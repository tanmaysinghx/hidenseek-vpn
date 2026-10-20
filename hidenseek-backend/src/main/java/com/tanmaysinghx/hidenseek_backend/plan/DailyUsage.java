package com.tanmaysinghx.hidenseek_backend.plan;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.LocalDate;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Setter;

/** Bytes a user moved through the VPN (both directions, all devices and servers) on one day. */
@Entity
@Table(name = "hs_daily_usage")
@Getter
@Setter
public class DailyUsage {

    @EmbeddedId
    private Key id;

    @Column(nullable = false)
    private long usedBytes;

    @Embeddable
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {

        @Column(name = "user_id")
        private String userId;

        @Column(name = "usage_date")
        private LocalDate usageDate;
    }
}
