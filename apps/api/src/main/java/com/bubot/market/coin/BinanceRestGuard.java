package com.bubot.market.coin;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * Binance REST 보호막 — 서버 IP 하나가 Binance에 보내는 요청을 묶고, 429/418 차단 시각을 존중한다.
 * Spring singleton으로 두어 티커·호가·캔들·WS 부트스트랩이 같은 차단 상태를 본다(리뷰 P1 #6).
 *
 * 문제(2026-09-05): 브라우저가 0.5초마다 호가를 요청하고 서버는 요청마다 Binance를 다시 불러
 * 탭 몇 개만 열려도 분당 150~250회가 나갔다. Binance는 429 뒤 418(IP 차단)로 응답했고, 차단 중에도
 * 요청이 계속 가면 차단이 연장된다. 티커가 빈 목록으로 돌아오면 관심종목 목록도 함께 사라졌다.
 *
 * 규칙:
 *  - 같은 key 요청은 ttlMs 안에서는 캐시를 돌려준다(클라이언트 N개 → 상류 요청 1개).
 *  - 같은 key의 동시 요청은 한 번만 상류로 나가고 결과·예외를 공유한다(in-flight future, 리뷰 P1 #9).
 *  - 429/418을 받으면 Retry-After(초)만큼(없으면 429=30초, 418=300초) 상류 요청을 멈추고,
 *    캐시가 있으면 오래된 값이라도 돌려준다. 없으면 emptyValue. 차단 시각 갱신은 원자적(리뷰 P1 #8).
 *  - 캐시는 MAX_ENTRIES를 넘으면 오래된 항목부터 지운다(리뷰 P1 #7).
 */
@Slf4j
@Component
public class BinanceRestGuard {

    static final long DEFAULT_429_BLOCK_MS = 30_000;
    static final long DEFAULT_418_BLOCK_MS = 300_000;
    static final int MAX_ENTRIES = 512;
    static final long ENTRY_MAX_AGE_MS = 10 * 60_000;
    static final long INFLIGHT_WAIT_SECONDS = 20;

    private record Entry(Object data, long at, long seq) {}

    private final AtomicLong seq = new AtomicLong(0);
    private final Map<String, Entry> cache = new ConcurrentHashMap<>();
    private final Map<String, CompletableFuture<Object>> inflight = new ConcurrentHashMap<>();
    private final AtomicLong blockedUntil = new AtomicLong(0);
    private volatile long lastBlockLogAt;

    /** 캐시·차단·단일 비행을 거쳐 상류를 호출한다. 429/418은 여기서 처리하고 나머지 예외는 그대로 던진다. */
    public Object get(String key, long ttlMs, Supplier<Object> upstream, Object emptyValue) throws Exception {
        long now = System.currentTimeMillis();
        Entry hit = cache.get(key);
        if (hit != null && now - hit.at < ttlMs) return hit.data;
        if (now < blockedUntil.get()) return hit != null ? hit.data : emptyValue;

        CompletableFuture<Object> mine = new CompletableFuture<>();
        CompletableFuture<Object> existing = inflight.putIfAbsent(key, mine);
        if (existing != null) {
            // 같은 key가 상류로 나가는 중 — 그 결과(또는 예외)를 공유한다.
            try {
                return existing.get(INFLIGHT_WAIT_SECONDS, TimeUnit.SECONDS);
            } catch (ExecutionException e) {
                Throwable c = e.getCause();
                throw c instanceof Exception ex ? ex : e;
            } catch (TimeoutException e) {
                return hit != null ? hit.data : emptyValue;
            }
        }
        try {
            Object data = upstream.get();
            if (data != null) put(key, data);
            Object out = data != null ? data : emptyValue;
            mine.complete(out);
            return out;
        } catch (RuntimeException e) {
            if (noteRateLimit(e)) {
                Object out = hit != null ? hit.data : emptyValue;
                mine.complete(out);
                return out;
            }
            mine.completeExceptionally(e);
            throw e;
        } finally {
            inflight.remove(key, mine);
        }
    }

    /** 상류 실패 시 호출자가 빈 값 대신 쓸 마지막 성공 값. 없으면 emptyValue. */
    public Object staleOr(String key, Object emptyValue) {
        Entry hit = cache.get(key);
        return hit != null ? hit.data : emptyValue;
    }

    private void put(String key, Object data) {
        long now = System.currentTimeMillis();
        cache.put(key, new Entry(data, now, seq.incrementAndGet()));
        if (cache.size() > MAX_ENTRIES) {
            cache.entrySet().removeIf(e -> now - e.getValue().at > ENTRY_MAX_AGE_MS);
            if (cache.size() > MAX_ENTRIES) {
                // 그래도 많으면 삽입 순서(seq)가 오래된 것부터 지워 3/4 크기로 줄인다(같은 ms에 몰려도 확실히 줄어든다).
                int drop = cache.size() - MAX_ENTRIES * 3 / 4;
                List<Map.Entry<String, Entry>> oldest = cache.entrySet().stream()
                        .sorted(Comparator.comparingLong(e -> e.getValue().seq()))
                        .limit(drop).toList();
                for (Map.Entry<String, Entry> e : oldest) cache.remove(e.getKey(), e.getValue());
            }
        }
    }

    /** 429/418이면 차단 시각을 기록하고 true. 그 외 false. */
    public boolean noteRateLimit(Throwable e) {
        Throwable t = e;
        while (t != null && !(t instanceof WebClientResponseException)) t = t.getCause();
        if (!(t instanceof WebClientResponseException wex)) return false;
        return noteRateLimit(wex.getStatusCode().value(), wex.getHeaders().getFirst("Retry-After"));
    }

    /** HttpClient 등 예외 없이 상태코드만 있는 경로용. */
    public boolean noteRateLimit(int status, String retryAfterHeader) {
        if (status != 429 && status != 418) return false;
        long blockMs = status == 418 ? DEFAULT_418_BLOCK_MS : DEFAULT_429_BLOCK_MS;
        if (retryAfterHeader != null) {
            try { blockMs = Math.max(1_000, Long.parseLong(retryAfterHeader.trim()) * 1_000); } catch (NumberFormatException ignore) { /* 기본값 */ }
        }
        long now = System.currentTimeMillis();
        blockedUntil.accumulateAndGet(now + blockMs, Math::max);
        if (now - lastBlockLogAt > 10_000) {
            lastBlockLogAt = now;
            log.warn("Binance REST {} — {}초 동안 상류 요청 중지(캐시 값으로 응답)", status, blockMs / 1_000);
        }
        return true;
    }

    public boolean isBlocked() {
        return System.currentTimeMillis() < blockedUntil.get();
    }

    long blockedUntil() {
        return blockedUntil.get();
    }

    int cacheSize() {
        return cache.size();
    }
}
