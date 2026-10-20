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

/** A page view in the web console, with where the visit came from. */
@Entity
@Table(name = "hs_traffic_events")
@Getter
@Setter
public class TrafficEvent {

    /** LANDING is the first page of a visit (it carries the referrer); PAGEVIEW is in-app navigation. */
    public enum Type { LANDING, PAGEVIEW }

    public enum Device { DESKTOP, MOBILE, TABLET, OTHER }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Instant occurredAt;

    @Column(nullable = false)
    private LocalDate occurredDay;

    @Column(nullable = false)
    private String visitorId;

    @Column(nullable = false)
    private String sessionId;

    private String userEmail;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Type type;

    @Column(nullable = false)
    private String path;

    private String referrer;

    /** "Direct", the referring host, or the utm_source. */
    @Column(nullable = false)
    private String source;

    private String utmSource;
    private String utmMedium;
    private String utmCampaign;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Device device;

    private String ip;
    private String countryCode;
    private String country;
    private String region;
    private String userAgent;
}
