package com.tanmaysinghx.hidenseek_backend.device;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface PeerRepository extends JpaRepository<Peer, String> {

    Optional<Peer> findByDeviceIdAndNodeId(String deviceId, String nodeId);

    @Query("select p.address from Peer p where p.node.id = :nodeId")
    List<String> findAddressesByNodeId(String nodeId);

    /** Peers the node should have configured: active devices of approved users. */
    @Query("""
            select p from Peer p join fetch p.device d join fetch d.user u
            where p.node.id = :nodeId and d.revokedAt is null
              and u.status = com.tanmaysinghx.hidenseek_backend.user.VpnUser.Status.APPROVED
            """)
    List<Peer> findAuthorizedByNodeId(String nodeId);

    @Query("select p from Peer p join fetch p.device d join fetch d.user where p.node.id = :nodeId")
    List<Peer> findAllWithDeviceByNodeId(String nodeId);

    long countByNodeId(String nodeId);

    @Modifying
    @Query("delete from Peer p where p.node.id = :nodeId")
    void deleteByNodeId(String nodeId);
}
