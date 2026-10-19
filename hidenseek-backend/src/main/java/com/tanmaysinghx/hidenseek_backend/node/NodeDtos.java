package com.tanmaysinghx.hidenseek_backend.node;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public final class NodeDtos {

    private NodeDtos() {
    }

    /** What any signed-in user sees in the server picker. */
    public record NodeView(String id, String name, String countryCode, String city, boolean online,
                           boolean activityLogging) {
        public static NodeView of(Node node) {
            return new NodeView(node.getId(), node.getName(), node.getCountryCode(), node.getCity(),
                    node.isOnline(), node.isActivityLogging());
        }
    }

    public record AdminNodeView(String id, String name, String countryCode, String city, String endpointHost,
                                int listenPort, String publicKey, String addressCidr, String dns,
                                Node.Status status, boolean enabled, boolean activityLogging, boolean online,
                                String agentVersion, Instant lastHeartbeatAt, Instant createdAt,
                                long peerCount, long activeSessions) {
        public static AdminNodeView of(Node node, long peerCount, long activeSessions) {
            return new AdminNodeView(node.getId(), node.getName(), node.getCountryCode(), node.getCity(),
                    node.getEndpointHost(), node.getListenPort(), node.getPublicKey(), node.getAddressCidr(),
                    node.getDns(), node.getStatus(), node.isEnabled(), node.isActivityLogging(), node.isOnline(),
                    node.getAgentVersion(), node.getLastHeartbeatAt(), node.getCreatedAt(), peerCount, activeSessions);
        }
    }

    public record CreateNodeRequest(
            @NotBlank @Size(max = 100) String name,
            @NotBlank @Pattern(regexp = "[A-Za-z]{2}", message = "must be an ISO 3166 alpha-2 code") String countryCode,
            @Size(max = 100) String city,
            @Size(max = 255) String endpointHost,
            @Min(1) @Max(65535) Integer listenPort,
            @Pattern(regexp = "\\d{1,3}(\\.\\d{1,3}){3}/\\d{1,2}", message = "must be an IPv4 CIDR") String addressCidr,
            @Size(max = 255) String dns,
            Boolean activityLogging) {
    }

    public record UpdateNodeRequest(
            @Size(max = 100) String name,
            @Pattern(regexp = "[A-Za-z]{2}", message = "must be an ISO 3166 alpha-2 code") String countryCode,
            @Size(max = 100) String city,
            @Size(max = 255) String endpointHost,
            @Size(max = 255) String dns,
            Boolean enabled,
            Boolean activityLogging) {
    }

    public record EnrollmentView(String token, Instant expiresAt, String installCommand) {
    }
}
