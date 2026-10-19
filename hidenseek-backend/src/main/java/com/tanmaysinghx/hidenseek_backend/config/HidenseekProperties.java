package com.tanmaysinghx.hidenseek_backend.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("hidenseek")
public record HidenseekProperties(
        String publicUrl,
        Portal portal,
        Access access,
        Geoip geoip,
        Sessions sessions,
        Activity activity) {

    public record Portal(String url, String clientId, String clientSecret) {

        public boolean brokersTokens() {
            return clientSecret != null && !clientSecret.isBlank();
        }
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

    public boolean isAdminEmail(String email) {
        return email != null && access.adminEmails().stream()
                .anyMatch(admin -> admin.trim().equalsIgnoreCase(email));
    }
}
