package co.kr.bogopa.app.nativechat;

import android.app.Activity;
import android.content.Intent;

import androidx.appcompat.app.AlertDialog;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeChat")
public class NativeChatPlugin extends Plugin {

    @Override
    public void load() {
        super.load();
        NativeChatBridge.setPlugin(this);
    }

    @Override
    protected void handleOnDestroy() {
        NativeChatBridge.clearPlugin(this);
        super.handleOnDestroy();
    }

    @PluginMethod
    public void present(PluginCall call) {
        NativeChatBridge.setPlugin(this);
        NativeChatState state = NativeChatState.fromCall(call, NativeChatBridge.getState());
        NativeChatBridge.updateState(state);

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Bridge activity is unavailable.");
            return;
        }

        activity.runOnUiThread(() -> {
            NativeChatActivity existing = NativeChatBridge.getActivity();
            if (existing != null && !existing.isFinishing()) {
                existing.applyStateFromPlugin(state);
                call.resolve();
                return;
            }

            Intent intent = new Intent(activity, NativeChatActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            activity.startActivity(intent);
            call.resolve();
        });
    }

    @PluginMethod
    public void sync(PluginCall call) {
        NativeChatBridge.setPlugin(this);
        NativeChatState state = NativeChatState.fromCall(call, NativeChatBridge.getState());
        NativeChatBridge.updateState(state);
        call.resolve();
    }

    @PluginMethod
    public void dismiss(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            NativeChatActivity existing = NativeChatBridge.getActivity();
            if (existing != null && !existing.isFinishing()) {
                existing.dismissFromPlugin();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void confirmMemoryStore(PluginCall call) {
        String title = call.getString("title", "기억이 부족해요");
        String message = call.getString("message", "확인을 누르면 기억 스토어로 이동합니다.");
        String confirmText = call.getString("confirmText", "확인");
        String cancelText = call.getString("cancelText", "취소");

        Activity host = NativeChatBridge.getActivity();
        if (host == null) {
            host = getActivity();
        }

        if (host == null) {
            call.reject("No available activity to present alert.");
            return;
        }

        Activity finalHost = host;
        finalHost.runOnUiThread(() -> {
            if (finalHost.isFinishing()) {
                call.reject("Activity is finishing.");
                return;
            }

            new AlertDialog.Builder(finalHost)
                    .setTitle(title)
                    .setMessage(message)
                    .setNegativeButton(cancelText, (dialog, which) -> {
                        JSObject result = new JSObject();
                        result.put("confirmed", false);
                        call.resolve(result);
                    })
                    .setPositiveButton(confirmText, (dialog, which) -> {
                        JSObject result = new JSObject();
                        result.put("confirmed", true);
                        call.resolve(result);
                    })
                    .setOnCancelListener(dialog -> {
                        JSObject result = new JSObject();
                        result.put("confirmed", false);
                        call.resolve(result);
                    })
                    .show();
        });
    }

    void emitSendMessage(String text) {
        JSObject data = new JSObject();
        data.put("text", text == null ? "" : text);
        notifyListeners("sendMessage", data);
    }

    void emitClose() {
        notifyListeners("close", new JSObject());
    }

    void emitSelectPersona(String personaId) {
        JSObject data = new JSObject();
        data.put("personaId", personaId == null ? "" : personaId);
        notifyListeners("selectPersona", data);
    }

    void emitCreateMemory() {
        notifyListeners("createMemory", new JSObject());
    }

    void emitSubscribeMemoryPass(String personaId, String personaName) {
        JSObject data = new JSObject();
        data.put("personaId", personaId == null ? "" : personaId);
        data.put("personaName", personaName == null ? "" : personaName);
        notifyListeners("subscribeMemoryPass", data);
    }
}
