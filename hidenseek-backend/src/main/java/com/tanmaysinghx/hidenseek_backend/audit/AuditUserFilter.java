package com.tanmaysinghx.hidenseek_backend.audit;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Sits in the API security chain after bearer authentication and before authorization, and notes
 * the caller's email on the request for {@link AuditFilter}, even when the request is then refused.
 * Not a bean: Spring Boot would also register it as a plain servlet filter.
 */
public class AuditUserFilter extends OncePerRequestFilter {

    static final String USER_ATTRIBUTE = AuditUserFilter.class.getName() + ".user";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        request.setAttribute(USER_ATTRIBUTE, currentEmail());
        chain.doFilter(request, response);
    }

    /** The signed-in caller's email, or null. */
    public static String currentEmail() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof Jwt jwt ? jwt.getClaimAsString("email") : null;
    }
}
