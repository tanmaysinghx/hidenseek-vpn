package com.tanmaysinghx.hidenseek_backend.agent;

import com.tanmaysinghx.hidenseek_backend.activity.ActivityService;
import com.tanmaysinghx.hidenseek_backend.agent.AgentDtos.EnrollRequest;
import com.tanmaysinghx.hidenseek_backend.agent.AgentDtos.EnrollResponse;
import com.tanmaysinghx.hidenseek_backend.agent.AgentDtos.NodeState;
import com.tanmaysinghx.hidenseek_backend.agent.AgentDtos.PeerSpec;
import com.tanmaysinghx.hidenseek_backend.agent.AgentDtos.Report;
import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.common.Ipv4Cidr;
import com.tanmaysinghx.hidenseek_backend.common.WireGuardKeys;
import com.tanmaysinghx.hidenseek_backend.device.PeerRepository;
import com.tanmaysinghx.hidenseek_backend.node.Node;
import com.tanmaysinghx.hidenseek_backend.node.NodeService;
import com.tanmaysinghx.hidenseek_backend.session.SessionTracker;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The API hidenseek-agent talks to. Agents only ever call out, so nodes need no inbound admin port. */
@RestController
@RequestMapping("/agent/v1")
@RequiredArgsConstructor
public class AgentController {

    private final NodeService nodeService;
    private final PeerRepository peers;
    private final SessionTracker sessionTracker;
    private final ActivityService activityService;

    @PostMapping("/enroll")
    public EnrollResponse enroll(@Valid @RequestBody EnrollRequest request, HttpServletRequest http) {
        if (!WireGuardKeys.isValid(request.publicKey())) {
            throw ApiException.badRequest("HS-3002", "publicKey is not a WireGuard public key");
        }
        String host = request.detectedHost() != null && !request.detectedHost().isBlank()
                ? request.detectedHost()
                : publicSourceAddress(http);
        NodeService.Enrollment enrollment = nodeService.enroll(request.token(), request.publicKey(),
                request.listenPort(), host, request.agentVersion());
        return new EnrollResponse(enrollment.node().getId(), enrollment.agentToken());
    }

    /** The agent's own address as we see it, unless it is private (agent on the same host or LAN). */
    private static String publicSourceAddress(HttpServletRequest http) {
        try {
            InetAddress address = InetAddress.getByName(http.getRemoteAddr());
            boolean local = address.isLoopbackAddress() || address.isSiteLocalAddress()
                    || address.isLinkLocalAddress() || address.isAnyLocalAddress();
            return local ? null : address.getHostAddress();
        } catch (UnknownHostException e) {
            return null;
        }
    }

    @GetMapping("/state")
    @Transactional(readOnly = true)
    public NodeState state(@AuthenticationPrincipal NodePrincipal principal) {
        Node node = nodeService.get(principal.nodeId());
        List<PeerSpec> specs = node.isEnabled()
                ? peers.findAuthorizedByNodeId(node.getId()).stream()
                        .map(p -> new PeerSpec(p.getDevice().getPublicKey(), List.of(p.getAddress() + "/32")))
                        .toList()
                : List.of();
        List<String> dns = Arrays.stream(node.getDns().split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        return new NodeState(node.getId(), Ipv4Cidr.parse(node.getAddressCidr()).gatewayWithPrefix(),
                node.getListenPort(), dns, node.isActivityLogging(), specs);
    }

    @PostMapping("/report")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void report(@AuthenticationPrincipal NodePrincipal principal, @Valid @RequestBody Report report) {
        Instant now = Instant.now();
        Node node = nodeService.get(principal.nodeId());
        node.setLastHeartbeatAt(now);
        if (report.agentVersion() != null) {
            node.setAgentVersion(report.agentVersion());
        }
        if (report.peers() != null) {
            sessionTracker.record(node, report.peers(), now);
        }
        activityService.record(node, report.dns());
    }
}
