package com.tanmaysinghx.hidenseek_backend.activity;

import com.tanmaysinghx.hidenseek_backend.common.PageView;
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

    public record ActivityView(long id, String sessionId, String userId, String nodeId, String domain,
                               String queryType, Instant occurredAt) {
        static ActivityView of(ActivityEvent e) {
            return new ActivityView(e.getId(), e.getSessionId(), e.getUserId(), e.getNodeId(), e.getDomain(),
                    e.getQueryType(), e.getOccurredAt());
        }
    }

    @GetMapping
    public PageView<ActivityView> list(@RequestParam(required = false) String userId,
                                       @RequestParam(required = false) String sessionId,
                                       @RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "100") int size) {
        PageRequest pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 500));
        if (sessionId != null) {
            return PageView.of(activity.findBySessionIdOrderByOccurredAtDesc(sessionId, pageable), ActivityView::of);
        }
        if (userId != null) {
            return PageView.of(activity.findByUserIdOrderByOccurredAtDesc(userId, pageable), ActivityView::of);
        }
        return PageView.of(activity.findAllByOrderByOccurredAtDesc(pageable), ActivityView::of);
    }
}
