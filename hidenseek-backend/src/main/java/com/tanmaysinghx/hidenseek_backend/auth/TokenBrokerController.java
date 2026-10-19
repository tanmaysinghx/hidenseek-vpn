package com.tanmaysinghx.hidenseek_backend.auth;

import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Token broker for the native apps. The app runs the PKCE authorization request in the browser as
 * usual, then hands the code here; we redeem it at Portal with the client secret. Portal still
 * checks the PKCE verifier, so a stolen code is useless without the app that started the login.
 */
@RestController
@RequestMapping("/api/v1/public/auth")
@RequiredArgsConstructor
public class TokenBrokerController {

    private final PortalTokenClient portal;
    private final HidenseekProperties properties;

    public record CodeRequest(@NotBlank String code, @NotBlank String codeVerifier, @NotBlank String redirectUri) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    @PostMapping("/token")
    public ResponseEntity<String> token(@Valid @RequestBody CodeRequest request) {
        requireBroker();
        if (!isLoopback(request.redirectUri())) {
            throw ApiException.badRequest("HS-5002", "redirectUri must be a loopback address");
        }
        Map<String, String> form = new LinkedHashMap<>();
        form.put("grant_type", "authorization_code");
        form.put("code", request.code());
        form.put("code_verifier", request.codeVerifier());
        form.put("redirect_uri", request.redirectUri());
        return portal.exchange(form);
    }

    @PostMapping("/refresh")
    public ResponseEntity<String> refresh(@Valid @RequestBody RefreshRequest request) {
        requireBroker();
        return portal.exchange(Map.of("grant_type", "refresh_token", "refresh_token", request.refreshToken()));
    }

    private void requireBroker() {
        if (!properties.portal().brokersTokens()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "HS-5001",
                    "Token broker is disabled; set PORTAL_CLIENT_SECRET to enable it");
        }
    }

    static boolean isLoopback(String uri) {
        try {
            URI parsed = URI.create(uri);
            return "http".equals(parsed.getScheme())
                    && ("127.0.0.1".equals(parsed.getHost()) || "[::1]".equals(parsed.getHost()));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
