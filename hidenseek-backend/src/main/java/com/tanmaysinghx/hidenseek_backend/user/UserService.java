package com.tanmaysinghx.hidenseek_backend.user;

import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserService {

    private static final Duration LAST_SEEN_RESOLUTION = Duration.ofMinutes(1);

    private final VpnUserRepository users;
    private final HidenseekProperties properties;

    /**
     * Finds or creates the VPN user for a Portal access token. Role follows the token on every
     * call, so promoting someone in Portal (or ADMIN_EMAILS) takes effect on their next request.
     */
    @Transactional
    public VpnUser resolve(Jwt jwt, Authentication authentication) {
        String email = jwt.getClaimAsString("email");
        if (email == null || email.isBlank()) {
            throw ApiException.forbidden("HS-1001", "Token has no email claim; request the 'email' scope");
        }
        boolean admin = authentication.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        Instant now = Instant.now();

        VpnUser user = users.findBySubject(jwt.getSubject())
                .or(() -> users.findByEmailIgnoreCase(email))
                .orElseGet(() -> newUser(jwt.getSubject(), now, admin));
        user.setSubject(jwt.getSubject());
        user.setEmail(email);
        user.setDisplayName(jwt.getClaimAsString("name"));
        user.setRole(admin ? VpnUser.Role.ADMIN : VpnUser.Role.USER);
        if (admin && user.getStatus() == VpnUser.Status.PENDING) {
            user.setStatus(VpnUser.Status.APPROVED);
        }
        if (user.getLastSeenAt() == null || user.getLastSeenAt().isBefore(now.minus(LAST_SEEN_RESOLUTION))) {
            user.setLastSeenAt(now);
        }
        return users.save(user);
    }

    private VpnUser newUser(String subject, Instant now, boolean admin) {
        VpnUser user = new VpnUser();
        user.setSubject(subject);
        user.setCreatedAt(now);
        user.setStatus(admin || properties.access().autoApprove() ? VpnUser.Status.APPROVED : VpnUser.Status.PENDING);
        return user;
    }

    public List<VpnUser> list() {
        return users.findAllByOrderByCreatedAtDesc();
    }

    @Transactional
    public VpnUser setStatus(String id, VpnUser.Status status, VpnUser actor) {
        VpnUser user = users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
        if (user.getId().equals(actor.getId()) && status != VpnUser.Status.APPROVED) {
            throw ApiException.badRequest("HS-1002", "You cannot suspend yourself");
        }
        user.setStatus(status);
        return user;
    }
}
