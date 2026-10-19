package com.tanmaysinghx.hidenseek_backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.tanmaysinghx.hidenseek_backend.activity.ActivityRepository;
import com.tanmaysinghx.hidenseek_backend.session.VpnSession;
import com.tanmaysinghx.hidenseek_backend.session.VpnSessionRepository;
import java.time.Instant;
import java.util.Base64;
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
class VpnFlowIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    VpnSessionRepository sessions;

    @Autowired
    ActivityRepository activity;

    @MockitoBean
    JwtDecoder jwtDecoder;

    @Test
    void nodeEnrollsDeviceConnectsAndSessionIsTracked() throws Exception {
        RequestPostProcessor admin = portalUser("admin@test.dev");

        // Admin adds a node with activity logging on and gets an install command.
        String nodeId = JsonPath.read(mvc.perform(post("/api/v1/admin/nodes").with(admin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Singapore 1","countryCode":"sg","city":"Singapore",
                                 "endpointHost":"sg1.vpn.test","activityLogging":true}"""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.countryCode").value("SG"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andReturn().getResponse().getContentAsString(), "$.id");
        String enrollToken = JsonPath.read(mvc.perform(post("/api/v1/admin/nodes/{id}/enrollment", nodeId).with(admin))
                .andExpect(jsonPath("$.installCommand").value(org.hamcrest.Matchers.containsString("--token hsn_enroll_")))
                .andReturn().getResponse().getContentAsString(), "$.token");

        // The agent enrolls; the token is single use.
        String enrollBody = """
                {"token":"%s","publicKey":"%s","listenPort":51820,"agentVersion":"0.1.0"}"""
                .formatted(enrollToken, key());
        String agentToken = JsonPath.read(mvc.perform(post("/agent/v1/enroll")
                        .contentType(MediaType.APPLICATION_JSON).content(enrollBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.agentToken");
        mvc.perform(post("/agent/v1/enroll").contentType(MediaType.APPLICATION_JSON).content(enrollBody))
                .andExpect(status().isUnauthorized());

        // A new friend signs in: pending until approved.
        RequestPostProcessor friend = portalUser("friend@test.dev");
        String userId = JsonPath.read(mvc.perform(get("/api/v1/me").with(friend))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andReturn().getResponse().getContentAsString(), "$.id");
        String devicePublicKey = key();
        String deviceId = JsonPath.read(mvc.perform(post("/api/v1/devices").with(friend)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Laptop","platform":"LINUX","publicKey":"%s"}""".formatted(devicePublicKey)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");
        String tunnelBody = """
                {"nodeId":"%s"}""".formatted(nodeId);
        mvc.perform(post("/api/v1/devices/{id}/tunnel", deviceId).with(friend)
                        .contentType(MediaType.APPLICATION_JSON).content(tunnelBody))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/admin/users").with(friend)).andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/admin/users/{id}", userId).with(admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"APPROVED\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/devices/{id}/tunnel", deviceId).with(friend)
                        .contentType(MediaType.APPLICATION_JSON).content(tunnelBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.address").value("10.66.0.2/32"))
                .andExpect(jsonPath("$.dns[0]").value("10.66.0.1"))
                .andExpect(jsonPath("$.endpoint").value("sg1.vpn.test:51820"))
                .andExpect(jsonPath("$.activityLogging").value(true));

        // The agent sees the peer in its desired state.
        String bearer = "Bearer " + agentToken;
        mvc.perform(get("/agent/v1/state").header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.address").value("10.66.0.1/24"))
                .andExpect(jsonPath("$.peers[0].publicKey").value(devicePublicKey))
                .andExpect(jsonPath("$.peers[0].allowedIps[0]").value("10.66.0.2/32"));
        mvc.perform(get("/agent/v1/state").header("Authorization", "Bearer hsn_agent_wrong"))
                .andExpect(status().isUnauthorized());

        // Handshake + traffic + DNS: a session opens and activity is attached to it.
        Instant now = Instant.now();
        report(bearer, devicePublicKey, now.minusSeconds(5), 1000, 4000,
                ",\"dns\":[{\"clientIp\":\"10.66.0.2\",\"domain\":\"Example.COM.\",\"type\":\"A\",\"at\":\"" + now + "\"}]");
        report(bearer, devicePublicKey, now.minusSeconds(4), 3000, 9000, "");

        VpnSession open = sessions.findAll().getFirst();
        assertThat(open.getUserEmail()).isEqualTo("friend@test.dev");
        assertThat(open.getClientIp()).isEqualTo("203.0.113.9");
        assertThat(open.getRxBytes()).isEqualTo(3000);
        assertThat(open.getTxBytes()).isEqualTo(9000);
        assertThat(open.isActive()).isTrue();
        assertThat(activity.findAll()).singleElement().satisfies(a -> {
            assertThat(a.getDomain()).isEqualTo("example.com");
            assertThat(a.getSessionId()).isEqualTo(open.getId());
        });

        // Handshake goes stale: the session closes.
        report(bearer, devicePublicKey, now.minusSeconds(600), 3000, 9000, "");
        assertThat(sessions.findById(open.getId())).get().satisfies(s -> assertThat(s.isActive()).isFalse());

        mvc.perform(get("/api/v1/sessions").with(friend))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].clientIp").value("203.0.113.9"));
        mvc.perform(get("/api/v1/admin/activity").with(admin))
                .andExpect(jsonPath("$.items[0].domain").value("example.com"));
    }

    @Test
    void publicConfigNeedsNoToken() throws Exception {
        mvc.perform(get("/api/v1/public/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.portalUrl").value("https://sso.test"))
                .andExpect(jsonPath("$.clientId").value("hidenseek-vpn"))
                .andExpect(jsonPath("$.tokenBroker").value(true));
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
    }

    private void report(String bearer, String publicKey, Instant handshake, long rx, long tx, String extra)
            throws Exception {
        mvc.perform(post("/agent/v1/report").header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"agentVersion":"0.1.0","peers":[{"publicKey":"%s","endpoint":"203.0.113.9:40000",
                                 "lastHandshake":"%s","rxBytes":%d,"txBytes":%d}]%s}"""
                                .formatted(publicKey, handshake, rx, tx, extra)))
                .andExpect(status().isNoContent());
    }

    private static RequestPostProcessor portalUser(String email) {
        boolean admin = email.startsWith("admin");
        List<GrantedAuthority> authorities = admin
                ? List.of(new SimpleGrantedAuthority("ROLE_USER"), new SimpleGrantedAuthority("ROLE_ADMIN"))
                : List.of(new SimpleGrantedAuthority("ROLE_USER"));
        return jwt().jwt(j -> j.subject("sub-" + email).claim("email", email).claim("name", email))
                .authorities(authorities);
    }

    private static String key() {
        byte[] bytes = UUID.randomUUID().toString().substring(0, 32).getBytes();
        return Base64.getEncoder().encodeToString(bytes);
    }
}
