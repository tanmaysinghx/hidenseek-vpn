package com.tanmaysinghx.hidenseek_backend.session;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface VpnSessionRepository extends JpaRepository<VpnSession, String> {

    Optional<VpnSession> findFirstByPeerIdAndEndedAtIsNull(String peerId);

    List<VpnSession> findByPeerIdInAndEndedAtIsNull(List<String> peerIds);

    Page<VpnSession> findByUserIdOrderByStartedAtDesc(String userId, Pageable pageable);

    Page<VpnSession> findAllByOrderByStartedAtDesc(Pageable pageable);

    Page<VpnSession> findByEndedAtIsNullOrderByStartedAtDesc(Pageable pageable);

    List<VpnSession> findByEndedAtIsNullAndLastSeenAtBefore(Instant cutoff);

    /** Sessions that were active at any point after {@code since}. */
    @Query("select s from VpnSession s where s.endedAt is null or s.endedAt > :since")
    List<VpnSession> findActiveSince(Instant since);

    @Query("select s from VpnSession s where s.userId = :userId and (s.endedAt is null or s.endedAt > :since)")
    List<VpnSession> findActiveSinceForUser(String userId, Instant since);

    List<VpnSession> findByEndedAtIsNullOrderByStartedAtDesc();

    long countByNodeIdAndEndedAtIsNull(String nodeId);

    long countByEndedAtIsNull();

    long countByStartedAtAfter(Instant since);

    @Query("select coalesce(sum(s.rxBytes + s.txBytes), 0) from VpnSession s where s.startedAt > :since")
    long sumBytesSince(Instant since);

    @Modifying
    @Query("delete from VpnSession s where s.nodeId = :nodeId")
    void deleteByNodeId(String nodeId);
}
