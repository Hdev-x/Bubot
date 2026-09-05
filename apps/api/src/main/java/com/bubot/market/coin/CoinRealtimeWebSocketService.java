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
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
public class CoinRealtimeWebSocketService {

    private static final URI BITGET_PUBLIC_WS = URI.create("wss://ws.bitget.com/v2/ws/public");
    private static final URI BITGET_SPOT_TICKERS = URI.create("https://api.bitget.com/api/v2/spot/market/tickers");
    private static final URI BITGET_USDT_FUTURES_TICKERS =
            URI.create("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES");
    private static final URI BITGET_USDC_FUTURES_TICKERS =
            URI.create("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDC-FUTURES");
    private static final int CHANNELS_PER_CONNECTION = 40;

    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private static final long STALE_TIMEOUT_MS = 60_000; // 구독 중인데 이 시간 무수신이면 재연결
    private final Map<String, Map<String, Object>> latestTickers = new ConcurrentHashMap<>();
    // [코얼레싱] 송출 대기 중인 변경분: key=STOMP topic, value=해당 topic의 최신 payload.
    // WebSocket 읽기 스레드에서 직접 송출하지 않고 여기 모았다가 flush()가 주기적으로 일괄 송출한다.
    private final Map<String, Map<String, Object>> pendingBroadcasts = new ConcurrentHashMap<>();
    private final List<BitgetConnection> connections = new CopyOnWriteArrayList<>();
    private final AtomicBoolean firstTickerLogged = new AtomicBoolean(false);

    private volatile Set<String> subscribedChannels = Set.of();
    private volatile boolean shuttingDown;

    @Value("${app.coin.websocket.enabled:true}")
    private boolean enabled;

    public CoinRealtimeWebSocketService(SimpMessagingTemplate messagingTemplate, ObjectMapper objectMapper) {
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void start() {
        if (!enabled) {
            log.info("코인 실시간 WebSocket 비활성화");
            return;
        }
        Thread.ofVirtual().name("bitget-ticker-init").start(this::refreshSubscriptions);
    }

    public Map<String, Object> getLatestTicker(String symbol) {
        return latestTickers.getOrDefault(symbol, Map.of());
    }

    @Scheduled(initialDelay = 300_000, fixedDelay = 300_000)
    public void refreshSubscriptions() {
        if (!enabled || shuttingDown) {
            return;
        }
        try {
            rebuildConnectionsIfChanged(loadSubscriptionArguments());
        } catch (Exception e) {
            log.warn("Bitget 전체 ticker 구독 목록 조회 실패: {}", e.getMessage());
        }
    }

    private List<Map<String, String>> loadSubscriptionArguments() throws Exception {
        Map<String, Map<String, String>> uniqueArgs = new LinkedHashMap<>();
        addSpotArguments(uniqueArgs, fetchTickerRows(BITGET_SPOT_TICKERS));
        addFuturesArguments(uniqueArgs, fetchTickerRows(BITGET_USDT_FUTURES_TICKERS), "USDT-FUTURES");
        addFuturesArguments(uniqueArgs, fetchTickerRows(BITGET_USDC_FUTURES_TICKERS), "USDC-FUTURES");
        return new ArrayList<>(uniqueArgs.values());
    }

    private JsonNode fetchTickerRows(URI endpoint) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(10)).GET().build();
        String body = httpClient.send(request, HttpResponse.BodyHandlers.ofString()).body();
        return objectMapper.readTree(body).path("data");
    }

    private void addSpotArguments(Map<String, Map<String, String>> args, JsonNode rows) {
        for (JsonNode row : rows) {
            String symbol = row.path("symbol").asText();
            if (symbol.endsWith("USDT") || symbol.endsWith("USDC")) {
                addArgument(args, "SPOT", symbol);
            }
        }
    }

    private void addFuturesArguments(Map<String, Map<String, String>> args, JsonNode rows, String instType) {
        for (JsonNode row : rows) {
            String symbol = row.path("symbol").asText();
            if (!symbol.isEmpty()) {
                addArgument(args, instType, symbol);
            }
        }
    }

    private void addArgument(Map<String, Map<String, String>> args, String instType, String symbol) {
        String key = instType + ":" + symbol;
        args.put(key, Map.of("instType", instType, "channel", "ticker", "instId", symbol));
    }

    private synchronized void rebuildConnectionsIfChanged(List<Map<String, String>> args) {
        Set<String> nextChannels = new LinkedHashSet<>();
        for (Map<String, String> arg : args) {
            nextChannels.add(arg.get("instType") + ":" + arg.get("instId"));
        }
        if (nextChannels.isEmpty() || (nextChannels.equals(subscribedChannels) && !connections.isEmpty())) {
            return;
        }

        for (BitgetConnection connection : connections) {
            connection.stop();
        }
        connections.clear();
        subscribedChannels = Set.copyOf(nextChannels);

        for (int start = 0; start < args.size(); start += CHANNELS_PER_CONNECTION) {
            int end = Math.min(start + CHANNELS_PER_CONNECTION, args.size());
            BitgetConnection connection = new BitgetConnection(List.copyOf(args.subList(start, end)));
            connections.add(connection);
            connection.connectAsync();
        }
        log.info("Bitget 전체 실시간 구독 구성: 종목채널 {}개, WebSocket {}개",
                args.size(), connections.size());
    }

    /**
     * [코얼레싱 송출] 250ms마다 버퍼에 쌓인 변경분을 종목별 최신값 1건씩만 일괄 송출한다.
     * 수천 건/초의 ticker를 종목당 최대 4회/초로 줄여 STOMP 부하와 WS 백프레셔를 완화한다.
     * (latestTickers는 항상 최신이라 REST 조회에는 영향 없음)
     */
    @Scheduled(fixedDelay = 250)
    public void flushBroadcasts() {
        if (!enabled || shuttingDown || pendingBroadcasts.isEmpty()) {
            return;
        }
        for (String topic : new ArrayList<>(pendingBroadcasts.keySet())) {
            Map<String, Object> payload = pendingBroadcasts.remove(topic);
            if (payload != null) {
                try {
                    messagingTemplate.convertAndSend(topic, payload);
                } catch (Exception e) {
                    log.debug("ticker 송출 실패 {}: {}", topic, e.getMessage());
                }
            }
        }
    }

    /** 10초마다 연결 상태 점검 — 닫힌 소켓·무수신 연결을 재연결 (2026-09-04 장애 후 추가). */
    @Scheduled(fixedDelay = 10_000)
    public void maintainConnections() {
        if (!enabled || shuttingDown) {
            return;
        }
        for (BitgetConnection connection : connections) {
            connection.maintain();
        }
    }

    @Scheduled(fixedDelay = 25_000)
    public void ping() {
        if (!enabled || shuttingDown) {
            return;
        }
        for (BitgetConnection connection : connections) {
            connection.ping();
        }
    }

    /** @return 유효한 ticker 데이터를 1건 이상 처리했으면 true — 구독 ack·pong·오류 프레임은 '수신'으로 세지 않는다(리뷰 2차 P1). */
    private boolean handleMessage(String message) {
        if ("pong".equalsIgnoreCase(message)) {
            return false;
        }
        try {
            JsonNode root = objectMapper.readTree(message);
            JsonNode dataNode = root.get("data");
            JsonNode argNode = root.get("arg");
            if (dataNode == null || !dataNode.isArray() || argNode == null) {
                return false;
            }

            String symbol = argNode.path("instId").asText();
            String instType = argNode.path("instType").asText();
            boolean isFutures = instType.endsWith("FUTURES");
            boolean handled = false;
            for (JsonNode item : dataNode) {
                double price = item.path("lastPr").asDouble();
                double openUtc = item.path("openUtc").asDouble();
                double change = openUtc > 0 ? price - openUtc : 0;
                Map<String, Object> payload = new HashMap<>();
                payload.put("symbol", symbol);
                payload.put("price", price);
                payload.put("bid", item.path("bidPr").asDouble());
                payload.put("ask", item.path("askPr").asDouble());
                payload.put("change", change);
                payload.put("changeRate", openUtc > 0 ? change / openUtc : item.path("changeUtc24h").asDouble());
                payload.put("volume", item.path("quoteVolume").asDouble());
                payload.put("ts", item.path("ts").asLong(Instant.now().toEpochMilli()));

                latestTickers.put(symbol, payload);
                String topic = isFutures ? "/topic/coin-futures/" + symbol : "/topic/coin/" + symbol;
                // [코얼레싱] 읽기 스레드에서는 송출하지 않고 최신값만 버퍼에 적재 → 백프레셔 방지.
                // 같은 topic의 더 최신 값으로 덮어쓰며, 실제 송출은 flush()가 일괄 처리한다.
                pendingBroadcasts.put(topic, payload);
                handled = true;
                if (firstTickerLogged.compareAndSet(false, true)) {
                    log.info("Bitget 전체 실시간 ticker 수신 시작: {} {} {}", instType, symbol, price);
                }
            }
            return handled;
        } catch (Exception e) {
            log.debug("Bitget WebSocket 메시지 파싱 실패: {}", e.getMessage());
            return false;
        }
    }

    @PreDestroy
    public void stop() {
        shuttingDown = true;
        for (BitgetConnection connection : connections) {
            connection.stop();
        }
        connections.clear();
    }

    private final class BitgetConnection implements WebSocket.Listener {
        private final List<Map<String, String>> subscriptionArgs;
        private final StringBuilder messageBuffer = new StringBuilder();
        private volatile WebSocket socket;
        private final ReconnectPolicy reconnect = new ReconnectPolicy(3_000, 60_000);
        private volatile boolean stopped;
        private volatile long lastMsgAt;
        private volatile boolean connecting;

        private BitgetConnection(List<Map<String, String>> subscriptionArgs) {
            this.subscriptionArgs = subscriptionArgs;
        }

        private void connectAsync() {
            Thread.ofVirtual().start(this::connect);
        }

        private synchronized void connect() {
            if (stopped || shuttingDown) {
                return;
            }
            connecting = true;
            try {
                WebSocket opened = WsConnect.open(httpClient, BITGET_PUBLIC_WS, this);
                if (stopped || shuttingDown) { opened.abort(); return; } // 연결 중 stop()이 왔으면 살려두지 않는다(3차 리뷰 P1)
                socket = opened;
            } catch (Exception e) {
                reconnect.fail();
                log.warn("Bitget WebSocket 연결 실패({}회째): {}", reconnect.attempts(), e.getMessage());
                scheduleReconnect();
            } finally {
                connecting = false;
            }
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
            reconnect.success();
            lastMsgAt = System.currentTimeMillis();
            try {
                String message = objectMapper.writeValueAsString(Map.of("op", "subscribe", "args", subscriptionArgs));
                // 구독 전송 실패를 관찰한다 — 실패하면 소켓을 끊어 maintain()이 재연결하게(리뷰 2차 P1)
                webSocket.sendText(message, true).whenComplete((r, ex) -> {
                    if (ex != null) {
                        log.warn("Bitget ticker 구독 전송 실패 - 재연결: {}", ex.getMessage());
                        webSocket.abort();
                    }
                });
            } catch (Exception e) {
                log.warn("Bitget ticker 구독 실패: {}", e.getMessage());
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
            if (handleMessage(message)) lastMsgAt = System.currentTimeMillis(); // 유효 ticker만 수신으로 셈(pong·ack 제외, 리뷰 P1 #4·2차 P1)
            webSocket.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onPing(WebSocket webSocket, ByteBuffer message) {
            webSocket.sendPong(message);
            webSocket.request(1);
            return null;
        }

        private void ping() {
            WebSocket current = socket;
            if (current != null && !current.isOutputClosed()) {
                current.sendText("ping", true);
            }
        }

        private void maintain() {
            if (stopped || shuttingDown || reconnect.isPending() || connecting) {
                return;
            }
            WebSocket current = socket;
            if (current == null || current.isInputClosed() || current.isOutputClosed()) {
                log.warn("Bitget WebSocket 닫힘 감지 - 재연결");
                scheduleReconnect();
                return;
            }
            long idle = System.currentTimeMillis() - lastMsgAt;
            if (lastMsgAt > 0 && idle >= STALE_TIMEOUT_MS) {
                log.warn("Bitget WebSocket {}ms 무수신 - 재연결", idle);
                current.abort();
                scheduleReconnect();
            }
        }

        private void scheduleReconnect() {
            if (stopped || shuttingDown) {
                return;
            }
            long delay = reconnect.begin();
            if (delay < 0) {
                return;
            }
            log.info("Bitget WebSocket 재연결 예약({}회째, {}ms 후)", reconnect.attempts(), delay);
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
            if (!stopped && !shuttingDown && webSocket == socket) { // 교체된 옛 소켓의 종료는 무시(리스너 소유권)
                log.warn("Bitget WebSocket 종료: status={}, reason={}", statusCode, reason);
                scheduleReconnect();
            }
            return WebSocket.Listener.super.onClose(webSocket, statusCode, reason);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            if (!stopped && !shuttingDown && webSocket == socket) {
                log.warn("Bitget WebSocket 오류: {}", error.getMessage());
                scheduleReconnect();
            }
        }

        private synchronized void stop() { // connect()와 같은 lock
            stopped = true;
            WebSocket current = socket;
            if (current != null && !current.isOutputClosed()) {
                current.sendClose(WebSocket.NORMAL_CLOSURE, "shutdown");
            }
        }
    }
}
