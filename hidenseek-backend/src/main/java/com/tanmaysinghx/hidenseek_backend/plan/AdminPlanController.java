package com.tanmaysinghx.hidenseek_backend.plan;

import com.tanmaysinghx.hidenseek_backend.plan.PlanDtos.AssignPlan;
import com.tanmaysinghx.hidenseek_backend.plan.PlanDtos.Decision;
import com.tanmaysinghx.hidenseek_backend.plan.PlanDtos.PlanRequestView;
import com.tanmaysinghx.hidenseek_backend.plan.PlanDtos.PlanView;
import com.tanmaysinghx.hidenseek_backend.plan.PlanDtos.UpdatePlan;
import com.tanmaysinghx.hidenseek_backend.user.CurrentUser;
import com.tanmaysinghx.hidenseek_backend.user.UserDtos.AdminUserView;
import com.tanmaysinghx.hidenseek_backend.user.VpnUser;
import com.tanmaysinghx.hidenseek_backend.user.VpnUserRepository;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
public class AdminPlanController {

    private final PlanService plans;
    private final VpnUserRepository users;

    @GetMapping("/plans")
    public List<PlanView> list() {
        return plans.list().stream().map(PlanView::of).toList();
    }

    @PutMapping("/plans/{id}")
    @Transactional
    public PlanView update(@PathVariable String id, @Valid @RequestBody UpdatePlan body) {
        return PlanView.of(plans.update(id, body.name(), body.description(), body.dailyLimitBytes(), body.priceLabel()));
    }

    @GetMapping("/plan-requests")
    @Transactional(readOnly = true)
    public List<PlanRequestView> requests(@RequestParam(defaultValue = "true") boolean pending) {
        List<PlanRequest> list = plans.requests(pending);
        Map<String, VpnUser> byId = users.findAllById(list.stream().map(PlanRequest::getUserId).distinct().toList())
                .stream().collect(Collectors.toMap(VpnUser::getId, Function.identity()));
        Map<String, Plan> planById = plans.list().stream().collect(Collectors.toMap(Plan::getId, Function.identity()));
        return list.stream().map(r -> PlanRequestView.of(r, planById.get(r.getPlanId()), byId.get(r.getUserId()))).toList();
    }

    @PostMapping("/plan-requests/{id}/approve")
    @Transactional
    public PlanRequestView approve(@PathVariable String id, @Valid @RequestBody(required = false) Decision body,
                                   @CurrentUser VpnUser admin) {
        Decision d = body == null ? new Decision(null, null) : body;
        PlanRequest r = plans.approve(id, d.days(), d.note(), admin);
        return PlanRequestView.of(r, plans.get(r.getPlanId()), users.findById(r.getUserId()).orElse(null));
    }

    @PostMapping("/plan-requests/{id}/reject")
    @Transactional
    public PlanRequestView reject(@PathVariable String id, @Valid @RequestBody(required = false) Decision body,
                                  @CurrentUser VpnUser admin) {
        PlanRequest r = plans.reject(id, body == null ? null : body.note(), admin);
        return PlanRequestView.of(r, plans.get(r.getPlanId()), users.findById(r.getUserId()).orElse(null));
    }

    @PutMapping("/users/{id}/plan")
    @Transactional
    public AdminUserView assign(@PathVariable String id, @Valid @RequestBody AssignPlan body) {
        VpnUser user = plans.assign(id, body.planId(), body.days());
        return AdminUserView.of(user, plans.effectivePlan(user), plans.usage(user).usedBytes());
    }
}
