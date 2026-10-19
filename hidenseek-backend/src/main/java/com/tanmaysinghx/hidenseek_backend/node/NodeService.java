package com.tanmaysinghx.hidenseek_backend.node;

import com.tanmaysinghx.hidenseek_backend.activity.ActivityRepository;
import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.common.Ipv4Cidr;
import com.tanmaysinghx.hidenseek_backend.common.Tokens;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.tanmaysinghx.hidenseek_backend.device.PeerRepository;
import com.tanmaysinghx.hidenseek_backend.node.NodeDtos.CreateNodeRequest;
import com.tanmaysinghx.hidenseek_backend.node.NodeDtos.EnrollmentView;
import com.tanmaysinghx.hidenseek_backend.node.NodeDtos.UpdateNodeRequest;
import com.tanmaysinghx.hidenseek_backend.session.VpnSessionRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class NodeService {

    static final Duration ENROLLMENT_TTL = Duration.ofHours(1);
    static final int DEFAULT_PORT = 51820;
    static final String DEFAULT_CIDR = "10.66.0.0/24";
    static final String DEFAULT_DNS = "1.1.1.1,9.9.9.9";

    private final NodeRepository nodes;
    private final PeerRepository peers;
    private final VpnSessionRepository sessions;
    private final ActivityRepository activity;
    private final HidenseekProperties properties;

    public List<Node> list() {
        return nodes.findAllByOrderByName();
    }

    public List<Node> listAvailable() {
        return nodes.findAllByOrderByName().stream().filter(Node::isAvailable).toList();
    }

    public Node get(String id) {
        return nodes.findById(id).orElseThrow(() -> ApiException.notFound("Node"));
    }

    @Transactional
    public Node create(CreateNodeRequest request) {
        if (nodes.existsByNameIgnoreCase(request.name().trim())) {
            throw ApiException.conflict("HS-2001", "A node with this name already exists");
        }
        String cidr = request.addressCidr() == null ? DEFAULT_CIDR : request.addressCidr();
        try {
            cidr = Ipv4Cidr.parse(cidr).toString();
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("HS-2002", e.getMessage());
        }
        Node node = new Node();
        node.setName(request.name().trim());
        node.setCountryCode(request.countryCode().toUpperCase(Locale.ROOT));
        node.setCity(blankToNull(request.city()));
        node.setEndpointHost(blankToNull(request.endpointHost()));
        node.setListenPort(request.listenPort() == null ? DEFAULT_PORT : request.listenPort());
        node.setAddressCidr(cidr);
        node.setDns(request.dns() == null || request.dns().isBlank() ? DEFAULT_DNS : request.dns().trim());
        node.setActivityLogging(Boolean.TRUE.equals(request.activityLogging()));
        node.setEnabled(true);
        node.setStatus(Node.Status.PENDING);
        node.setCreatedAt(Instant.now());
        return nodes.save(node);
    }

    @Transactional
    public Node update(String id, UpdateNodeRequest request) {
        Node node = get(id);
        if (request.name() != null && !request.name().isBlank()) {
            node.setName(request.name().trim());
        }
        if (request.countryCode() != null) {
            node.setCountryCode(request.countryCode().toUpperCase(Locale.ROOT));
        }
        if (request.city() != null) {
            node.setCity(blankToNull(request.city()));
        }
        if (request.endpointHost() != null) {
            node.setEndpointHost(blankToNull(request.endpointHost()));
        }
        if (request.dns() != null && !request.dns().isBlank()) {
            node.setDns(request.dns().trim());
        }
        if (request.enabled() != null) {
            node.setEnabled(request.enabled());
        }
        if (request.activityLogging() != null) {
            node.setActivityLogging(request.activityLogging());
        }
        return node;
    }

    @Transactional
    public void delete(String id) {
        Node node = get(id);
        activity.deleteByNodeId(node.getId());
        sessions.deleteByNodeId(node.getId());
        peers.deleteByNodeId(node.getId());
        nodes.delete(node);
    }

    /** Issues a one-hour, single-use token the install script exchanges for an agent token. */
    @Transactional
    public EnrollmentView issueEnrollment(String id) {
        Node node = get(id);
        String token = Tokens.generate("hsn_enroll_");
        node.setEnrollmentTokenHash(Tokens.hash(token));
        node.setEnrollmentExpiresAt(Instant.now().plus(ENROLLMENT_TTL));
        String command = "curl -fsSL %s/install.sh | sudo bash -s -- --api %s --token %s"
                .formatted(properties.publicUrl(), properties.publicUrl(), token);
        return new EnrollmentView(token, node.getEnrollmentExpiresAt(), command);
    }

    public record Enrollment(Node node, String agentToken) {
    }

    @Transactional
    public Enrollment enroll(String enrollmentToken, String publicKey, int listenPort, String detectedHost,
                             String agentVersion) {
        Node node = nodes.findByEnrollmentTokenHash(Tokens.hash(enrollmentToken))
                .filter(n -> n.getEnrollmentExpiresAt() != null && n.getEnrollmentExpiresAt().isAfter(Instant.now()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "HS-3001",
                        "Enrollment token is invalid or expired; issue a new one from the admin console"));
        String agentToken = Tokens.generate("hsn_agent_");
        node.setEnrollmentTokenHash(null);
        node.setEnrollmentExpiresAt(null);
        node.setAgentTokenHash(Tokens.hash(agentToken));
        node.setPublicKey(publicKey);
        node.setListenPort(listenPort);
        if (node.getEndpointHost() == null && detectedHost != null && !detectedHost.isBlank()) {
            node.setEndpointHost(detectedHost.trim());
        }
        node.setAgentVersion(agentVersion);
        node.setStatus(Node.Status.ENROLLED);
        node.setLastHeartbeatAt(Instant.now());
        return new Enrollment(node, agentToken);
    }

    public Optional<Node> authenticateAgent(String agentToken) {
        return nodes.findByAgentTokenHash(Tokens.hash(agentToken));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
