package co.kr.bogopa.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import co.kr.bogopa.app.nativechat.NativeChatPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeChatPlugin.class);
        super.onCreate(savedInstanceState);
        hideWebViewScrollIndicators();
    }

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
