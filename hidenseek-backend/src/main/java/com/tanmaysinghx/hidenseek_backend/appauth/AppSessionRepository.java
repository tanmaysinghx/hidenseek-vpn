package com.tanmaysinghx.hidenseek_backend.appauth;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface AppSessionRepository extends JpaRepository<AppSession, String> {

    Optional<AppSession> findByRefreshTokenHash(String hash);

    @Modifying
    @Query("delete from AppSession s where s.expiresAt < :cutoff or s.revokedAt < :cutoff")
    int deleteStale(Instant cutoff);
}
