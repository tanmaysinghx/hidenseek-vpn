package com.tanmaysinghx.hidenseek_backend.device;

import com.tanmaysinghx.hidenseek_backend.node.Node;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** A device's slot on one node: its tunnel address there, plus the last transfer counters seen. */
@Entity
@Table(name = "hs_peers")
@Getter
@Setter
public class Peer {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "device_id")
    private Device device;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "node_id")
    private Node node;

    @Column(nullable = false)
    private String address;

    /** WireGuard's cumulative counters at the last report, used to compute per-session deltas. */
    @Column(nullable = false)
    private long lastRxBytes;

    @Column(nullable = false)
    private long lastTxBytes;

    @Column(nullable = false)
    private Instant createdAt;
}
