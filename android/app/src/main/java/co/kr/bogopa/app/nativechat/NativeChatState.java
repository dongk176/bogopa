package co.kr.bogopa.app.nativechat;

import com.getcapacitor.PluginCall;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class NativeChatState {
    static final class Message {
        final String id;
        final String role;
        final String content;
        final String createdAt;

        Message(String id, String role, String content, String createdAt) {
            this.id = id;
            this.role = role;
            this.content = content;
            this.createdAt = createdAt;
        }
    }

    static final class Persona {
        final String personaId;
        final String personaName;
        final String avatarUrl;
        final String lastMessage;
        final boolean isLocked;

        Persona(String personaId, String personaName, String avatarUrl, String lastMessage, boolean isLocked) {
            this.personaId = personaId;
            this.personaName = personaName;
            this.avatarUrl = avatarUrl;
            this.lastMessage = lastMessage;
            this.isLocked = isLocked;
        }
    }

    final String personaId;
    final String personaName;
    final String avatarUrl;
    final List<Message> messages;
    final boolean isTyping;
    final Integer memoryBalance;
    final List<Persona> personas;

    NativeChatState(
            String personaId,
            String personaName,
            String avatarUrl,
            List<Message> messages,
            boolean isTyping,
            Integer memoryBalance,
            List<Persona> personas
    ) {
        this.personaId = personaId == null ? "" : personaId;
        this.personaName = personaName == null || personaName.trim().isEmpty() ? "기억" : personaName;
        this.avatarUrl = normalizeNullableString(avatarUrl);
        this.messages = Collections.unmodifiableList(messages == null ? new ArrayList<>() : messages);
        this.isTyping = isTyping;
        this.memoryBalance = memoryBalance;
        this.personas = Collections.unmodifiableList(personas == null ? new ArrayList<>() : personas);
    }

    static NativeChatState fromCall(PluginCall call, NativeChatState fallback) {
        String personaId = valueOr(call.getString("personaId"), fallback == null ? "" : fallback.personaId);
        String personaName = valueOr(call.getString("personaName"), fallback == null ? "기억" : fallback.personaName);
        String avatarUrl = valueOrNullable(call.getString("avatarUrl"), fallback == null ? null : fallback.avatarUrl);

        Boolean isTypingRaw = call.getBoolean("isTyping");
        boolean isTyping = isTypingRaw != null ? isTypingRaw : (fallback != null && fallback.isTyping);

        Integer memoryBalanceRaw = call.getInt("memoryBalance");
        Integer memoryBalance = memoryBalanceRaw != null ? memoryBalanceRaw : (fallback == null ? null : fallback.memoryBalance);

        List<Message> parsedMessages = parseMessages(call.getArray("messages"));
        if (parsedMessages.isEmpty() && fallback != null) {
            parsedMessages = new ArrayList<>(fallback.messages);
        }

        List<Persona> parsedPersonas = parsePersonas(call.getArray("personas"));
        if (parsedPersonas.isEmpty() && fallback != null) {
            parsedPersonas = new ArrayList<>(fallback.personas);
        }

        return new NativeChatState(
                personaId,
                personaName,
                avatarUrl,
                parsedMessages,
                isTyping,
                memoryBalance,
                parsedPersonas
        );
    }

    private static List<Message> parseMessages(JSONArray rawMessages) {
        List<Message> result = new ArrayList<>();
        if (rawMessages == null) return result;

        for (int i = 0; i < rawMessages.length(); i++) {
            JSONObject object = rawMessages.optJSONObject(i);
            if (object == null) continue;

            String id = trimToEmpty(object.optString("id", ""));
            String role = trimToEmpty(object.optString("role", ""));
            String content = object.optString("content", "");
            String createdAt = trimToEmpty(object.optString("createdAt", ""));
            if (id.isEmpty() || role.isEmpty() || createdAt.isEmpty()) continue;
            result.add(new Message(id, role, content, createdAt));
        }

        return result;
    }

    private static List<Persona> parsePersonas(JSONArray rawPersonas) {
        List<Persona> result = new ArrayList<>();
        if (rawPersonas == null) return result;

        Set<String> seen = new LinkedHashSet<>();

        for (int i = 0; i < rawPersonas.length(); i++) {
            JSONObject object = rawPersonas.optJSONObject(i);
            if (object == null) continue;

            String personaId = trimToEmpty(object.optString("personaId", ""));
            String personaName = trimToEmpty(object.optString("personaName", ""));
            if (personaId.isEmpty() || personaName.isEmpty() || seen.contains(personaId)) continue;

            seen.add(personaId);
            result.add(new Persona(
                    personaId,
                    personaName,
                    normalizeNullableString(object.optString("avatarUrl", null)),
                    object.optString("lastMessage", ""),
                    object.optBoolean("isLocked", false)
            ));
        }

        return result;
    }

    private static String valueOr(String value, String fallback) {
        String trimmed = trimToEmpty(value);
        if (trimmed.isEmpty()) {
            return fallback == null ? "" : fallback;
        }
        return trimmed;
    }

    private static String valueOrNullable(String value, String fallback) {
        String normalized = normalizeNullableString(value);
        if (normalized != null) return normalized;
        return normalizeNullableString(fallback);
    }

    private static String normalizeNullableString(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
