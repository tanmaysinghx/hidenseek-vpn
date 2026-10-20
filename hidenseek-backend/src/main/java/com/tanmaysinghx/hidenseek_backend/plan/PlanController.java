package com.tanmaysinghx.hidenseek_backend.plan;

import com.tanmaysinghx.hidenseek_backend.plan.PlanDtos.MyPlanView;
import com.tanmaysinghx.hidenseek_backend.plan.PlanDtos.PlanRequestView;
import com.tanmaysinghx.hidenseek_backend.plan.PlanDtos.PlanView;
import com.tanmaysinghx.hidenseek_backend.plan.PlanDtos.RequestPlan;
import com.tanmaysinghx.hidenseek_backend.plan.PlanDtos.UsageView;
import com.tanmaysinghx.hidenseek_backend.user.CurrentUser;
import com.tanmaysinghx.hidenseek_backend.user.VpnUser;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Plans as a signed-in user sees them: the catalogue, their own plan and usage, and requests. */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class PlanController {

    private final PlanService plans;

    @GetMapping("/plans")
    public List<PlanView> list() {
        return plans.list().stream().map(PlanView::of).toList();
    }

    @GetMapping("/me/plan")
    @Transactional(readOnly = true)
    public MyPlanView mine(@CurrentUser VpnUser user) {
        return view(user);
    }

    /** Free plan: switches at once. Others: creates a request for an admin. Returns the new state. */
    @PostMapping("/me/plan-requests")
    @Transactional
    public MyPlanView request(@CurrentUser VpnUser user, @Valid @RequestBody RequestPlan body) {
        plans.request(user, body.planId(), body.note());
        return view(user);
    }

    @DeleteMapping("/me/plan-requests/pending")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void cancel(@CurrentUser VpnUser user) {
        plans.cancelPending(user);
    }

    private MyPlanView view(VpnUser user) {
        Plan plan = plans.effectivePlan(user);
        PlanRequest pending = plans.pendingRequest(user);
        boolean ownPlan = user.getPlanId() != null && user.getPlanId().equals(plan.getId());
        return new MyPlanView(PlanView.of(plan), ownPlan ? user.getPlanExpiresAt() : null,
                UsageView.of(plans.usage(user)),
                pending == null ? null : PlanRequestView.of(pending, plans.get(pending.getPlanId()), user));
    }
}
