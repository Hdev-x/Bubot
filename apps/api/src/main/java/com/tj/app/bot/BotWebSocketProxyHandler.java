package com.tj.app.bot;

import com.tj.app.common.security.JwtProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class BotWebSocketProxyHandler extends TextWebSocketHandler {

    private static final String CLIENT_PREFIX = "/api/bot-ws/";
    private static final String TRADER_PREFIX = "/bot-api/";
    private static final String UPSTREAM_SESSION_KEY = "botUpstreamSession";

    private final JwtProvider jwtProvider;
    private final String baseUrl;
    private final String botApiToken;
    private final StandardWebSocketClient webSocketClient = new StandardWebSocketClient();

    public BotWebSocketProxyHandler(
            JwtProvider jwtProvider,
            @Value("${app.bot.base-url}") String baseUrl,
            @Value("${app.bot.api-token}") String botApiToken) {
        this.jwtProvider = jwtProvider;
        this.baseUrl = baseUrl;
        this.botApiToken = botApiToken;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession clientSession) throws Exception {
        String appToken = queryParams(clientSession.getUri()).get("token");
        if (!isAdminToken(appToken)) {
            clientSession.close(CloseStatus.POLICY_VIOLATION.withReason("ADMIN token required"));
            return;
        }

        URI upstreamUri = buildUpstreamUri(clientSession.getUri());
        webSocketClient.execute(new TextWebSocketHandler() {
            @Override
            public void afterConnectionEstablished(WebSocketSession upstreamSession) {
                clientSession.getAttributes().put(UPSTREAM_SESSION_KEY, upstreamSession);
            }

            @Override
            protected void handleTextMessage(WebSocketSession upstreamSession, TextMessage message) throws IOException {
                if (clientSession.isOpen()) {
                    clientSession.sendMessage(message);
                }
            }

            @Override
            public void afterConnectionClosed(WebSocketSession upstreamSession, CloseStatus status) throws Exception {
                if (clientSession.isOpen()) {
                    clientSession.close(status);
                }
            }

            @Override
            public void handleTransportError(WebSocketSession upstreamSession, Throwable exception) throws Exception {
                if (clientSession.isOpen()) {
                    clientSession.close(CloseStatus.SERVER_ERROR.withReason("upstream error"));
                }
            }
        }, new WebSocketHttpHeaders(), upstreamUri).whenComplete((upstreamSession, error) -> {
            if (error != null && clientSession.isOpen()) {
                try {
                    clientSession.close(CloseStatus.SERVER_ERROR.withReason("upstream connect failed"));
                } catch (IOException ignored) {
                    // Client already disconnected.
                }
            }
        });
    }

    @Override
    protected void handleTextMessage(WebSocketSession clientSession, TextMessage message) throws Exception {
        WebSocketSession upstreamSession = (WebSocketSession) clientSession.getAttributes().get(UPSTREAM_SESSION_KEY);
        if (upstreamSession != null && upstreamSession.isOpen()) {
            upstreamSession.sendMessage(message);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession clientSession, CloseStatus status) throws Exception {
        WebSocketSession upstreamSession = (WebSocketSession) clientSession.getAttributes().get(UPSTREAM_SESSION_KEY);
        if (upstreamSession != null && upstreamSession.isOpen()) {
            upstreamSession.close(status);
        }
    }

    private boolean isAdminToken(String token) {
        if (token == null || token.isBlank()) {
            return false;
        }
        try {
            jwtProvider.validateAndGetSubject(token);
            return "ADMIN".equalsIgnoreCase(jwtProvider.getRole(token));
        } catch (Exception e) {
            return false;
        }
    }

    private URI buildUpstreamUri(URI clientUri) {
        String path = clientUri.getPath();
        String rest = path.startsWith(CLIENT_PREFIX) ? path.substring(CLIENT_PREFIX.length()) : "";

        Map<String, String> params = queryParams(clientUri);
        params.remove("token");
        params.put("token", botApiToken);

        String query = params.entrySet().stream()
                .map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue()))
                .collect(Collectors.joining("&"));

        return URI.create(toWebSocketBaseUrl(baseUrl) + TRADER_PREFIX + rest + (query.isBlank() ? "" : "?" + query));
    }

    private String toWebSocketBaseUrl(String httpBaseUrl) {
        String trimmed = httpBaseUrl.endsWith("/") ? httpBaseUrl.substring(0, httpBaseUrl.length() - 1) : httpBaseUrl;
        if (trimmed.startsWith("https://")) {
            return "wss://" + trimmed.substring("https://".length());
        }
        if (trimmed.startsWith("http://")) {
            return "ws://" + trimmed.substring("http://".length());
        }
        return trimmed;
    }

    private Map<String, String> queryParams(URI uri) {
        Map<String, String> params = new LinkedHashMap<>();
        if (uri == null || uri.getRawQuery() == null || uri.getRawQuery().isBlank()) {
            return params;
        }

        Arrays.stream(uri.getRawQuery().split("&"))
                .filter(part -> !part.isBlank())
                .forEach(part -> {
                    String[] pair = part.split("=", 2);
                    String key = decode(pair[0]);
                    String value = pair.length > 1 ? decode(pair[1]) : "";
                    params.put(key, value);
                });
        return params;
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}
