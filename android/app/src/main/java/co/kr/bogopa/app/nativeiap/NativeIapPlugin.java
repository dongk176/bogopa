package co.kr.bogopa.app.nativeiap;

import android.app.Activity;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesResponseListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

@CapacitorPlugin(name = "NativeIap")
public class NativeIapPlugin extends Plugin implements com.android.billingclient.api.PurchasesUpdatedListener {
    private BillingClient billingClient;
    private final List<BillingReadyCallback> billingReadyCallbacks = new ArrayList<>();
    private boolean billingConnectionInProgress = false;
    private PendingPurchaseRequest pendingPurchase;

    private interface BillingReadyCallback {
        void onReady();
        void onError(String message);
    }

    private static class PendingPurchaseRequest {
        final PluginCall call;
        final String productId;
        final String productType;

        PendingPurchaseRequest(PluginCall call, String productId, String productType) {
            this.call = call;
            this.productId = productId;
            this.productType = productType;
        }
    }

    @Override
    public void load() {
        super.load();
        ensureBillingClient();
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) {
            if (billingClient != null) {
                billingClient.endConnection();
                billingClient = null;
            }
            pendingPurchase = null;
            billingReadyCallbacks.clear();
            billingConnectionInProgress = false;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = normalize(call.getString("productId"));
        if (productId.isEmpty()) {
            call.reject("상품 ID가 필요합니다.");
            return;
        }

        String productKey = normalize(call.getString("productKey"));
        String productType = resolveProductType(productKey, productId);

        withBillingClient(new BillingReadyCallback() {
            @Override
            public void onReady() {
                queryProductDetailsForPurchase(call, productId, productType);
            }

            @Override
            public void onError(String message) {
                call.reject(message);
            }
        });
    }

    @PluginMethod
    public void restore(PluginCall call) {
        withBillingClient(new BillingReadyCallback() {
            @Override
            public void onReady() {
                queryOwnedPurchases(BillingClient.ProductType.INAPP, new PurchasesCollectorCallback() {
                    @Override
                    public void onSuccess(List<Purchase> inAppPurchases) {
                        queryOwnedPurchases(BillingClient.ProductType.SUBS, new PurchasesCollectorCallback() {
                            @Override
                            public void onSuccess(List<Purchase> subPurchases) {
                                JSArray restored = new JSArray();
                                appendPurchases(restored, inAppPurchases, BillingClient.ProductType.INAPP, "native_google_play_restore");
                                appendPurchases(restored, subPurchases, BillingClient.ProductType.SUBS, "native_google_play_restore");
                                JSObject result = new JSObject();
                                result.put("ok", true);
                                result.put("count", restored.length());
                                result.put("restored", restored);
                                call.resolve(result);
                            }

                            @Override
                            public void onError(String message) {
                                call.reject(message);
                            }
                        });
                    }

                    @Override
                    public void onError(String message) {
                        call.reject(message);
                    }
                });
            }

            @Override
            public void onError(String message) {
                call.reject(message);
            }
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        PendingPurchaseRequest request = getPendingPurchase();
        if (request == null) {
            return;
        }

        int code = billingResult.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK) {
            if (purchases == null || purchases.isEmpty()) {
                rejectAndClearPending("결제 결과를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
                return;
            }
            Purchase matched = findMatchingPurchase(purchases, request.productId);
            if (matched == null) {
                rejectAndClearPending("결제된 상품을 확인하지 못했습니다.");
                return;
            }
            resolvePendingWithPurchase(matched, request.productType, "native_google_play_billing");
            return;
        }

        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            rejectAndClearPending("사용자가 결제를 취소했습니다.");
            return;
        }

        if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            queryOwnedPurchaseAndResolve(request);
            return;
        }

        rejectAndClearPending("결제를 진행하지 못했습니다. (" + code + ")");
    }

    private interface PurchasesCollectorCallback {
        void onSuccess(List<Purchase> purchases);
        void onError(String message);
    }

    private void queryOwnedPurchases(String productType, PurchasesCollectorCallback callback) {
        BillingClient client = ensureBillingClient();
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(productType)
                .build();
        client.queryPurchasesAsync(params, new PurchasesResponseListener() {
            @Override
            public void onQueryPurchasesResponse(BillingResult billingResult, List<Purchase> purchases) {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    callback.onError("구매 내역 조회에 실패했습니다. (" + billingResult.getResponseCode() + ")");
                    return;
                }
                callback.onSuccess(purchases != null ? purchases : new ArrayList<>());
            }
        });
    }

    private void queryOwnedPurchaseAndResolve(PendingPurchaseRequest request) {
        queryOwnedPurchases(request.productType, new PurchasesCollectorCallback() {
            @Override
            public void onSuccess(List<Purchase> purchases) {
                Purchase matched = findMatchingPurchase(purchases, request.productId);
                if (matched == null) {
                    rejectAndClearPending("이미 보유 중인 상품이지만 거래 정보를 찾지 못했습니다.");
                    return;
                }
                resolvePendingWithPurchase(matched, request.productType, "native_google_play_owned");
            }

            @Override
            public void onError(String message) {
                rejectAndClearPending(message);
            }
        });
    }

    private Purchase findMatchingPurchase(List<Purchase> purchases, String productId) {
        if (purchases == null || purchases.isEmpty()) return null;
        for (Purchase purchase : purchases) {
            List<String> products = purchase.getProducts();
            if (products == null || products.isEmpty()) continue;
            for (String item : products) {
                if (productId.equals(item)) return purchase;
            }
        }
        return null;
    }

    private void appendPurchases(JSArray target, List<Purchase> purchases, String productType, String source) {
        if (purchases == null) return;
        for (Purchase purchase : purchases) {
            if (purchase == null) continue;
            if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            List<String> products = purchase.getProducts();
            if (products == null || products.isEmpty()) continue;
            for (String productId : products) {
                JSObject payload = buildPurchasePayload(purchase, productId, productType, source);
                target.put(payload);
            }
        }
    }

    private void queryProductDetailsForPurchase(PluginCall call, String productId, String productType) {
        BillingClient client = ensureBillingClient();

        QueryProductDetailsParams.Product queryProduct = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(productType)
                .build();
        QueryProductDetailsParams queryParams = QueryProductDetailsParams.newBuilder()
                .setProductList(java.util.Collections.singletonList(queryProduct))
                .build();

        client.queryProductDetailsAsync(queryParams, (billingResult, productDetailsList) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject("스토어 상품 조회에 실패했습니다. (" + billingResult.getResponseCode() + ")");
                return;
            }
            if (productDetailsList == null || productDetailsList.isEmpty()) {
                call.reject("스토어에서 상품을 찾을 수 없습니다. productId=" + productId);
                return;
            }

            ProductDetails productDetails = productDetailsList.get(0);
            BillingFlowParams.ProductDetailsParams.Builder productDetailsParams =
                    BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(productDetails);

            if (BillingClient.ProductType.SUBS.equals(productType)) {
                List<ProductDetails.SubscriptionOfferDetails> offerDetails = productDetails.getSubscriptionOfferDetails();
                if (offerDetails == null || offerDetails.isEmpty()) {
                    call.reject("구독 혜택 정보를 찾지 못했습니다.");
                    return;
                }
                String offerToken = normalize(offerDetails.get(0).getOfferToken());
                if (offerToken.isEmpty()) {
                    call.reject("구독 혜택 토큰을 확인하지 못했습니다.");
                    return;
                }
                productDetailsParams.setOfferToken(offerToken);
            }

            BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(java.util.Collections.singletonList(productDetailsParams.build()))
                    .build();

            Activity activity = getActivity();
            if (activity == null) {
                call.reject("브리지 액티비티를 찾지 못했습니다.");
                return;
            }

            synchronized (this) {
                if (pendingPurchase != null) {
                    call.reject("이미 진행 중인 결제가 있습니다.");
                    return;
                }
                pendingPurchase = new PendingPurchaseRequest(call, productId, productType);
            }

            activity.runOnUiThread(() -> {
                BillingResult launchResult = client.launchBillingFlow(activity, flowParams);
                if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    rejectAndClearPending("결제창을 열지 못했습니다. (" + launchResult.getResponseCode() + ")");
                }
            });
        });
    }

    private String resolveProductType(String productKey, String productId) {
        if ("memory_pass_monthly".equals(productKey)) return BillingClient.ProductType.SUBS;
        if (productId.contains(".pass.")) return BillingClient.ProductType.SUBS;
        return BillingClient.ProductType.INAPP;
    }

    private synchronized PendingPurchaseRequest getPendingPurchase() {
        return pendingPurchase;
    }

    private synchronized PendingPurchaseRequest takePendingPurchase() {
        PendingPurchaseRequest current = pendingPurchase;
        pendingPurchase = null;
        return current;
    }

    private void rejectAndClearPending(String message) {
        PendingPurchaseRequest request = takePendingPurchase();
        if (request != null) {
            request.call.reject(message);
        }
    }

    private void resolvePendingWithPurchase(Purchase purchase, String productType, String source) {
        PendingPurchaseRequest request = takePendingPurchase();
        if (request == null) return;

        if (purchase == null) {
            request.call.reject("결제 정보를 확인하지 못했습니다.");
            return;
        }

        if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            request.call.reject("결제가 보류 상태입니다. 결제 승인 후 다시 시도해주세요.");
            return;
        }
        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
            request.call.reject("구매 완료 상태를 확인하지 못했습니다.");
            return;
        }

        String matchedProductId = request.productId;
        List<String> products = purchase.getProducts();
        if (products != null && !products.isEmpty()) {
            if (!products.contains(matchedProductId)) {
                matchedProductId = products.get(0);
            }
        }

        JSObject payload = buildPurchasePayload(purchase, matchedProductId, productType, source);
        request.call.resolve(payload);
    }

    private JSObject buildPurchasePayload(Purchase purchase, String productId, String productType, String source) {
        String purchaseToken = normalize(purchase.getPurchaseToken());
        String orderId = normalize(purchase.getOrderId());
        String transactionId = !orderId.isEmpty() ? orderId : purchaseToken;
        String purchasedAt = toIso8601(purchase.getPurchaseTime());

        JSObject rawPayload = new JSObject();
        rawPayload.put("source", source);
        rawPayload.put("productType", productType);
        rawPayload.put("productId", productId);
        rawPayload.put("purchaseToken", purchaseToken);
        rawPayload.put("orderId", orderId);
        rawPayload.put("purchaseTime", purchase.getPurchaseTime());
        rawPayload.put("purchaseState", purchase.getPurchaseState());
        rawPayload.put("isAcknowledged", purchase.isAcknowledged());
        rawPayload.put("isAutoRenewing", purchase.isAutoRenewing());
        rawPayload.put("packageName", getContext() != null ? getContext().getPackageName() : "");
        rawPayload.put("signature", normalize(purchase.getSignature()));
        rawPayload.put("originalJson", normalize(purchase.getOriginalJson()));

        JSObject response = new JSObject();
        response.put("productId", productId);
        response.put("transactionId", transactionId);
        response.put("orderId", orderId);
        response.put("purchaseToken", purchaseToken);
        response.put("originalTransactionId", purchaseToken);
        response.put("purchasedAt", purchasedAt);
        response.put("rawPayload", rawPayload);
        return response;
    }

    private BillingClient ensureBillingClient() {
        synchronized (this) {
            if (billingClient != null) return billingClient;
            billingClient = BillingClient.newBuilder(getContext())
                    .setListener(this)
                    .enablePendingPurchases(
                            PendingPurchasesParams.newBuilder()
                                    .enableOneTimeProducts()
                                    .build()
                    )
                    .build();
            return billingClient;
        }
    }

    private void withBillingClient(BillingReadyCallback callback) {
        BillingClient client = ensureBillingClient();
        synchronized (this) {
            if (client.isReady()) {
                callback.onReady();
                return;
            }
            billingReadyCallbacks.add(callback);
            if (billingConnectionInProgress) return;
            billingConnectionInProgress = true;
        }

        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                List<BillingReadyCallback> callbacks;
                synchronized (NativeIapPlugin.this) {
                    billingConnectionInProgress = false;
                    callbacks = new ArrayList<>(billingReadyCallbacks);
                    billingReadyCallbacks.clear();
                }
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    for (BillingReadyCallback item : callbacks) item.onReady();
                } else {
                    String message = "Google Play 결제 서비스에 연결하지 못했습니다. (" + billingResult.getResponseCode() + ")";
                    for (BillingReadyCallback item : callbacks) item.onError(message);
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                synchronized (NativeIapPlugin.this) {
                    billingConnectionInProgress = false;
                }
            }
        });
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private String toIso8601(long epochMillis) {
        if (epochMillis <= 0) {
            return toIso8601(new Date().getTime());
        }
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new Date(epochMillis));
    }
}
