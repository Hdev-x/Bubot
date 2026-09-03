package com.bubot.bot;

import org.springframework.context.annotation.Profile;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Profile("trading") // trading 프로필에서만 등록. Beta(프로필 없음)에서는 제외 (wp-02 d03)
@Configuration
@EnableWebSocket
public class BotWebSocketProxyConfig implements WebSocketConfigurer {

    private final BotWebSocketProxyHandler botWebSocketProxyHandler;

    public BotWebSocketProxyConfig(BotWebSocketProxyHandler botWebSocketProxyHandler) {
        this.botWebSocketProxyHandler = botWebSocketProxyHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(botWebSocketProxyHandler, "/api/bot-ws/**")
                .setAllowedOriginPatterns("*");
    }
}
