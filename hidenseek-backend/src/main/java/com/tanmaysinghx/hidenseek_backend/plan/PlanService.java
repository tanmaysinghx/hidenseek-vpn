package com.tanmaysinghx.hidenseek_backend.plan;

import com.tanmaysinghx.hidenseek_backend.common.ApiException;
import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.tanmaysinghx.hidenseek_backend.user.VpnUser;
import com.tanmaysinghx.hidenseek_backend.user.VpnUserRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Plans, daily usage and upgrade requests. Usage is counted from the agents' traffic reports; a user
 * over their plan's daily allowance is left out of every node's peer list until midnight (in the
 * configured timezone), so their tunnel stops within one agent poll. Admins are never limited.
 */
@Service
@RequiredArgsConstructor
public class PlanService {

    private final PlanRepository plans;
    private final PlanRequestRepository requests;
    private final DailyUsageRepository usage;
    private final VpnUserRepository users;
    private final HidenseekProperties properties;

    public record Usage(long usedBytes, Long limitBytes, Instant resetsAt, boolean limited, boolean exempt) {
    }

    // ---- Plans and usage --------------------------------------------------------------------

    public List<Plan> list() {
        return plans.findAllByOrderBySortOrderAsc();
    }

    public Plan get(String id) {
        return plans.findById(id).orElseThrow(() -> ApiException.notFound("Plan"));
    }

    public Plan defaultPlan() {
        return plans.findFirstByDefaultPlanTrue().orElseThrow(() -> new IllegalStateException("No default plan"));
    }

    /** The user's plan, or the default one when none is set or it has expired. */
    public Plan effectivePlan(VpnUser user) {
        return planOf(user, Instant.now(), byId());
    }

    private Plan planOf(VpnUser user, Instant now, Map<String, Plan> all) {
        boolean active = user.getPlanId() != null
                && (user.getPlanExpiresAt() == null || user.getPlanExpiresAt().isAfter(now));
        Plan plan = active ? all.get(user.getPlanId()) : null;
        return plan != null ? plan : all.values().stream().filter(Plan::isDefaultPlan).findFirst().orElseThrow();
    }

    public Usage usage(VpnUser user) {
        Plan plan = effectivePlan(user);
        LocalDate today = today();
        long used = usage.findById(new DailyUsage.Key(user.getId(), today)).map(DailyUsage::getUsedBytes).orElse(0L);
        return usage(user, plan, used);
    }

    private Usage usage(VpnUser user, Plan plan, long used) {
        boolean exempt = user.isAdmin();
        boolean limited = !exempt && !plan.isUnlimited() && used >= plan.getDailyLimitBytes();
        return new Usage(used, plan.getDailyLimitBytes(), nextReset(), limited, exempt);
    }

    /** Today's usage for many users at once (admin list). */
    public Map<String, Long> usedToday(Collection<String> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return usage.findForDay(today(), userIds).stream()
                .collect(Collectors.toMap(u -> u.getId().getUserId(), DailyUsage::getUsedBytes));
    }

    /** Users (among those given) who have used up today's allowance. */
    public Set<String> limitedUsers(Collection<VpnUser> candidates) {
        Map<String, VpnUser> byId = candidates.stream()
                .filter(u -> !u.isAdmin())
                .collect(Collectors.toMap(VpnUser::getId, Function.identity(), (a, b) -> a));
        if (byId.isEmpty()) {
            return Set.of();
        }
        Map<String, Plan> all = byId();
        Instant now = Instant.now();
        return usage.findForDay(today(), byId.keySet()).stream()
                .filter(u -> {
                    Plan plan = planOf(byId.get(u.getId().getUserId()), now, all);
                    return !plan.isUnlimited() && u.getUsedBytes() >= plan.getDailyLimitBytes();
                })
                .map(u -> u.getId().getUserId())
                .collect(Collectors.toSet());
    }

    public void requireAllowance(VpnUser user) {
        Usage u = usage(user);
        if (u.limited()) {
            Plan plan = effectivePlan(user);
            throw ApiException.forbidden("HS-7001", "You've used today's " + gb(plan.getDailyLimitBytes())
                    + " on the " + plan.getName() + " plan. It resets at midnight, or request a bigger plan.");
        }
    }

    /** Adds traffic (bytes, both directions) per user to today's totals. */
    @Transactional
    public void record(Map<String, Long> bytesByUser) {
        LocalDate today = today();
        bytesByUser.forEach((userId, bytes) -> {
            if (bytes > 0) {
                usage.add(userId, today, bytes);
            }
        });
    }

    @Scheduled(cron = "0 15 4 * * *")
    @Transactional
    public void purgeOldUsage() {
        usage.deleteBefore(today().minusDays(90));
    }

    // ---- Requests ---------------------------------------------------------------------------

    public PlanRequest pendingRequest(VpnUser user) {
        return requests.findFirstByUserIdAndStatus(user.getId(), PlanRequest.Status.PENDING).orElse(null);
    }

    /**
     * Moving to the default (free) plan happens at once; anything else waits for an admin. A new
     * request replaces the user's previous pending one.
     */
    @Transactional
    public PlanRequest request(VpnUser user, String planId, String note) {
        Plan plan = get(planId);
        cancelPending(user);
        if (plan.isDefaultPlan()) {
            user.setPlanId(null);
            user.setPlanExpiresAt(null);
            users.save(user);
            return null;
        }
        if (effectivePlan(user).getId().equals(plan.getId())) {
            throw ApiException.badRequest("HS-7002", "You're already on the " + plan.getName() + " plan");
        }
        PlanRequest request = new PlanRequest();
        request.setUserId(user.getId());
        request.setPlanId(plan.getId());
        request.setStatus(PlanRequest.Status.PENDING);
        request.setNote(blankToNull(note));
        request.setCreatedAt(Instant.now());
        return requests.save(request);
    }

    @Transactional
    public void cancelPending(VpnUser user) {
        requests.findFirstByUserIdAndStatus(user.getId(), PlanRequest.Status.PENDING)
                .ifPresent(r -> {
                    r.setStatus(PlanRequest.Status.CANCELLED);
                    r.setDecidedAt(Instant.now());
                });
    }

    public List<PlanRequest> requests(boolean pendingOnly) {
        return pendingOnly
                ? requests.findByStatusOrderByCreatedAtAsc(PlanRequest.Status.PENDING)
                : requests.findTop100ByOrderByCreatedAtDesc();
    }

    public long pendingCount() {
        return requests.countByStatus(PlanRequest.Status.PENDING);
    }

    @Transactional
    public PlanRequest approve(String requestId, Integer days, String note, VpnUser admin) {
        PlanRequest request = pending(requestId);
        VpnUser user = users.findById(request.getUserId()).orElseThrow(() -> ApiException.notFound("User"));
        assign(user, get(request.getPlanId()), days);
        decide(request, PlanRequest.Status.APPROVED, note, admin);
        return request;
    }

    @Transactional
    public PlanRequest reject(String requestId, String note, VpnUser admin) {
        PlanRequest request = pending(requestId);
        decide(request, PlanRequest.Status.REJECTED, note, admin);
        return request;
    }

    /** Admin sets a user's plan directly; {@code days} null = no end date. */
    @Transactional
    public VpnUser assign(String userId, String planId, Integer days) {
        VpnUser user = users.findById(userId).orElseThrow(() -> ApiException.notFound("User"));
        assign(user, get(planId), days);
        cancelPending(user);
        return user;
    }

    @Transactional
    public Plan update(String id, String name, String description, Long dailyLimitBytes, String priceLabel) {
        Plan plan = get(id);
        if (dailyLimitBytes != null && dailyLimitBytes < 1) {
            throw ApiException.badRequest("HS-7003", "The daily limit must be positive, or empty for unlimited");
        }
        plan.setName(name.trim());
        plan.setDescription(blankToNull(description));
        plan.setDailyLimitBytes(dailyLimitBytes);
        plan.setPriceLabel(blankToNull(priceLabel));
        return plan;
    }

    private void assign(VpnUser user, Plan plan, Integer days) {
        if (days != null && (days < 1 || days > 3660)) {
            throw ApiException.badRequest("HS-7004", "Duration must be between 1 and 3660 days");
        }
        boolean free = plan.isDefaultPlan();
        user.setPlanId(free ? null : plan.getId());
        user.setPlanExpiresAt(free || days == null ? null : Instant.now().plus(Duration.ofDays(days)));
        users.save(user);
    }

    private PlanRequest pending(String requestId) {
        PlanRequest request = requests.findById(requestId).orElseThrow(() -> ApiException.notFound("Plan request"));
        if (request.getStatus() != PlanRequest.Status.PENDING) {
            throw new ApiException(HttpStatus.CONFLICT, "HS-7005", "This request was already " + request.getStatus().name().toLowerCase());
        }
        return request;
    }

    private static void decide(PlanRequest request, PlanRequest.Status status, String note, VpnUser admin) {
        request.setStatus(status);
        request.setDecidedAt(Instant.now());
        request.setDecidedBy(admin.getEmail());
        request.setDecisionNote(blankToNull(note));
    }

    // ---- Time -------------------------------------------------------------------------------

    public LocalDate today() {
        return LocalDate.now(zone());
    }

    public Instant nextReset() {
        return today().plusDays(1).atStartOfDay(zone()).toInstant();
    }

    private ZoneId zone() {
        return ZoneId.of(properties.plans().timezone());
    }

    private Map<String, Plan> byId() {
        return plans.findAll().stream().collect(Collectors.toMap(Plan::getId, Function.identity()));
    }

    private static String gb(long bytes) {
        double gb = bytes / (1024.0 * 1024 * 1024);
        return (gb == Math.rint(gb) ? String.valueOf((long) gb) : String.format("%.1f", gb)) + " GB";
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
