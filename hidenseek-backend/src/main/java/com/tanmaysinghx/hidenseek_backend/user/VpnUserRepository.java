package com.tanmaysinghx.hidenseek_backend.user;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VpnUserRepository extends JpaRepository<VpnUser, String> {

    Optional<VpnUser> findBySubject(String subject);

    Optional<VpnUser> findByEmailIgnoreCase(String email);

    List<VpnUser> findAllByOrderByCreatedAtDesc();

    long countByStatus(VpnUser.Status status);
}
