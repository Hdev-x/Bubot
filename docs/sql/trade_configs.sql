-- AutoTrade - trade_configs 테이블 생성
-- 실행: psql <database_url> -f docs/sql/trade_configs.sql
--
-- 사용자별 자동매매 설정(심볼/전략/투자금/안전장치).
-- 한 사용자가 여러 심볼을 동시에 운용 → (member_id, exchange, symbol) 단위로 1행.

CREATE TABLE IF NOT EXISTS trade_configs (
    id             SERIAL PRIMARY KEY,
    member_id      VARCHAR(255)  NOT NULL,
    exchange       VARCHAR(20)   NOT NULL DEFAULT 'BITGET',
    symbol         VARCHAR(30)   NOT NULL,              -- 'SOLUSDT' 등
    strategy       VARCHAR(30)   NOT NULL DEFAULT 'OB', -- 'OB' | 'FVG' | 'BB'
    params         JSONB         NOT NULL DEFAULT '{}', -- SignalEngineParams 부분집합
    invest_usdt    NUMERIC(18,4) NOT NULL DEFAULT 0,    -- 설정별 고정 투자금
    leverage       INT           NOT NULL DEFAULT 5,
    max_loss_pct   NUMERIC(6,2)  NOT NULL,              -- 안전장치: 최대손실%(필수)
    is_active      BOOLEAN       NOT NULL DEFAULT false,-- 사용자 on/off
    status         VARCHAR(20)   NOT NULL DEFAULT 'IDLE', -- IDLE|RUNNING|STOPPED_LOSS|ERROR|KILLED
    realized_pnl   NUMERIC(18,4) NOT NULL DEFAULT 0,    -- 누적 실현손익(손실한도 판정)
    created_at     TIMESTAMP DEFAULT NOW(),
    updated_at     TIMESTAMP DEFAULT NOW(),
    UNIQUE (member_id, exchange, symbol)
);

-- member_id → members(email) 외래키 (members 존재 시에만)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'members') THEN
        ALTER TABLE trade_configs
            ADD CONSTRAINT fk_trade_configs_member
            FOREIGN KEY (member_id) REFERENCES members(email)
            ON DELETE CASCADE;
    END IF;
END $$;
