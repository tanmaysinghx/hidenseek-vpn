package com.tanmaysinghx.hidenseek_backend.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ConsoleForwardingTest {

    @Autowired
    MockMvc mvc;

    @MockitoBean
    JwtDecoder jwtDecoder;

    @Test
    void clientRoutesGetTheShellWithoutSignIn() throws Exception {
        mvc.perform(get("/console")).andExpect(redirectedUrl("/console/"));
        mvc.perform(get("/console/")).andExpect(status().isOk()).andExpect(forwardedUrl("/console/index.html"));
        mvc.perform(get("/console/users/42")).andExpect(status().isOk()).andExpect(forwardedUrl("/console/index.html"));
    }

    @Test
    void landingPageAndItsScreenshotsArePublic() throws Exception {
        mvc.perform(get("/")).andExpect(status().isOk());
        mvc.perform(get("/screens/android-connect.webp")).andExpect(status().isOk());
        mvc.perform(get("/screens/desktop-connect.webp")).andExpect(status().isOk());
    }

    @Test
    void realFilesAreNotRewritten() throws Exception {
        mvc.perform(get("/console/index.html")).andExpect(status().isOk());
        mvc.perform(get("/console/missing-chunk.js")).andExpect(status().isNotFound());
    }
}
