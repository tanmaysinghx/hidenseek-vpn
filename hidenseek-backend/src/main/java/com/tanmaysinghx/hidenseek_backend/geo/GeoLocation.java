package com.tanmaysinghx.hidenseek_backend.geo;

public record GeoLocation(String countryCode, String country, String region, String city) {

    public static final GeoLocation UNKNOWN = new GeoLocation(null, null, null, null);
}
