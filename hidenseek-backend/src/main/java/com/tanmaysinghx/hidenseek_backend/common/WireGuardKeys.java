package com.tanmaysinghx.hidenseek_backend.common;

import java.util.Base64;

public final class WireGuardKeys {

    private WireGuardKeys() {
    }

    /** A WireGuard key is 32 bytes, base64 encoded (44 chars with padding). */
    public static boolean isValid(String key) {
        if (key == null || key.length() != 44) {
            return false;
        }
        try {
            return Base64.getDecoder().decode(key).length == 32;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
