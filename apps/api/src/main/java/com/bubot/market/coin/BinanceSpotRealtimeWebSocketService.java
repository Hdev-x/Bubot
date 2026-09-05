package com.bubot.market.coin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.time.Duration;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
public class BinanceSpotRealtimeWebSocketService implements WebSocket.Listener {

    private static final URI BINANCE_SPOT_WS = URI.create("wss://stream.binance.com:9443/ws");
    private static final URI BINANCE_SPOT_EXCHANGE_INFO = URI.create("https://api.binance.com/api/v3/exchangeInfo");
    private static final long STALE_CONNECTION_TIMEOUT_MILLIS = 30_000;

    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final StringBuilder messageBuffer = new StringBuilder();
    private final AtomicBoolean firstTickerLogged = new AtomicBoolean(false);
    private final Map<String, Map<String, Object>> latestTickers = new ConcurrentHashMap<>();

    private volatile WebSocket webSocket;
    private final ReconnectPolicy reconnect = new ReconnectPolicy(3_000, 60_000);
    private volatile long lastTickerReceivedAt;

    @Value("${app.coin.websocket.enabled:true}")
    private boolean enabled;

    private final BinanceRestGuard guard;
    private volatile boolean connecting;
    private volatile boolean shuttingDown; // 종료 뒤 재연결 예약 금지(리뷰 2차 P1)

    public BinanceSpotRealtimeWebSocketService(SimpMessagingTemplate messagingTemplate, ObjectMapper objectMapper, BinanceRestGuard guard) {
        this.guard = guard;
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    public Map<String, Map<String, Object>> getLatestTickers() {
        return latestTickers;
    }

    @PostConstruct
    public void start() {
        if (!enabled) {
            return;
        }
        connect();
    }

    private synchronized void connect() {
        if (shuttingDown) return;
        connecting = true;
        try {
            webSocket = WsConnect.open(httpClient, BINANCE_SPOT_WS, this);
        } catch (Exception e) {
            reconnect.fail();
            log.warn("Binance Spot WS 연결 실패({}회째): {}", reconnect.attempts(), e.getMessage());
            scheduleReconnect();
        } finally {
            connecting = false;
        }
    }

    @Override
    public void onOpen(WebSocket webSocket) {
        webSocket.request(1);
        reconnect.success();
        lastTickerReceivedAt = System.currentTimeMillis();
        subscribeDailyKlines(webSocket);
        log.info("Binance Spot UTC 일봉 WebSocket 연결 완료");
    }

    private void subscribeDailyKlines(WebSocket webSocket) {
        try {
            HttpRequest request = HttpRequest.newBuilder(BINANCE_SPOT_EXCHANGE_INFO).timeout(Duration.ofSeconds(10)).GET().build();
            if (guard.isBlocked()) { log.warn("Binance Spot 구독 목록 REST 생략 — Binance 차단 중"); return; }
            HttpResponse<String> res = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                guard.noteRateLimit(res.statusCode(), res.headers().firstValue("Retry-After").orElse(null));
                log.warn("Binance Spot 구독 목록 REST {} — 구독 생략", res.statusCode());
                return;
            }
            String body = res.body();
            JsonNode symbols = objectMapper.readTree(body).path("symbols");
            List<String> params = new ArrayList<>();
            for (JsonNode item : symbols) {
                String symbol = item.path("symbol").asText();
                String status = item.path("status").asText();
                String quoteAsset = item.path("quoteAsset").asText();
                if ("TRADING".equals(status) && ("USDT".equals(quoteAsset) || "USDC".equals(quoteAsset))) {
                    params.add(symbol.toLowerCase() + "@kline_1d");
                }
            }
            // 전 종목(수백 개)을 한 메시지로 보내면 바이낸스가 1008 "Payload too long"으로 끊는다.
            // 200개씩 나눠 여러 SUBSCRIBE 메시지로 전송한다. (바이낸스 초당 메시지 한도 내)
            final int CHUNK_SIZE = 200;
            int id = 1;
            for (int i = 0; i < params.size(); i += CHUNK_SIZE) {
                List<String> chunk = params.subList(i, Math.min(i + CHUNK_SIZE, params.size()));
                String message = objectMapper.writeValueAsString(
                        Map.of("method", "SUBSCRIBE", "params", chunk, "id", id++));
                // 이전 send 완료를 기다려야 함 (미완료 상태에서 재호출 시 IllegalStateException)
                webSocket.sendText(message, true).orTimeout(5, TimeUnit.SECONDS).join();
            }
        } catch (Exception e) {
            log.warn("Binance Spot 일봉 구독 실패: {}", e.getMessage());
        }
    }

    @Override
    public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
        messageBuffer.append(data);
        if (!last) {
            webSocket.request(1);
            return null;
        }

        String message = messageBuffer.toString();
        messageBuffer.setLength(0);
        handleMessage(message);
        webSocket.request(1);
        return null;
    }

    @Override
    public CompletionStage<?> onPing(WebSocket webSocket, ByteBuffer message) {
        webSocket.sendPong(message);
        webSocket.request(1);
        return null;
    }

    private void handleMessage(String message) {
        try {
            JsonNode root = objectMapper.readTree(message);
            if (!"kline".equals(root.path("e").asText())) {
                return;
            }

            JsonNode kline = root.path("k");
            String symbol = root.path("s").asText();
            String priceStr = kline.path("c").asText();
            if ((!symbol.endsWith("USDT") && !symbol.endsWith("USDC")) || priceStr.isEmpty()) {
                return;
            }

            double price = Double.parseDouble(priceStr);
            double openPrice = kline.path("o").asDouble();
            double change = openPrice > 0 ? price - openPrice : 0;
            Map<String, Object> payload = new HashMap<>();
            payload.put("symbol", symbol);
            payload.put("price", price);
            payload.put("change", change);
            payload.put("changeRate", openPrice > 0 ? change / openPrice : 0);
            payload.put("volume", kline.path("q").asDouble());
            payload.put("ts", root.path("E").asLong());

            lastTickerReceivedAt = System.currentTimeMillis();
            latestTickers.put(symbol, payload);
            messagingTemplate.convertAndSend("/topic/binance-spot/" + symbol, payload);
            if (firstTickerLogged.compareAndSet(false, true)) {
                log.info("Binance Spot UTC 일봉 ticker 수신 시작: {} = {}", symbol, price);
            }
        } catch (Exception e) {
            log.warn("Binance Spot 메시지 파싱 실패: {}", e.getMessage());
        }
    }

    @Scheduled(fixedDelay = 10_000)
    public void reconnectIfNeeded() {
        WebSocket socket = webSocket;
        if (!enabled || shuttingDown || reconnect.isPending() || connecting) {
            return;
        }
        if (socket == null || socket.isInputClosed() || socket.isOutputClosed()) {
            scheduleReconnect();
            return;
        }

        long idleMillis = System.currentTimeMillis() - lastTickerReceivedAt;
        if (idleMillis >= STALE_CONNECTION_TIMEOUT_MILLIS) {
            log.warn("Binance Spot WS ticker {}ms 무수신 - 연결 재시작", idleMillis);
            socket.abort();
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (shuttingDown) return;
        long delay = reconnect.begin();
        if (delay < 0) return;
        log.info("Binance Spot WS 재연결 예약({}회째, {}ms 후)", reconnect.attempts(), delay);
        Thread.ofVirtual().start(() -> {
            try {
                Thread.sleep(delay);
                connect();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
    }

    @Override
    public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
        // 종료 중이거나 이미 교체된 옛 소켓의 종료면 재연결하지 않는다(리스너 소유권, 리뷰 2차 P1)
        if (!shuttingDown && webSocket == this.webSocket) {
            log.warn("Binance Spot WS 종료: status={}, reason={}", statusCode, reason);
            scheduleReconnect();
        }
        return WebSocket.Listener.super.onClose(webSocket, statusCode, reason);
    }

    @Override
    public void onError(WebSocket webSocket, Throwable error) {
        if (shuttingDown || webSocket != this.webSocket) return;
        log.warn("Binance Spot WS 오류: {}", error.getMessage());
        scheduleReconnect();
    }

    @PreDestroy
    public void stop() {
        shuttingDown = true;
        WebSocket socket = webSocket;
        if (socket != null) {
            socket.sendClose(WebSocket.NORMAL_CLOSURE, "shutdown");
        }
    }
}
