package com.tanmaysinghx.hidenseek_backend.agent;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public final class AgentDtos {

    private AgentDtos() {
    }

    public record EnrollRequest(@NotBlank String token, @NotBlank String publicKey,
                                @Min(1) @Max(65535) int listenPort, String detectedHost, String agentVersion) {
    }

    public record EnrollResponse(String nodeId, String agentToken) {
    }

    /** Desired state; the agent reconciles its WireGuard interface to match it on every poll. */
    public record NodeState(String nodeId, String address, int listenPort, List<String> upstreamDns,
                            boolean activityLogging, List<PeerSpec> peers) {
    }

    public record PeerSpec(String publicKey, List<String> allowedIps) {
    }

    public record Report(String agentVersion, @Size(max = 4096) List<@Valid PeerStat> peers,
                         @Size(max = 20000) List<@Valid DnsEvent> dns) {
    }

    /** Cumulative counters, as {@code wg show} reports them. */
    public record PeerStat(@NotBlank String publicKey, String endpoint, Instant lastHandshake, long rxBytes,
                           long txBytes) {
    }

    public record DnsEvent(String clientIp, String domain, String type, Instant at) {
    }
}
