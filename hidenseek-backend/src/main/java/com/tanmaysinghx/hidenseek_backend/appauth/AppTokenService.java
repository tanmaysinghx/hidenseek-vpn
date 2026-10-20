package com.tanmaysinghx.hidenseek_backend.appauth;

import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Component;

/**
 * Signs and verifies the backend's own access tokens for app sessions (HS256). They carry the same
 * claims as Portal access tokens ({@code sub} = email, {@code email}, {@code name}, {@code roles}),
 * so the rest of the API treats both alike.
 */
@Component
public class AppTokenService {

    static final String AUDIENCE = "hidenseek-app";

    private final String issuer;
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final HidenseekProperties.AppTokens settings;

    public AppTokenService(HidenseekProperties properties) {
        this.issuer = properties.publicUrl().replaceAll("/+$", "") + "/app";
        this.settings = properties.appTokens();
        SecretKey key = new SecretKeySpec(keyBytes(properties), "HmacSHA256");
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
        NimbusJwtDecoder nimbus = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        OAuth2TokenValidator<Jwt> audience = jwt -> jwt.getAudience().contains(AUDIENCE)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "wrong audience", null));
        nimbus.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(issuer), audience));
        this.decoder = nimbus;
    }

    public String issuer() {
        return issuer;
    }

    public JwtDecoder decoder() {
        return decoder;
    }

    public String issue(String email, String name, List<String> roles, Instant now) {
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .audience(List.of(AUDIENCE))
                .subject(email)
                .issuedAt(now)
                .expiresAt(now.plus(settings.accessTtl()))
                .claim("email", email)
                .claim("roles", roles);
        if (name != null) {
            claims.claim("name", name);
        }
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims.build()))
                .getTokenValue();
    }

    /** An explicit APP_TOKEN_SECRET, or a key derived from the Portal secrets (stable across restarts). */
    private static byte[] keyBytes(HidenseekProperties properties) {
        String explicit = properties.appTokens().secret();
        String material = explicit != null && !explicit.isBlank()
                ? explicit
                : "hidenseek-app-tokens|" + nullToEmpty(properties.portal().clientSecret()) + "|"
                        + nullToEmpty(properties.portal().apiKey());
        try {
            return MessageDigest.getInstance("SHA-256").digest(material.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}
