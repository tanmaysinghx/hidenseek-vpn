package com.tanmaysinghx.hidenseek_backend.appauth;

import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Portal's external login/register API (X-Portal-App-Key). It checks credentials and creates
 * accounts, but issues no tokens; {@link AppAuthService} does that.
 */
@Component
public class PortalAccountsClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    public record Account(String id, String email, String firstName, String lastName, List<String> roles) {

        public String displayName() {
            String name = ((firstName == null ? "" : firstName) + " " + (lastName == null ? "" : lastName)).trim();
            return name.isEmpty() ? null : name;
        }
    }

    /** {@code account} is null when Portal created the account but it awaits Portal's own approval. */
    public record Result(boolean authenticated, boolean mfaRequired, Account account) {
    }

    private final RestClient http;
    private final HidenseekProperties.Portal portal;
    private final JsonMapper json;

    public PortalAccountsClient(HidenseekProperties properties, JsonMapper json) {
        JdkClientHttpRequestFactory requests = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(TIMEOUT).build());
        requests.setReadTimeout(TIMEOUT);
        this.http = RestClient.builder().requestFactory(requests).build();
        this.portal = properties.portal();
        this.json = json;
    }

    public Result login(String email, String password) {
        return call("login", Map.of("email", email, "password", password));
    }

    public Result register(String email, String password, String firstName, String lastName) {
        return call("register", Map.of("email", email, "password", password,
                "firstName", firstName, "lastName", lastName == null ? "" : lastName));
    }

    private Result call(String action, Map<String, String> body) {
        String url = "%s/api/external/apps/%s/%s".formatted(portal.url(), portal.appId(), action);
        return http.post()
                .uri(url)
                .header("X-Portal-App-Key", portal.apiKey())
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange((request, response) -> {
                    String text = new String(response.getBody().readAllBytes());
                    JsonNode node = text.isBlank() ? json.createObjectNode() : json.readTree(text);
                    if (!response.getStatusCode().is2xxSuccessful()) {
                        throw portalError(response.getStatusCode().value(), node);
                    }
                    return parse(node);
                });
    }

    private static Result parse(JsonNode node) {
        JsonNode u = node.path("user");
        Account account = u.isMissingNode() || u.isNull() ? null : new Account(
                u.path("id").asString(null), u.path("email").asString(null), u.path("firstName").asString(null),
                u.path("lastName").asString(null),
                u.path("roles").isArray() ? u.path("roles").valueStream().map(r -> r.asString()).toList() : List.of());
        return new Result(node.path("authenticated").asBoolean(false), node.path("mfaRequired").asBoolean(false), account);
    }

    /** Relays Portal's message (wrong password, locked, already registered, weak password...). */
    private static ApiException portalError(int status, JsonNode node) {
        String code = node.path("code").asString("PRTL");
        String message = node.path("message").asString("Portal rejected the request");
        HttpStatus mapped = switch (status) {
            case 400, 422 -> HttpStatus.BAD_REQUEST;
            case 401 -> code.equals("PRTL-1001") ? HttpStatus.BAD_GATEWAY : HttpStatus.UNAUTHORIZED;
            case 403 -> code.equals("PRTL-1002") ? HttpStatus.BAD_GATEWAY : HttpStatus.FORBIDDEN;
            case 409 -> HttpStatus.CONFLICT;
            case 429 -> HttpStatus.TOO_MANY_REQUESTS;
            default -> HttpStatus.BAD_GATEWAY;
        };
        // A wrong or missing app key is a server misconfiguration, not the user's fault.
        if (mapped == HttpStatus.BAD_GATEWAY) {
            return new ApiException(mapped, "HS-6002", "Sign-in is misconfigured on the server (Portal app key). Contact the admin.");
        }
        return new ApiException(mapped, code, message);
    }
}
