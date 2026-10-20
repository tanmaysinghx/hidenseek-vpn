package com.tanmaysinghx.hidenseek_backend.appauth;

import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.common.Tokens;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.tanmaysinghx.hidenseek_backend.user.VpnUser;
import com.tanmaysinghx.hidenseek_backend.user.VpnUserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AppAuthService {

    private final PortalAccountsClient portal;
    private final AppTokenService tokens;
    private final AppSessionRepository sessions;
    private final VpnUserRepository users;
    private final HidenseekProperties properties;

    public record Issued(String accessToken, long expiresIn, String refreshToken, long refreshExpiresIn,
                         String email, String name) {
    }

    @Transactional
    public Issued login(String email, String password, String deviceName) {
        requireEnabled();
        PortalAccountsClient.Result result = portal.login(email.trim(), password);
        return start(result, deviceName);
    }

    @Transactional
    public Issued register(String email, String password, String firstName, String lastName, String deviceName) {
        requireEnabled();
        PortalAccountsClient.Result created = portal.register(email.trim(), password, firstName.trim(),
                lastName == null ? null : lastName.trim());
        if (!created.authenticated() || created.account() == null) {
            throw new ApiException(HttpStatus.ACCEPTED, "HS-6003",
                    "Account created. Portal's admin must activate it before you can sign in.");
        }
        return start(created, deviceName);
    }

    /** Swaps a refresh token for a new access token and a new refresh token (the old one dies). */
    @Transactional
    public Issued refresh(String refreshToken) {
        Instant now = Instant.now();
        AppSession session = sessions.findByRefreshTokenHash(Tokens.hash(refreshToken))
                .filter(s -> s.isUsable(now))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "HS-6004", "Session expired. Sign in again."));
        VpnUser user = users.findById(session.getUserId())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "HS-6004", "Session expired. Sign in again."));
        String next = Tokens.generate("hsr_");
        session.setRefreshTokenHash(Tokens.hash(next));
        session.setLastUsedAt(now);
        return issued(user, roles(session), next, session, now);
    }

    @Transactional
    public void logout(String refreshToken) {
        sessions.findByRefreshTokenHash(Tokens.hash(refreshToken)).ifPresent(s -> s.setRevokedAt(Instant.now()));
    }

    @Scheduled(cron = "0 40 3 * * *")
    @Transactional
    public void purge() {
        sessions.deleteStale(Instant.now().minus(Duration.ofDays(7)));
    }

    private Issued start(PortalAccountsClient.Result result, String deviceName) {
        if (result.mfaRequired()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "HS-6005",
                    "Your Portal account uses 2-step verification. Use \"Continue in browser\" to sign in.");
        }
        PortalAccountsClient.Account account = result.account();
        if (!result.authenticated() || account == null || account.email() == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "PRTL-1003", "Invalid email or password.");
        }
        Instant now = Instant.now();
        String email = account.email().toLowerCase(Locale.ROOT);
        boolean admin = account.roles().contains("ROLE_ADMIN") || properties.isAdminEmail(email);
        VpnUser user = users.findBySubject(email).or(() -> users.findByEmailIgnoreCase(email)).orElseGet(() -> {
            VpnUser created = new VpnUser();
            created.setCreatedAt(now);
            created.setStatus(admin || properties.access().autoApprove() ? VpnUser.Status.APPROVED : VpnUser.Status.PENDING);
            return created;
        });
        user.setSubject(email);
        user.setEmail(email);
        if (account.displayName() != null) {
            user.setDisplayName(account.displayName());
        }
        user.setRole(admin ? VpnUser.Role.ADMIN : VpnUser.Role.USER);
        if (admin && user.getStatus() == VpnUser.Status.PENDING) {
            user.setStatus(VpnUser.Status.APPROVED);
        }
        user.setLastSeenAt(now);
        users.save(user);

        String refresh = Tokens.generate("hsr_");
        AppSession session = new AppSession();
        session.setUserId(user.getId());
        session.setRefreshTokenHash(Tokens.hash(refresh));
        session.setRoles(String.join(",", account.roles()));
        session.setDeviceName(deviceName == null ? null : deviceName.substring(0, Math.min(deviceName.length(), 100)));
        session.setCreatedAt(now);
        session.setLastUsedAt(now);
        session.setExpiresAt(now.plus(properties.appTokens().refreshTtl()));
        sessions.save(session);
        return issued(user, account.roles(), refresh, session, now);
    }

    private Issued issued(VpnUser user, List<String> roles, String refresh, AppSession session, Instant now) {
        String access = tokens.issue(user.getEmail(), user.getDisplayName(), roles, now);
        return new Issued(access, properties.appTokens().accessTtl().toSeconds(), refresh,
                Duration.between(now, session.getExpiresAt()).toSeconds(), user.getEmail(), user.getDisplayName());
    }

    private static List<String> roles(AppSession session) {
        return Arrays.stream(session.getRoles().split(",")).filter(r -> !r.isBlank()).toList();
    }

    private void requireEnabled() {
        if (!properties.portal().passwordLogin()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "HS-6000",
                    "Email sign-in isn't set up on this server; use browser sign-in.");
        }
    }
}
