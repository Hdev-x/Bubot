package com.tj.app.bot;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;

/** ============================================================
 * [클래스 읽기] 봇(trader) HTTP API 프록시 — ADMIN 전용.
 *
 * 프론트는 /api/bot/** 로 호출(JWT 첨부).
 *  1. SecurityConfig가 /api/bot/** 를 ROLE_ADMIN으로 제한 → 비ADMIN은 여기 도달 못함(403)
 *  2. 이 컨트롤러가 외부 trader 서비스로 요청을 중계하면서
 *     서버측 비밀 토큰(app.bot.api-token)을 Authorization 헤더로 붙인다.
 *     → trader 토큰을 프론트에 노출하지 않고 admin만 봇 데이터를 조회할 수 있게 한다.
 *
 * 실시간 WebSocket 스트림은 BotWebSocketProxyHandler가 /api/bot-ws/** 에서 별도 중계한다.
 * ============================================================ */
@RestController
@RequestMapping("/api/bot")
public class BotProxyController {

    private static final String PREFIX = "/api/bot/";

    private final WebClient webClient;
    private final String botApiToken;

    public BotProxyController(
            @Value("${app.bot.base-url}") String baseUrl,
            @Value("${app.bot.api-token}") String botApiToken) {
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                // 일부 응답이 클 수 있어 버퍼 한도를 넉넉히 (4MB)
                .codecs(c -> c.defaultCodecs().maxInMemorySize(4 * 1024 * 1024))
                .build();
        this.botApiToken = botApiToken;
    }

    /** /api/bot/** 의 GET 요청을 trader로 중계 (봇 상태 조회 등) */
    @RequestMapping(value = "/**", method = org.springframework.web.bind.annotation.RequestMethod.GET)
    public ResponseEntity<byte[]> proxyGet(HttpServletRequest request) {
        return forward(request, null);
    }

    /** /api/bot/** 의 POST 요청을 trader로 중계 (봇 제어 등) */
    @RequestMapping(value = "/**", method = org.springframework.web.bind.annotation.RequestMethod.POST)
    public ResponseEntity<byte[]> proxyPost(HttpServletRequest request, @RequestBody(required = false) byte[] body) {
        return forward(request, body);
    }

    private ResponseEntity<byte[]> forward(HttpServletRequest request, byte[] body) {
        String target = buildTargetPath(request);

        WebClient.RequestBodySpec spec = webClient
                .method(org.springframework.http.HttpMethod.valueOf(request.getMethod()))
                .uri(target)
                .header("Authorization", "Bearer " + botApiToken);

        WebClient.ResponseSpec responseSpec = (body != null && body.length > 0)
                ? spec.contentType(MediaType.APPLICATION_JSON).bodyValue(body).retrieve()
                : spec.retrieve();

        // 중계: trader의 상태코드/바디를 그대로 전달. 4xx/5xx도 예외 없이 전달.
        return responseSpec
                .onStatus(s -> true, resp -> reactor.core.publisher.Mono.empty())
                .toEntity(byte[].class)
                .map(entity -> ResponseEntity
                        .status(entity.getStatusCode())
                        .contentType(entity.getHeaders().getContentType() != null
                                ? entity.getHeaders().getContentType() : MediaType.APPLICATION_JSON)
                        .body(entity.getBody()))
                .onErrorResume(e -> reactor.core.publisher.Mono.just(
                        ResponseEntity.status(HttpStatusCode.valueOf(502))
                                .body(("{\"message\":\"bot proxy error: " + e.getMessage() + "\"}").getBytes())))
                .block();
    }

    /**
     * /api/bot/main/api/status?x=1 → /bot-api/main/api/status?x=1
     * trader는 /bot-api/** 경로로 서비스하므로 접두어를 /bot-api 로 바꿔 중계한다.
     */
    private String buildTargetPath(HttpServletRequest request) {
        String uri = request.getRequestURI();           // /api/bot/main/api/status
        String rest = uri.substring(PREFIX.length());    // main/api/status
        String query = request.getQueryString();
        return "/bot-api/" + rest + (query != null ? "?" + query : "");
    }
}
