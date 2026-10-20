package com.tanmaysinghx.hidenseek_backend.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;

/** One API request: who made it, from where, and how it went. */
@Entity
@Table(name = "hs_audit_log")
@Getter
@Setter
public class AuditLog {

    public enum Client { APP, WEB, OTHER }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Instant occurredAt;

    @Column(nullable = false)
    private LocalDate occurredDay;

    private String userEmail;

    @Column(nullable = false)
    private String method;

    @Column(nullable = false)
    private String path;

    /** {@link #path} with ids replaced by {@code {id}}. */
    @Column(nullable = false)
    private String route;

    @Column(nullable = false)
    private int status;

    @Column(nullable = false)
    private int durationMs;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private Client client;

    private String ip;
    private String countryCode;
    private String country;
    private String region;
    private String city;
    private String referrer;
    private String userAgent;
}
