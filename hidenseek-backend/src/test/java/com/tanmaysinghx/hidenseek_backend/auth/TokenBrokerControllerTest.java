package com.tanmaysinghx.hidenseek_backend.auth;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.ArgumentMatchers.any;

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

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TokenBrokerControllerTest {

    @Autowired
    MockMvc mvc;

    @MockitoBean
    PortalTokenClient portal;

    @MockitoBean
    JwtDecoder jwtDecoder;

    @Test
    void redeemsCodeWithVerifierAtPortal() throws Exception {
        when(portal.exchange(any())).thenReturn(ResponseEntity.ok("{\"access_token\":\"a\",\"refresh_token\":\"r\"}"));
        mvc.perform(post("/api/v1/public/auth/token").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"c","codeVerifier":"v","redirectUri":"http://127.0.0.1:47863/callback"}"""))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"refresh_token\":\"r\"}"));
        verify(portal).exchange(argThat(form -> "authorization_code".equals(form.get("grant_type"))
                && "v".equals(form.get("code_verifier")) && "c".equals(form.get("code"))));
    }

    @Test
    void rejectsNonLoopbackRedirects() throws Exception {
        mvc.perform(post("/api/v1/public/auth/token").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"c","codeVerifier":"v","redirectUri":"https://evil.example/callback"}"""))
                .andExpect(status().isBadRequest());
        verify(portal, never()).exchange(any());
    }

    @Test
    void passesPortalErrorsThrough() throws Exception {
        when(portal.exchange(any())).thenReturn(ResponseEntity.badRequest()
                .header("Content-Type", "application/json").body("{\"error\":\"invalid_grant\"}"));
        mvc.perform(post("/api/v1/public/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"old\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(header().string("Content-Type", "application/json"))
                .andExpect(content().json("{\"error\":\"invalid_grant\"}"));
    }
}
