package com.tanmaysinghx.hidenseek_backend.audit;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    /** Newest first. {@code q} matches path, IP or email; status bounds are inclusive. */
    @Query("""
            select a from AuditLog a
            where a.occurredAt >= :since
              and (:user is null or a.userEmail = :user)
              and (:method is null or a.method = :method)
              and (:minStatus is null or a.status >= :minStatus)
              and (:maxStatus is null or a.status <= :maxStatus)
              and (:q is null or lower(a.path) like concat('%', :q, '%') or a.ip like concat('%', :q, '%')
                   or lower(a.userEmail) like concat('%', :q, '%'))
            order by a.occurredAt desc, a.id desc
            """)
    Page<AuditLog> search(Instant since, String user, String method, Integer minStatus, Integer maxStatus, String q,
                          Pageable pageable);

    /** requests, failures (status >= 400), distinct IPs, distinct users, average duration. */
    @Query("""
            select count(a), coalesce(sum(case when a.status >= 400 then 1 else 0 end), 0),
                   count(distinct a.ip), count(distinct a.userEmail), coalesce(avg(a.durationMs), 0)
            from AuditLog a where a.occurredAt >= :since
            """)
    List<Object[]> totals(Instant since);

    @Query("""
            select a.occurredDay, count(a), coalesce(sum(case when a.status >= 400 then 1 else 0 end), 0)
            from AuditLog a where a.occurredAt >= :since group by a.occurredDay order by a.occurredDay
            """)
    List<Object[]> perDay(Instant since);

    @Query("""
            select a.method, a.route, count(a), coalesce(sum(case when a.status >= 400 then 1 else 0 end), 0),
                   coalesce(avg(a.durationMs), 0)
            from AuditLog a where a.occurredAt >= :since group by a.method, a.route order by count(a) desc
            """)
    List<Object[]> topRoutes(Instant since, Pageable pageable);

    @Query("select a.status, count(a) from AuditLog a where a.occurredAt >= :since group by a.status")
    List<Object[]> statuses(Instant since);

    @Query("select a.client, count(a) from AuditLog a where a.occurredAt >= :since group by a.client")
    List<Object[]> clients(Instant since);

    @Query("""
            select a.userEmail, count(a), coalesce(sum(case when a.status >= 400 then 1 else 0 end), 0), max(a.occurredAt)
            from AuditLog a where a.occurredAt >= :since and a.userEmail is not null
            group by a.userEmail order by count(a) desc
            """)
    List<Object[]> topUsers(Instant since, Pageable pageable);

    @Query("""
            select a.countryCode, max(a.country), count(a), count(distinct a.ip)
            from AuditLog a where a.occurredAt >= :since and a.countryCode is not null
            group by a.countryCode order by count(a) desc
            """)
    List<Object[]> countries(Instant since, Pageable pageable);

    @Query("""
            select a.region, a.countryCode, count(a), count(distinct a.ip)
            from AuditLog a where a.occurredAt >= :since and a.region is not null
            group by a.region, a.countryCode order by count(a) desc
            """)
    List<Object[]> regions(Instant since, Pageable pageable);

    @Query("""
            select a.ip, max(a.countryCode), max(a.region), count(a),
                   coalesce(sum(case when a.status >= 400 then 1 else 0 end), 0), max(a.occurredAt)
            from AuditLog a where a.occurredAt >= :since and a.ip is not null
            group by a.ip order by count(a) desc
            """)
    List<Object[]> topIps(Instant since, Pageable pageable);

    @Query("select min(a.occurredAt) from AuditLog a")
    Instant oldest();

    @Modifying
    @Query("delete from AuditLog a where a.occurredAt < :cutoff")
    int deleteOlderThan(Instant cutoff);
}
