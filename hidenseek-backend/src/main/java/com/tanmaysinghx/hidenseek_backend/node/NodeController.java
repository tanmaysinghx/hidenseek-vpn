package com.tanmaysinghx.hidenseek_backend.node;

import com.tanmaysinghx.hidenseek_backend.config.HidenseekProperties;
import com.tanmaysinghx.hidenseek_backend.node.NodeDtos.NodeView;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class NodeController {

    private final NodeService nodeService;
    private final HidenseekProperties properties;

    @GetMapping("/api/v1/nodes")
    public List<NodeView> list() {
        return nodeService.listAvailable().stream().map(NodeView::of).toList();
    }

    /**
     * Lets an app configure itself from just the backend URL. With {@code tokenBroker} the app sends
     * its authorization code to /api/v1/public/auth instead of Portal's token endpoint.
     */
    public record PublicConfig(String name, String portalUrl, String clientId, String scopes, boolean tokenBroker,
                               boolean passwordLogin) {
    }

    @GetMapping("/api/v1/public/config")
    public PublicConfig publicConfig() {
        return new PublicConfig("Hidenseek VPN", properties.portal().url(), properties.portal().clientId(),
                "openid profile email", properties.portal().brokersTokens(), properties.portal().passwordLogin());
    }
}
