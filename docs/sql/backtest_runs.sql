-- AutoTrade - backtest_runs 테이블 생성
-- 실행: psql <database_url> -f docs/sql/backtest_runs.sql
--
-- 백테스트 실험 이력. "무엇을 해봤는지" 누적 — 설정(전략 스키마 JSON) + 표준 리포트 요약.
-- 개별 거래 원장은 저장하지 않음 (같은 설정 JSON으로 재현 가능).

CREATE TABLE IF NOT EXISTS backtest_runs (
    id           SERIAL PRIMARY KEY,
    member_id    VARCHAR(255) NOT NULL,
    name         VARCHAR(200),                 -- 사람용 라벨 (기본: 전략명 + 실행시각)
    config       JSONB        NOT NULL,        -- shared/strategy-schema.ts StrategyConfig
    symbols      JSONB        NOT NULL,        -- 대상 심볼 배열 ['BTCUSDT', ...]
    range_start  TIMESTAMP,                    -- 데이터 시작 (미지정 시 전체)
    range_end    TIMESTAMP    NOT NULL,        -- 실행 시점 기준 마지막 캔들
    report       JSONB        NOT NULL,        -- utils/backtestReport.ts BacktestReport
    config_hash  VARCHAR(64)  NOT NULL,        -- config+symbols+range 해시 (중복 실험 식별)
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_member_created
    ON backtest_runs (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_member_hash
    ON backtest_runs (member_id, config_hash);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'members') THEN
        ALTER TABLE backtest_runs
            ADD CONSTRAINT fk_backtest_runs_member
            FOREIGN KEY (member_id) REFERENCES members(email)
            ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
