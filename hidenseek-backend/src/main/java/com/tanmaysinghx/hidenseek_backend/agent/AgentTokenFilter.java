package com.tanmaysinghx.hidenseek_backend.agent;

import com.tanmaysinghx.hidenseek_backend.node.NodeService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Authenticates node agents by their opaque {@code hsn_agent_} bearer token. */
@Component
@RequiredArgsConstructor
public class AgentTokenFilter extends OncePerRequestFilter {

    private static final String PREFIX = "Bearer hsn_agent_";

    private final NodeService nodeService;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith(PREFIX)) {
            nodeService.authenticateAgent(header.substring("Bearer ".length())).ifPresent(node ->
                    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                            new NodePrincipal(node.getId()), null, List.of(new SimpleGrantedAuthority("ROLE_NODE")))));
        }
        chain.doFilter(request, response);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/agent/");
    }
}
