package com.bubot.market.coin;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BinanceRestGuardTest {

    private static WebClientResponseException status(int code, String retryAfter) {
        HttpHeaders h = new HttpHeaders();
        if (retryAfter != null) h.set("Retry-After", retryAfter);
        return WebClientResponseException.create(code, HttpStatus.valueOf(code).getReasonPhrase(), h, new byte[0], StandardCharsets.UTF_8);
    }

    @Test
    void ttl_안에서는_상류를_한_번만_부른다() throws Exception {
        BinanceRestGuard g = new BinanceRestGuard();
        AtomicInteger calls = new AtomicInteger();
        for (int i = 0; i < 5; i++) {
            Object v = g.get("futures|BTCUSDT|20", 400, () -> { calls.incrementAndGet(); return Map.of("n", 1); }, Map.of());
            assertEquals(Map.of("n", 1), v);
        }
        assertEquals(1, calls.get(), "0.5초 폴링 클라이언트가 여럿이어도 상류는 1회");
    }

    @Test
    void 사백이십구를_받으면_차단하고_캐시값을_돌려준다() throws Exception {
        BinanceRestGuard g = new BinanceRestGuard();
        AtomicInteger calls = new AtomicInteger();
        g.get("k", 0, () -> { calls.incrementAndGet(); return Map.of("v", "old"); }, Map.of());
        Object v = g.get("k", 0, () -> { calls.incrementAndGet(); throw status(429, "7"); }, Map.of());
        assertEquals(Map.of("v", "old"), v, "차단 중에는 마지막 캐시를 그대로");
        assertTrue(g.isBlocked());
        assertTrue(g.blockedUntil() - System.currentTimeMillis() > 5_000, "Retry-After 7초 반영");
        Object v2 = g.get("k", 0, () -> { calls.incrementAndGet(); return Map.of("v", "new"); }, Map.of());
        assertEquals(Map.of("v", "old"), v2);
        assertEquals(2, calls.get(), "차단 중에는 상류 호출 없음");
    }

    @Test
    void 사백십팔은_기본_삼백초_차단이고_캐시가_없으면_빈값() throws Exception {
        BinanceRestGuard g = new BinanceRestGuard();
        Object v = g.get("k", 0, () -> { throw status(418, null); }, Map.of());
        assertEquals(Map.of(), v);
        assertTrue(g.blockedUntil() - System.currentTimeMillis() > 290_000);
    }

    @Test
    void 다른_오류는_그대로_던지고_차단하지_않으며_staleOr로_마지막_값을_준다() throws Exception {
        BinanceRestGuard g = new BinanceRestGuard();
        g.get("k", 0, () -> Map.of("v", "old"), Map.of());
        assertThrows(IllegalStateException.class, () -> g.get("k", 0, () -> { throw new IllegalStateException("boom"); }, Map.of()));
        assertFalse(g.isBlocked());
        assertFalse(g.noteRateLimit(status(500, null)));
        assertEquals(Map.of("v", "old"), g.staleOr("k", Map.of()), "관심종목처럼 빈 목록 대신 마지막 값이 필요할 때");
        assertEquals(Map.of(), g.staleOr("none", Map.of()));
    }

    @Test
    void 긴_차단이_짧은_차단에_덮이지_않는다() {
        BinanceRestGuard g = new BinanceRestGuard();
        g.noteRateLimit(418, "4000");
        long longUntil = g.blockedUntil();
        g.noteRateLimit(429, "5");
        assertEquals(longUntil, g.blockedUntil(), "accumulateAndGet(max)라 더 긴 차단이 남는다");
    }

    @Test
    void 동시_요청은_상류_한_번의_결과를_공유한다() throws Exception {
        BinanceRestGuard g = new BinanceRestGuard();
        AtomicInteger calls = new AtomicInteger();
        CountDownLatch release = new CountDownLatch(1);
        List<Object> results = new ArrayList<>();
        List<Thread> ts = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            Thread t = new Thread(() -> {
                try {
                    Object v = g.get("k", 0, () -> {
                        calls.incrementAndGet();
                        try { release.await(); } catch (InterruptedException ignored) { /* test */ }
                        return Map.of("v", 1);
                    }, Map.of());
                    synchronized (results) { results.add(v); }
                } catch (Exception e) { throw new RuntimeException(e); }
            });
            ts.add(t); t.start();
        }
        Thread.sleep(200);
        release.countDown();
        for (Thread t : ts) t.join(5_000);
        assertEquals(8, results.size());
        assertEquals(1, calls.get(), "8개 동시 요청 → 상류 1회");
        assertTrue(results.stream().allMatch(v -> v.equals(Map.of("v", 1))));
    }

    @Test
    void 캐시는_상한을_넘으면_오래된_항목을_지운다() throws Exception {
        BinanceRestGuard g = new BinanceRestGuard();
        for (int i = 0; i < BinanceRestGuard.MAX_ENTRIES + 50; i++) {
            final int n = i;
            g.get("k" + n, 0, () -> Map.of("n", n), Map.of());
        }
        assertTrue(g.cacheSize() <= BinanceRestGuard.MAX_ENTRIES, "endTime 페이징 키가 무한히 쌓이지 않는다: " + g.cacheSize());
    }

    @Test
    void 상류가_null이면_기존_캐시를_지우지_않는다() throws Exception {
        BinanceRestGuard g = new BinanceRestGuard();
        g.get("k", 0, () -> Map.of("v", "old"), Map.of());
        Object v = g.get("k", 0, () -> null, Map.of());
        assertEquals(Map.of("v", "old"), v, "빈 응답 한 번에 관심종목 목록이 사라지지 않는다");
        assertEquals(Map.of("v", "old"), g.staleOr("k", Map.of()));
    }

    @Test
    void stale_최대_나이를_넘긴_캐시는_차단_중에도_빈값() throws Exception {
        BinanceRestGuard g = new BinanceRestGuard();
        g.get("k", 0, () -> Map.of("v", "old"), Map.of());
        Thread.sleep(30);
        g.noteRateLimit(429, "60");
        assertEquals(Map.of(), g.get("k", 0, 10, () -> Map.of("v", "new"), Map.of()), "10ms보다 오래된 호가는 주지 않는다");
        assertEquals(Map.of("v", "old"), g.get("k", 0, 60_000, () -> Map.of("v", "new"), Map.of()), "허용 나이 안이면 마지막 값");
        assertEquals(Map.of(), g.staleOr("k", 10, Map.of()));
        assertEquals(Map.of("v", "old"), g.staleOr("k", 60_000, Map.of()));
    }

    @Test
    void 소유자가_된_뒤_차단이_시작됐으면_상류를_부르지_않는다() throws Exception {
        // 첫 검사(차단 없음) 통과 → in-flight 소유자 획득 → [그 사이 다른 요청이 429를 기록] → 재확인에서 차단을 보고 상류 생략.
        // beforeOwnerRecheck 테스트 seam으로 "첫 검사와 재확인 사이"를 정확히 고정한다(3차 리뷰 P2: 이전 테스트는 이 순서를 만들지 못했다).
        AtomicInteger calls = new AtomicInteger();
        BinanceRestGuard g = new BinanceRestGuard() {
            @Override void beforeOwnerRecheck() { noteRateLimit(429, "60"); }
        };
        Object v = g.get("a", 0, () -> { calls.incrementAndGet(); return Map.of("v", 1); }, Map.of());
        assertEquals(Map.of(), v, "재확인에서 차단을 봤으므로 빈 값");
        assertEquals(0, calls.get(), "소유자가 됐어도 재확인 뒤에는 상류를 부르지 않는다");
        assertTrue(g.isBlocked());
    }

    @Test
    void stale_나이는_상류_응답_시점_기준으로_판정한다() throws Exception {
        // 요청 시작 때 10ms 된 캐시가 상류 대기 60ms 뒤 429를 받으면 70ms 된 값 — 30ms 제한을 넘겼으니 빈 값(3차 리뷰 P1)
        BinanceRestGuard g = new BinanceRestGuard();
        g.get("k", 0, () -> Map.of("v", "old"), Map.of());
        Thread.sleep(10);
        Object v = g.get("k", 0, 30, () -> {
            try { Thread.sleep(60); } catch (InterruptedException ignored) { /* test */ }
            throw status(429, "60");
        }, Map.of());
        assertEquals(Map.of(), v, "대기 전 시각으로 판정하면 old가 나온다");
        // null 응답도 같은 규칙
        BinanceRestGuard g2 = new BinanceRestGuard();
        g2.get("k", 0, () -> Map.of("v", "old"), Map.of());
        Object v2 = g2.get("k", 0, 30, () -> { try { Thread.sleep(60); } catch (InterruptedException ignored) { /* test */ } return null; }, Map.of());
        assertEquals(Map.of(), v2);
    }
}
