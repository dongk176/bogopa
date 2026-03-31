package co.kr.bogopa.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private void hideWebViewScrollIndicators() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().setVerticalScrollBarEnabled(false);
        getBridge().getWebView().setHorizontalScrollBarEnabled(false);
    }

    @Override
    public void onStart() {
        super.onStart();
        hideWebViewScrollIndicators();
    }

    @Override
    public void onResume() {
        super.onResume();
        hideWebViewScrollIndicators();
    }
}
