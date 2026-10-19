package com.tanmaysinghx.hidenseek_backend.node;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NodeRepository extends JpaRepository<Node, String> {

    Optional<Node> findByEnrollmentTokenHash(String hash);

    Optional<Node> findByAgentTokenHash(String hash);

    List<Node> findAllByOrderByName();

    boolean existsByNameIgnoreCase(String name);
}
