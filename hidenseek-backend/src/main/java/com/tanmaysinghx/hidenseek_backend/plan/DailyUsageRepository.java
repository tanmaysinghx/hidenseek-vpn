package com.tanmaysinghx.hidenseek_backend.plan;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface DailyUsageRepository extends JpaRepository<DailyUsage, DailyUsage.Key> {

    /** Atomic, so several servers reporting the same user at once can't lose bytes. */
    @Modifying
    @Query(value = """
            INSERT INTO hs_daily_usage (user_id, usage_date, used_bytes) VALUES (:userId, :date, :bytes)
            ON DUPLICATE KEY UPDATE used_bytes = used_bytes + :bytes
            """, nativeQuery = true)
    void add(String userId, LocalDate date, long bytes);

    @Query("select u from DailyUsage u where u.id.usageDate = :date and u.id.userId in :userIds")
    List<DailyUsage> findForDay(LocalDate date, Collection<String> userIds);

    @Modifying
    @Query("delete from DailyUsage u where u.id.usageDate < :before")
    int deleteBefore(LocalDate before);
}
