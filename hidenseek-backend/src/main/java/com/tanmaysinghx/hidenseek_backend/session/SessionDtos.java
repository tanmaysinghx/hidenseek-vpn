package com.tanmaysinghx.hidenseek_backend.session;

import java.time.Instant;

public final class SessionDtos {

    private SessionDtos() {
    }

    public record SessionView(String id, String userId, String userEmail, String deviceId, String nodeId,
                              String clientIp, String countryCode, String country, String region, String city,
                              Instant startedAt, Instant lastSeenAt, Instant endedAt, long elapsedSeconds,
                              long rxBytes, long txBytes, boolean active) {
        public static SessionView of(VpnSession s) {
            return new SessionView(s.getId(), s.getUserId(), s.getUserEmail(), s.getDeviceId(), s.getNodeId(),
                    s.getClientIp(), s.getCountryCode(), s.getCountry(), s.getRegion(), s.getCity(), s.getStartedAt(),
                    s.getLastSeenAt(), s.getEndedAt(), s.elapsed().toSeconds(), s.getRxBytes(), s.getTxBytes(),
                    s.isActive());
        }
    }

    public record Stats(long users, long pendingUsers, long nodes, long onlineNodes, long activeSessions,
                        long sessionsLast24h, long bytesLast24h) {
    }
}
