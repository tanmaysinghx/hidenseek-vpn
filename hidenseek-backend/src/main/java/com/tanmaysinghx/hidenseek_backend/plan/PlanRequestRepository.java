package com.tanmaysinghx.hidenseek_backend.plan;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlanRequestRepository extends JpaRepository<PlanRequest, String> {

    Optional<PlanRequest> findFirstByUserIdAndStatus(String userId, PlanRequest.Status status);

    List<PlanRequest> findByStatusOrderByCreatedAtAsc(PlanRequest.Status status);

    List<PlanRequest> findTop100ByOrderByCreatedAtDesc();

    long countByStatus(PlanRequest.Status status);
}
