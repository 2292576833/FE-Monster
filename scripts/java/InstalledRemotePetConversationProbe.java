package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class InstalledRemotePetConversationProbe {
    private InstalledRemotePetConversationProbe() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("usage: <installed-data-dir>");
        Path dataDir = Path.of(args[0]).toAbsolutePath().normalize();
        Path config = dataDir.resolve("community-server-url.txt");
        Path tlsPin = dataDir.resolve("community-server-tls-pin.txt");
        require(Files.isRegularFile(config), "installed community URL is missing");
        require(Files.isRegularFile(tlsPin), "installed TLS pin is missing");
        String url = Files.readString(config).trim();
        String pin = Files.readString(tlsPin).trim();
        require(url.startsWith("https://") && !url.matches("(?i).*?(localhost|127\\.0\\.0\\.1|\\[::1]).*"),
            "installed community URL is not public HTTPS: " + url);
        require(pin.matches("sha256:[A-F0-9]{64}"), "installed TLS pin is invalid");

        MachineIdentityService machine = new MachineIdentityService(ProjectPaths.detect());
        CommunityService service = new CommunityService(config, machine, null);
        Map<String, Object> provider = new LinkedHashMap<>();
        provider.put("loggedIn", true);
        provider.put("account", Map.of(
            "userId", "final-installer-remote-qa-v1",
            "nickname", "Final Installer Remote QA",
            "avatarUrl", ""
        ));

        Map<String, Object> state = service.state("fixture", "Final Installer QA", provider);
        require(SimpleJson.asBoolean(state.get("serverOnline"), false), "installed Java server health failed: " + state);
        require(SimpleJson.asBoolean(state.get("ok"), false), "installed Java device registration failed: " + state);
        String feId = SimpleJson.asString(SimpleJson.asMap(state.get("profile")).get("feId"), "");
        require(feId.matches("[1-9]\\d{7}"), "installed Java did not receive an FE ID: " + state);
        require(Files.isRegularFile(dataDir.resolve("community-device-credentials.json")),
            "installed Java did not persist its device credential");

        Map<String, Object> status = service.petStatus("fixture", "Final Installer QA", provider);
        require(SimpleJson.asBoolean(status.get("ok"), false), "pet status failed: " + status);

        Map<String, Object> session = service.petMutation(
            "fixture", "Final Installer QA", provider, "sessions",
            Map.of("title", "Final installer remote QA")
        );
        require(SimpleJson.asBoolean(session.get("ok"), false), "pet session failed: " + session);
        String sessionId = SimpleJson.asString(SimpleJson.asMap(session.get("session")).get("id"), "");
        require(!sessionId.isBlank(), "pet session id is missing: " + session);

        String requestId = "final-installer-chat-qa-v1";
        Map<String, Object> chat = service.petMutation(
            "fixture", "Final Installer QA", provider, "chat",
            Map.of(
                "sessionId", sessionId,
                "requestId", requestId,
                "text", "Reply with a short confirmation that the installed remote desktop pet chat is working.",
                "replyWithVoice", false,
                "voiceReply", false,
                "realtimeVoice", false
            )
        );
        require(SimpleJson.asBoolean(chat.get("ok"), false), "pet chat submit failed: " + chat);
        require(requestId.equals(SimpleJson.asString(chat.get("requestId"), "")),
            "pet chat request id was not preserved: " + chat);

        Map<String, Object> history = Map.of();
        long deadline = System.nanoTime() + Duration.ofSeconds(90).toNanos();
        boolean assistantReply = false;
        int completedReadOnlyActions = 0;
        while (System.nanoTime() < deadline) {
            history = service.petHistory("fixture", "Final Installer QA", provider, sessionId);
            Map<String, Object> historySession = SimpleJson.asMap(history.get("session"));
            for (Object value : SimpleJson.asList(historySession.get("messages"))) {
                Map<String, Object> message = SimpleJson.asMap(value);
                if ("assistant".equals(SimpleJson.asString(message.get("role"), ""))
                    && !SimpleJson.asString(message.get("content"), "").isBlank()) {
                    assistantReply = true;
                    break;
                }
            }
            for (Object value : SimpleJson.asList(historySession.get("pendingActions"))) {
                Map<String, Object> action = SimpleJson.asMap(value);
                if (!"pending".equals(SimpleJson.asString(action.get("status"), "pending"))) continue;
                String actionId = SimpleJson.asString(action.get("actionId"), "");
                String actionName = SimpleJson.asString(action.get("name"), "");
                Map<String, Object> arguments = SimpleJson.asMap(action.get("arguments"));
                String command = SimpleJson.asString(arguments.get("command"), "");
                require("control_app".equals(actionName) && "app.capabilities.query".equals(command),
                    "probe refused to execute a non-read-only client action: " + action);
                require(!SimpleJson.asBoolean(action.get("requiresConfirmation"), false),
                    "read-only capability query unexpectedly requires confirmation: " + action);
                Map<String, Object> claim = service.petMutation(
                    "fixture", "Final Installer QA", provider, "action-claim",
                    Map.of("sessionId", sessionId, "actionId", actionId)
                );
                if (!SimpleJson.asBoolean(claim.get("claimed"), false)) continue;
                Map<String, Object> capabilityResult = new LinkedHashMap<>();
                capabilityResult.put("version", 2);
                capabilityResult.put("commands", List.of(
                    capabilityDefinition(
                        "app.capabilities.query", "Read available application commands",
                        Map.of("query", "string?", "category", "string?", "cursor", "number?", "limit", "number 1..20?")
                    ),
                    capabilityDefinition("app.context.query", "Read current application context", Map.of())
                ));
                capabilityResult.put("total", 2);
                capabilityResult.put("cursor", 0);
                capabilityResult.put("limit", 12);
                capabilityResult.put("nextCursor", null);
                capabilityResult.put("defaultPolicy", "allow-registered");
                capabilityResult.put("deniedCategories", List.of(
                    "dangerous", "destructive", "code-execution", "credential",
                    "credentials", "filesystem-write"
                ));
                capabilityResult.put("arbitraryCode", false);
                capabilityResult.put("shell", false);
                capabilityResult.put("localConfirmation", true);
                Map<String, Object> actionResult = service.petMutation(
                    "fixture", "Final Installer QA", provider, "action-result",
                    Map.of(
                        "sessionId", sessionId,
                        "actionId", actionId,
                        "ok", true,
                        "result", capabilityResult
                    )
                );
                require(SimpleJson.asBoolean(actionResult.get("ok"), false),
                    "read-only client action result failed: " + actionResult);
                completedReadOnlyActions += 1;
            }
            String sessionState = SimpleJson.asString(historySession.get("state"), "");
            if (assistantReply && "idle".equals(sessionState)) break;
            if ("error".equals(sessionState)) throw new IllegalStateException("pet chat failed: " + history);
            Thread.sleep(300L);
        }
        require(assistantReply, "pet chat did not return an assistant reply: " + history);

        Map<String, Object> narration = service.petMutation(
            "fixture", "Final Installer QA", provider, "narrate",
            Map.of(
                "requestId", "final-installer-narrate-qa-v1",
                "text", "Welcome to FE Monster."
            )
        );
        require(SimpleJson.asBoolean(narration.get("ok"), false), "pet narration failed: " + narration);
        String audioId = SimpleJson.asString(narration.get("audioId"), "");
        require(audioId.startsWith("pet-audio-"), "pet narration audio id is missing: " + narration);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("installedJava", System.getProperty("java.home"));
        result.put("communityUrl", url);
        result.put("tlsPin", pin);
        result.put("computerIdSource", machine.computerIdSource());
        result.put("deviceCredentialPersisted", true);
        result.put("feId", feId);
        result.put("status", 200);
        result.put("session", 200);
        result.put("sessionId", sessionId);
        result.put("chat", 202);
        result.put("chatState", SimpleJson.asString(SimpleJson.asMap(history.get("session")).get("state"), ""));
        result.put("chatAssistantReply", true);
        result.put("completedReadOnlyActions", completedReadOnlyActions);
        result.put("narrate", 200);
        result.put("audioId", audioId);
        System.out.println(SimpleJson.stringify(result));
    }

    private static Map<String, Object> capabilityDefinition(
        String command,
        String description,
        Map<String, Object> parameters
    ) {
        Map<String, Object> definition = new LinkedHashMap<>();
        definition.put("command", command);
        definition.put("title", description);
        definition.put("description", description);
        definition.put("category", "read");
        definition.put("aliases", List.of());
        definition.put("parameters", parameters);
        definition.put("requiredParameterGroups", List.of());
        definition.put("readOnly", true);
        definition.put("requiresConfirmation", false);
        return definition;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
