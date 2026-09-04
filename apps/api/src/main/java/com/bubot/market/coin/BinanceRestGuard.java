package com.bubot.market.coin;

import lombok.extern.slf4j.Slf4j;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Binance REST 프록시 보호막 — 짧은 캐시(코얼레싱) + 429/418 차단 시각 존중.
 *
 * 문제(2026-09-05): 브라우저가 0.5초마다 호가를 요청하고 서버는 요청마다 Binance를 다시 불러
 * 탭 몇 개만 열려도 분당 150~250회가 나갔다. Binance는 429 뒤 418(IP 차단)로 응답했고,
 * 그동안 모든 Binance 종목의 호가·캔들이 실패하거나 느려졌다.
 *
 * 규칙:
 *  - 같은 key 요청은 ttlMs 안에서는 캐시를 돌려준다(클라이언트 N개 → 상류 요청 1개).
 *  - 같은 key의 동시 요청은 한 번만 상류로 나간다(키별 lock).
 *  - 429/418을 받으면 Retry-After(초)만큼(없으면 429=30초, 418=300초) 상류 요청을 멈추고,
 *    캐시가 있으면 오래된 값이라도 돌려준다. 없으면 emptyValue.
 */
@Slf4j
final class BinanceRestGuard {

    static final long DEFAULT_429_BLOCK_MS = 30_000;
    static final long DEFAULT_418_BLOCK_MS = 300_000;

    private record Entry(Object data, long at) {}

    private final Map<String, Entry> cache = new ConcurrentHashMap<>();
    private final Map<String, Object> locks = new ConcurrentHashMap<>();
    private volatile long blockedUntil;
    private volatile long lastBlockLogAt;

    /** 캐시·차단을 거쳐 상류를 호출한다. upstream이 던지는 예외는 429/418만 여기서 처리하고 나머지는 그대로 던진다. */
    Object get(String key, long ttlMs, Supplier<Object> upstream, Object emptyValue) throws Exception {
        long now = System.currentTimeMillis();
        Entry hit = cache.get(key);
        if (hit != null && now - hit.at < ttlMs) return hit.data;
        if (now < blockedUntil) return hit != null ? hit.data : emptyValue;

        Object lock = locks.computeIfAbsent(key, k -> new Object());
        synchronized (lock) {
            hit = cache.get(key);
            now = System.currentTimeMillis();
            if (hit != null && now - hit.at < ttlMs) return hit.data;
            if (now < blockedUntil) return hit != null ? hit.data : emptyValue;
            try {
                Object data = upstream.get();
                if (data != null) cache.put(key, new Entry(data, System.currentTimeMillis()));
                return data != null ? data : emptyValue;
            } catch (RuntimeException e) {
                if (noteRateLimit(e)) return hit != null ? hit.data : emptyValue;
                throw e;
            }
        }
    }

    /** 429/418이면 차단 시각을 기록하고 true. 그 외 false. */
    boolean noteRateLimit(Throwable e) {
        Throwable t = e;
        while (t != null && !(t instanceof WebClientResponseException)) t = t.getCause();
        if (!(t instanceof WebClientResponseException wex)) return false;
        int status = wex.getStatusCode().value();
        if (status != 429 && status != 418) return false;
        long blockMs = status == 418 ? DEFAULT_418_BLOCK_MS : DEFAULT_429_BLOCK_MS;
        String retryAfter = wex.getHeaders().getFirst("Retry-After");
        if (retryAfter != null) {
            try { blockMs = Math.max(1_000, Long.parseLong(retryAfter.trim()) * 1_000); } catch (NumberFormatException ignore) { /* 기본값 */ }
        }
        long now = System.currentTimeMillis();
        blockedUntil = Math.max(blockedUntil, now + blockMs);
        if (now - lastBlockLogAt > 10_000) {
            lastBlockLogAt = now;
            log.warn("Binance REST {} — {}초 동안 상류 요청 중지(캐시 값으로 응답)", status, blockMs / 1_000);
        }
        return true;
    }

    boolean isBlocked() {
        return System.currentTimeMillis() < blockedUntil;
    }

    long blockedUntil() {
        return blockedUntil;
    }
}
