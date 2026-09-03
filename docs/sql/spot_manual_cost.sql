-- AutoTrade - spot_manual_cost 테이블 생성
-- 실행: psql <database_url> -f docs/sql/spot_manual_cost.sql
--
-- 현물 보유자산의 매수평균가를 거래소 체결내역으로 못 받아올 때(약 90일 초과 / 권한 없음 등)
-- 사용자가 직접 입력한 원가를 저장한다. (member_id, exchange, coin) 단위로 1행.
-- 실데이터(체결내역)가 있으면 그쪽을 우선하고, 없을 때만 이 값으로 손익을 계산한다.

CREATE TABLE IF NOT EXISTS spot_manual_cost (
    id          SERIAL PRIMARY KEY,
    member_id   VARCHAR(255)  NOT NULL,
    exchange    VARCHAR(20)   NOT NULL DEFAULT 'BITGET',
    coin        VARCHAR(30)   NOT NULL,             -- 'SOL' 등 (USDT 마켓 base 심볼)
    avg_cost    NUMERIC(24,8) NOT NULL,             -- 사용자 입력 매수평균가(USDT)
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE (member_id, exchange, coin)
);

-- member_id → members(email) 외래키 (members 존재 시에만)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_spot_manual_cost_member'
    ) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'members') THEN
        ALTER TABLE spot_manual_cost
            ADD CONSTRAINT fk_spot_manual_cost_member
            FOREIGN KEY (member_id) REFERENCES members(email)
            ON DELETE CASCADE;
    END IF;
END $$;

-- 앱 접속 계정(neondb_owner)에 권한 부여 — 다른 역할로 테이블을 만들었을 때 'permission denied' 방지.
-- (소유자가 다르면 GRANT만으론 부족할 수 있어 소유권도 이전)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON spot_manual_cost TO neondb_owner';
        EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE spot_manual_cost_id_seq TO neondb_owner';
        EXECUTE 'ALTER TABLE spot_manual_cost OWNER TO neondb_owner';
        EXECUTE 'ALTER SEQUENCE spot_manual_cost_id_seq OWNER TO neondb_owner';
    END IF;
END $$;
