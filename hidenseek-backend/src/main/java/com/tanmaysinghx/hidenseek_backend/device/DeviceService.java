package com.tanmaysinghx.hidenseek_backend.device;

import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.common.Ipv4Cidr;
import com.tanmaysinghx.hidenseek_backend.common.WireGuardKeys;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.tanmaysinghx.hidenseek_backend.device.DeviceDtos.RegisterDeviceRequest;
import com.tanmaysinghx.hidenseek_backend.device.DeviceDtos.TunnelConfig;
import com.tanmaysinghx.hidenseek_backend.node.Node;
import com.tanmaysinghx.hidenseek_backend.node.NodeService;
import com.tanmaysinghx.hidenseek_backend.user.VpnUser;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DeviceService {

    static final List<String> FULL_TUNNEL = List.of("0.0.0.0/0", "::/0");
    static final int KEEPALIVE_SECONDS = 25;

    private final DeviceRepository devices;
    private final PeerRepository peers;
    private final NodeService nodeService;
    private final HidenseekProperties properties;

    public List<Device> list(VpnUser user) {
        return devices.findByUserIdAndRevokedAtIsNullOrderByCreatedAt(user.getId());
    }

    @Transactional
    public Device register(VpnUser user, RegisterDeviceRequest request) {
        if (!WireGuardKeys.isValid(request.publicKey())) {
            throw ApiException.badRequest("HS-4001", "publicKey is not a WireGuard public key");
        }
        if (devices.existsByPublicKey(request.publicKey())) {
            throw ApiException.conflict("HS-4002", "This key is already registered");
        }
        int max = properties.access().maxDevicesPerUser();
        if (devices.countByUserIdAndRevokedAtIsNull(user.getId()) >= max) {
            throw ApiException.forbidden("HS-4003", "Device limit reached (" + max + "); remove one first");
        }
        Device device = new Device();
        device.setUser(user);
        device.setName(request.name().trim());
        device.setPlatform(request.platform());
        device.setPublicKey(request.publicKey());
        device.setCreatedAt(Instant.now());
        return devices.save(device);
    }

    @Transactional
    public void revoke(VpnUser user, String deviceId) {
        Device device = devices.findByIdAndUserId(deviceId, user.getId())
                .filter(Device::isActive)
                .orElseThrow(() -> ApiException.notFound("Device"));
        device.setRevokedAt(Instant.now());
    }

    /**
     * Returns the device's tunnel config for a node, allocating an address on first use. The node's
     * agent picks the new peer up on its next poll (a few seconds).
     */
    @Transactional
    public TunnelConfig provision(VpnUser user, String deviceId, String nodeId) {
        if (!user.canConnect()) {
            throw ApiException.forbidden("HS-4004", user.getStatus() == VpnUser.Status.PENDING
                    ? "Your account is waiting for an admin to approve it"
                    : "Your VPN access is suspended");
        }
        Device device = devices.findByIdAndUserId(deviceId, user.getId())
                .filter(Device::isActive)
                .orElseThrow(() -> ApiException.notFound("Device"));
        Node node = nodeService.get(nodeId);
        if (!node.isAvailable()) {
            throw ApiException.badRequest("HS-4005", "This server is not available");
        }
        Ipv4Cidr cidr = Ipv4Cidr.parse(node.getAddressCidr());
        Peer peer = peers.findByDeviceIdAndNodeId(device.getId(), node.getId())
                .orElseGet(() -> allocate(device, node, cidr));
        return new TunnelConfig(node.getId(), node.getName(), node.getCountryCode(), peer.getAddress() + "/32",
                List.of(cidr.gateway()), node.getPublicKey(), node.endpoint(), FULL_TUNNEL, KEEPALIVE_SECONDS,
                node.isActivityLogging());
    }

    private Peer allocate(Device device, Node node, Ipv4Cidr cidr) {
        String address = cidr.firstFree(new HashSet<>(peers.findAddressesByNodeId(node.getId())))
                .orElseThrow(() -> ApiException.conflict("HS-4006", "This server has no free addresses"));
        Peer peer = new Peer();
        peer.setDevice(device);
        peer.setNode(node);
        peer.setAddress(address);
        peer.setCreatedAt(Instant.now());
        // The unique (node_id, address) constraint turns a concurrent double allocation into an error.
        return peers.saveAndFlush(peer);
    }
}
