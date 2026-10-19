package com.tanmaysinghx.hidenseek_backend.activity;

import com.tanmaysinghx.hidenseek_backend.common.PageView;
import com.tanmaysinghx.hidenseek_backend.user.VpnUser;
import com.tanmaysinghx.hidenseek_backend.user.VpnUserRepository;
import java.time.Duration;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/activity")
@RequiredArgsConstructor
public class AdminActivityController {

    private final ActivityRepository activity;
    private final VpnUserRepository users;

    public record ActivityView(long id, String sessionId, String userId, String userEmail, String nodeId,
                               String domain, String queryType, Instant occurredAt) {
        static ActivityView of(ActivityEvent e, Map<String, String> emails) {
            return new ActivityView(e.getId(), e.getSessionId(), e.getUserId(), emails.get(e.getUserId()),
                    e.getNodeId(), e.getDomain(), e.getQueryType(), e.getOccurredAt());
        }
    }

    /** DNS activity, newest first. Filter by session, or by any of user, domain substring and days. */
    @GetMapping
    public PageView<ActivityView> list(@RequestParam(required = false) String userId,
                                       @RequestParam(required = false) String sessionId,
                                       @RequestParam(required = false) String q,
                                       @RequestParam(defaultValue = "30") int days,
                                       @RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "100") int size) {
        PageRequest pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 500));
        Map<String, String> emails = users.findAll().stream()
                .collect(Collectors.toMap(VpnUser::getId, VpnUser::getEmail));
        Function<ActivityEvent, ActivityView> view = e -> ActivityView.of(e, emails);
        if (sessionId != null) {
            return PageView.of(activity.findBySessionIdOrderByOccurredAtDesc(sessionId, pageable), view);
        }
        Instant since = Instant.now().minus(Duration.ofDays(Math.clamp(days, 1, 365)));
        String domain = q == null || q.isBlank() ? null : q.trim().toLowerCase(java.util.Locale.ROOT);
        return PageView.of(activity.search(since, blankToNull(userId), domain, pageable), view);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
