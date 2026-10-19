package com.tanmaysinghx.hidenseek_backend.insights;

import com.tanmaysinghx.hidenseek_backend.activity.ActivityRepository;
import com.tanmaysinghx.hidenseek_backend.activity.AdminActivityController.ActivityView;
import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.device.Device;
import com.tanmaysinghx.hidenseek_backend.device.DeviceDtos.DeviceView;
import com.tanmaysinghx.hidenseek_backend.device.DeviceRepository;
import com.tanmaysinghx.hidenseek_backend.insights.InsightsDtos.CountryStat;
import com.tanmaysinghx.hidenseek_backend.insights.InsightsDtos.Dashboard;
import com.tanmaysinghx.hidenseek_backend.insights.InsightsDtos.DayPoint;
import com.tanmaysinghx.hidenseek_backend.insights.InsightsDtos.DomainStat;
import com.tanmaysinghx.hidenseek_backend.insights.InsightsDtos.LiveSession;
import com.tanmaysinghx.hidenseek_backend.insights.InsightsDtos.UserInsights;
import com.tanmaysinghx.hidenseek_backend.insights.InsightsDtos.UserTraffic;
import com.tanmaysinghx.hidenseek_backend.node.Node;
import com.tanmaysinghx.hidenseek_backend.node.NodeRepository;
import com.tanmaysinghx.hidenseek_backend.session.SessionController;
import com.tanmaysinghx.hidenseek_backend.session.SessionDtos.SessionView;
import com.tanmaysinghx.hidenseek_backend.session.VpnSession;
import com.tanmaysinghx.hidenseek_backend.session.VpnSessionRepository;
import com.tanmaysinghx.hidenseek_backend.user.UserDtos.UserView;
import com.tanmaysinghx.hidenseek_backend.user.VpnUser;
import com.tanmaysinghx.hidenseek_backend.user.VpnUserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Aggregates for the admin console. Sessions are bucketed in Java rather than SQL so the same code
 * runs on MySQL and H2; at the scale of a friends' VPN that is a few thousand rows at most.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InsightsService {

    static final int MAX_DAYS = 90;
    private static final int TOP = 10;

    private final VpnSessionRepository sessions;
    private final ActivityRepository activity;
    private final VpnUserRepository users;
    private final NodeRepository nodes;
    private final DeviceRepository devices;
    private final SessionController sessionController;

    public Dashboard dashboard(int requestedDays) {
        int days = clampDays(requestedDays);
        Instant since = startOf(days);
        List<VpnSession> window = sessions.findActiveSince(since);
        Map<String, VpnUser> userById = users.findAll().stream().collect(Collectors.toMap(VpnUser::getId, Function.identity()));
        Map<String, String> emails = emails(userById);

        List<UserTraffic> topUsers = window.stream()
                .collect(Collectors.groupingBy(VpnSession::getUserId))
                .entrySet().stream()
                .map(e -> traffic(userById.get(e.getKey()), e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong((UserTraffic u) -> u.downloadBytes() + u.uploadBytes()).reversed())
                .limit(TOP)
                .toList();

        List<CountryStat> countries = window.stream()
                .collect(Collectors.groupingBy(s -> s.getCountryCode() == null ? "" : s.getCountryCode()))
                .entrySet().stream()
                .map(e -> new CountryStat(e.getKey().isEmpty() ? null : e.getKey(),
                        e.getValue().getFirst().getCountry(), e.getValue().size(),
                        e.getValue().stream().map(VpnSession::getUserId).distinct().count()))
                .sorted(Comparator.comparingLong(CountryStat::sessions).reversed())
                .limit(TOP)
                .toList();

        Map<String, String> nodeNames = nodes.findAll().stream().collect(Collectors.toMap(Node::getId, Node::getName));
        Map<String, String> deviceNames = devices.findAllById(sessions.findByEndedAtIsNullOrderByStartedAtDesc().stream()
                        .map(VpnSession::getDeviceId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(Device::getId, Device::getName));
        List<LiveSession> live = sessions.findByEndedAtIsNullOrderByStartedAtDesc().stream()
                .map(s -> new LiveSession(SessionView.of(s), nodeNames.get(s.getNodeId()), deviceNames.get(s.getDeviceId())))
                .toList();

        List<ActivityView> recent = activity.search(since, null, null, PageRequest.of(0, 15)).getContent().stream()
                .map(a -> new ActivityView(a.getId(), a.getSessionId(), a.getUserId(), emails.get(a.getUserId()),
                        a.getNodeId(), a.getDomain(), a.getQueryType(), a.getOccurredAt()))
                .toList();

        return new Dashboard(days, sessionController.stats(), activity.countSince(since, null), daily(window, days),
                topDomains(since, null, TOP), topUsers, countries, live, recent);
    }

    public UserInsights user(String userId, int requestedDays) {
        int days = clampDays(requestedDays);
        Instant since = startOf(days);
        VpnUser user = users.findById(userId).orElseThrow(() -> ApiException.notFound("User"));
        List<VpnSession> window = sessions.findActiveSinceForUser(userId, since);
        UserTraffic totals = traffic(user, userId, window);
        List<SessionView> recent = sessions.findByUserIdOrderByStartedAtDesc(userId, PageRequest.of(0, 20))
                .map(SessionView::of).getContent();
        List<DeviceView> userDevices = devices.findByUserIdAndRevokedAtIsNullOrderByCreatedAt(userId).stream()
                .map(DeviceView::of).toList();
        return new UserInsights(days, UserView.of(user), totals.sessions(), totals.downloadBytes(), totals.uploadBytes(),
                totals.connectedSeconds(), activity.countSince(since, userId), daily(window, days),
                topDomains(since, userId, 15), userDevices, recent);
    }

    public List<DomainStat> websites(int requestedDays, String userId, int limit) {
        return topDomains(startOf(clampDays(requestedDays)), userId, Math.clamp(limit, 1, 200));
    }

    /** One point per UTC day, oldest first, with zero days filled in so charts have no gaps. */
    static List<DayPoint> daily(List<VpnSession> window, int days) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Map<LocalDate, long[]> buckets = new LinkedHashMap<>();
        Map<LocalDate, Set<String>> usersPerDay = new HashMap<>();
        for (int i = days - 1; i >= 0; i--) {
            buckets.put(today.minusDays(i), new long[3]);
            usersPerDay.put(today.minusDays(i), new HashSet<>());
        }
        for (VpnSession s : window) {
            LocalDate day = LocalDate.ofInstant(s.getStartedAt(), ZoneOffset.UTC);
            long[] b = buckets.get(day);
            if (b == null) {
                continue; // started before the window; still counted in totals, not in daily starts
            }
            b[0]++;
            b[1] += s.getTxBytes();
            b[2] += s.getRxBytes();
            usersPerDay.get(day).add(s.getUserId());
        }
        List<DayPoint> points = new ArrayList<>();
        buckets.forEach((day, b) -> points.add(new DayPoint(day, b[0], usersPerDay.get(day).size(), b[1], b[2])));
        return points;
    }

    private List<DomainStat> topDomains(Instant since, String userId, int limit) {
        return activity.topDomains(since, userId, PageRequest.of(0, limit)).stream()
                .map(r -> new DomainStat((String) r[0], ((Number) r[1]).longValue(), ((Number) r[2]).longValue(), (Instant) r[3]))
                .toList();
    }

    /** Server counters: tx is what the user downloaded, rx what they uploaded. */
    private static UserTraffic traffic(VpnUser user, String userId, List<VpnSession> list) {
        long down = 0, up = 0, seconds = 0;
        Instant last = null;
        for (VpnSession s : list) {
            down += s.getTxBytes();
            up += s.getRxBytes();
            seconds += s.elapsed().toSeconds();
            Instant seen = s.getEndedAt() != null ? s.getEndedAt() : s.getLastSeenAt();
            if (last == null || seen.isAfter(last)) {
                last = seen;
            }
        }
        return new UserTraffic(userId, user == null ? "deleted user" : user.getEmail(),
                user == null ? null : user.getDisplayName(), list.size(), down, up, seconds, last);
    }

    private static Map<String, String> emails(Map<String, VpnUser> users) {
        return users.values().stream().collect(Collectors.toMap(VpnUser::getId, VpnUser::getEmail));
    }

    private static int clampDays(int days) {
        return Math.clamp(days, 1, MAX_DAYS);
    }

    private static Instant startOf(int days) {
        return LocalDate.now(ZoneOffset.UTC).minusDays(days - 1L).atStartOfDay().toInstant(ZoneOffset.UTC);
    }
}
