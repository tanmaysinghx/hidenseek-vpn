package com.tanmaysinghx.hidenseek_backend.audit;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class AuditDtos {

    private AuditDtos() {
    }

    // ---- Audit log ---------------------------------------------------------------------------

    public record AuditLogView(long id, Instant occurredAt, String userEmail, String method, String path, String route,
                               int status, int durationMs, AuditLog.Client client, String ip, String countryCode,
                               String country, String region, String city, String referrer, String userAgent) {
        static AuditLogView of(AuditLog a) {
            return new AuditLogView(a.getId(), a.getOccurredAt(), a.getUserEmail(), a.getMethod(), a.getPath(),
                    a.getRoute(), a.getStatus(), a.getDurationMs(), a.getClient(), a.getIp(), a.getCountryCode(),
                    a.getCountry(), a.getRegion(), a.getCity(), a.getReferrer(), a.getUserAgent());
        }
    }

    public record AuditDay(LocalDate date, long requests, long failures) {
    }

    public record RouteStat(String method, String route, long requests, long failures, long avgMs) {
    }

    public record UserStat(String email, long requests, long failures, Instant lastSeen) {
    }

    public record IpStat(String ip, String countryCode, String region, long requests, long failures, Instant lastSeen) {
    }

    /** {@code requests} is page views for traffic stats; {@code ips} is distinct visitors there. */
    public record PlaceStat(String code, String name, String countryCode, long requests, long uniques) {
    }

    public record AuditStats(int days, long requests, long failures, long uniqueIps, long uniqueUsers, long avgMs,
                             List<AuditDay> daily, Map<String, Long> statusClasses, Map<String, Long> clients,
                             List<RouteStat> topRoutes, List<UserStat> topUsers, List<IpStat> topIps,
                             List<PlaceStat> countries, List<PlaceStat> regions) {
    }

    public record Deleted(long deleted, Instant before) {
    }

    // ---- Traffic ------------------------------------------------------------------------------

    public record TrafficIn(@NotNull TrafficEvent.Type type, @NotBlank @Size(max = 255) String path,
                            @Size(max = 512) String referrer, @Size(max = 100) String utmSource,
                            @Size(max = 100) String utmMedium, @Size(max = 100) String utmCampaign, Instant at) {
    }

    public record TrafficBatch(@NotBlank @Size(max = 36) String visitorId, @NotBlank @Size(max = 36) String sessionId,
                               @NotEmpty @Size(max = 50) List<@Valid TrafficIn> events) {
    }

    public record TrafficDay(LocalDate date, long pageViews, long visitors, long visits) {
    }

    public record SourceStat(String source, long visits, long visitors) {
    }

    public record CampaignStat(String source, String medium, String campaign, long visits) {
    }

    public record PageStat(String path, long views, long visitors) {
    }

    public record TrafficStats(int days, long pageViews, long visitors, long visits, long signedInUsers,
                               List<TrafficDay> daily, List<SourceStat> sources, List<CampaignStat> campaigns,
                               List<PageStat> landingPages, List<PageStat> topPages, List<PlaceStat> countries,
                               List<PlaceStat> regions, Map<String, Long> devices) {
    }

    // ---- System -------------------------------------------------------------------------------

    public record DataSet(String id, String label, long rows, Instant oldest, long retentionDays) {
    }

    public record SystemView(boolean geoipEnabled, String timezone, boolean auditLogReads, List<DataSet> data,
                             long users, long nodes, long devices) {
    }
}
