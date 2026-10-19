package com.tanmaysinghx.hidenseek_backend.geo;

import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.maxmind.geoip2.DatabaseReader;
import com.maxmind.geoip2.model.CityResponse;
import jakarta.annotation.PreDestroy;
import java.io.File;
import java.io.IOException;
import java.net.InetAddress;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Looks client IPs up in a local MaxMind GeoLite2-City database, so no IP ever leaves the server.
 * Without a database configured every lookup returns {@link GeoLocation#UNKNOWN}.
 */
@Slf4j
@Service
public class GeoIpService {

    private final DatabaseReader reader;

    public GeoIpService(HidenseekProperties properties) {
        this.reader = open(properties.geoip().database());
    }

    private static DatabaseReader open(String path) {
        if (path == null || path.isBlank()) {
            log.info("GEOIP_DATABASE not set; sessions will be stored without location");
            return null;
        }
        try {
            return new DatabaseReader.Builder(new File(path)).build();
        } catch (IOException e) {
            log.warn("Could not open GeoIP database {}; sessions will be stored without location", path, e);
            return null;
        }
    }

    public GeoLocation locate(String ip) {
        if (reader == null || ip == null) {
            return GeoLocation.UNKNOWN;
        }
        try {
            return reader.tryCity(InetAddress.getByName(ip)).map(GeoIpService::toLocation).orElse(GeoLocation.UNKNOWN);
        } catch (Exception e) {
            log.debug("GeoIP lookup failed for {}", ip, e);
            return GeoLocation.UNKNOWN;
        }
    }

    private static GeoLocation toLocation(CityResponse r) {
        return new GeoLocation(r.getCountry().getIsoCode(), r.getCountry().getName(),
                r.getMostSpecificSubdivision().getName(), r.getCity().getName());
    }

    @PreDestroy
    void close() throws IOException {
        if (reader != null) {
            reader.close();
        }
    }
}
