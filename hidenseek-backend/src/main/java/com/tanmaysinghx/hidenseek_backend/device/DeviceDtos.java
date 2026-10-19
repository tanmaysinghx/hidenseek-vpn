package com.tanmaysinghx.hidenseek_backend.device;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public final class DeviceDtos {

    private DeviceDtos() {
    }

    public record DeviceView(String id, String name, Device.Platform platform, String publicKey, Instant createdAt) {
        public static DeviceView of(Device device) {
            return new DeviceView(device.getId(), device.getName(), device.getPlatform(), device.getPublicKey(),
                    device.getCreatedAt());
        }
    }

    public record RegisterDeviceRequest(
            @NotBlank @Size(max = 100) String name,
            @NotNull Device.Platform platform,
            @NotBlank String publicKey) {
    }

    public record ProvisionRequest(@NotBlank String nodeId) {
    }

    /**
     * Everything the app needs to build a WireGuard config, except its private key which it already
     * holds. DNS points at the node's own resolver so lookups never leak outside the tunnel.
     */
    public record TunnelConfig(String nodeId, String nodeName, String countryCode, String address,
                               List<String> dns, String serverPublicKey, String endpoint, List<String> allowedIps,
                               int persistentKeepalive, boolean activityLogging) {
    }
}
