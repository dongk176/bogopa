package co.kr.bogopa.app.nativechat;

import java.lang.ref.WeakReference;

final class NativeChatBridge {
    private static final Object LOCK = new Object();

    private static WeakReference<NativeChatPlugin> pluginRef = new WeakReference<>(null);
    private static WeakReference<NativeChatActivity> activityRef = new WeakReference<>(null);
    private static NativeChatState state;

    private NativeChatBridge() {
    }

    static void setPlugin(NativeChatPlugin plugin) {
        synchronized (LOCK) {
            pluginRef = new WeakReference<>(plugin);
        }
    }

    static void clearPlugin(NativeChatPlugin plugin) {
        synchronized (LOCK) {
            NativeChatPlugin existing = pluginRef.get();
            if (existing == plugin) {
                pluginRef = new WeakReference<>(null);
            }
        }
    }

    static void registerActivity(NativeChatActivity activity) {
        synchronized (LOCK) {
            activityRef = new WeakReference<>(activity);
        }
        NativeChatState latestState = getState();
        if (latestState != null) {
            activity.applyStateFromPlugin(latestState);
        }
    }

    static void unregisterActivity(NativeChatActivity activity) {
        synchronized (LOCK) {
            NativeChatActivity existing = activityRef.get();
            if (existing == activity) {
                activityRef = new WeakReference<>(null);
            }
        }
    }

    static NativeChatActivity getActivity() {
        synchronized (LOCK) {
            return activityRef.get();
        }
    }

    static void updateState(NativeChatState nextState) {
        synchronized (LOCK) {
            state = nextState;
        }
        NativeChatActivity activity = getActivity();
        if (activity != null) {
            activity.applyStateFromPlugin(nextState);
        }
    }

    static NativeChatState getState() {
        synchronized (LOCK) {
            return state;
        }
    }

    static void emitSendMessage(String text) {
        NativeChatPlugin plugin = getPlugin();
        if (plugin != null) {
            plugin.emitSendMessage(text);
        }
    }

    static void emitClose() {
        NativeChatPlugin plugin = getPlugin();
        if (plugin != null) {
            plugin.emitClose();
        }
    }

    static void emitSelectPersona(String personaId) {
        NativeChatPlugin plugin = getPlugin();
        if (plugin != null) {
            plugin.emitSelectPersona(personaId);
        }
    }

    static void emitCreateMemory() {
        NativeChatPlugin plugin = getPlugin();
        if (plugin != null) {
            plugin.emitCreateMemory();
        }
    }

    private static NativeChatPlugin getPlugin() {
        synchronized (LOCK) {
            return pluginRef.get();
        }
    }
}
