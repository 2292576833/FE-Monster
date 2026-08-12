package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public final class CommunityDeviceEnrollmentIntegrationProbe {
    private CommunityDeviceEnrollmentIntegrationProbe() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("usage: <config-path> <server-url>");
        Path config = Path.of(args[0]).toAbsolutePath().normalize();
        Files.createDirectories(config.getParent());
        Files.writeString(config, args[1], StandardCharsets.UTF_8);

        MachineIdentityService machine = new MachineIdentityService(ProjectPaths.detect());
        CommunityService service = new CommunityService(config, machine, null);
        Map<String, Object> account = new LinkedHashMap<>();
        account.put("userId", "java-device-enrollment-fixture");
        account.put("nickname", "Java Device Fixture");
        account.put("avatarUrl", "");
        Map<String, Object> provider = new LinkedHashMap<>();
        provider.put("loggedIn", true);
        provider.put("account", account);

        Map<String, Object> first = service.state("fixture", "Fixture", provider);
        require(SimpleJson.asBoolean(first.get("ok"), false), "first signed registration failed: " + first);
        String feId = SimpleJson.asString(SimpleJson.asMap(first.get("profile")).get("feId"), "");
        require(feId.matches("[1-9]\\d{7}"), "server did not issue an FE ID");

        CommunityService restored = new CommunityService(config, machine, null);
        Map<String, Object> second = restored.state("fixture", "Fixture", provider);
        require(SimpleJson.asBoolean(second.get("ok"), false), "restored device registration failed: " + second);
        String restoredFeId = SimpleJson.asString(SimpleJson.asMap(second.get("profile")).get("feId"), "");
        require(feId.equals(restoredFeId), "restored installation received a different FE ID");
        Path credentialFile = config.getParent().resolve("community-device-credentials.json");
        require(Files.isRegularFile(credentialFile), "device credential file is missing");

        byte[] preservedCredential = Files.readAllBytes(credentialFile);
        Files.delete(credentialFile);
        CommunityService rotatedCredential = new CommunityService(config, machine, null);
        Map<String, Object> rotated = rotatedCredential.state("fixture", "Fixture", provider);
        require(SimpleJson.asBoolean(rotated.get("ok"), false),
                "a replacement key for the same computer was rejected: " + rotated);
        String rotatedFeId = SimpleJson.asString(SimpleJson.asMap(rotated.get("profile")).get("feId"), "");
        require(feId.equals(rotatedFeId), "replacement device credential received a different FE ID");
        require(Files.isRegularFile(credentialFile), "replacement device credential was not persisted");

        Files.write(credentialFile, preservedCredential);
        CommunityService reinstalled = new CommunityService(config, machine, null);
        Map<String, Object> third = reinstalled.state("fixture", "Fixture", provider);
        require(SimpleJson.asBoolean(third.get("ok"), false),
                "reinstalled client did not reuse its preserved device credential: " + third);
        String reinstalledFeId = SimpleJson.asString(SimpleJson.asMap(third.get("profile")).get("feId"), "");
        require(feId.equals(reinstalledFeId), "reinstalled device received a different FE ID");
        System.out.println("CommunityDeviceEnrollmentIntegrationProbe passed: feId=" + feId);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
