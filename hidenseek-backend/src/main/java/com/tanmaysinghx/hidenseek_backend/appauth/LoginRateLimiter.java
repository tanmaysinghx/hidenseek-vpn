package com.tanmaysinghx.hidenseek_backend.appauth;

import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Sliding-window limits on password sign-in and registration. Portal's external login API does
 * not lock accounts after failed attempts, so guessing is throttled here, per email and per IP.
 */
@Component
public class LoginRateLimiter {

    static final Duration WINDOW = Duration.ofMinutes(10);
    static final int PER_EMAIL = 8;
    static final int PER_IP = 30;

    private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();

    public void check(String email, String ip) {
        Instant now = Instant.now();
        boolean blocked = over("e:" + email.trim().toLowerCase(Locale.ROOT), PER_EMAIL, now)
                | over("i:" + ip, PER_IP, now);
        if (blocked) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "HS-6001",
                    "Too many sign-in attempts. Wait a few minutes and try again.");
        }
    }

    private boolean over(String key, int limit, Instant now) {
        Deque<Instant> window = attempts.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (window) {
            while (!window.isEmpty() && window.peekFirst().isBefore(now.minus(WINDOW))) {
                window.pollFirst();
            }
            if (window.size() >= limit) {
                return true;
            }
            window.addLast(now);
            return false;
        }
    }

    @Scheduled(fixedDelayString = "PT10M")
    void evictIdle() {
        Instant cutoff = Instant.now().minus(WINDOW);
        attempts.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                return e.getValue().isEmpty() || e.getValue().peekLast().isBefore(cutoff);
            }
        });
    }
}
