package com.tanmaysinghx.hidenseek_backend.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuditIntegrationTest {

    private static final String BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36";
    private static final String PHONE = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36";

    @Autowired
    MockMvc mvc;

    @Autowired
    AuditService audit;

    @Autowired
    AuditLogRepository auditLogs;

    @MockitoBean
    JwtDecoder jwtDecoder;

    @Test
    void auditsChangesAndFailuresWithTheCallerAndTheirForwardedIp() throws Exception {
        RequestPostProcessor admin = user("admin@test.dev");
        RequestPostProcessor auditee = user("auditee@test.dev");
        String userId = JsonPath.read(mvc.perform(get("/api/v1/me").with(auditee)).andReturn().getResponse().getContentAsString(), "$.id");

        // A change, a refused admin read, and a plain read (not audited by default).
        mvc.perform(patch("/api/v1/admin/users/{id}", userId).with(admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"APPROVED\"}")
                        .header("X-Forwarded-For", "198.51.100.7").header("User-Agent", BROWSER)
                        .header("Referer", "https://vpn.test/console/users"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/admin/users").with(auditee).header("User-Agent", "hidenseek-app/0.1.20"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/nodes").with(auditee)).andExpect(status().isOk());
        audit.flush();

        mvc.perform(get("/api/v1/admin/audit-logs").with(admin).param("q", "/api/v1/admin/users/" + userId))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].method").value("PATCH"))
                .andExpect(jsonPath("$.items[0].route").value("/api/v1/admin/users/{id}"))
                .andExpect(jsonPath("$.items[0].status").value(200))
                .andExpect(jsonPath("$.items[0].userEmail").value("admin@test.dev"))
                .andExpect(jsonPath("$.items[0].ip").value("198.51.100.7"))
                .andExpect(jsonPath("$.items[0].client").value("WEB"))
                .andExpect(jsonPath("$.items[0].referrer").value("https://vpn.test/console/users"));
        // Refused requests carry who tried; successful reads are skipped.
        mvc.perform(get("/api/v1/admin/audit-logs").with(admin).param("user", "auditee@test.dev"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].path").value("/api/v1/admin/users"))
                .andExpect(jsonPath("$.items[0].status").value(403))
                .andExpect(jsonPath("$.items[0].client").value("APP"));
        mvc.perform(get("/api/v1/admin/audit-logs").with(admin).param("user", "auditee@test.dev").param("status", "2xx"))
                .andExpect(jsonPath("$.items.length()").value(0));
        mvc.perform(get("/api/v1/admin/audit-logs").with(admin).param("status", "teapot"))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/v1/admin/audit-logs/stats").with(admin).param("days", "7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.daily.length()").value(7))
                .andExpect(jsonPath("$.statusClasses.4xx").isNumber())
                .andExpect(jsonPath("$.topRoutes[*].route").value(hasItem("/api/v1/admin/users/{id}")))
                .andExpect(jsonPath("$.topUsers[*].email").value(hasItems("admin@test.dev", "auditee@test.dev")));
        mvc.perform(get("/api/v1/admin/audit-logs").with(auditee)).andExpect(status().isForbidden());
    }

    @Test
    void adminsDeleteOldLogsButNeverToday() throws Exception {
        RequestPostProcessor admin = user("admin@test.dev");
        ZoneId zone = ZoneId.of("Asia/Kolkata");
        auditLogs.save(row(Instant.now().minus(40, ChronoUnit.DAYS), "/api/v1/old-one"));
        auditLogs.save(row(Instant.now().minus(1, ChronoUnit.HOURS), "/api/v1/recent-one"));
        LocalDate today = LocalDate.now(zone);

        mvc.perform(delete("/api/v1/admin/audit-logs").with(user("someone@test.dev")).param("before", today.minusDays(30).toString()))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/admin/audit-logs").with(admin).param("before", today.plusDays(1).toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("HS-8001"));
        mvc.perform(delete("/api/v1/admin/audit-logs").with(admin)).andExpect(status().isBadRequest());

        mvc.perform(delete("/api/v1/admin/audit-logs").with(admin).param("before", today.minusDays(30).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deleted").value(1));
        assertThat(auditLogs.findAll()).extracting(AuditLog::getPath).contains("/api/v1/recent-one").doesNotContain("/api/v1/old-one");

        // The deletion is itself on the record.
        audit.flush();
        mvc.perform(get("/api/v1/admin/audit-logs").with(admin).param("method", "DELETE").param("status", "200"))
                .andExpect(jsonPath("$.items[0].path").value("/api/v1/admin/audit-logs"))
                .andExpect(jsonPath("$.items[0].userEmail").value("admin@test.dev"));

        mvc.perform(get("/api/v1/admin/system").with(admin))
                .andExpect(jsonPath("$.geoipEnabled").value(false))
                .andExpect(jsonPath("$.data[*].id").value(hasItems("audit", "traffic", "activity")))
                .andExpect(jsonPath("$.data[0].retentionDays").value(90));
        mvc.perform(delete("/api/v1/admin/activity").with(admin).param("before", today.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deleted").isNumber());
    }

    @Test
    void consoleReportsWhereVisitsComeFrom() throws Exception {
        String google = "{\"visitorId\":\"%s\",\"sessionId\":\"%s\",\"events\":[".formatted(id(), id())
                + "{\"type\":\"LANDING\",\"path\":\"/sign-in?next=/users\",\"referrer\":\"https://www.google.com/search?q=vpn\"},"
                + "{\"type\":\"PAGEVIEW\",\"path\":\"/dashboard\"}]}";
        String newsletter = "{\"visitorId\":\"%s\",\"sessionId\":\"%s\",\"events\":[".formatted(id(), id())
                + "{\"type\":\"LANDING\",\"path\":\"/sign-in\",\"referrer\":\"https://mail.example.com/\","
                + "\"utmSource\":\"Newsletter\",\"utmMedium\":\"email\",\"utmCampaign\":\"oct-launch\"}]}";
        String internal = "{\"visitorId\":\"%s\",\"sessionId\":\"%s\",\"events\":[".formatted(id(), id())
                + "{\"type\":\"LANDING\",\"path\":\"/users\",\"referrer\":\"https://vpn.test/\"}]}";

        mvc.perform(post("/api/v1/public/events").contentType(MediaType.APPLICATION_JSON).content(google)
                .header("User-Agent", BROWSER)).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/public/events").contentType(MediaType.APPLICATION_JSON).content(newsletter)
                .header("User-Agent", PHONE)).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/public/events").with(user("visitor@test.dev")).contentType(MediaType.APPLICATION_JSON)
                .content(internal).header("User-Agent", BROWSER)).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/public/events").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visitorId\":\"v\",\"sessionId\":\"s\",\"events\":[]}"))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/v1/admin/traffic/stats").with(user("admin@test.dev")).param("days", "30"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.daily.length()").value(30))
                .andExpect(jsonPath("$.sources[*].source").value(hasItems("google.com", "newsletter", "Direct")))
                .andExpect(jsonPath("$.campaigns[?(@.campaign=='oct-launch')].medium").value(hasItem("email")))
                .andExpect(jsonPath("$.landingPages[*].path").value(hasItems("/sign-in", "/users")))
                .andExpect(jsonPath("$.topPages[*].path").value(hasItem("/dashboard")))
                .andExpect(jsonPath("$.devices.MOBILE").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.signedInUsers").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)));
        // Beacons don't flood the audit log.
        audit.flush();
        mvc.perform(get("/api/v1/admin/audit-logs").with(user("admin@test.dev")).param("q", "/api/v1/public/events"))
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void routesGroupIdsAndClientsComeFromTheUserAgent() {
        assertThat(AuditService.route("/api/v1/admin/users/3f2a9c1e-0b7d-4d2a-9f1e-1234567890ab/plan"))
                .isEqualTo("/api/v1/admin/users/{id}/plan");
        assertThat(AuditService.route("/api/v1/sessions/42")).isEqualTo("/api/v1/sessions/{id}");
        assertThat(AuditService.client("hidenseek-app/0.1.20")).isEqualTo(AuditLog.Client.APP);
        assertThat(AuditService.client(BROWSER)).isEqualTo(AuditLog.Client.WEB);
        assertThat(AuditService.client("curl/8.0")).isEqualTo(AuditLog.Client.OTHER);
        assertThat(TrafficService.device(PHONE)).isEqualTo(TrafficEvent.Device.MOBILE);
        assertThat(TrafficService.host("https://www.Google.com/search?q=x")).isEqualTo("google.com");
        assertThat(TrafficService.host("not a url")).isNull();
    }

    private static AuditLog row(Instant at, String path) {
        AuditLog a = new AuditLog();
        a.setOccurredAt(at);
        a.setOccurredDay(LocalDate.ofInstant(at, ZoneId.of("Asia/Kolkata")));
        a.setMethod("POST");
        a.setPath(path);
        a.setRoute(path);
        a.setStatus(200);
        a.setClient(AuditLog.Client.OTHER);
        return a;
    }

    private static String id() {
        return UUID.randomUUID().toString();
    }

    private static RequestPostProcessor user(String email) {
        boolean admin = email.startsWith("admin");
        List<GrantedAuthority> authorities = admin
                ? List.of(new SimpleGrantedAuthority("ROLE_USER"), new SimpleGrantedAuthority("ROLE_ADMIN"))
                : List.of(new SimpleGrantedAuthority("ROLE_USER"));
        return jwt().jwt(j -> j.subject("sub-" + email).claim("email", email).claim("name", email)).authorities(authorities);
    }
}
