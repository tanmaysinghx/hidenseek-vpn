package com.tanmaysinghx.hidenseek_backend.appauth;

import com.tanmaysinghx.hidenseek_backend.appauth.AppAuthService.Issued;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Email/password sign-in for the native apps (Portal checks the credentials). */
@RestController
@RequestMapping("/api/v1/public/auth/app")
@RequiredArgsConstructor
public class AppAuthController {

    private final AppAuthService auth;
    private final LoginRateLimiter limiter;

    public record LoginRequest(@NotBlank @Email String email, @NotBlank @Size(max = 200) String password,
                               @Size(max = 100) String deviceName) {
    }

    public record RegisterRequest(@NotBlank @Email String email, @NotBlank @Size(min = 8, max = 200) String password,
                                  @NotBlank @Size(max = 100) String firstName, @Size(max = 100) String lastName,
                                  @Size(max = 100) String deviceName) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    @PostMapping("/login")
    public ResponseEntity<Issued> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        limiter.check(request.email(), http.getRemoteAddr());
        return noStore(auth.login(request.email(), request.password(), request.deviceName()));
    }

    @PostMapping("/register")
    public ResponseEntity<Issued> register(@Valid @RequestBody RegisterRequest request, HttpServletRequest http) {
        limiter.check(request.email(), http.getRemoteAddr());
        return noStore(auth.register(request.email(), request.password(), request.firstName(), request.lastName(),
                request.deviceName()));
    }

    @PostMapping("/refresh")
    public ResponseEntity<Issued> refresh(@Valid @RequestBody RefreshRequest request) {
        return noStore(auth.refresh(request.refreshToken()));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@Valid @RequestBody RefreshRequest request) {
        auth.logout(request.refreshToken());
    }

    private static ResponseEntity<Issued> noStore(Issued issued) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(issued);
    }
}
