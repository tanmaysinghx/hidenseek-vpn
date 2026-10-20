package com.tanmaysinghx.hidenseek_backend.audit;

import static com.tanmaysinghx.hidenseek_backend.audit.AuditService.cut;
import static com.tanmaysinghx.hidenseek_backend.audit.AuditService.num;

import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.CampaignStat;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.PageStat;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.PlaceStat;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.SourceStat;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.TrafficBatch;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.TrafficDay;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.TrafficIn;
import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.TrafficStats;
import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.tanmaysinghx.hidenseek_backend.geo.GeoIpService;
import com.tanmaysinghx.hidenseek_backend.geo.GeoLocation;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Page views from the web console: the landing page and its referrer / utm_* tags, then each
 * in-app navigation. Visitor and visit ids are random values the browser keeps; there are no cookies.
 */
@Slf4j
@Service
public class TrafficService {

    static final int PER_IP_PER_MINUTE = 120;
    private static final int TOP = 10;

    private final TrafficEventRepository events;
    private final AuditService audit;
    private final GeoIpService geoIp;
    private final HidenseekProperties properties;
    private final Map<String, Deque<Instant>> recent = new ConcurrentHashMap<>();

    public TrafficService(TrafficEventRepository events, AuditService audit, GeoIpService geoIp,
                          HidenseekProperties properties) {
        this.events = events;
        this.audit = audit;
        this.geoIp = geoIp;
        this.properties = properties;
    }

    @Transactional
    public void record(TrafficBatch batch, String ip, String userAgent, String userEmail) {
        throttle(ip, batch.events().size());
        Instant now = Instant.now();
        ZoneId zone = audit.zone();
        GeoLocation geo = geoIp.locate(ip);
        TrafficEvent.Device device = device(userAgent);
        events.saveAll(batch.events().stream().map(in -> {
            // Trust the browser's clock only within the last hour, so a batch can't backfill history.
            Instant at = in.at() != null && in.at().isBefore(now) && in.at().isAfter(now.minus(Duration.ofHours(1)))
                    ? in.at() : now;
            TrafficEvent e = new TrafficEvent();
            e.setOccurredAt(at);
            e.setOccurredDay(LocalDate.ofInstant(at, zone));
            e.setVisitorId(batch.visitorId().trim());
            e.setSessionId(batch.sessionId().trim());
            e.setUserEmail(cut(userEmail, 320));
            e.setType(in.type());
            e.setPath(cut(pathOnly(in.path()), 255));
            e.setReferrer(in.type() == TrafficEvent.Type.LANDING ? cut(in.referrer(), 512) : null);
            e.setSource(cut(source(in), 255));
            e.setUtmSource(cut(in.utmSource(), 100));
            e.setUtmMedium(cut(in.utmMedium(), 100));
            e.setUtmCampaign(cut(in.utmCampaign(), 100));
            e.setDevice(device);
            e.setIp(cut(ip, 45));
            e.setCountryCode(geo.countryCode());
            e.setCountry(cut(geo.country(), 64));
            e.setRegion(cut(geo.region(), 64));
            e.setUserAgent(cut(userAgent, 255));
            return e;
        }).toList());
    }

    /** utm_source if tagged, else the referring site, else Direct. Links within the console count as Direct. */
    String source(TrafficIn in) {
        if (in.utmSource() != null && !in.utmSource().isBlank()) {
            return in.utmSource().trim().toLowerCase(Locale.ROOT);
        }
        String host = host(in.referrer());
        return host == null || host.equals(host(properties.publicUrl())) ? "Direct" : host;
    }

    static String host(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        try {
            String host = URI.create(url.trim()).getHost();
            if (host == null) {
                return null;
            }
            host = host.toLowerCase(Locale.ROOT);
            return host.startsWith("www.") ? host.substring(4) : host;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String pathOnly(String path) {
        String p = path.trim();
        int cut = p.indexOf('?');
        p = cut >= 0 ? p.substring(0, cut) : p;
        cut = p.indexOf('#');
        p = cut >= 0 ? p.substring(0, cut) : p;
        return p.startsWith("/") ? p : "/" + p;
    }

    static TrafficEvent.Device device(String userAgent) {
        if (userAgent == null || !userAgent.contains("Mozilla/")) {
            return TrafficEvent.Device.OTHER;
        }
        if (userAgent.contains("iPad") || userAgent.contains("Tablet")
                || (userAgent.contains("Android") && !userAgent.contains("Mobile"))) {
            return TrafficEvent.Device.TABLET;
        }
        return userAgent.contains("Mobi") ? TrafficEvent.Device.MOBILE : TrafficEvent.Device.DESKTOP;
    }

    /** The endpoint is public (the sign-in page reports too), so each IP gets a modest budget. */
    private void throttle(String ip, int count) {
        Instant now = Instant.now();
        Deque<Instant> window = recent.computeIfAbsent(ip == null ? "?" : ip, k -> new ArrayDeque<>());
        synchronized (window) {
            while (!window.isEmpty() && window.peekFirst().isBefore(now.minusSeconds(60))) {
                window.pollFirst();
            }
            if (window.size() + count > PER_IP_PER_MINUTE) {
                throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "HS-8003", "Too many events; slow down");
            }
            for (int i = 0; i < count; i++) {
                window.addLast(now);
            }
        }
    }

    @Scheduled(fixedDelayString = "PT5M")
    void evictIdle() {
        Instant cutoff = Instant.now().minusSeconds(60);
        recent.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                return e.getValue().isEmpty() || e.getValue().peekLast().isBefore(cutoff);
            }
        });
    }

    // ---- Reading -------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public TrafficStats stats(int requestedDays) {
        int days = AuditService.clampDays(requestedDays);
        Instant since = audit.since(days);
        Pageable top = PageRequest.of(0, TOP);
        Object[] t = events.totals(since).getFirst();
        Map<String, Long> devices = new LinkedHashMap<>();
        for (TrafficEvent.Device d : TrafficEvent.Device.values()) {
            devices.put(d.name(), 0L);
        }
        events.devices(since).forEach(r -> devices.put(((TrafficEvent.Device) r[0]).name(), num(r[1])));

        return new TrafficStats(days, num(t[0]), num(t[1]), num(t[2]), num(t[3]),
                audit.fillDays(days, AuditService.byDay(events.perDay(since)), (d, r) -> r == null
                        ? new TrafficDay(d, 0, 0, 0) : new TrafficDay(d, num(r[1]), num(r[2]), num(r[3]))),
                events.sources(since, top).stream().map(r -> new SourceStat((String) r[0], num(r[1]), num(r[2]))).toList(),
                events.campaigns(since, top).stream()
                        .map(r -> new CampaignStat((String) r[0], (String) r[1], (String) r[2], num(r[3]))).toList(),
                events.landingPages(since, top).stream().map(r -> new PageStat((String) r[0], num(r[1]), num(r[2]))).toList(),
                events.topPages(since, top).stream().map(r -> new PageStat((String) r[0], num(r[1]), num(r[2]))).toList(),
                events.countries(since, top).stream()
                        .map(r -> new PlaceStat((String) r[0], (String) r[1], (String) r[0], num(r[3]), num(r[2]))).toList(),
                events.regions(since, top).stream()
                        .map(r -> new PlaceStat((String) r[0], (String) r[0], (String) r[1], num(r[3]), num(r[2]))).toList(),
                devices);
    }

    // ---- Retention -----------------------------------------------------------------------------

    @Transactional
    public AuditDtos.Deleted purge(LocalDate before) {
        Instant cutoff = audit.cutoff(before);
        return new AuditDtos.Deleted(events.deleteOlderThan(cutoff), cutoff);
    }

    @Scheduled(cron = "0 35 3 * * *")
    @Transactional
    public void purgeExpired() {
        int deleted = events.deleteOlderThan(Instant.now().minus(properties.audit().retention()));
        if (deleted > 0) {
            log.info("Purged {} traffic events past retention", deleted);
        }
    }
}
