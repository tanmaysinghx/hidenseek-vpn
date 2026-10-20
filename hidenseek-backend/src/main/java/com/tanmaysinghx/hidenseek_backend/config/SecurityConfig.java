package com.tanmaysinghx.hidenseek_backend.config;

import com.nimbusds.jwt.JWTParser;
import com.tanmaysinghx.hidenseek_backend.agent.AgentTokenFilter;
import com.tanmaysinghx.hidenseek_backend.appauth.AppTokenService;
import jakarta.servlet.http.HttpServletRequest;
import java.text.ParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationManagerResolver;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationProvider;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.preauth.AbstractPreAuthenticatedProcessingFilter;

/**
 * Two callers, two chains: node agents authenticate with their own opaque token, and apps
 * authenticate with Portal SSO access tokens (RS256 JWTs validated against the portal's JWKS).
 */
@Configuration
public class SecurityConfig {

    @Bean
    @Order(1)
    SecurityFilterChain agentChain(HttpSecurity http, AgentTokenFilter agentTokenFilter) throws Exception {
        return http
                .securityMatcher("/agent/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .addFilterBefore(agentTokenFilter, AbstractPreAuthenticatedProcessingFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/agent/v1/enroll").permitAll()
                        .anyRequest().hasRole("NODE"))
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain apiChain(HttpSecurity http, HidenseekProperties properties, JwtDecoder portalDecoder,
                                 AppTokenService appTokens) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/", "/index.html", "/logo.svg", "/install.sh", "/console", "/console/**").permitAll()
                        .requestMatchers("/api/v1/public/**", "/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o.authenticationManagerResolver(
                        tokenIssuers(portalDecoder, appTokens, jwtConverter(properties))))
                .build();
    }

    /**
     * Two kinds of bearer token: Portal SSO access tokens (verified against Portal's JWKS) and the
     * backend's own app-session tokens (HS256, issued after Portal checks a password). The unverified
     * {@code iss} only picks the verifier; the chosen one still checks signature, expiry and audience.
     */
    private static AuthenticationManagerResolver<HttpServletRequest> tokenIssuers(
            JwtDecoder portalDecoder, AppTokenService appTokens, JwtAuthenticationConverter converter) {
        AuthenticationManager portal = manager(portalDecoder, converter);
        AuthenticationManager app = manager(appTokens.decoder(), converter);
        BearerTokenResolver bearer = new DefaultBearerTokenResolver();
        return request -> appTokens.issuer().equals(issuerOf(bearer.resolve(request))) ? app : portal;
    }

    private static AuthenticationManager manager(JwtDecoder decoder, JwtAuthenticationConverter converter) {
        JwtAuthenticationProvider provider = new JwtAuthenticationProvider(decoder);
        provider.setJwtAuthenticationConverter(converter);
        return new ProviderManager(provider);
    }

    private static String issuerOf(String token) {
        if (token == null) {
            return null;
        }
        try {
            return JWTParser.parse(token).getJWTClaimsSet().getIssuer();
        } catch (ParseException e) {
            return null;
        }
    }

    /** Portal puts roles like {@code ROLE_ADMIN} in a {@code roles} claim; ADMIN_EMAILS adds admins locally. */
    private JwtAuthenticationConverter jwtConverter(HidenseekProperties properties) {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> authorities(jwt, properties));
        return converter;
    }

    static Collection<GrantedAuthority> authorities(Jwt jwt, HidenseekProperties properties) {
        List<GrantedAuthority> authorities = new ArrayList<>();
        authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
        List<String> roles = jwt.getClaimAsStringList("roles");
        boolean admin = (roles != null && roles.contains("ROLE_ADMIN"))
                || properties.isAdminEmail(jwt.getClaimAsString("email"));
        if (admin) {
            authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
        }
        return authorities;
    }
}
