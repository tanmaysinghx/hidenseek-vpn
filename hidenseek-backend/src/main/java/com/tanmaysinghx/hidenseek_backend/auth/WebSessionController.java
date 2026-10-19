package com.tanmaysinghx.hidenseek_backend.auth;

import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Sign-in for the web console. The browser runs Portal's popup flow (PKCE) and hands the code
 * here. The refresh token goes into an HttpOnly cookie scoped to these endpoints, so page scripts
 * never see it; the short-lived access token is returned and kept in memory only.
 */
@RestController
@RequestMapping("/api/v1/public/auth/web")
@RequiredArgsConstructor
public class WebSessionController {

    static final String COOKIE = "hs_rt";
    static final String COOKIE_PATH = "/api/v1/public/auth/web";
    /** Required on refresh/logout: a custom header can't be sent cross-site without CORS approval. */
    static final String CSRF_HEADER = "X-Hidenseek-Console";
    private static final Duration REFRESH_LIFETIME = Duration.ofDays(30);

    private final PortalTokenClient portal;
    private final HidenseekProperties properties;
    private final JsonMapper json;

    public record CodeRequest(@NotBlank String code, @NotBlank String codeVerifier) {
    }

    public record WebSession(String accessToken, long expiresIn) {
    }

    @PostMapping("/token")
    public ResponseEntity<WebSession> token(@Valid @RequestBody CodeRequest request, HttpServletRequest http) {
        requireBroker();
        Map<String, String> form = new LinkedHashMap<>();
        form.put("grant_type", "authorization_code");
        form.put("code", request.code());
        form.put("code_verifier", request.codeVerifier());
        form.put("redirect_uri", popupCallback());
        return issue(portal.exchange(form), http);
    }

    @PostMapping("/refresh")
    public ResponseEntity<WebSession> refresh(@CookieValue(name = COOKIE, required = false) String refreshToken,
                                              @RequestHeader(name = CSRF_HEADER, required = false) String csrf,
                                              HttpServletRequest http) {
        requireBroker();
        if (csrf == null) {
            throw ApiException.forbidden("HS-5004", CSRF_HEADER + " header is required");
        }
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "HS-5005", "Not signed in");
        }
        return issue(portal.exchange(Map.of("grant_type", "refresh_token", "refresh_token", refreshToken)), http);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader(name = CSRF_HEADER, required = false) String csrf,
                                       HttpServletRequest http) {
        if (csrf == null) {
            throw ApiException.forbidden("HS-5004", CSRF_HEADER + " header is required");
        }
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO, http)).build();
    }

    private ResponseEntity<WebSession> issue(ResponseEntity<String> portalResponse, HttpServletRequest http) {
        JsonNode body = json.readTree(portalResponse.getBody() == null ? "{}" : portalResponse.getBody());
        if (!portalResponse.getStatusCode().is2xxSuccessful() || !body.hasNonNull("access_token")) {
            String reason = body.path("error_description").asString(body.path("error").asString("sign-in failed"));
            // The refresh token is dead or the code was rejected: drop any cookie so the console signs in again.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO, http))
                    .header("X-Hidenseek-Error", reason)
                    .build();
        }
        ResponseEntity.BodyBuilder ok = ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store");
        if (body.hasNonNull("refresh_token")) {
            ok.header(HttpHeaders.SET_COOKIE, cookie(body.get("refresh_token").asString(), REFRESH_LIFETIME, http));
        }
        return ok.body(new WebSession(body.get("access_token").asString(), body.path("expires_in").asLong(900)));
    }

    private String cookie(String value, Duration maxAge, HttpServletRequest http) {
        boolean secure = http.isSecure() || properties.publicUrl().startsWith("https://");
        return ResponseCookie.from(COOKIE, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Strict")
                .path(COOKIE_PATH)
                .maxAge(maxAge)
                .build()
                .toString();
    }

    private String popupCallback() {
        return properties.portal().url() + "/oauth2/popup-callback";
    }

    private void requireBroker() {
        if (!properties.portal().brokersTokens()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "HS-5001",
                    "Web sign-in needs PORTAL_CLIENT_SECRET (a confidential Portal client)");
        }
    }
}
