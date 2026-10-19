package com.tanmaysinghx.hidenseek_backend.session;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/**
 * One continuous connection of a device to a node from one client IP. Derived from the agent's
 * WireGuard handshake reports, so it is accurate even if the app crashes or loses network.
 */
@Entity
@Table(name = "hs_sessions")
@Getter
@Setter
public class VpnSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String peerId;

    @Column(nullable = false)
    private String userId;

    @Column(nullable = false)
    private String deviceId;

    @Column(nullable = false)
    private String nodeId;

    /** Copied from the user so raw session rows stay readable on their own. */
    @Column(nullable = false)
    private String userEmail;

    @Column(nullable = false)
    private String clientIp;

    private String countryCode;

    private String country;

    private String region;

    private String city;

    @Column(nullable = false)
    private Instant startedAt;

    @Column(nullable = false)
    private Instant lastSeenAt;

    private Instant endedAt;

    @Column(nullable = false)
    private long rxBytes;

    @Column(nullable = false)
    private long txBytes;

    public Duration elapsed() {
        return Duration.between(startedAt, endedAt != null ? endedAt : lastSeenAt);
    }

    public boolean isActive() {
        return endedAt == null;
    }
}
