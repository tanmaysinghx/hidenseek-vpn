package com.tanmaysinghx.hidenseek_backend.device;

import com.tanmaysinghx.hidenseek_backend.user.VpnUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** An app install. It generates its own WireGuard keypair and only ever sends the public key. */
@Entity
@Table(name = "hs_devices")
@Getter
@Setter
public class Device {

    public enum Platform { WINDOWS, LINUX, ANDROID, MACOS, IOS, OTHER }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private VpnUser user;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Platform platform;

    @Column(nullable = false, unique = true)
    private String publicKey;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant revokedAt;

    public boolean isActive() {
        return revokedAt == null;
    }
}
