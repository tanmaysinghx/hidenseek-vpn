package com.tanmaysinghx.hidenseek_backend.node;

import com.tanmaysinghx.hidenseek_backend.device.PeerRepository;
import com.tanmaysinghx.hidenseek_backend.node.NodeDtos.AdminNodeView;
import com.tanmaysinghx.hidenseek_backend.node.NodeDtos.CreateNodeRequest;
import com.tanmaysinghx.hidenseek_backend.node.NodeDtos.EnrollmentView;
import com.tanmaysinghx.hidenseek_backend.node.NodeDtos.UpdateNodeRequest;
import com.tanmaysinghx.hidenseek_backend.session.VpnSessionRepository;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/nodes")
@RequiredArgsConstructor
public class AdminNodeController {

    private final NodeService nodeService;
    private final PeerRepository peers;
    private final VpnSessionRepository sessions;

    @GetMapping
    public List<AdminNodeView> list() {
        return nodeService.list().stream().map(this::view).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminNodeView create(@Valid @RequestBody CreateNodeRequest request) {
        return view(nodeService.create(request));
    }

    @PatchMapping("/{id}")
    public AdminNodeView update(@PathVariable String id, @Valid @RequestBody UpdateNodeRequest request) {
        return view(nodeService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        nodeService.delete(id);
    }

    @PostMapping("/{id}/enrollment")
    public EnrollmentView enrollment(@PathVariable String id) {
        return nodeService.issueEnrollment(id);
    }

    private AdminNodeView view(Node node) {
        return AdminNodeView.of(node, peers.countByNodeId(node.getId()),
                sessions.countByNodeIdAndEndedAtIsNull(node.getId()));
    }
}
