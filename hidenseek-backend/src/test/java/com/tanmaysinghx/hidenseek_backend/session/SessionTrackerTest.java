package com.tanmaysinghx.hidenseek_backend.session;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SessionTrackerTest {

    @Test
    void extractsHostFromEndpoints() {
        assertThat(SessionTracker.hostOf("203.0.113.9:51820")).isEqualTo("203.0.113.9");
        assertThat(SessionTracker.hostOf("[2001:db8::1]:51820")).isEqualTo("2001:db8::1");
        assertThat(SessionTracker.hostOf(null)).isNull();
    }

    @Test
    void countersThatResetCountFromZero() {
        assertThat(SessionTracker.delta(1500, 1000)).isEqualTo(500);
        assertThat(SessionTracker.delta(200, 1000)).isEqualTo(200);
    }
}
