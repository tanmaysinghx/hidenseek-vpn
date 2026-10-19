package com.tanmaysinghx.hidenseek_backend.common;

import java.util.Optional;
import java.util.Set;

/** Minimal IPv4 CIDR helper used to hand out tunnel addresses on a node's subnet. */
public record Ipv4Cidr(int network, int prefix) {

    public static Ipv4Cidr parse(String cidr) {
        String[] parts = cidr.trim().split("/");
        if (parts.length != 2) {
            throw new IllegalArgumentException("Expected a.b.c.d/n: " + cidr);
        }
        int prefix = Integer.parseInt(parts[1]);
        if (prefix < 16 || prefix > 29) {
            throw new IllegalArgumentException("Prefix must be between /16 and /29: " + cidr);
        }
        int mask = -1 << (32 - prefix);
        return new Ipv4Cidr(toInt(parts[0]) & mask, prefix);
    }

    /** The node's own address: the first usable host. */
    public String gateway() {
        return toString(network + 1);
    }

    public String gatewayWithPrefix() {
        return gateway() + "/" + prefix;
    }

    /** Lowest free host address after the gateway, excluding the broadcast address. */
    public Optional<String> firstFree(Set<String> taken) {
        int size = 1 << (32 - prefix);
        for (int offset = 2; offset < size - 1; offset++) {
            String candidate = toString(network + offset);
            if (!taken.contains(candidate)) {
                return Optional.of(candidate);
            }
        }
        return Optional.empty();
    }

    @Override
    public String toString() {
        return toString(network) + "/" + prefix;
    }

    static int toInt(String address) {
        String[] octets = address.split("\\.");
        if (octets.length != 4) {
            throw new IllegalArgumentException("Not an IPv4 address: " + address);
        }
        int value = 0;
        for (String octet : octets) {
            int n = Integer.parseInt(octet);
            if (n < 0 || n > 255) {
                throw new IllegalArgumentException("Not an IPv4 address: " + address);
            }
            value = (value << 8) | n;
        }
        return value;
    }

    static String toString(int value) {
        return ((value >>> 24) & 0xff) + "." + ((value >>> 16) & 0xff) + "." + ((value >>> 8) & 0xff) + "." + (value & 0xff);
    }
}
