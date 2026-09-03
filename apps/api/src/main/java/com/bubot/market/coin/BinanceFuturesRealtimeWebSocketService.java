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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Service
public class BinanceFuturesRealtimeWebSocketService implements WebSocket.Listener {

    private static final URI BINANCE_FUTURES_WS = URI.create("wss://fstream.binance.com/market/ws");
    private static final URI BINANCE_FUTURES_TICKERS = URI.create("https://fapi.binance.com/fapi/v1/ticker/24hr");
    private static final long STALE_CONNECTION_TIMEOUT_MILLIS = 30_000;

    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .build();
    private final StringBuilder messageBuffer = new StringBuilder();
    private final AtomicBoolean firstTickerLogged = new AtomicBoolean(false);
    private final AtomicInteger msgCount = new AtomicInteger(0);
    private final Map<String, Map<String, Object>> latestTickers = new ConcurrentHashMap<>();

    private volatile WebSocket webSocket;
    private volatile boolean reconnecting;
    private volatile long lastTickerReceivedAt;

    @Value("${app.coin.websocket.enabled:true}")
    private boolean enabled;

    public BinanceFuturesRealtimeWebSocketService(SimpMessagingTemplate messagingTemplate, ObjectMapper objectMapper) {
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    public Map<String, Map<String, Object>> getLatestTickers() {
        return latestTickers;
    }

    @PostConstruct
    public void start() {
        if (!enabled) return;
        connect();
    }

    private synchronized void connect() {
        try {
            webSocket = httpClient.newWebSocketBuilder()
                    .buildAsync(BINANCE_FUTURES_WS, this)
                    .join();
        } catch (Exception e) {
            log.warn("Binance Futures WS 연결 실패: {}", e.getMessage());
            scheduleReconnect();
        }
    }

    @Override
    public void onOpen(WebSocket webSocket) {
        webSocket.request(1);
        reconnecting = false;
        lastTickerReceivedAt = System.currentTimeMillis();
        subscribeDailyKlines(webSocket);
        log.info("Binance Futures UTC 일봉 WebSocket 연결 완료");
    }

    private void subscribeDailyKlines(WebSocket webSocket) {
        try {
            HttpRequest request = HttpRequest.newBuilder(BINANCE_FUTURES_TICKERS).GET().build();
            String body = httpClient.send(request, HttpResponse.BodyHandlers.ofString()).body();
            JsonNode tickers = objectMapper.readTree(body);
            List<String> params = new ArrayList<>();
            for (JsonNode ticker : tickers) {
                String symbol = ticker.path("symbol").asText();
                if (symbol.endsWith("USDT") || symbol.endsWith("USDC")) {
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
                webSocket.sendText(message, true).join();
            }
        } catch (Exception e) {
            log.warn("Binance Futures 일봉 구독 실패: {}", e.getMessage());
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

        int cnt = msgCount.incrementAndGet();
        if (cnt <= 3) {
            log.info("Binance Futures 메시지 #{} ({}자): {}", cnt, message.length(),
                    message.length() > 200 ? message.substring(0, 200) : message);
        }

        handleMessage(message);
        webSocket.request(1);
        return null;
    }

    @Override
    public CompletionStage<?> onBinary(WebSocket webSocket, ByteBuffer data, boolean last) {
        log.info("Binance Futures 바이너리 메시지 수신 ({}bytes)", data.remaining());
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
            messagingTemplate.convertAndSend("/topic/binance-futures/" + symbol, payload);
            if (firstTickerLogged.compareAndSet(false, true)) {
                log.info("Binance Futures UTC 일봉 ticker 수신 시작: {} = {}", symbol, price);
            }
        } catch (Exception e) {
            log.warn("Binance Futures 메시지 파싱 실패: {}", e.getMessage());
        }
    }

    @Scheduled(fixedDelay = 10_000)
    public void reconnectIfNeeded() {
        WebSocket socket = webSocket;
        if (!enabled || reconnecting) {
            return;
        }
        if (socket == null || socket.isInputClosed() || socket.isOutputClosed()) {
            scheduleReconnect();
            return;
        }

        long idleMillis = System.currentTimeMillis() - lastTickerReceivedAt;
        if (idleMillis >= STALE_CONNECTION_TIMEOUT_MILLIS) {
            log.warn("Binance Futures WS ticker {}ms 무수신 - 연결 재시작", idleMillis);
            socket.abort();
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (reconnecting) return;
        reconnecting = true;
        Thread.ofVirtual().start(() -> {
            try {
                Thread.sleep(3_000);
                connect();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
    }

    @Override
    public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
        log.warn("Binance Futures WS 종료: status={}, reason={}", statusCode, reason);
        scheduleReconnect();
        return WebSocket.Listener.super.onClose(webSocket, statusCode, reason);
    }

    @Override
    public void onError(WebSocket webSocket, Throwable error) {
        log.warn("Binance Futures WS 오류: {}", error.getMessage());
        scheduleReconnect();
    }

    @PreDestroy
    public void stop() {
        WebSocket socket = webSocket;
        if (socket != null) socket.sendClose(WebSocket.NORMAL_CLOSURE, "shutdown");
    }
}
