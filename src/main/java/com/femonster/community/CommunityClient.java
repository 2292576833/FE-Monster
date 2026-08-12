package com.femonster.community;

import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpResponse;
import java.util.Map;

public interface CommunityClient {
    Map<String, Object> state(String provider, String providerLabel, Map<String, Object> accountPayload);

    Map<String, Object> addFriend(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId);

    Map<String, Object> respondFriendRequest(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String requestId,
        boolean accepted
    );

    Map<String, Object> mailbox(String provider, String providerLabel, Map<String, Object> accountPayload);

    Map<String, Object> identityCards(String provider, String providerLabel, Map<String, Object> accountPayload);

    Map<String, Object> friendIdentityCard(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String targetId
    );

    Map<String, Object> equipIdentityCard(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String cardId
    );

    Map<String, Object> markMailboxRead(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String mailId
    );

    Map<String, Object> claimMailboxReward(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String mailId,
        String attachmentId
    );

    Map<String, Object> achievementState(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    );

    Map<String, Object> updateAchievementState(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        Map<String, Object> state
    );

    Map<String, Object> claimAchievementReward(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String achievementId
    );

    Map<String, Object> submitAchievementEvidence(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        Map<String, Object> event
    );

    Map<String, Object> recordListening(String provider, String providerLabel, Map<String, Object> accountPayload, long listenMsDelta, Map<String, Object> song);

    Map<String, Object> messages(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId);

    Map<String, Object> sendMessage(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, String text);

    Map<String, Object> updateProfile(String provider, String providerLabel, Map<String, Object> accountPayload, String bio);

    default Map<String, Object> updateProfile(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String bio,
        Map<String, Object> avatarOrnament
    ) {
        return updateProfile(provider, providerLabel, accountPayload, bio);
    }

    default Map<String, Object> updateProfile(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String username,
        String bio,
        Map<String, Object> avatarOrnament
    ) {
        return updateProfile(provider, providerLabel, accountPayload, bio, avatarOrnament);
    }

    Map<String, Object> nearby(String provider, String providerLabel, Map<String, Object> accountPayload, int radiusKm);

    Map<String, Object> userProfile(String feId);

    Map<String, Object> creativeMarket(String type, String query, String feId);

    Map<String, Object> creativeMarketWork(String workId);

    Map<String, Object> creativeMarketComments(String workId);

    Map<String, Object> squareMessages(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String after,
        int limit
    );

    Map<String, Object> creativeMarketMutation(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String action,
        Map<String, Object> payload
    );

    Map<String, Object> sendSquareMessage(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        Map<String, Object> payload
    );

    Map<String, Object> likeFriend(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId);

    Map<String, Object> listenState(String provider, String providerLabel, Map<String, Object> accountPayload);

    default Map<String, Object> listenReport(String provider, String providerLabel, Map<String, Object> accountPayload) {
        Map<String, Object> state = listenState(provider, providerLabel, accountPayload);
        Map<String, Object> response = new java.util.LinkedHashMap<>();
        response.put("ok", state.getOrDefault("ok", false));
        Object report = state.getOrDefault("togetherListeningReport", Map.of());
        response.put("report", report);
        response.put("togetherListeningReport", report);
        if (state.containsKey("error")) response.put("error", state.get("error"));
        return response;
    }

    Map<String, Object> inviteListen(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, Map<String, Object> song);

    Map<String, Object> respondListen(String provider, String providerLabel, Map<String, Object> accountPayload, String inviteId, boolean accepted);

    Map<String, Object> leaveListen(String provider, String providerLabel, Map<String, Object> accountPayload, String sessionId);

    Map<String, Object> sendCallSignal(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, String sessionId, String type, Object payload);

    Map<String, Object> relay(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, String type, Object payload);

    Map<String, Object> callSignals(String provider, String providerLabel, Map<String, Object> accountPayload, String sessionId, String after);

    Map<String, Object> petStatus(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    );

    Map<String, Object> petHistory(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String sessionId
    );

    Map<String, Object> petMutation(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String action,
        Map<String, Object> payload
    );

    HttpResponse<InputStream> petAudio(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String audioId
    ) throws IOException, InterruptedException;

    Map<String, Object> sandboxGet(String path);

    Map<String, Object> sandboxPost(String path, Map<String, Object> payload);

    HttpResponse<InputStream> sandboxAsset(String path) throws IOException, InterruptedException;

    HttpResponse<InputStream> creativeMarketAsset(
        String assetId,
        String range,
        String ifNoneMatch,
        String ifRange
    ) throws IOException, InterruptedException;

    HttpResponse<InputStream> uploadCreativeMarketContent(
        String uploadId,
        String token,
        String contentType,
        long contentLength,
        InputStream content
    ) throws IOException, InterruptedException;

    HttpResponse<InputStream> eventStream(String feId, String after) throws IOException, InterruptedException;
}
