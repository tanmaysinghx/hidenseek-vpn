package com.tanmaysinghx.hidenseek_backend.activity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/**
 * A DNS lookup made through a node's resolver. With HTTPS this (the domain) is all a VPN operator
 * can see of a user's browsing; page contents stay encrypted end to end.
 */
@Entity
@Table(name = "hs_activity")
@Getter
@Setter
public class ActivityEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String sessionId;

    @Column(nullable = false)
    private String userId;

    @Column(nullable = false)
    private String nodeId;

    @Column(nullable = false)
    private String domain;

    @Column(nullable = false)
    private String queryType;

    @Column(nullable = false)
    private Instant occurredAt;
}
