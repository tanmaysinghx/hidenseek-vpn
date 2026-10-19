package com.tanmaysinghx.hidenseek_backend.user;

import com.tanmaysinghx.hidenseek_backend.user.UserDtos.UpdateUserRequest;
import com.tanmaysinghx.hidenseek_backend.user.UserDtos.UserView;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/users")
@RequiredArgsConstructor
public class AdminUserController {

    private final UserService userService;

    @GetMapping
    public List<UserView> list() {
        return userService.list().stream().map(UserView::of).toList();
    }

    @PatchMapping("/{id}")
    public UserView update(@PathVariable String id, @Valid @RequestBody UpdateUserRequest request,
                           @CurrentUser VpnUser actor) {
        return UserView.of(userService.setStatus(id, request.status(), actor));
    }
}
