package com.tanmaysinghx.hidenseek_backend.device;

import com.tanmaysinghx.hidenseek_backend.device.DeviceDtos.DeviceView;
import com.tanmaysinghx.hidenseek_backend.device.DeviceDtos.ProvisionRequest;
import com.tanmaysinghx.hidenseek_backend.device.DeviceDtos.RegisterDeviceRequest;
import com.tanmaysinghx.hidenseek_backend.device.DeviceDtos.TunnelConfig;
import com.tanmaysinghx.hidenseek_backend.user.CurrentUser;
import com.tanmaysinghx.hidenseek_backend.user.VpnUser;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceController {

    private final DeviceService deviceService;

    @GetMapping
    public List<DeviceView> list(@CurrentUser VpnUser user) {
        return deviceService.list(user).stream().map(DeviceView::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DeviceView register(@CurrentUser VpnUser user, @Valid @RequestBody RegisterDeviceRequest request) {
        return DeviceView.of(deviceService.register(user, request));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@CurrentUser VpnUser user, @PathVariable String id) {
        deviceService.revoke(user, id);
    }

    @PostMapping("/{id}/tunnel")
    public TunnelConfig tunnel(@CurrentUser VpnUser user, @PathVariable String id,
                               @Valid @RequestBody ProvisionRequest request) {
        return deviceService.provision(user, id, request.nodeId());
    }
}
