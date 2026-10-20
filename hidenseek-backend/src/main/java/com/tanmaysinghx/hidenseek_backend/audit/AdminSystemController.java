package com.tanmaysinghx.hidenseek_backend.audit;

import com.tanmaysinghx.hidenseek_backend.activity.ActivityRepository;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.DataSet;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.Deleted;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.SystemView;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.tanmaysinghx.hidenseek_backend.device.DeviceRepository;
import com.tanmaysinghx.hidenseek_backend.geo.GeoIpService;
import com.tanmaysinghx.hidenseek_backend.node.NodeRepository;
import com.tanmaysinghx.hidenseek_backend.user.VpnUserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The console's control panel: what's stored, how long it's kept, and manual clean-up. */
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminSystemController {

    private final AuditService audit;
    private final AuditLogRepository auditLogs;
    private final TrafficEventRepository trafficEvents;
    private final ActivityRepository activity;
    private final VpnUserRepository users;
    private final NodeRepository nodes;
    private final DeviceRepository devices;
    private final GeoIpService geoIp;
    private final HidenseekProperties properties;

    @GetMapping("/system")
    @Transactional(readOnly = true)
    public SystemView system() {
        long auditDays = properties.audit().retention().toDays();
        return new SystemView(geoIp.enabled(), properties.plans().timezone(), properties.audit().logReads(), List.of(
                new DataSet("audit", "API audit log", auditLogs.count(), auditLogs.oldest(), auditDays),
                new DataSet("traffic", "Console traffic", trafficEvents.count(), trafficEvents.oldest(), auditDays),
                new DataSet("activity", "DNS activity", activity.count(), activity.oldest(),
                        properties.activity().retention().toDays())),
                users.count(), nodes.count(), devices.count());
    }

    /** Deletes DNS activity from before {@code before} (yyyy-MM-dd). Today is kept. */
    @DeleteMapping("/activity")
    @Transactional
    public Deleted purgeActivity(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate before) {
        Instant cutoff = audit.cutoff(before);
        return new Deleted(activity.deleteOlderThan(cutoff), cutoff);
    }
}
