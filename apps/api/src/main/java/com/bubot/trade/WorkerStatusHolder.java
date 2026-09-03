package com.bubot.trade;

import org.springframework.stereotype.Component;

/**
 * 통합 워커가 주기적으로 push하는 상태 스냅샷을 메모리에 캐시한다.
 * (영속화 불필요 — 대시보드 표시용 최신값만 유지)
 */
@Component
public class WorkerStatusHolder {

    private volatile Object snapshot = null;
    private volatile long updatedAt = 0L;

    public void update(Object snap) {
        this.snapshot = snap;
        this.updatedAt = System.currentTimeMillis();
    }

    public Object getSnapshot() { return snapshot; }
    public long getUpdatedAt() { return updatedAt; }

    /** 워커 생존 여부 — 최근 30초 내 push가 있었는가 */
    public boolean isAlive() {
        return snapshot != null && (System.currentTimeMillis() - updatedAt) < 30_000;
    }
}
