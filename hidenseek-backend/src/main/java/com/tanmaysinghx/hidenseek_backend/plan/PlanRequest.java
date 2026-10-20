package com.tanmaysinghx.hidenseek_backend.plan;

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

/** A user asking for a plan; an admin approves it (after payment, arranged outside the app) or rejects it. */
@Entity
@Table(name = "hs_plan_requests")
@Getter
@Setter
public class PlanRequest {

    public enum Status { PENDING, APPROVED, REJECTED, CANCELLED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String userId;

    @Column(nullable = false)
    private String planId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    private String note;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant decidedAt;

    /** Email of the admin who decided. */
    private String decidedBy;

    private String decisionNote;
}
