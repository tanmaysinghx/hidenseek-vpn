package com.tanmaysinghx.hidenseek_backend.plan;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
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
class PlanIntegrationTest {

    @Autowired
    MockMvc mvc;

    @MockitoBean
    JwtDecoder jwtDecoder;

    @Test
    void freeUserHitsTheDailyLimitRequestsAnUpgradeAndAdminApprovesIt() throws Exception {
        RequestPostProcessor admin = user("admin@test.dev");
        RequestPostProcessor me = user("planner@test.dev");

        // A node with an enrolled agent, and an approved user with a device.
        String nodeId = JsonPath.read(mvc.perform(post("/api/v1/admin/nodes").with(admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Plans node\",\"countryCode\":\"IN\",\"endpointHost\":\"in1.vpn.test\",\"addressCidr\":\"10.77.0.0/24\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        String enroll = JsonPath.read(mvc.perform(post("/api/v1/admin/nodes/{id}/enrollment", nodeId).with(admin))
                .andReturn().getResponse().getContentAsString(), "$.token");
        String agent = "Bearer " + JsonPath.read(mvc.perform(post("/agent/v1/enroll").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"%s\",\"publicKey\":\"%s\",\"listenPort\":51820}".formatted(enroll, key())))
                .andReturn().getResponse().getContentAsString(), "$.agentToken");
        String userId = JsonPath.read(mvc.perform(get("/api/v1/me").with(me)).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(patch("/api/v1/admin/users/{id}", userId).with(admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"APPROVED\"}")).andExpect(status().isOk());
        String deviceKey = key();
        String deviceId = JsonPath.read(mvc.perform(post("/api/v1/devices").with(me).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Phone\",\"platform\":\"ANDROID\",\"publicKey\":\"%s\"}".formatted(deviceKey)))
                .andReturn().getResponse().getContentAsString(), "$.id");
        String tunnel = "{\"nodeId\":\"%s\"}".formatted(nodeId);

        // Everyone starts on Free (2 GB/day). Shrink it so the test can use it up.
        mvc.perform(get("/api/v1/me/plan").with(me))
                .andExpect(jsonPath("$.plan.code").value("FREE"))
                .andExpect(jsonPath("$.usage.limitBytes").value(2147483648L))
                .andExpect(jsonPath("$.usage.usedBytes").value(0))
                .andExpect(jsonPath("$.usage.limited").value(false));
        mvc.perform(get("/api/v1/plans").with(me)).andExpect(jsonPath("$[*].code").value(org.hamcrest.Matchers.contains("FREE", "PLUS", "PRO")));
        mvc.perform(put("/api/v1/admin/plans/free").with(me).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Free\",\"dailyLimitBytes\":10000}")).andExpect(status().isForbidden());
        setFreeLimit(admin, 10000);
        try {
            mvc.perform(post("/api/v1/devices/{id}/tunnel", deviceId).with(me).contentType(MediaType.APPLICATION_JSON).content(tunnel))
                    .andExpect(status().isOk());
            mvc.perform(get("/agent/v1/state").header("Authorization", agent)).andExpect(jsonPath("$.peers.length()").value(1));

            // 12 kB moves through the tunnel: over the limit, so the node drops the peer and connecting is refused.
            report(agent, deviceKey, 4000, 8000);
            mvc.perform(get("/api/v1/me/plan").with(me))
                    .andExpect(jsonPath("$.usage.usedBytes").value(12000))
                    .andExpect(jsonPath("$.usage.limited").value(true));
            mvc.perform(get("/agent/v1/state").header("Authorization", agent)).andExpect(jsonPath("$.peers.length()").value(0));
            mvc.perform(post("/api/v1/devices/{id}/tunnel", deviceId).with(me).contentType(MediaType.APPLICATION_JSON).content(tunnel))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("HS-7001"));

            // The user asks for Plus; it waits for an admin, and a second request replaces the first.
            mvc.perform(post("/api/v1/me/plan-requests").with(me).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"planId\":\"pro\"}")).andExpect(jsonPath("$.pendingRequest.plan.code").value("PRO"));
            mvc.perform(post("/api/v1/me/plan-requests").with(me).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"planId\":\"plus\",\"note\":\"Paid via UPI\"}"))
                    .andExpect(jsonPath("$.plan.code").value("FREE"))
                    .andExpect(jsonPath("$.pendingRequest.plan.code").value("PLUS"));
            String requestId = JsonPath.read(mvc.perform(get("/api/v1/admin/plan-requests").with(admin))
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].userEmail").value("planner@test.dev"))
                    .andExpect(jsonPath("$[0].note").value("Paid via UPI"))
                    .andReturn().getResponse().getContentAsString(), "$[0].id");
            mvc.perform(get("/api/v1/admin/plan-requests").with(me)).andExpect(status().isForbidden());

            // Approved for 30 days: the user is back on the node at once.
            mvc.perform(post("/api/v1/admin/plan-requests/{id}/approve", requestId).with(admin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"days\":30}"))
                    .andExpect(jsonPath("$.status").value("APPROVED"))
                    .andExpect(jsonPath("$.decidedBy").value("admin@test.dev"));
            mvc.perform(post("/api/v1/admin/plan-requests/{id}/approve", requestId).with(admin))
                    .andExpect(status().isConflict());
            mvc.perform(get("/api/v1/me/plan").with(me))
                    .andExpect(jsonPath("$.plan.code").value("PLUS"))
                    .andExpect(jsonPath("$.expiresAt").isNotEmpty())
                    .andExpect(jsonPath("$.usage.limited").value(false))
                    .andExpect(jsonPath("$.pendingRequest").isEmpty());
            mvc.perform(get("/agent/v1/state").header("Authorization", agent)).andExpect(jsonPath("$.peers.length()").value(1));
            mvc.perform(get("/api/v1/admin/users").with(admin))
                    .andExpect(jsonPath("$[?(@.email=='planner@test.dev')].planName").value("Plus"))
                    .andExpect(jsonPath("$[?(@.email=='planner@test.dev')].usedTodayBytes").value(12000));

            // Going back to Free needs no approval; an admin can also set any plan directly.
            mvc.perform(post("/api/v1/me/plan-requests").with(me).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"planId\":\"free\"}")).andExpect(jsonPath("$.plan.code").value("FREE"));
            mvc.perform(put("/api/v1/admin/users/{id}/plan", userId).with(admin).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"planId\":\"pro\"}"))
                    .andExpect(jsonPath("$.planName").value("Pro"))
                    .andExpect(jsonPath("$.dailyLimitBytes").isEmpty());
            mvc.perform(delete("/api/v1/me/plan-requests/pending").with(me)).andExpect(status().isNoContent());
        } finally {
            setFreeLimit(admin, 2147483648L);
        }
    }

    @Test
    void adminsAreNeverLimited() throws Exception {
        mvc.perform(get("/api/v1/me/plan").with(user("admin@test.dev")))
                .andExpect(jsonPath("$.usage.exempt").value(true))
                .andExpect(jsonPath("$.usage.limited").value(false));
    }

    private void setFreeLimit(RequestPostProcessor admin, long bytes) throws Exception {
        mvc.perform(put("/api/v1/admin/plans/free").with(admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Free\",\"description\":\"For light browsing and messaging.\",\"dailyLimitBytes\":%d,\"priceLabel\":\"Free\"}".formatted(bytes)))
                .andExpect(status().isOk());
    }

    private void report(String agent, String key, long rx, long tx) throws Exception {
        mvc.perform(post("/agent/v1/report").header("Authorization", agent).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"peers":[{"publicKey":"%s","endpoint":"203.0.113.20:40000","lastHandshake":"%s","rxBytes":%d,"txBytes":%d}]}"""
                                .formatted(key, Instant.now().minusSeconds(3), rx, tx)))
                .andExpect(status().isNoContent());
    }

    private static RequestPostProcessor user(String email) {
        boolean admin = email.startsWith("admin");
        List<GrantedAuthority> authorities = admin
                ? List.of(new SimpleGrantedAuthority("ROLE_USER"), new SimpleGrantedAuthority("ROLE_ADMIN"))
                : List.of(new SimpleGrantedAuthority("ROLE_USER"));
        return jwt().jwt(j -> j.subject("sub-" + email).claim("email", email).claim("name", email)).authorities(authorities);
    }

    private static String key() {
        return Base64.getEncoder().encodeToString(UUID.randomUUID().toString().substring(0, 32).getBytes());
    }
}
