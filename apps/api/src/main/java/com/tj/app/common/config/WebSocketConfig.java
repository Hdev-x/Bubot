package com.tj.app.common.config;

import com.tj.app.common.security.JwtProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/** ============================================================
 * [클래스 읽기] WebSocket(STOMP) 설정 클래스.
 *
 * @EnableWebSocketMessageBroker → STOMP 기반 WebSocket 메시지 브로커를 활성화한다.
 * 실시간 코인 시세, 주식 시세, 실시간 댓글 기능이 이 설정을 기반으로 동작한다.
 *
 * [전체 흐름]
 * 클라이언트(JS) → SockJS로 /ws-coin 또는 /ws-stock 에 연결
 *               → STOMP 프로토콜로 /topic/... 채널을 구독
 *               → 서버가 해당 채널로 메시지를 발행하면 구독자 전체에 전달
 * ============================================================ */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtProvider jwtProvider;

    public WebSocketConfig(JwtProvider jwtProvider) {
        this.jwtProvider = jwtProvider;
    }

    /** ============================================================
     * 메시지 브로커 설정.
     *
     * enableSimpleBroker("/topic") →
     *   /topic 으로 시작하는 채널을 인메모리 브로커가 관리한다.
     *   서버에서 /topic/coin/BTCUSDT 로 발행하면 해당 채널 구독자 전체에 전달.
     *
     * setApplicationDestinationPrefixes("/app") →
     *   클라이언트가 /app/... 로 메시지를 보내면 @MessageMapping 메서드로 라우팅된다.
     *   (현재 프로젝트에서는 주로 서버→클라이언트 단방향 전송만 사용 중)
     * ============================================================ */
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    /** ============================================================
     * STOMP WebSocket 엔드포인트 등록.
     *
     * [실행 흐름]
     * 1. 클라이언트(JS)가 /ws-coin 또는 /ws-stock으로 WebSocket 연결 시도.
     * 2. 현재 순수 WebSocket 사용을 위해 withSockJS()를 제거함.
     * 3. setAllowedOriginPatterns("*")로 모든 도메인의 접근을 허용.
     * ============================================================ */
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws-coin")
                .addInterceptors(jwtHandshakeInterceptor())
                .setAllowedOriginPatterns("*");
        registry.addEndpoint("/ws-stock")
                .addInterceptors(jwtHandshakeInterceptor())
                .setAllowedOriginPatterns("*");
    }

    private HandshakeInterceptor jwtHandshakeInterceptor() {
        return new HandshakeInterceptor() {
            @Override
            public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                           WebSocketHandler wsHandler, Map<String, Object> attributes) {
                String token = tokenFromQuery(request.getURI().getRawQuery());
                if (token == null || token.isBlank()) {
                    response.setStatusCode(HttpStatus.UNAUTHORIZED);
                    return false;
                }
                try {
                    jwtProvider.validateAndGetSubject(token);
                    return true;
                } catch (Exception e) {
                    response.setStatusCode(HttpStatus.UNAUTHORIZED);
                    return false;
                }
            }

            @Override
            public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                       WebSocketHandler wsHandler, Exception exception) {
                // no-op
            }
        };
    }

    private String tokenFromQuery(String rawQuery) {
        if (rawQuery == null || rawQuery.isBlank()) {
            return null;
        }
        for (String part : rawQuery.split("&")) {
            String[] pair = part.split("=", 2);
            if (pair.length == 2 && "token".equals(URLDecoder.decode(pair[0], StandardCharsets.UTF_8))) {
                return URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }
}
