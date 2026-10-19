package com.tanmaysinghx.hidenseek_backend.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** A Portal SSO account that has used the VPN. Identity lives in Portal; this row holds VPN access. */
@Entity
@Table(name = "hs_users")
@Getter
@Setter
public class VpnUser {

    public enum Role { USER, ADMIN }

    public enum Status { PENDING, APPROVED, SUSPENDED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    /** Portal's {@code sub} claim. */
    @Column(nullable = false, unique = true)
    private String subject;

    @Column(nullable = false, unique = true)
    private String email;

    private String displayName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant lastSeenAt;

    public boolean isAdmin() {
        return role == Role.ADMIN;
    }

    public boolean canConnect() {
        return status == Status.APPROVED;
    }
}
