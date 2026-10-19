package com.tanmaysinghx.hidenseek_backend.activity;

import java.time.Instant;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ActivityRepository extends JpaRepository<ActivityEvent, Long> {

    Page<ActivityEvent> findAllByOrderByOccurredAtDesc(Pageable pageable);

    Page<ActivityEvent> findByUserIdOrderByOccurredAtDesc(String userId, Pageable pageable);

    Page<ActivityEvent> findBySessionIdOrderByOccurredAtDesc(String sessionId, Pageable pageable);

    @Modifying
    @Query("delete from ActivityEvent a where a.occurredAt < :cutoff")
    int deleteOlderThan(Instant cutoff);

    @Modifying
    @Query("delete from ActivityEvent a where a.nodeId = :nodeId")
    void deleteByNodeId(String nodeId);
}
