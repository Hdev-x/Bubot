-- AutoTrade - 모의투자(페이퍼 트레이딩) 테이블
-- 실행: psql <database_url> -f docs/sql/paper_trading.sql
--
-- 가상 잔고(USDT)로 실시간 시세 기준 모의 매매. 실거래(bot_api_keys/trade_configs)와 완전 분리.
-- 가상계좌 1개/회원, 보유 포지션은 행 단위(같은 종목 중복 보유 허용).

CREATE TABLE IF NOT EXISTS paper_accounts (
    member_id   VARCHAR(255) PRIMARY KEY,
    balance     NUMERIC(20,8) NOT NULL DEFAULT 10000,  -- 가용 USDT(자유 잔고)
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paper_positions (
    id           SERIAL PRIMARY KEY,
    member_id    VARCHAR(255)   NOT NULL,
    symbol       VARCHAR(30)    NOT NULL,        -- 'BTCUSDT' 등
    direction    VARCHAR(8)     NOT NULL,        -- 'long' | 'short'
    entry_price  NUMERIC(30,10) NOT NULL,
    size         NUMERIC(30,10) NOT NULL,        -- 코인 수량(명목/진입가)
    leverage     INT            NOT NULL DEFAULT 1,
    margin       NUMERIC(20,8)  NOT NULL,        -- 투입 증거금(USDT)
    opened_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paper_positions_member ON paper_positions(member_id);

-- 지정가 미체결 주문(서버 루프가 현재가 닿으면 체결 → paper_positions로 전환). 증거금은 주문 시 잠금.
CREATE TABLE IF NOT EXISTS paper_orders (
    id           SERIAL PRIMARY KEY,
    member_id    VARCHAR(255)   NOT NULL,
    symbol       VARCHAR(30)    NOT NULL,
    direction    VARCHAR(8)     NOT NULL,        -- 'long' | 'short'
    limit_price  NUMERIC(30,10) NOT NULL,        -- 지정가
    size         NUMERIC(30,10) NOT NULL,        -- 체결 시 수량(증거금×레버리지/지정가)
    leverage     INT            NOT NULL DEFAULT 1,
    margin       NUMERIC(20,8)  NOT NULL,        -- 주문 시 잠근 증거금(USDT)
    status       VARCHAR(10)    NOT NULL DEFAULT 'pending', -- pending | filled | canceled
    created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paper_orders_member ON paper_orders(member_id);
CREATE INDEX IF NOT EXISTS idx_paper_orders_pending ON paper_orders(status);

-- member_id → members(email) FK (members 존재 시에만, 1회 실행)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'members')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_paper_accounts_member') THEN
        ALTER TABLE paper_accounts
            ADD CONSTRAINT fk_paper_accounts_member
            FOREIGN KEY (member_id) REFERENCES members(email) ON DELETE CASCADE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'members')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_paper_positions_member') THEN
        ALTER TABLE paper_positions
            ADD CONSTRAINT fk_paper_positions_member
            FOREIGN KEY (member_id) REFERENCES members(email) ON DELETE CASCADE;
    END IF;
END $$;
