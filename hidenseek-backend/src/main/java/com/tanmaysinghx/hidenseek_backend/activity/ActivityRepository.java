package com.tanmaysinghx.hidenseek_backend.activity;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ActivityRepository extends JpaRepository<ActivityEvent, Long> {

    Page<ActivityEvent> findAllByOrderByOccurredAtDesc(Pageable pageable);

    Page<ActivityEvent> findByUserIdOrderByOccurredAtDesc(String userId, Pageable pageable);

    Page<ActivityEvent> findBySessionIdOrderByOccurredAtDesc(String sessionId, Pageable pageable);

    /** Filtered log: any of userId / domain substring may be null. */
    @Query("""
            select a from ActivityEvent a
            where a.occurredAt > :since
              and (:userId is null or a.userId = :userId)
              and (:domain is null or a.domain like concat('%', :domain, '%'))
            order by a.occurredAt desc
            """)
    Page<ActivityEvent> search(Instant since, String userId, String domain, Pageable pageable);

    /** Rows of [domain, lookups, distinct users, last seen], most looked-up first. */
    @Query("""
            select a.domain, count(a), count(distinct a.userId), max(a.occurredAt) from ActivityEvent a
            where a.occurredAt > :since and (:userId is null or a.userId = :userId)
            group by a.domain order by count(a) desc
            """)
    List<Object[]> topDomains(Instant since, String userId, Pageable pageable);

    @Query("select count(a) from ActivityEvent a where a.occurredAt > :since and (:userId is null or a.userId = :userId)")
    long countSince(Instant since, String userId);

    @Modifying
    @Query("delete from ActivityEvent a where a.occurredAt < :cutoff")
    int deleteOlderThan(Instant cutoff);

    @Modifying
    @Query("delete from ActivityEvent a where a.nodeId = :nodeId")
    void deleteByNodeId(String nodeId);
}
