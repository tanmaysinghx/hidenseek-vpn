package com.tanmaysinghx.hidenseek_backend.user;

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

    public record UpdateUserRequest(@NotNull VpnUser.Status status) {
    }
}
