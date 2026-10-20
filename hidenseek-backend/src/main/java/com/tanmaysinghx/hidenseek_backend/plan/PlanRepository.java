package com.tanmaysinghx.hidenseek_backend.plan;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlanRepository extends JpaRepository<Plan, String> {

    List<Plan> findAllByOrderBySortOrderAsc();

    Optional<Plan> findFirstByDefaultPlanTrue();
}
