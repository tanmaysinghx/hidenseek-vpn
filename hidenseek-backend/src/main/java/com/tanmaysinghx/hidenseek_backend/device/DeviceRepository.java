package com.tanmaysinghx.hidenseek_backend.device;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeviceRepository extends JpaRepository<Device, String> {

    List<Device> findByUserIdAndRevokedAtIsNullOrderByCreatedAt(String userId);

    long countByUserIdAndRevokedAtIsNull(String userId);

    Optional<Device> findByIdAndUserId(String id, String userId);

    boolean existsByPublicKey(String publicKey);
}
