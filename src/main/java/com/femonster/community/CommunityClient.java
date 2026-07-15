package com.femonster.community;

import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpResponse;
import java.util.Map;

public interface CommunityClient {
    Map<String, Object> state(String provider, String providerLabel, Map<String, Object> accountPayload);

    Map<String, Object> addFriend(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId);

    Map<String, Object> recordListening(String provider, String providerLabel, Map<String, Object> accountPayload, long listenMsDelta, Map<String, Object> song);

    Map<String, Object> messages(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId);

    Map<String, Object> sendMessage(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, String text);

    Map<String, Object> updateProfile(String provider, String providerLabel, Map<String, Object> accountPayload, String bio);

    Map<String, Object> nearby(String provider, String providerLabel, Map<String, Object> accountPayload, int radiusKm);

    Map<String, Object> likeFriend(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId);

    Map<String, Object> listenState(String provider, String providerLabel, Map<String, Object> accountPayload);

    Map<String, Object> inviteListen(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, Map<String, Object> song);

    Map<String, Object> respondListen(String provider, String providerLabel, Map<String, Object> accountPayload, String inviteId, boolean accepted);

    Map<String, Object> leaveListen(String provider, String providerLabel, Map<String, Object> accountPayload, String sessionId);

    Map<String, Object> sendCallSignal(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, String sessionId, String type, Object payload);

    Map<String, Object> relay(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, String type, Object payload);

    Map<String, Object> callSignals(String provider, String providerLabel, Map<String, Object> accountPayload, String sessionId, String after);

    Map<String, Object> sandboxGet(String path);

    Map<String, Object> sandboxPost(String path, Map<String, Object> payload);

    HttpResponse<InputStream> sandboxAsset(String path) throws IOException, InterruptedException;

    HttpResponse<InputStream> eventStream(String feId, String after) throws IOException, InterruptedException;
}
