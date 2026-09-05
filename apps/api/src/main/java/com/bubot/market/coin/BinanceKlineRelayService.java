package com.bubot.market.coin;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;
import org.springframework.web.socket.messaging.SessionUnsubscribeEvent;

import java.net.URI;
import java.time.Duration;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Binance 차트 캔들(kline) 백엔드 릴레이.
 * 브라우저 직결 kline이 지역차단(한국 등)으로 막혀, 서버가 받아 STOMP로 중계한다.
 * 핵심: 전종목이 아니라 "지금 화면에 띄운 심볼+TF"만 동적 구독한다.
 *   - 프론트가 /topic/binance-kline/{market}/{SYMBOL}/{interval} 을 구독하면(STOMP)
 *     그 순간 Binance에 해당 스트림을 SUBSCRIBE, 구독자가 0이 되면 (유예 후) UNSUBSCRIBE.
 *   - 같은 스트림을 N명이 봐도 Binance엔 1구독(refcount).
 * (현재가/등락은 별도 티커 경로(@kline_1d 방송)라 이 서비스가 죽어도 안 멈춤 — 거래량만 영향.)
 */
@Slf4j
@Service
public class BinanceKlineRelayService {

    private static final URI FUTURES_WS = URI.create("wss://fstream.binance.com/market/ws");
    private static final URI SPOT_WS = URI.create("wss://stream.binance.com:9443/ws");
    private static final String TOPIC_PREFIX = "/topic/binance-kline/";
    private static final long IDLE_UNSUB_MS = 8_000;          // refcount 0 후 유예(빠른 TF 전환 디바운스 + 정리)
    private static final long STALE_TIMEOUT_MS = 60_000;       // 구독 있는데 이 시간 무수신이면 재연결

    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(10)).build();

    @Value("${app.coin.websocket.enabled:true}")
    private boolean enabled;

    private volatile boolean shuttingDown; // 종료 뒤 재연결 예약 금지(리뷰 2차 P1)
    private final Conn futures = new Conn("futures", FUTURES_WS);
    private final Conn spot = new Conn("spot", SPOT_WS);

    // subKey(sessionId|subscriptionId) → market + NUL 구분자 + stream (UNSUBSCRIBE/DISCONNECT 시 어떤 스트림을 줄일지). NUL은 이스케이프로 표기(리뷰 P2)
    private final Map<String, String> subToStream = new ConcurrentHashMap<>();

    public BinanceKlineRelayService(SimpMessagingTemplate messagingTemplate, ObjectMapper objectMapper) {
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void start() {
        if (!enabled) return;
        futures.connect();
        spot.connect();
    }

    @PreDestroy
    public void stop() {
        shuttingDown = true;
        futures.close();
        spot.close();
    }

    private Conn connFor(String market) {
        return "spot".equals(market) ? spot : futures;
    }

    // ── STOMP 구독 생명주기 ──────────────────────────────────
    @EventListener
    public void onSubscribe(SessionSubscribeEvent event) {
        StompHeaderAccessor h = StompHeaderAccessor.wrap(event.getMessage());
        String dest = h.getDestination();
        if (dest == null || !dest.startsWith(TOPIC_PREFIX)) return;
        String[] p = parseDestination(dest);
        if (p == null) return;
        String market = p[0], stream = p[1];
        subToStream.put(h.getSessionId() + "|" + h.getSubscriptionId(), market + "\u0000" + stream);
        connFor(market).incref(stream);
    }

    @EventListener
    public void onUnsubscribe(SessionUnsubscribeEvent event) {
        StompHeaderAccessor h = StompHeaderAccessor.wrap(event.getMessage());
        release(h.getSessionId() + "|" + h.getSubscriptionId());
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        String prefix = event.getSessionId() + "|";
        List<String> keys = new ArrayList<>();
        for (String k : subToStream.keySet()) if (k.startsWith(prefix)) keys.add(k);
        keys.forEach(this::release);
    }

    private void release(String subKey) {
        String ms = subToStream.remove(subKey);
        if (ms == null) return;
        int sep = ms.indexOf('\u0000');
        connFor(ms.substring(0, sep)).decref(ms.substring(sep + 1));
    }

    /** /topic/binance-kline/{market}/{SYMBOL}/{interval} → [market, "symbol@kline_interval"] (없으면 null) */
    private String[] parseDestination(String dest) {
        String tail = dest.substring(TOPIC_PREFIX.length());
        String[] seg = tail.split("/");
        if (seg.length != 3) return null;
        String market = seg[0];
        if (!"futures".equals(market) && !"spot".equals(market)) return null;
        if (seg[1].isEmpty() || seg[2].isEmpty()) return null;
        return new String[]{market, seg[1].toLowerCase() + "@kline_" + seg[2]};
    }

    @Scheduled(fixedDelay = 3_000)
    public void maintain() {
        if (!enabled || shuttingDown) return;
        futures.maintain();
        spot.maintain();
    }

    // ── 거래소별 1연결 + 동적 구독 ───────────────────────────
    private class Conn implements WebSocket.Listener {
        private final String market;
        private final URI uri;
        private final StringBuilder buf = new StringBuilder();
        private final Map<String, Integer> refCounts = new ConcurrentHashMap<>(); // stream → 구독자 수(유예 중 0 허용)
        private final java.util.Set<String> subscribed = ConcurrentHashMap.newKeySet(); // Binance에 실제 SUBSCRIBE된 스트림
        private final Map<String, Long> zeroSince = new ConcurrentHashMap<>(); // refcount 0이 된 시각
        private final AtomicInteger idGen = new AtomicInteger(1);
        private volatile WebSocket ws;
        private final ReconnectPolicy reconnect = new ReconnectPolicy(3_000, 60_000);
        private volatile long lastMsgAt;
        private volatile boolean connecting;
        private final Object refLock = new Object(); // refCounts·zeroSince·subscribed 전이를 함께 보호(3차 리뷰 P1: decref의 get/put이 incref와 겹치면 활성 구독을 0으로 덮었다)
        // 전송 큐: SUBSCRIBE/UNSUBSCRIBE를 상태 전이와 같은 순서로 한 스레드가 보낸다(5차 리뷰 P1: lock 밖 전송은 유예 만료 UNSUBSCRIBE가 새 SUBSCRIBE 뒤에 도착할 수 있었다).
        // enqueue는 refLock 안에서 하므로 큐 순서 = 상태 변경 순서. 실제 전송(최대 5초 대기)은 큐 스레드에서.
        private final ExecutorService sender = Executors.newSingleThreadExecutor(Thread.ofVirtual().name("kline-sender-", 0).factory());

        Conn(String market, URI uri) { this.market = market; this.uri = uri; }

        synchronized void connect() {
            if (shuttingDown) return;
            connecting = true;
            try {
                WebSocket opened = WsConnect.open(httpClient, uri, this);
                if (shuttingDown) { opened.abort(); return; } // 연결 중 stop()이 왔으면 살려두지 않는다(3차 리뷰 P1)
                ws = opened;
            } catch (Exception e) {
                reconnect.fail();
                log.warn("Binance kline relay({}) 연결 실패({}회째): {}", market, reconnect.attempts(), e.getMessage());
                scheduleReconnect();
            } finally {
                connecting = false;
            }
        }

        void incref(String stream) {
            boolean needSub;
            synchronized (refLock) {
                refCounts.merge(stream, 1, Integer::sum);
                zeroSince.remove(stream);
                needSub = subscribed.add(stream); // 처음 보는 스트림만 실제 SUBSCRIBE
                if (needSub) enqueue("SUBSCRIBE", stream); // 큐 순서 = 상태 순서
            }
        }

        void decref(String stream) {
            synchronized (refLock) {
                Integer v = refCounts.get(stream);
                if (v == null) return;
                if (v <= 1) { refCounts.put(stream, 0); zeroSince.put(stream, System.currentTimeMillis()); }
                else refCounts.put(stream, v - 1);
            }
        }

        void maintain() {
            // 1) 유예 지난 0-구독 스트림 UNSUBSCRIBE
            long now = System.currentTimeMillis();
            synchronized (refLock) {
                for (Map.Entry<String, Long> e : new HashMap<>(zeroSince).entrySet()) {
                    if (now - e.getValue() < IDLE_UNSUB_MS) continue;
                    String stream = e.getKey();
                    zeroSince.remove(stream);
                    if (refCounts.getOrDefault(stream, 0) == 0) {
                        refCounts.remove(stream);
                        if (subscribed.remove(stream)) enqueue("UNSUBSCRIBE", stream);
                    }
                }
            }
            // 2) 재연결 필요 판단
            WebSocket s = ws;
            if (reconnect.isPending() || connecting) return;
            if (s == null || s.isInputClosed() || s.isOutputClosed()) { scheduleReconnect(); return; }
            if (!subscribed.isEmpty() && now - lastMsgAt >= STALE_TIMEOUT_MS) {
                log.warn("Binance kline relay({}) {}ms 무수신 - 재시작", market, now - lastMsgAt);
                s.abort();
                scheduleReconnect();
            }
        }

        /** 큐에 넣는다. 실행 시점의 현재 소켓으로 보낸다(소켓이 없으면 버림 — onOpen 재구독이 subscribed 전체를 다시 보낸다). */
        private void enqueue(String method, String stream) {
            sender.execute(() -> sendMethod(ws, method, stream));
        }

        private void sendMethod(WebSocket s, String method, String stream) {
            if (s == null) return;
            try {
                String msg = objectMapper.writeValueAsString(
                        Map.of("method", method, "params", List.of(stream), "id", idGen.getAndIncrement()));
                s.sendText(msg, true).orTimeout(5, TimeUnit.SECONDS).join(); // 스케줄러 스레드가 무한 대기하지 않게
            } catch (Exception e) {
                log.warn("Binance kline relay({}) {} 실패 {}: {}", market, method, stream, e.getMessage());
            }
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
            reconnect.success();
            lastMsgAt = System.currentTimeMillis();
            // 재연결 시 활성 구독 복원 — refLock 안에서 새 소켓을 설치하고 구독 snapshot을 큐에 넣어, 그 뒤 들어오는 incref가 옛 소켓/null로 가지 않게 한다(5차 리뷰 P1 연결 인계)
            synchronized (refLock) {
                ws = webSocket;
                for (String stream : subscribed) enqueue("SUBSCRIBE", stream);
            }
            log.info("Binance kline relay({}) 연결 완료 (활성 {}스트림)", market, subscribed.size());
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            buf.append(data);
            if (!last) { webSocket.request(1); return null; }
            String message = buf.toString();
            buf.setLength(0);
            handle(message);
            webSocket.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onPing(WebSocket webSocket, ByteBuffer message) {
            webSocket.sendPong(message);
            webSocket.request(1);
            return null;
        }

        private void handle(String message) {
            try {
                JsonNode root = objectMapper.readTree(message);
                if (!"kline".equals(root.path("e").asText())) return; // 구독 ack 등 무시
                lastMsgAt = System.currentTimeMillis();
                JsonNode k = root.path("k");
                String symbol = root.path("s").asText();
                String interval = k.path("i").asText();
                if (symbol.isEmpty() || interval.isEmpty()) return;
                Map<String, Object> payload = new HashMap<>();
                payload.put("time", k.path("t").asLong() / 1000);
                payload.put("open", k.path("o").asDouble());
                payload.put("high", k.path("h").asDouble());
                payload.put("low", k.path("l").asDouble());
                payload.put("close", k.path("c").asDouble());
                payload.put("volume", k.path("v").asDouble());
                messagingTemplate.convertAndSend(TOPIC_PREFIX + market + "/" + symbol + "/" + interval, payload);
            } catch (Exception e) {
                log.warn("Binance kline relay({}) 파싱 실패: {}", market, e.getMessage());
            }
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            if (!shuttingDown && webSocket == ws) { // 교체된 옛 소켓의 종료는 무시(리스너 소유권)
                log.warn("Binance kline relay({}) 종료: {} {}", market, statusCode, reason);
                scheduleReconnect();
            }
            return WebSocket.Listener.super.onClose(webSocket, statusCode, reason);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            if (shuttingDown || webSocket != ws) return;
            log.warn("Binance kline relay({}) 오류: {}", market, error.getMessage());
            scheduleReconnect();
        }

        private void scheduleReconnect() {
            if (shuttingDown) return;
            long delay = reconnect.begin();
            if (delay < 0) return;
            log.info("Binance kline relay({}) 재연결 예약({}회째, {}ms 후)", market, reconnect.attempts(), delay);
            Thread.ofVirtual().start(() -> {
                try { Thread.sleep(delay); connect(); }
                catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            });
        }

        synchronized void close() { // connect()와 같은 lock
            sender.shutdown();
            WebSocket s = ws;
            if (s != null) s.sendClose(WebSocket.NORMAL_CLOSURE, "shutdown");
        }
    }
}
