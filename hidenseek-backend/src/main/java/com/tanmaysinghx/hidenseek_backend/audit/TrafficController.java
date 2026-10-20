package com.tanmaysinghx.hidenseek_backend.audit;

import com.tanmaysinghx.hidenseek_backend.audit.AuditDtos.TrafficBatch;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Where the web console reports page views. Public, because the sign-in page is usually where a
 * visit lands; when the console sends its token the events are tied to the signed-in user.
 */
@RestController
@RequiredArgsConstructor
public class TrafficController {

    private final TrafficService traffic;

    @PostMapping("/api/v1/public/events")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void record(@Valid @RequestBody TrafficBatch batch, HttpServletRequest request) {
        traffic.record(batch, request.getRemoteAddr(), request.getHeader("User-Agent"), AuditUserFilter.currentEmail());
    }
}
