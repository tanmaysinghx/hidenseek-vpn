package com.tanmaysinghx.hidenseek_backend.audit;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Wraps every request, outside Spring Security, so rejected requests (401/403) are audited too.
 * Runs after the forwarded-header filter, so {@code getRemoteAddr()} is the client's IP as Caddy
 * saw it. The caller's identity comes from {@link AuditUserFilter}, which runs inside the chain.
 */
public class AuditFilter extends OncePerRequestFilter {

    private final AuditService audit;

    public AuditFilter(AuditService audit) {
        this.audit = audit;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Instant at = Instant.now();
        long start = System.nanoTime();
        boolean failed = false;
        try {
            chain.doFilter(request, response);
        } catch (IOException | ServletException | RuntimeException e) {
            failed = true;
            throw e;
        } finally {
            int status = failed ? 500 : response.getStatus();
            String path = request.getRequestURI();
            if (audit.shouldAudit(request.getMethod(), path, status)) {
                audit.enqueue(new AuditService.Captured(at, (String) request.getAttribute(AuditUserFilter.USER_ATTRIBUTE),
                        request.getMethod(), path, status, (int) Math.min((System.nanoTime() - start) / 1_000_000, Integer.MAX_VALUE),
                        request.getRemoteAddr(), request.getHeader("Referer"), request.getHeader("User-Agent")));
            }
        }
    }
}
