-- AutoTrade - bot_api_keys 테이블 생성
-- 실행: psql <database_url> -f docs/sql/bot_api_keys.sql
--
-- 사용자가 앱에서 입력한 거래소 API 키를 AES-256-GCM 암호화하여 저장.
-- 평문 키는 DB에 절대 저장되지 않음.

CREATE TABLE IF NOT EXISTS bot_api_keys (
    id              SERIAL PRIMARY KEY,
    member_id       VARCHAR(255) NOT NULL,
    exchange        VARCHAR(20) NOT NULL DEFAULT 'BITGET',
    api_key_enc     TEXT NOT NULL,
    secret_key_enc  TEXT NOT NULL,
    passphrase_enc  TEXT NOT NULL,
    label           VARCHAR(100),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- member_id → members(email) 외래키
-- members 테이블이 존재하는 경우에만 실행
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'members') THEN
        ALTER TABLE bot_api_keys
            ADD CONSTRAINT fk_bot_api_keys_member
            FOREIGN KEY (member_id) REFERENCES members(email)
            ON DELETE CASCADE;
    END IF;
END $$;