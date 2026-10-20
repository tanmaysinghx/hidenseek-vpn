package com.tanmaysinghx.hidenseek_backend.plan;

import com.tanmaysinghx.hidenseek_backend.user.VpnUser;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public final class PlanDtos {

    private PlanDtos() {
    }

    public record PlanView(String id, String code, String name, String description, Long dailyLimitBytes,
                           String priceLabel, boolean isDefault) {
        public static PlanView of(Plan p) {
            return new PlanView(p.getId(), p.getCode(), p.getName(), p.getDescription(), p.getDailyLimitBytes(),
                    p.getPriceLabel(), p.isDefaultPlan());
        }
    }

    public record UsageView(long usedBytes, Long limitBytes, Instant resetsAt, boolean limited, boolean exempt) {
        public static UsageView of(PlanService.Usage u) {
            return new UsageView(u.usedBytes(), u.limitBytes(), u.resetsAt(), u.limited(), u.exempt());
        }
    }

    public record PlanRequestView(String id, String userId, String userEmail, String userName, PlanView plan,
                                  PlanRequest.Status status, String note, Instant createdAt, Instant decidedAt,
                                  String decidedBy, String decisionNote) {
        public static PlanRequestView of(PlanRequest r, Plan plan, VpnUser user) {
            return new PlanRequestView(r.getId(), r.getUserId(), user == null ? null : user.getEmail(),
                    user == null ? null : user.getDisplayName(), PlanView.of(plan), r.getStatus(), r.getNote(),
                    r.getCreatedAt(), r.getDecidedAt(), r.getDecidedBy(), r.getDecisionNote());
        }
    }

    /** What the app shows on the plan screen and the connect screen. */
    public record MyPlanView(PlanView plan, Instant expiresAt, UsageView usage, PlanRequestView pendingRequest) {
    }

    public record RequestPlan(@NotBlank String planId, @Size(max = 500) String note) {
    }

    /** {@code days}: how long the approved plan lasts; null = no end date. */
    public record Decision(@Min(1) @Max(3660) Integer days, @Size(max = 500) String note) {
    }

    public record AssignPlan(@NotBlank String planId, @Min(1) @Max(3660) Integer days) {
    }

    /** Full replacement; {@code dailyLimitBytes} null = unlimited. */
    public record UpdatePlan(@NotBlank @Size(max = 64) String name, @Size(max = 255) String description,
                             @Min(1) Long dailyLimitBytes, @Size(max = 64) String priceLabel) {
    }
}
