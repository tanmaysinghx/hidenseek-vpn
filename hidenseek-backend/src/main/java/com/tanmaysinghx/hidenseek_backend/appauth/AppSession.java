package com.tanmaysinghx.hidenseek_backend.appauth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** A signed-in app install. Only the refresh token's hash is stored; it changes on every use. */
@Entity
@Table(name = "hs_app_sessions")
@Getter
@Setter
public class AppSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String userId;

    @Column(nullable = false, unique = true)
    private String refreshTokenHash;

    /** Portal roles at sign-in, comma separated, copied into each access token. */
    @Column(nullable = false)
    private String roles;

    private String deviceName;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant lastUsedAt;

    @Column(nullable = false)
    private Instant expiresAt;

    private Instant revokedAt;

    public boolean isUsable(Instant now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }
}
