package com.tanmaysinghx.hidenseek_backend.user;

import com.tanmaysinghx.hidenseek_backend.user.UserDtos.UserView;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
public class MeController {

    @GetMapping
    public UserView me(@CurrentUser VpnUser user) {
        return UserView.of(user);
    }
}
