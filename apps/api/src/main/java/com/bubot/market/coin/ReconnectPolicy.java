package com.bubot.market.coin;

/**
 * 거래소 WebSocket 재연결 정책 — 중계 서비스 4개(Bitget 티커·Binance 티커 2·Binance kline)가 공유한다.
 *
 * 고치는 문제(2026-09-04 장애): 예전 코드는 "재연결 중" 플래그를 연결 성공(onOpen)에서만 내렸다.
 * 재연결 시도가 실패하면 플래그가 켜진 채 남아 이후 예약·점검이 전부 건너뛰어져 중계가 영원히 멈췄다.
 *
 * 규칙:
 *  - begin(): 재연결을 예약할 수 있으면 대기 시간(ms)을 돌려주고 pending 상태로 들어간다. 이미 pending이면 -1.
 *  - 대기 시간은 시도 횟수에 따라 base × 2^(n-1), max로 상한(백오프). 동시 재시도 폭주로 포트가 고갈되는 것을 막는다.
 *  - fail(): 시도가 실패하면 pending을 풀어 다음 begin()이 가능하게 한다(횟수는 유지).
 *  - success(): 연결되면 pending을 풀고 횟수를 0으로 되돌린다.
 */
public final class ReconnectPolicy {

    private final long baseDelayMs;
    private final long maxDelayMs;
    private boolean pending;
    private int attempts;

    public ReconnectPolicy(long baseDelayMs, long maxDelayMs) {
        if (baseDelayMs <= 0 || maxDelayMs < baseDelayMs) {
            throw new IllegalArgumentException("baseDelayMs > 0, maxDelayMs >= baseDelayMs");
        }
        this.baseDelayMs = baseDelayMs;
        this.maxDelayMs = maxDelayMs;
    }

    /** 재연결 예약 시작. 이미 진행 중이면 -1, 아니면 이번 시도 전 대기 시간(ms). */
    public synchronized long begin() {
        if (pending) return -1;
        pending = true;
        attempts++;
        return delayFor(attempts);
    }

    /** 시도 실패 — pending을 풀어 다음 예약을 허용한다. 횟수는 누적. */
    public synchronized void fail() {
        pending = false;
    }

    /** 연결 성공 — pending 해제 + 횟수 초기화. */
    public synchronized void success() {
        pending = false;
        attempts = 0;
    }

    public synchronized boolean isPending() {
        return pending;
    }

    public synchronized int attempts() {
        return attempts;
    }

    /** n번째 시도 전 대기 시간: base × 2^(n-1), max 상한. */
    long delayFor(int attempt) {
        long delay = baseDelayMs;
        for (int i = 1; i < attempt; i++) {
            delay = Math.min(maxDelayMs, delay * 2);
            if (delay >= maxDelayMs) break;
        }
        return Math.min(maxDelayMs, delay);
    }
}
