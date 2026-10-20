package com.tanmaysinghx.hidenseek_backend.appauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AppAuthIntegrationTest {

    @Autowired
    MockMvc mvc;

    @MockitoBean
    PortalAccountsClient portal;

    @MockitoBean
    JwtDecoder portalDecoder;

    private static PortalAccountsClient.Result ok(String email, String... roles) {
        return new PortalAccountsClient.Result(true, false,
                new PortalAccountsClient.Account("id-" + email, email, "Ana", "Lee", List.of(roles)));
    }

    private String login(String email) throws Exception {
        return mvc.perform(post("/api/v1/public/auth/app/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"pw-123456\",\"deviceName\":\"Pixel\"}".formatted(email)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void passwordSignInIssuesTokensTheApiAccepts() throws Exception {
        when(portal.login(eq("ana@test.dev"), anyString())).thenReturn(ok("ana@test.dev", "ROLE_USER"));
        String body = login("ana@test.dev");
        String access = JsonPath.read(body, "$.accessToken");
        String refresh = JsonPath.read(body, "$.refreshToken");
        assertThat((Integer) JsonPath.read(body, "$.expiresIn")).isEqualTo(900);
        assertThat((Integer) JsonPath.read(body, "$.refreshExpiresIn")).isEqualTo(30 * 86400);

        // The app token goes through the real verifier, not a mock.
        mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("ana@test.dev"))
                .andExpect(jsonPath("$.displayName").value("Ana Lee"))
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.status").value("PENDING"));
        mvc.perform(get("/api/v1/admin/users").header("Authorization", "Bearer " + access))
                .andExpect(status().isForbidden());

        // Refresh rotates: the new token works once, the old one is dead.
        String next = mvc.perform(post("/api/v1/public/auth/app/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refresh + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String nextRefresh = JsonPath.read(next, "$.refreshToken");
        assertThat(nextRefresh).isNotEqualTo(refresh);
        mvc.perform(post("/api/v1/public/auth/app/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + refresh + "\"}"))
                .andExpect(status().isUnauthorized());

        // Logout revokes the session.
        mvc.perform(post("/api/v1/public/auth/app/logout").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + nextRefresh + "\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/public/auth/app/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + nextRefresh + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void portalAdminsAreAdminsAndApprovedRightAway() throws Exception {
        when(portal.login(eq("boss@test.dev"), anyString())).thenReturn(ok("boss@test.dev", "ROLE_ADMIN", "ROLE_USER"));
        String access = JsonPath.read(login("boss@test.dev"), "$.accessToken");
        mvc.perform(get("/api/v1/admin/users").header("Authorization", "Bearer " + access)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + access))
                .andExpect(jsonPath("$.status").value("APPROVED"));
    }

    @Test
    void tamperedTokensAreRejected() throws Exception {
        when(portal.login(eq("eve@test.dev"), anyString())).thenReturn(ok("eve@test.dev", "ROLE_USER"));
        String access = JsonPath.read(login("eve@test.dev"), "$.accessToken");
        String[] parts = access.split("\\.");
        String forged = parts[0] + "." + parts[1].replace(parts[1].charAt(5), parts[1].charAt(5) == 'a' ? 'b' : 'a') + "." + parts[2];
        mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + forged)).andExpect(status().isUnauthorized());
    }

    @Test
    void portalErrorsAndTwoStepAccountsAreExplained() throws Exception {
        when(portal.login(eq("bad@test.dev"), anyString()))
                .thenThrow(new ApiException(HttpStatus.UNAUTHORIZED, "PRTL-1003", "Invalid email or password."));
        mvc.perform(post("/api/v1/public/auth/app/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"bad@test.dev\",\"password\":\"nope-nope\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password."));

        when(portal.login(eq("mfa@test.dev"), anyString())).thenReturn(new PortalAccountsClient.Result(true, true,
                new PortalAccountsClient.Account("m", "mfa@test.dev", null, null, List.of("ROLE_USER"))));
        mvc.perform(post("/api/v1/public/auth/app/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"mfa@test.dev\",\"password\":\"pw-123456\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("HS-6005"));
    }

    @Test
    void registrationSignsInOrReportsPendingApproval() throws Exception {
        when(portal.register(eq("new@test.dev"), anyString(), anyString(), anyString())).thenReturn(ok("new@test.dev", "ROLE_USER"));
        mvc.perform(post("/api/v1/public/auth/app/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"new@test.dev\",\"password\":\"Str0ng-pass\",\"firstName\":\"Ana\",\"lastName\":\"Lee\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").exists());

        when(portal.register(eq("wait@test.dev"), anyString(), anyString(), any()))
                .thenReturn(new PortalAccountsClient.Result(false, false, null));
        mvc.perform(post("/api/v1/public/auth/app/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"wait@test.dev\",\"password\":\"Str0ng-pass\",\"firstName\":\"Ana\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.code").value("HS-6003"));
    }

    @Test
    void repeatedGuessesAreThrottled() throws Exception {
        when(portal.login(eq("target@test.dev"), anyString()))
                .thenThrow(new ApiException(HttpStatus.UNAUTHORIZED, "PRTL-1003", "Invalid email or password."));
        for (int i = 0; i < LoginRateLimiter.PER_EMAIL; i++) {
            mvc.perform(post("/api/v1/public/auth/app/login").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"target@test.dev\",\"password\":\"guess-" + i + "\"}"))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/v1/public/auth/app/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"TARGET@test.dev\",\"password\":\"guess-x\"}"))
                .andExpect(status().isTooManyRequests());
    }
}
