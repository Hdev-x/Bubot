package com.bubot.market.coin;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.nio.charset.StandardCharsets;
import java.util.Map;
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
    void 다른_오류는_그대로_던지고_차단하지_않는다() {
        BinanceRestGuard g = new BinanceRestGuard();
        assertThrows(IllegalStateException.class, () -> g.get("k", 0, () -> { throw new IllegalStateException("boom"); }, Map.of()));
        assertFalse(g.isBlocked());
        assertFalse(g.noteRateLimit(status(500, null)));
    }
}
