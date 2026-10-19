package com.tanmaysinghx.hidenseek_backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Serves the Angular console (static/console) as a single-page app: client routes such as
 * /console/users/42 get index.html, while real files (anything with an extension) are served as is.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ConsoleForwardingFilter extends OncePerRequestFilter {

    static final String BASE = "/console";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (path.equals(BASE)) {
            response.sendRedirect(BASE + "/");
            return;
        }
        String last = path.substring(path.lastIndexOf('/') + 1);
        if (path.startsWith(BASE + "/") && !last.contains(".")) {
            // The shell must never be cached, so a deploy is picked up on the next load.
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-cache");
            request.getRequestDispatcher(BASE + "/index.html").forward(request, response);
            return;
        }
        chain.doFilter(request, response);
    }
}
