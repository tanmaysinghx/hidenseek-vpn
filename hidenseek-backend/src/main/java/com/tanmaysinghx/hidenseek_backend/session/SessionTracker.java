package com.tanmaysinghx.hidenseek_backend.session;

import com.tanmaysinghx.hidenseek_backend.agent.AgentDtos.PeerStat;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.tanmaysinghx.hidenseek_backend.device.Peer;
import com.tanmaysinghx.hidenseek_backend.device.PeerRepository;
import com.tanmaysinghx.hidenseek_backend.geo.GeoIpService;
import com.tanmaysinghx.hidenseek_backend.geo.GeoLocation;
import com.tanmaysinghx.hidenseek_backend.node.Node;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns WireGuard peer stats into sessions. A peer with a recent handshake is connected; a new
 * session starts when it first connects or reconnects from a different public IP, and ends when the
 * handshake goes stale.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SessionTracker {

    private final PeerRepository peers;
    private final VpnSessionRepository sessions;
    private final GeoIpService geoIp;
    private final HidenseekProperties properties;

    @Transactional
    public void record(Node node, List<PeerStat> stats, Instant now) {
        Map<String, Peer> byKey = peers.findAllWithDeviceByNodeId(node.getId()).stream()
                .collect(Collectors.toMap(p -> p.getDevice().getPublicKey(), Function.identity()));
        Instant activeAfter = now.minus(properties.sessions().handshakeTimeout());

        for (PeerStat stat : stats) {
            Peer peer = byKey.get(stat.publicKey());
            if (peer == null) {
                continue;
            }
            long rx = delta(stat.rxBytes(), peer.getLastRxBytes());
            long tx = delta(stat.txBytes(), peer.getLastTxBytes());
            peer.setLastRxBytes(stat.rxBytes());
            peer.setLastTxBytes(stat.txBytes());

            boolean connected = stat.lastHandshake() != null && stat.lastHandshake().isAfter(activeAfter);
            VpnSession open = sessions.findFirstByPeerIdAndEndedAtIsNull(peer.getId()).orElse(null);
            String clientIp = hostOf(stat.endpoint());

            if (connected) {
                if (open != null && clientIp != null && !clientIp.equals(open.getClientIp())) {
                    close(open, now);
                    open = null;
                }
                if (open == null) {
                    open = start(peer, clientIp, min(stat.lastHandshake(), now));
                }
                open.setLastSeenAt(now);
                add(open, rx, tx);
            } else if (open != null) {
                add(open, rx, tx);
                close(open, stat.lastHandshake() != null ? max(stat.lastHandshake(), open.getStartedAt()) : open.getLastSeenAt());
            }
        }
    }

    /** Closes sessions whose node stopped reporting (agent down, VPS rebooted). */
    @Scheduled(fixedDelayString = "PT1M")
    @Transactional
    public void closeAbandoned() {
        Instant cutoff = Instant.now().minus(properties.sessions().handshakeTimeout()).minus(Node.ONLINE_WINDOW);
        List<VpnSession> stale = sessions.findByEndedAtIsNullAndLastSeenAtBefore(cutoff);
        stale.forEach(s -> s.setEndedAt(s.getLastSeenAt()));
        if (!stale.isEmpty()) {
            log.info("Closed {} sessions from nodes that stopped reporting", stale.size());
        }
    }

    private VpnSession start(Peer peer, String clientIp, Instant startedAt) {
        GeoLocation geo = geoIp.locate(clientIp);
        VpnSession session = new VpnSession();
        session.setPeerId(peer.getId());
        session.setUserId(peer.getDevice().getUser().getId());
        session.setUserEmail(peer.getDevice().getUser().getEmail());
        session.setDeviceId(peer.getDevice().getId());
        session.setNodeId(peer.getNode().getId());
        session.setClientIp(clientIp != null ? clientIp : "unknown");
        session.setCountryCode(geo.countryCode());
        session.setCountry(geo.country());
        session.setRegion(geo.region());
        session.setCity(geo.city());
        session.setStartedAt(startedAt);
        session.setLastSeenAt(startedAt);
        return sessions.save(session);
    }

    private static void close(VpnSession session, Instant endedAt) {
        session.setEndedAt(endedAt);
        session.setLastSeenAt(endedAt);
    }

    private static void add(VpnSession session, long rx, long tx) {
        session.setRxBytes(session.getRxBytes() + rx);
        session.setTxBytes(session.getTxBytes() + tx);
    }

    /** WireGuard counters reset when the interface or peer is recreated. */
    static long delta(long current, long last) {
        return current >= last ? current - last : current;
    }

    /** "1.2.3.4:51820" or "[2001:db8::1]:51820" to the bare address. */
    static String hostOf(String endpoint) {
        if (endpoint == null || endpoint.isBlank()) {
            return null;
        }
        if (endpoint.startsWith("[")) {
            int end = endpoint.indexOf(']');
            return end > 0 ? endpoint.substring(1, end) : null;
        }
        int colon = endpoint.lastIndexOf(':');
        return colon > 0 ? endpoint.substring(0, colon) : endpoint;
    }

    private static Instant min(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }

    private static Instant max(Instant a, Instant b) {
        return a.isAfter(b) ? a : b;
    }
}
