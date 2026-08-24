package com.femonster.core;

/** Stable, caller-safe failure raised by {@link ClientAiGateway}. */
public final class ClientAiException extends RuntimeException {
    private final String errorCode;
    private final int status;

    private ClientAiException(String errorCode, int status, String message) {
        super(message);
        this.errorCode = errorCode;
        this.status = status;
    }

    public String errorCode() { return errorCode; }
    public int status() { return status; }

    public static ClientAiException bad(String message) {
        return new ClientAiException("client_ai_bad_request", 400, message);
    }

    public static ClientAiException forbidden(String message) {
        return new ClientAiException("client_ai_forbidden", 403, message);
    }

    public static ClientAiException configInvalid() {
        return new ClientAiException(
            "client_ai_config_invalid", 409, "本地自备模型配置已损坏，请在设置中重新保存"
        );
    }

    public static ClientAiException notReady(String message) {
        return new ClientAiException("client_ai_not_ready", 409, message);
    }

    public static ClientAiException tooLarge(String label) {
        return new ClientAiException("client_ai_too_large", 413, label + " exceeds the size limit");
    }

    public static ClientAiException cancelled() {
        return new ClientAiException("client_ai_cancelled", 499, "client AI request cancelled");
    }

    public static ClientAiException upstream(int status) {
        int safeStatus = switch (status) {
            case 400, 401, 403, 408, 422, 425, 429 -> status;
            default -> 502;
        };
        String code = switch (status) {
            case 400, 422 -> "client_ai_request_rejected";
            case 401, 403 -> "client_ai_auth_failed";
            case 429 -> "client_ai_rate_limited";
            default -> "client_ai_upstream_error";
        };
        String message = switch (status) {
            case 400, 422 -> "自备模型不支持当前请求参数（HTTP " + status + "）";
            case 401, 403 -> "自备模型服务拒绝了凭据，请检查 API Key";
            case 429 -> "自备模型服务当前请求过多，请稍后重试";
            default -> "自备模型服务暂时不可用（HTTP " + status + "）";
        };
        return new ClientAiException(code, safeStatus, message);
    }

    public static ClientAiException transientError(String message) {
        return new ClientAiException("client_ai_upstream_error", 502, message);
    }
}
