package com.tanmaysinghx.hidenseek_backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WebSessionControllerTest {

    @Autowired
    MockMvc mvc;

    @MockitoBean
    PortalTokenClient portal;

    @MockitoBean
    JwtDecoder jwtDecoder;

    @Test
    void codeExchangeKeepsTheRefreshTokenInAnHttpOnlyCookie() throws Exception {
        when(portal.exchange(any())).thenReturn(ResponseEntity.ok(
                "{\"access_token\":\"at-1\",\"refresh_token\":\"rt-1\",\"expires_in\":900}"));
        MvcResult result = mvc.perform(post("/api/v1/public/auth/web/token").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"c\",\"codeVerifier\":\"v\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("at-1"))
                .andExpect(jsonPath("$.expiresIn").value(900))
                .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("rt-1");
        String cookie = result.getResponse().getHeader("Set-Cookie");
        assertThat(cookie).contains("hs_rt=rt-1", "HttpOnly", "Secure", "SameSite=Strict",
                "Path=/api/v1/public/auth/web");
        verify(portal).exchange(argThat(form -> "https://sso.test/oauth2/popup-callback".equals(form.get("redirect_uri"))
                && "v".equals(form.get("code_verifier"))));
    }

    @Test
    void refreshRotatesTheCookieAndNeedsTheConsoleHeader() throws Exception {
        mvc.perform(post("/api/v1/public/auth/web/refresh").cookie(new Cookie("hs_rt", "rt-1")))
                .andExpect(status().isForbidden());

        when(portal.exchange(any())).thenReturn(ResponseEntity.ok(
                "{\"access_token\":\"at-2\",\"refresh_token\":\"rt-2\",\"expires_in\":900}"));
        MvcResult result = mvc.perform(post("/api/v1/public/auth/web/refresh").cookie(new Cookie("hs_rt", "rt-1"))
                        .header("X-Hidenseek-Console", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("at-2"))
                .andReturn();
        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("hs_rt=rt-2");
    }

    @Test
    void rejectedRefreshClearsTheCookie() throws Exception {
        when(portal.exchange(any())).thenReturn(ResponseEntity.badRequest().body("{\"error\":\"invalid_grant\"}"));
        MvcResult result = mvc.perform(post("/api/v1/public/auth/web/refresh").cookie(new Cookie("hs_rt", "old"))
                        .header("X-Hidenseek-Console", "1"))
                .andExpect(status().isUnauthorized())
                .andReturn();
        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("hs_rt=", "Max-Age=0");
    }

    @Test
    void logoutClearsTheCookie() throws Exception {
        MvcResult result = mvc.perform(post("/api/v1/public/auth/web/logout").header("X-Hidenseek-Console", "1"))
                .andExpect(status().isNoContent()).andReturn();
        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("Max-Age=0");
    }
}
