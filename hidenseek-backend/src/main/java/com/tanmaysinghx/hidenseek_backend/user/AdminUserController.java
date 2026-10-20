package com.tanmaysinghx.hidenseek_backend.user;

import com.tanmaysinghx.hidenseek_backend.plan.PlanService;
import com.tanmaysinghx.hidenseek_backend.user.UserDtos.AdminUserView;
import com.tanmaysinghx.hidenseek_backend.user.UserDtos.UpdateUserRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
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
    private final PlanService plans;

    @GetMapping
    @Transactional(readOnly = true)
    public List<AdminUserView> list() {
        List<VpnUser> all = userService.list();
        Map<String, Long> used = plans.usedToday(all.stream().map(VpnUser::getId).toList());
        return all.stream()
                .map(u -> AdminUserView.of(u, plans.effectivePlan(u), used.getOrDefault(u.getId(), 0L)))
                .toList();
    }

    @PatchMapping("/{id}")
    @Transactional
    public AdminUserView update(@PathVariable String id, @Valid @RequestBody UpdateUserRequest request,
                                @CurrentUser VpnUser actor) {
        VpnUser user = userService.setStatus(id, request.status(), actor);
        return AdminUserView.of(user, plans.effectivePlan(user), plans.usage(user).usedBytes());
    }
}
