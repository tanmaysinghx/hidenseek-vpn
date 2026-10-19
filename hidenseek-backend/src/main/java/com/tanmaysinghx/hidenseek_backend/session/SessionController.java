package com.tanmaysinghx.hidenseek_backend.session;

import com.tanmaysinghx.hidenseek_backend.common.PageView;
import com.tanmaysinghx.hidenseek_backend.node.Node;
import com.tanmaysinghx.hidenseek_backend.node.NodeRepository;
import com.tanmaysinghx.hidenseek_backend.session.SessionDtos.SessionView;
import com.tanmaysinghx.hidenseek_backend.session.SessionDtos.Stats;
import com.tanmaysinghx.hidenseek_backend.user.CurrentUser;
import com.tanmaysinghx.hidenseek_backend.user.VpnUser;
import com.tanmaysinghx.hidenseek_backend.user.VpnUserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class SessionController {

    private static final int MAX_PAGE_SIZE = 200;

    private final VpnSessionRepository sessions;
    private final VpnUserRepository users;
    private final NodeRepository nodes;

    @GetMapping("/api/v1/sessions")
    public PageView<SessionView> mine(@CurrentUser VpnUser user, @RequestParam(defaultValue = "0") int page,
                                      @RequestParam(defaultValue = "25") int size) {
        return PageView.of(sessions.findByUserIdOrderByStartedAtDesc(user.getId(), pageable(page, size)),
                SessionView::of);
    }

    @GetMapping("/api/v1/admin/sessions")
    public PageView<SessionView> all(@RequestParam(required = false) String userId,
                                     @RequestParam(defaultValue = "false") boolean active,
                                     @RequestParam(defaultValue = "0") int page,
                                     @RequestParam(defaultValue = "50") int size) {
        PageRequest pageable = pageable(page, size);
        if (userId != null) {
            return PageView.of(sessions.findByUserIdOrderByStartedAtDesc(userId, pageable), SessionView::of);
        }
        return PageView.of(active
                ? sessions.findByEndedAtIsNullOrderByStartedAtDesc(pageable)
                : sessions.findAllByOrderByStartedAtDesc(pageable), SessionView::of);
    }

    @GetMapping("/api/v1/admin/stats")
    public Stats stats() {
        Instant dayAgo = Instant.now().minus(Duration.ofDays(1));
        List<Node> all = nodes.findAll();
        return new Stats(users.count(), users.countByStatus(VpnUser.Status.PENDING), all.size(),
                all.stream().filter(Node::isOnline).count(), sessions.countByEndedAtIsNull(),
                sessions.countByStartedAtAfter(dayAgo), sessions.sumBytesSince(dayAgo));
    }

    private static PageRequest pageable(int page, int size) {
        return PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE));
    }
}
