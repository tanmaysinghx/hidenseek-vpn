package com.tanmaysinghx.hidenseek_backend.audit;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface TrafficEventRepository extends JpaRepository<TrafficEvent, Long> {

    /** page views, distinct visitors, distinct visits (sessions), distinct signed-in users. */
    @Query("""
            select count(t), count(distinct t.visitorId), count(distinct t.sessionId), count(distinct t.userEmail)
            from TrafficEvent t where t.occurredAt >= :since
            """)
    List<Object[]> totals(Instant since);

    @Query("""
            select t.occurredDay, count(t), count(distinct t.visitorId), count(distinct t.sessionId)
            from TrafficEvent t where t.occurredAt >= :since group by t.occurredDay order by t.occurredDay
            """)
    List<Object[]> perDay(Instant since);

    /** Visits per source, counted on landings (the first page of a visit carries the referrer). */
    @Query("""
            select t.source, count(distinct t.sessionId), count(distinct t.visitorId)
            from TrafficEvent t where t.occurredAt >= :since and t.type = 'LANDING'
            group by t.source order by count(distinct t.sessionId) desc
            """)
    List<Object[]> sources(Instant since, Pageable pageable);

    @Query("""
            select t.utmSource, t.utmMedium, t.utmCampaign, count(distinct t.sessionId)
            from TrafficEvent t where t.occurredAt >= :since and t.type = 'LANDING'
              and (t.utmSource is not null or t.utmMedium is not null or t.utmCampaign is not null)
            group by t.utmSource, t.utmMedium, t.utmCampaign order by count(distinct t.sessionId) desc
            """)
    List<Object[]> campaigns(Instant since, Pageable pageable);

    @Query("""
            select t.path, count(t), count(distinct t.visitorId) from TrafficEvent t
            where t.occurredAt >= :since and t.type = 'LANDING' group by t.path order by count(t) desc
            """)
    List<Object[]> landingPages(Instant since, Pageable pageable);

    @Query("""
            select t.path, count(t), count(distinct t.visitorId) from TrafficEvent t
            where t.occurredAt >= :since group by t.path order by count(t) desc
            """)
    List<Object[]> topPages(Instant since, Pageable pageable);

    @Query("""
            select t.countryCode, max(t.country), count(distinct t.visitorId), count(t)
            from TrafficEvent t where t.occurredAt >= :since and t.countryCode is not null
            group by t.countryCode order by count(distinct t.visitorId) desc
            """)
    List<Object[]> countries(Instant since, Pageable pageable);

    @Query("""
            select t.region, t.countryCode, count(distinct t.visitorId), count(t)
            from TrafficEvent t where t.occurredAt >= :since and t.region is not null
            group by t.region, t.countryCode order by count(distinct t.visitorId) desc
            """)
    List<Object[]> regions(Instant since, Pageable pageable);

    @Query("select t.device, count(distinct t.visitorId) from TrafficEvent t where t.occurredAt >= :since group by t.device")
    List<Object[]> devices(Instant since);

    @Query("select min(t.occurredAt) from TrafficEvent t")
    Instant oldest();

    @Modifying
    @Query("delete from TrafficEvent t where t.occurredAt < :cutoff")
    int deleteOlderThan(Instant cutoff);
}
