package com.tanmaysinghx.hidenseek_backend.auth;

import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/** Calls Portal's token endpoint as the VPN's confidential client. */
@Component
public class PortalTokenClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    private final RestClient http;
    private final HidenseekProperties.Portal portal;
    private final AtomicReference<String> tokenEndpoint = new AtomicReference<>();

    public PortalTokenClient(HidenseekProperties properties) {
        JdkClientHttpRequestFactory requests = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(TIMEOUT).build());
        requests.setReadTimeout(TIMEOUT);
        this.http = RestClient.builder().requestFactory(requests).build();
        this.portal = properties.portal();
    }

    /** Forwards a token request and hands Portal's response (status and JSON body) back unchanged. */
    public ResponseEntity<String> exchange(Map<String, String> form) {
        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        form.forEach(body::add);
        return http.post()
                .uri(tokenEndpoint())
                .headers(h -> h.setBasicAuth(portal.clientId(), portal.clientSecret(), StandardCharsets.UTF_8))
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .accept(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange((request, response) -> ResponseEntity.status(response.getStatusCode())
                        .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                        .header(HttpHeaders.CACHE_CONTROL, "no-store")
                        .body(new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8)));
    }

    private String tokenEndpoint() {
        String cached = tokenEndpoint.get();
        if (cached != null) {
            return cached;
        }
        Map<?, ?> discovery = http.get()
                .uri(portal.url() + "/.well-known/openid-configuration")
                .retrieve()
                .body(Map.class);
        String endpoint = discovery == null ? null : (String) discovery.get("token_endpoint");
        if (endpoint == null) {
            throw new IllegalStateException("Portal discovery document has no token_endpoint");
        }
        tokenEndpoint.set(endpoint);
        return endpoint;
    }
}
