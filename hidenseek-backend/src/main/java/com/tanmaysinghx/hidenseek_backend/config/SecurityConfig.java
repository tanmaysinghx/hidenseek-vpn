package com.tanmaysinghx.hidenseek_backend.config;

import com.tanmaysinghx.hidenseek_backend.agent.AgentTokenFilter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
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
    SecurityFilterChain apiChain(HttpSecurity http, HidenseekProperties properties) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/public/**", "/actuator/health/**", "/install.sh").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtConverter(properties))))
                .build();
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
