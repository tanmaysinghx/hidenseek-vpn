package com.tanmaysinghx.hidenseek_backend.plan;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** A subscription tier: how much data a user may move through the VPN per day. */
@Entity
@Table(name = "hs_plans")
@Getter
@Setter
public class Plan {

    @Id
    private String id;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String name;

    private String description;

    /** Null = unlimited. */
    private Long dailyLimitBytes;

    /** Shown to users, e.g. "₹99 / month"; payment happens outside the app. */
    private String priceLabel;

    @Column(nullable = false)
    private int sortOrder;

    @Column(name = "is_default", nullable = false)
    private boolean defaultPlan;

    public boolean isUnlimited() {
        return dailyLimitBytes == null;
    }
}
