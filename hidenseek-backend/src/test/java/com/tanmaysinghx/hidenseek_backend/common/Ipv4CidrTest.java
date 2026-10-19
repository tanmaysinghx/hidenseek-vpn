package com.tanmaysinghx.hidenseek_backend.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Set;
import org.junit.jupiter.api.Test;

class Ipv4CidrTest {

    @Test
    void normalizesNetworkAndPicksGateway() {
        Ipv4Cidr cidr = Ipv4Cidr.parse("10.66.0.77/24");
        assertThat(cidr.toString()).isEqualTo("10.66.0.0/24");
        assertThat(cidr.gatewayWithPrefix()).isEqualTo("10.66.0.1/24");
    }

    @Test
    void allocatesLowestFreeHostAndSkipsBroadcast() {
        Ipv4Cidr cidr = Ipv4Cidr.parse("10.0.0.0/29");
        assertThat(cidr.firstFree(Set.of())).contains("10.0.0.2");
        assertThat(cidr.firstFree(Set.of("10.0.0.2", "10.0.0.3"))).contains("10.0.0.4");
        assertThat(cidr.firstFree(Set.of("10.0.0.2", "10.0.0.3", "10.0.0.4", "10.0.0.5", "10.0.0.6"))).isEmpty();
    }

    @Test
    void rejectsBadInput() {
        assertThatThrownBy(() -> Ipv4Cidr.parse("10.0.0.0")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Ipv4Cidr.parse("10.0.0.0/8")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Ipv4Cidr.parse("10.0.300.0/24")).isInstanceOf(IllegalArgumentException.class);
    }
}
