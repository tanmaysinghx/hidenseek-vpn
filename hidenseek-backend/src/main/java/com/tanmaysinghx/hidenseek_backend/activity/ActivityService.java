package com.tanmaysinghx.hidenseek_backend.activity;

import com.tanmaysinghx.hidenseek_backend.agent.AgentDtos.DnsEvent;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.tanmaysinghx.hidenseek_backend.device.Peer;
import com.tanmaysinghx.hidenseek_backend.device.PeerRepository;
import com.tanmaysinghx.hidenseek_backend.node.Node;
import com.tanmaysinghx.hidenseek_backend.session.VpnSession;
import com.tanmaysinghx.hidenseek_backend.session.VpnSessionRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class ActivityService {

    private static final int MAX_DOMAIN_LENGTH = 253;

    private final ActivityRepository activity;
    private final PeerRepository peers;
    private final VpnSessionRepository sessions;
    private final HidenseekProperties properties;

    /** Stores DNS events against the user and open session of the tunnel address that made them. */
    @Transactional
    public void record(Node node, List<DnsEvent> events) {
        // Enforced here as well as on the agent: a node with logging off never stores activity.
        if (!node.isActivityLogging() || events == null || events.isEmpty()) {
            return;
        }
        Map<String, Peer> byAddress = peers.findAllWithDeviceByNodeId(node.getId()).stream()
                .collect(Collectors.toMap(Peer::getAddress, Function.identity()));
        Map<String, String> sessionByPeer = sessions.findByPeerIdInAndEndedAtIsNull(
                        byAddress.values().stream().map(Peer::getId).toList()).stream()
                .collect(Collectors.toMap(VpnSession::getPeerId, VpnSession::getId, (a, b) -> a));

        List<ActivityEvent> rows = new ArrayList<>();
        for (DnsEvent event : events) {
            Peer peer = byAddress.get(event.clientIp());
            if (peer == null || event.domain() == null || event.domain().isBlank()) {
                continue;
            }
            ActivityEvent row = new ActivityEvent();
            row.setUserId(peer.getDevice().getUser().getId());
            row.setNodeId(node.getId());
            row.setSessionId(sessionByPeer.get(peer.getId()));
            row.setDomain(normalize(event.domain()));
            row.setQueryType(event.type() == null ? "?" : event.type());
            row.setOccurredAt(event.at() == null ? Instant.now() : event.at());
            rows.add(row);
        }
        activity.saveAll(rows);
    }

    @Scheduled(cron = "0 15 3 * * *")
    @Transactional
    public void purgeExpired() {
        int deleted = activity.deleteOlderThan(Instant.now().minus(properties.activity().retention()));
        if (deleted > 0) {
            log.info("Purged {} activity records past retention", deleted);
        }
    }

    static String normalize(String domain) {
        String d = domain.toLowerCase(Locale.ROOT);
        if (d.endsWith(".")) {
            d = d.substring(0, d.length() - 1);
        }
        return d.length() > MAX_DOMAIN_LENGTH ? d.substring(0, MAX_DOMAIN_LENGTH) : d;
    }
}
