package com.tanmaysinghx.hidenseek_backend.insights;

import com.tanmaysinghx.hidenseek_backend.insights.InsightsDtos.Dashboard;
import com.tanmaysinghx.hidenseek_backend.insights.InsightsDtos.DomainStat;
import com.tanmaysinghx.hidenseek_backend.insights.InsightsDtos.UserInsights;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/insights")
@RequiredArgsConstructor
public class AdminInsightsController {

    private final InsightsService insights;

    @GetMapping("/dashboard")
    public Dashboard dashboard(@RequestParam(defaultValue = "7") int days) {
        return insights.dashboard(days);
    }

    @GetMapping("/users/{id}")
    public UserInsights user(@PathVariable String id, @RequestParam(defaultValue = "30") int days) {
        return insights.user(id, days);
    }

    @GetMapping("/websites")
    public List<DomainStat> websites(@RequestParam(defaultValue = "7") int days,
                                     @RequestParam(required = false) String userId,
                                     @RequestParam(defaultValue = "50") int limit) {
        return insights.websites(days, userId == null || userId.isBlank() ? null : userId, limit);
    }
}
