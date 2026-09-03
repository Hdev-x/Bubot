-- AutoTrade - H-R50 페이퍼 실증용 확장 (인수인계 부록 F, 2026-07-05)
-- 실행: psql <database_url> -f docs/sql/paper_worker.sql
--
-- peak_equity: 실현 에쿼티(잔고 + 잠긴 증거금)의 역대 고점.
-- 워커 리스크 엔진(F3)의 DD 감속(-15%/-30%)·킬스위치(-45%) 판정 기준.
-- 미실현 손익은 제외 — 청산 시점에만 갱신되는 체결 기반 에쿼티 커브(백테스트 DD 정의와 동일).

ALTER TABLE paper_accounts
    ADD COLUMN IF NOT EXISTS peak_equity NUMERIC(20,8) NOT NULL DEFAULT 10000;

-- 기존 계좌는 현재 실현 에쿼티로 초기화(과거 고점은 복원 불가 — 페이퍼 시작 시점 기준)
UPDATE paper_accounts a
SET peak_equity = GREATEST(
    a.peak_equity,
    a.balance + COALESCE((SELECT SUM(p.margin) FROM paper_positions p WHERE p.member_id = a.member_id), 0)
);

-- F4 매매당 태깅 — 패턴명/신호시각/SL·TP/own50 상태/슬리피지 등 사후 분석용 (JSONB 자유 스키마)
ALTER TABLE trades
    ADD COLUMN IF NOT EXISTS tags JSONB;
