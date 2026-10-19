package com.tanmaysinghx.hidenseek_backend.node;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** A VPS running hidenseek-agent and a WireGuard interface. */
@Entity
@Table(name = "hs_nodes")
@Getter
@Setter
public class Node {

    /** A node that hasn't reported within this window is shown as offline. */
    public static final Duration ONLINE_WINDOW = Duration.ofSeconds(90);

    public enum Status { PENDING, ENROLLED }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(nullable = false, length = 2)
    private String countryCode;

    private String city;

    /** Public hostname or IP clients dial. Detected by the agent at enrollment when left blank. */
    private String endpointHost;

    @Column(nullable = false)
    private int listenPort;

    private String publicKey;

    /** Tunnel subnet, e.g. 10.66.0.0/24. The node takes the first host; peers get the rest. */
    @Column(nullable = false)
    private String addressCidr;

    /** Upstream resolvers for the node's DNS forwarder, comma separated. */
    @Column(nullable = false)
    private String dns;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(nullable = false)
    private boolean enabled;

    /** When true the node's resolver records DNS lookups; users are told before connecting. */
    @Column(nullable = false)
    private boolean activityLogging;

    private String enrollmentTokenHash;

    private Instant enrollmentExpiresAt;

    private String agentTokenHash;

    private String agentVersion;

    private Instant lastHeartbeatAt;

    @Column(nullable = false)
    private Instant createdAt;

    public boolean isOnline() {
        return lastHeartbeatAt != null && lastHeartbeatAt.isAfter(Instant.now().minus(ONLINE_WINDOW));
    }

    public boolean isAvailable() {
        return enabled && status == Status.ENROLLED && endpointHost != null && publicKey != null;
    }

    public String endpoint() {
        String host = endpointHost.contains(":") ? "[" + endpointHost + "]" : endpointHost;
        return host + ":" + listenPort;
    }
}
