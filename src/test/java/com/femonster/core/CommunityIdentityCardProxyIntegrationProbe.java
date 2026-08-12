package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public final class CommunityIdentityCardProxyIntegrationProbe {
    private CommunityIdentityCardProxyIntegrationProbe() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("usage: <config-path> <server-url>");
        Path config = Path.of(args[0]).toAbsolutePath().normalize();
        Files.createDirectories(config.getParent());
        Files.writeString(config, args[1], StandardCharsets.UTF_8);

        MachineIdentityService machine = new MachineIdentityService(ProjectPaths.detect());
        CommunityService service = new CommunityService(config, machine, null);
        Map<String, Object> accountA = account("identity-java-a", "Provider A");
        Map<String, Object> accountB = account("identity-java-b", "Provider B");

        Map<String, Object> stateA = service.state("fixture", "Fixture", accountA);
        require(SimpleJson.asBoolean(stateA.get("ok"), false), "account A registration failed: " + stateA);
        String feIdA = feId(stateA);
        Map<String, Object> cardsA = service.identityCards("fixture", "Fixture", accountA);
        require(SimpleJson.asBoolean(cardsA.get("ok"), false), "account A identity cards failed: " + cardsA);
        require(feIdA.equals(SimpleJson.asString(cardsA.get("feId"), "")), "identity cards used the wrong FE ID for account A");
        require("fe-gold".equals(SimpleJson.asString(cardsA.get("equippedId"), "")), "default identity card was not equipped");

        Map<String, Object> renamed = service.updateProfile("fixture", "Fixture", accountA, "Aquarius A", null, null);
        require(SimpleJson.asBoolean(renamed.get("ok"), false), "identity nickname update failed: " + renamed);

        Map<String, Object> stateB = service.state("fixture", "Fixture", accountB);
        require(SimpleJson.asBoolean(stateB.get("ok"), false), "account B registration failed: " + stateB);
        String feIdB = feId(stateB);
        require(!feIdA.equals(feIdB), "different provider accounts shared an FE ID");
        Map<String, Object> cardsB = service.identityCards("fixture", "Fixture", accountB);
        require(feIdB.equals(SimpleJson.asString(cardsB.get("feId"), "")), "identity cards leaked account A into account B");

        Map<String, Object> requested = service.addFriend("fixture", "Fixture", accountA, feIdB);
        require(SimpleJson.asBoolean(requested.get("ok"), false), "friend request failed: " + requested);
        Map<String, Object> refreshedB = service.state("fixture", "Fixture", accountB);
        Map<String, Object> requestsB = SimpleJson.asMap(refreshedB.get("friendRequests"));
        java.util.List<Object> incomingB = SimpleJson.asList(requestsB.get("incoming"));
        require(incomingB.size() == 1, "friend request was not delivered to account B: " + refreshedB);
        String requestId = SimpleJson.asString(SimpleJson.asMap(incomingB.get(0)).get("id"), "");
        Map<String, Object> accepted = service.respondFriendRequest("fixture", "Fixture", accountB, requestId, true);
        require(SimpleJson.asBoolean(accepted.get("ok"), false), "friend request acceptance failed: " + accepted);

        Map<String, Object> friendCard = service.friendIdentityCard("fixture", "Fixture", accountA, feIdB);
        require(SimpleJson.asBoolean(friendCard.get("ok"), false), "friend identity card proxy failed: " + friendCard);
        require(feIdB.equals(SimpleJson.asString(SimpleJson.asMap(friendCard.get("owner")).get("feId"), "")),
                "friend identity card returned the wrong owner: " + friendCard);
        Map<String, Object> publicCard = SimpleJson.asMap(friendCard.get("card"));
        require("fe-gold".equals(SimpleJson.asString(publicCard.get("id"), "")),
                "friend identity card omitted the equipped visual: " + friendCard);
        require(!publicCard.containsKey("owned") && !publicCard.containsKey("nicknameEditable"),
                "friend identity card leaked ownership or edit capabilities: " + publicCard);
        require("identity-card-display".equals(SimpleJson.asString(
                SimpleJson.asMap(friendCard.get("displayAnimation")).get("scope"), "")),
                "friend identity card returned a non-display animation: " + friendCard);

        Map<String, Object> cardsAAgain = service.identityCards("fixture", "Fixture", accountA);
        require(feIdA.equals(SimpleJson.asString(cardsAAgain.get("feId"), "")), "switching accounts lost account A identity scope");
        Map<String, Object> equipped = service.equipIdentityCard("fixture", "Fixture", accountA, "fe-gold");
        require(SimpleJson.asBoolean(equipped.get("ok"), false), "identity card equip proxy failed: " + equipped);

        CommunityService restored = new CommunityService(config, machine, null);
        Map<String, Object> restoredState = restored.state("fixture", "Fixture", accountA);
        Map<String, Object> restoredProfile = SimpleJson.asMap(restoredState.get("profile"));
        require("Aquarius A".equals(SimpleJson.asString(restoredProfile.get("username"), "")),
                "provider refresh overwrote the user-edited identity nickname: " + restoredState);
        Map<String, Object> restoredCards = restored.identityCards("fixture", "Fixture", accountA);
        require(feIdA.equals(SimpleJson.asString(restoredCards.get("feId"), "")), "restored proxy used a different FE ID");

        System.out.println("CommunityIdentityCardProxyIntegrationProbe passed: " + feIdA + "," + feIdB);
    }

    private static Map<String, Object> account(String userId, String nickname) {
        Map<String, Object> account = new LinkedHashMap<>();
        account.put("userId", userId);
        account.put("nickname", nickname);
        account.put("avatarUrl", "");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("loggedIn", true);
        payload.put("account", account);
        return payload;
    }

    private static String feId(Map<String, Object> state) {
        String value = SimpleJson.asString(SimpleJson.asMap(state.get("profile")).get("feId"), "");
        require(value.matches("[1-9]\\d{7}"), "server did not issue an FE ID: " + state);
        return value;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
