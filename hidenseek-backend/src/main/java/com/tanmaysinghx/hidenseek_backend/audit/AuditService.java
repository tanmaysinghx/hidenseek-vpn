package com.tanmaysinghx.hidenseek_backend.audit;

import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.AuditDay;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.AuditLogView;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.AuditStats;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.IpStat;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.PlaceStat;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.RouteStat;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.UserStat;
import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.common.PageView;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.tanmaysinghx.hidenseek_backend.geo.GeoIpService;
import com.tanmaysinghx.hidenseek_backend.geo.GeoLocation;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BiFunction;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The request audit log. Requests are queued by {@link AuditFilter} and written in batches every
 * couple of seconds, so auditing never slows a request down; the GeoIP lookup happens at write time.
 */
@Slf4j
@Service
public class AuditService {

    static final int MAX_DAYS = 365;
    private static final int QUEUE_CAPACITY = 20_000;
    private static final int TOP = 10;
    private static final Pattern ID_SEGMENT = Pattern.compile(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\\d+|[A-Za-z0-9_-]{24,}");

    /** What the filter knows about a finished request. */
    public record Captured(Instant at, String userEmail, String method, String path, int status, int durationMs,
                           String ip, String referrer, String userAgent) {
    }

    private final AuditLogRepository logs;
    private final GeoIpService geoIp;
    private final HidenseekProperties properties;
    private final BlockingQueue<Captured> queue = new LinkedBlockingQueue<>(QUEUE_CAPACITY);
    private final AtomicLong dropped = new AtomicLong();

    public AuditService(AuditLogRepository logs, GeoIpService geoIp, HidenseekProperties properties) {
        this.logs = logs;
        this.geoIp = geoIp;
        this.properties = properties;
    }

    // ---- Recording -----------------------------------------------------------------------------

    /** Reads are only audited when they fail or AUDIT_LOG_READS is on; the apps poll constantly. */
    public boolean shouldAudit(String method, String path, int status) {
        if (!path.startsWith("/api/") || path.startsWith("/api/v1/public/events") || "OPTIONS".equals(method)) {
            return false;
        }
        boolean read = "GET".equals(method) || "HEAD".equals(method);
        return !read || status >= 400 || properties.audit().logReads();
    }

    public void enqueue(Captured captured) {
        if (!queue.offer(captured) && dropped.incrementAndGet() % 1000 == 1) {
            log.warn("Audit queue full; {} requests not audited so far", dropped.get());
        }
    }

    @Scheduled(fixedDelayString = "PT2S")
    @Transactional
    public void flush() {
        List<Captured> batch = new ArrayList<>();
        queue.drainTo(batch, 1000);
        if (batch.isEmpty()) {
            return;
        }
        ZoneId zone = zone();
        logs.saveAll(batch.stream().map(c -> toEntity(c, zone)).toList());
    }

    private AuditLog toEntity(Captured c, ZoneId zone) {
        AuditLog a = new AuditLog();
        a.setOccurredAt(c.at());
        a.setOccurredDay(LocalDate.ofInstant(c.at(), zone));
        a.setUserEmail(cut(c.userEmail(), 320));
        a.setMethod(cut(c.method(), 8));
        a.setPath(cut(c.path(), 255));
        a.setRoute(cut(route(c.path()), 255));
        a.setStatus(c.status());
        a.setDurationMs(c.durationMs());
        a.setClient(client(c.userAgent()));
        a.setIp(cut(c.ip(), 45));
        GeoLocation geo = geoIp.locate(c.ip());
        a.setCountryCode(geo.countryCode());
        a.setCountry(cut(geo.country(), 64));
        a.setRegion(cut(geo.region(), 64));
        a.setCity(cut(geo.city(), 64));
        a.setReferrer(cut(c.referrer(), 512));
        a.setUserAgent(cut(c.userAgent(), 255));
        return a;
    }

    /** {@code /api/v1/admin/users/3f2a.../plan} becomes {@code /api/v1/admin/users/{id}/plan}. */
    static String route(String path) {
        String[] parts = path.split("/", -1);
        for (int i = 0; i < parts.length; i++) {
            if (!parts[i].isEmpty() && ID_SEGMENT.matcher(parts[i]).matches() && !parts[i].matches("v\\d+")) {
                parts[i] = "{id}";
            }
        }
        return String.join("/", parts);
    }

    static AuditLog.Client client(String userAgent) {
        if (userAgent == null) {
            return AuditLog.Client.OTHER;
        }
        if (userAgent.startsWith("hidenseek-app/")) {
            return AuditLog.Client.APP;
        }
        return userAgent.contains("Mozilla/") ? AuditLog.Client.WEB : AuditLog.Client.OTHER;
    }

    // ---- Reading -------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PageView<AuditLogView> search(int days, String user, String method, String status, String q, int page,
                                         int size) {
        Integer min = null;
        Integer max = null;
        if (status != null && !status.isBlank()) {
            String s = status.trim().toLowerCase(Locale.ROOT);
            if (s.matches("[1-5]xx")) {
                min = (s.charAt(0) - '0') * 100;
                max = min + 99;
            } else if ("failed".equals(s)) {
                min = 400;
            } else if (s.matches("\\d{3}")) {
                min = max = Integer.parseInt(s);
            } else {
                throw ApiException.badRequest("HS-8002", "Status must be like 404, 4xx or failed");
            }
        }
        return PageView.of(logs.search(since(days), blankToNull(user), upper(method), min, max, lower(q),
                PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 500))), AuditLogView::of);
    }

    @Transactional(readOnly = true)
    public AuditStats stats(int requestedDays) {
        int days = clampDays(requestedDays);
        Instant since = since(days);
        Pageable top = PageRequest.of(0, TOP);
        Object[] t = logs.totals(since).getFirst();

        Map<String, Long> statusClasses = new LinkedHashMap<>();
        for (String c : List.of("2xx", "3xx", "4xx", "5xx")) {
            statusClasses.put(c, 0L);
        }
        for (Object[] r : logs.statuses(since)) {
            statusClasses.merge((((Number) r[0]).intValue() / 100) + "xx", num(r[1]), Long::sum);
        }
        Map<String, Long> clients = new LinkedHashMap<>();
        for (AuditLog.Client c : AuditLog.Client.values()) {
            clients.put(c.name(), 0L);
        }
        logs.clients(since).forEach(r -> clients.put(((AuditLog.Client) r[0]).name(), num(r[1])));

        return new AuditStats(days, num(t[0]), num(t[1]), num(t[2]), num(t[3]), num(t[4]),
                fillDays(days, byDay(logs.perDay(since)),
                        (d, r) -> new AuditDay(d, r == null ? 0 : num(r[1]), r == null ? 0 : num(r[2]))),
                statusClasses, clients,
                logs.topRoutes(since, top).stream()
                        .map(r -> new RouteStat((String) r[0], (String) r[1], num(r[2]), num(r[3]), num(r[4]))).toList(),
                logs.topUsers(since, top).stream()
                        .map(r -> new UserStat((String) r[0], num(r[1]), num(r[2]), (Instant) r[3])).toList(),
                logs.topIps(since, top).stream()
                        .map(r -> new IpStat((String) r[0], (String) r[1], (String) r[2], num(r[3]), num(r[4]), (Instant) r[5]))
                        .toList(),
                logs.countries(since, top).stream()
                        .map(r -> new PlaceStat((String) r[0], (String) r[1], (String) r[0], num(r[2]), num(r[3]))).toList(),
                logs.regions(since, top).stream()
                        .map(r -> new PlaceStat((String) r[0], (String) r[0], (String) r[1], num(r[2]), num(r[3]))).toList());
    }

    // ---- Retention -----------------------------------------------------------------------------

    /** Deletes records from before the start of {@code before} (a day in the configured timezone). */
    @Transactional
    public AuditDtos.Deleted purge(LocalDate before) {
        Instant cutoff = cutoff(before);
        return new AuditDtos.Deleted(logs.deleteOlderThan(cutoff), cutoff);
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purgeExpired() {
        int deleted = logs.deleteOlderThan(Instant.now().minus(properties.audit().retention()));
        if (deleted > 0) {
            log.info("Purged {} audit log records past retention", deleted);
        }
    }

    // ---- Helpers shared with the traffic and system code ----------------------------------------

    /** Purges may not touch today: an accidental "delete everything" still leaves today's trail. */
    Instant cutoff(LocalDate before) {
        if (before == null) {
            throw ApiException.badRequest("HS-8001", "Choose a date to delete records from before");
        }
        LocalDate today = LocalDate.now(zone());
        if (before.isAfter(today)) {
            throw ApiException.badRequest("HS-8001", "Records from today can't be deleted; pick today or an earlier day");
        }
        return before.atStartOfDay(zone()).toInstant();
    }

    ZoneId zone() {
        return ZoneId.of(properties.plans().timezone());
    }

    Instant since(int days) {
        return LocalDate.now(zone()).minusDays(clampDays(days) - 1L).atStartOfDay(zone()).toInstant();
    }

    static int clampDays(int days) {
        return Math.clamp(days, 1, MAX_DAYS);
    }

    /** Rows whose first column is the day, keyed by it. */
    static Map<LocalDate, Object[]> byDay(List<Object[]> rows) {
        Map<LocalDate, Object[]> out = new HashMap<>();
        rows.forEach(r -> out.put((LocalDate) r[0], r));
        return out;
    }

    /** One point per day of the window, oldest first, including days with no rows. */
    <T> List<T> fillDays(int days, Map<LocalDate, Object[]> rows, BiFunction<LocalDate, Object[], T> point) {
        LocalDate today = LocalDate.now(zone());
        List<T> out = new ArrayList<>(days);
        for (LocalDate d = today.minusDays(days - 1L); !d.isAfter(today); d = d.plusDays(1)) {
            out.add(point.apply(d, rows.get(d)));
        }
        return out;
    }

    long retentionDays() {
        return properties.audit().retention().toDays();
    }

    static long num(Object o) {
        return o == null ? 0 : ((Number) o).longValue();
    }

    static String cut(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String upper(String s) {
        return s == null || s.isBlank() ? null : s.trim().toUpperCase(Locale.ROOT);
    }

    private static String lower(String s) {
        return s == null || s.isBlank() ? null : s.trim().toLowerCase(Locale.ROOT);
    }
}
