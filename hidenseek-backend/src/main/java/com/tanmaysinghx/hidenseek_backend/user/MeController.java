package com.tanmaysinghx.hidenseek_backend.user;

import com.tanmaysinghx.hidenseek_backend.geo.GeoIpService;
import com.tanmaysinghx.hidenseek_backend.geo.GeoLocation;
import com.tanmaysinghx.hidenseek_backend.user.UserDtos.UserView;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
@RequiredArgsConstructor
public class MeController {

    private final GeoIpService geoIp;

    /** Where the caller appears to be, from the local GeoIP database (fields are null without one). */
    public record LocationView(String ip, String countryCode, String country, String region, String city,
                               Double latitude, Double longitude) {
    }

    @GetMapping
    public UserView me(@CurrentUser VpnUser user) {
        return UserView.of(user);
    }

    @GetMapping("/location")
    public LocationView location(HttpServletRequest request) {
        String ip = request.getRemoteAddr();
        GeoLocation geo = geoIp.locate(ip);
        return new LocationView(ip, geo.countryCode(), geo.country(), geo.region(), geo.city(), geo.latitude(),
                geo.longitude());
    }
}
