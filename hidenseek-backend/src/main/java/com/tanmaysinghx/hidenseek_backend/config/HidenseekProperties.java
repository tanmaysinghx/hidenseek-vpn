package com.tanmaysinghx.hidenseek_backend.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("hidenseek")
public record HidenseekProperties(
        String publicUrl,
        Portal portal,
        @DefaultValue AppTokens appTokens,
        Access access,
        Geoip geoip,
        Sessions sessions,
        Activity activity,
        @DefaultValue Plans plans) {

    public record Portal(String url, String clientId, String clientSecret, String appId, String apiKey) {

        public boolean brokersTokens() {
            return clientSecret != null && !clientSecret.isBlank();
        }

        /** Email/password sign-in through Portal's external login/register API is configured. */
        public boolean passwordLogin() {
            return appId != null && !appId.isBlank() && apiKey != null && !apiKey.isBlank();
        }
    }

    public record AppTokens(String secret, @DefaultValue("15m") Duration accessTtl,
                            @DefaultValue("30d") Duration refreshTtl) {
    }

    public record Access(
            @DefaultValue List<String> adminEmails,
            @DefaultValue("false") boolean autoApprove,
            @DefaultValue("5") int maxDevicesPerUser) {
    }

    public record Geoip(String database) {
    }

    public record Sessions(@DefaultValue("3m") Duration handshakeTimeout) {
    }

    public record Activity(@DefaultValue("30d") Duration retention) {
    }

    /** Daily allowances reset at midnight in {@code timezone}. */
    public record Plans(@DefaultValue("Asia/Kolkata") String timezone) {
    }

    public boolean isAdminEmail(String email) {
        return email != null && access.adminEmails().stream()
                .anyMatch(admin -> admin.trim().equalsIgnoreCase(email));
    }
}
