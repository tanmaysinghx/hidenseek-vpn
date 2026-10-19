package com.tanmaysinghx.hidenseek_backend.insights;

import com.tanmaysinghx.hidenseek_backend.activity.AdminActivityController.ActivityView;
import com.tanmaysinghx.hidenseek_backend.device.DeviceDtos.DeviceView;
import com.tanmaysinghx.hidenseek_backend.session.SessionDtos.SessionView;
import com.tanmaysinghx.hidenseek_backend.session.SessionDtos.Stats;
import com.tanmaysinghx.hidenseek_backend.user.UserDtos.UserView;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class InsightsDtos {

    private InsightsDtos() {
    }

    /** One UTC day. Bytes are from the user's side: download is what the server sent them. */
    public record DayPoint(LocalDate date, long sessions, long activeUsers, long downloadBytes, long uploadBytes) {
    }

    public record DomainStat(String domain, long lookups, long users, Instant lastSeen) {
    }

    public record UserTraffic(String userId, String email, String displayName, long sessions, long downloadBytes,
                              long uploadBytes, long connectedSeconds, Instant lastConnected) {
    }

    public record CountryStat(String countryCode, String country, long sessions, long users) {
    }

    public record LiveSession(SessionView session, String nodeName, String deviceName) {
    }

    public record Dashboard(int days, Stats stats, long activityLookups, List<DayPoint> daily,
                            List<DomainStat> topDomains, List<UserTraffic> topUsers, List<CountryStat> countries,
                            List<LiveSession> live, List<ActivityView> recentActivity) {
    }

    public record UserInsights(int days, UserView user, long sessions, long downloadBytes, long uploadBytes,
                               long connectedSeconds, long activityLookups, List<DayPoint> daily,
                               List<DomainStat> topDomains, List<DeviceView> devices,
                               List<SessionView> recentSessions) {
    }
}
