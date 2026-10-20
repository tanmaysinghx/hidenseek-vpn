package com.tanmaysinghx.hidenseek_backend.user;

import com.tanmaysinghx.hidenseek_backend.plan.Plan;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public final class UserDtos {

    private UserDtos() {
    }

    public record UserView(String id, String email, String displayName, VpnUser.Role role,
                           VpnUser.Status status, Instant createdAt, Instant lastSeenAt) {
        public static UserView of(VpnUser user) {
            return new UserView(user.getId(), user.getEmail(), user.getDisplayName(), user.getRole(),
                    user.getStatus(), user.getCreatedAt(), user.getLastSeenAt());
        }
    }

    /** The admin list's view: the user plus their plan and today's usage. */
    public record AdminUserView(String id, String email, String displayName, VpnUser.Role role,
                                VpnUser.Status status, Instant createdAt, Instant lastSeenAt, String planId,
                                String planName, Long dailyLimitBytes, Instant planExpiresAt, long usedTodayBytes) {
        public static AdminUserView of(VpnUser user, Plan plan, long usedToday) {
            boolean ownPlan = plan.getId().equals(user.getPlanId());
            return new AdminUserView(user.getId(), user.getEmail(), user.getDisplayName(), user.getRole(),
                    user.getStatus(), user.getCreatedAt(), user.getLastSeenAt(), plan.getId(), plan.getName(),
                    plan.getDailyLimitBytes(), ownPlan ? user.getPlanExpiresAt() : null, usedToday);
        }
    }

    public record UpdateUserRequest(@NotNull VpnUser.Status status) {
    }
}
