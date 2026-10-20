package com.tanmaysinghx.hidenseek_backend.audit;

import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.AuditLogView;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.AuditStats;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.Deleted;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.TrafficStats;
import com.tanmaysinghx.hidenseek_backend.common.PageView;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The request audit log and console traffic analytics. Admin only (SecurityConfig). */
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminAuditController {

    private final AuditService audit;
    private final TrafficService traffic;

    /** Newest first. {@code status}: 404, 4xx or failed. {@code q}: part of a path, IP or email. */
    @GetMapping("/audit-logs")
    public PageView<AuditLogView> logs(@RequestParam(defaultValue = "7") int days,
                                       @RequestParam(required = false) String user,
                                       @RequestParam(required = false) String method,
                                       @RequestParam(required = false) String status,
                                       @RequestParam(required = false) String q,
                                       @RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "50") int size) {
        return audit.search(days, user, method, status, q, page, size);
    }

    @GetMapping("/audit-logs/stats")
    public AuditStats auditStats(@RequestParam(defaultValue = "30") int days) {
        return audit.stats(days);
    }

    /** Deletes audit records from before {@code before} (yyyy-MM-dd, the start of that day). Today is kept. */
    @DeleteMapping("/audit-logs")
    public Deleted purgeLogs(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate before) {
        return audit.purge(before);
    }

    @GetMapping("/traffic/stats")
    public TrafficStats trafficStats(@RequestParam(defaultValue = "30") int days) {
        return traffic.stats(days);
    }

    @DeleteMapping("/traffic-events")
    public Deleted purgeTraffic(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate before) {
        return traffic.purge(before);
    }
}
