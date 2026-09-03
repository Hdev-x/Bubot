package com.tj.app.common.config;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 부팅 시 bot_api_keys 테이블이 없으면 자동 생성.
 * 로컬 개발 편의용 — 운영에서는 flyway/liquibase 권장.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DdlAutoRunner {

    private final JdbcTemplate jdbc;

    @PostConstruct
    public void init() {
        try {
            jdbc.execute("""
                CREATE TABLE IF NOT EXISTS bot_api_keys (
                    id              SERIAL PRIMARY KEY,
                    member_id       VARCHAR(255) NOT NULL,
                    exchange        VARCHAR(20) NOT NULL DEFAULT 'BITGET',
                    bot_target      VARCHAR(20) NOT NULL DEFAULT 'MAIN',
                    api_key_enc     TEXT NOT NULL,
                    secret_key_enc  TEXT NOT NULL,
                    passphrase_enc  TEXT NOT NULL,
                    label           VARCHAR(100),
                    is_active       BOOLEAN DEFAULT true,
                    created_at      TIMESTAMP DEFAULT NOW(),
                    updated_at      TIMESTAMP DEFAULT NOW()
                )
            """);
            // 기존 테이블 호환 — 컬럼이 없으면 추가
            jdbc.execute("ALTER TABLE bot_api_keys ADD COLUMN IF NOT EXISTS bot_target VARCHAR(20) NOT NULL DEFAULT 'MAIN'");
            log.info("bot_api_keys 테이블 확인 완료");
        } catch (Exception e) {
            log.warn("bot_api_keys 테이블 자동 생성 실패 (이미 존재하거나 DB 연결 안 됨): {}", e.getMessage());
        }

        try {
            jdbc.execute("""
                CREATE TABLE IF NOT EXISTS trade_configs (
                    id             SERIAL PRIMARY KEY,
                    member_id      VARCHAR(255) NOT NULL,
                    exchange       VARCHAR(20)   NOT NULL DEFAULT 'BITGET',
                    symbol         VARCHAR(30)   NOT NULL,
                    strategy       VARCHAR(30)   NOT NULL DEFAULT 'OB',
                    params         JSONB         NOT NULL DEFAULT '{}',
                    invest_usdt    NUMERIC(18,4) NOT NULL DEFAULT 0,
                    leverage       INT           NOT NULL DEFAULT 5,
                    max_loss_pct   NUMERIC(6,2)  NOT NULL,
                    is_active      BOOLEAN       NOT NULL DEFAULT false,
                    status         VARCHAR(20)   NOT NULL DEFAULT 'IDLE',
                    realized_pnl   NUMERIC(18,4) NOT NULL DEFAULT 0,
                    created_at     TIMESTAMP DEFAULT NOW(),
                    updated_at     TIMESTAMP DEFAULT NOW(),
                    UNIQUE (member_id, exchange, symbol)
                )
            """);
            // 어느 봇(키 슬롯)으로 돌릴지 — 키1개=전략1개(여러 종목). 없으면 추가.
            jdbc.execute("ALTER TABLE trade_configs ADD COLUMN IF NOT EXISTS bot_target VARCHAR(20) NOT NULL DEFAULT 'SOL'");
            log.info("trade_configs 테이블 확인 완료");
        } catch (Exception e) {
            log.warn("trade_configs 테이블 자동 생성 실패: {}", e.getMessage());
        }

        try {
            jdbc.execute("""
                CREATE TABLE IF NOT EXISTS trades (
                    id           BIGSERIAL     PRIMARY KEY,
                    config_id    INT           NOT NULL,
                    member_id    VARCHAR(255)  NOT NULL,
                    symbol       VARCHAR(30)   NOT NULL,
                    direction    VARCHAR(10)   NOT NULL,
                    entry_price  NUMERIC(20,8) NOT NULL,
                    exit_price   NUMERIC(20,8) NOT NULL,
                    size         NUMERIC(20,8) NOT NULL,
                    pnl_usdt     NUMERIC(18,4) NOT NULL,
                    outcome      VARCHAR(20)   NOT NULL,
                    entry_time   TIMESTAMP,
                    exit_time    TIMESTAMP     DEFAULT NOW()
                )
            """);
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_trades_member ON trades(member_id, exit_time DESC)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_trades_config ON trades(config_id, exit_time DESC)");
            log.info("trades 테이블 확인 완료");
        } catch (Exception e) {
            log.warn("trades 테이블 자동 생성 실패: {}", e.getMessage());
        }

        try {
            jdbc.execute("""
                CREATE TABLE IF NOT EXISTS system_flags (
                    flag_key   VARCHAR(50) PRIMARY KEY,
                    flag_value VARCHAR(255) NOT NULL,
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """);
            // 글로벌 kill switch 기본값(off) — 없을 때만 삽입
            jdbc.update("INSERT INTO system_flags (flag_key, flag_value) VALUES ('kill_switch', 'false') "
                    + "ON CONFLICT (flag_key) DO NOTHING");
            // 자동매매 ON/OFF 기본값(off) — 명시적으로 켜야만 신규 진입 (없을 때만 삽입)
            jdbc.update("INSERT INTO system_flags (flag_key, flag_value) VALUES ('trading_enabled', 'false') "
                    + "ON CONFLICT (flag_key) DO NOTHING");
            log.info("system_flags 테이블 확인 완료");
        } catch (Exception e) {
            log.warn("system_flags 테이블 자동 생성 실패: {}", e.getMessage());
        }

        try {
            // 하모닉 패턴 생애주기(signal→체결→종료) — 패턴 1개 = 1 row.
            // 워커가 단계 전이마다 pattern.signature(=symbol|interval|xabcKey)로 upsert.
            // 차트가 자동 지표로 못 그리는 과거/종료 패턴을 다시 불러오기 위함.
            jdbc.execute("""
                CREATE TABLE IF NOT EXISTS harmonic_closed_patterns (
                    id           BIGSERIAL     PRIMARY KEY,
                    signature    TEXT,
                    symbol       VARCHAR(30)   NOT NULL,
                    interval_tf  VARCHAR(10),
                    pattern_name VARCHAR(60),
                    direction    VARCHAR(10),
                    phase        VARCHAR(12),
                    exit_reason  VARCHAR(20),
                    entry_time   BIGINT,
                    exit_time    BIGINT,
                    pattern      JSONB         NOT NULL,
                    created_at   TIMESTAMP     DEFAULT NOW(),
                    updated_at   TIMESTAMP     DEFAULT NOW()
                )
            """);
            // 구 스키마(종료만 저장) 테이블 호환: 누락 컬럼·signature 확장 멱등 추가.
            jdbc.execute("ALTER TABLE harmonic_closed_patterns ALTER COLUMN signature TYPE TEXT");
            jdbc.execute("ALTER TABLE harmonic_closed_patterns ADD COLUMN IF NOT EXISTS phase VARCHAR(12)");
            jdbc.execute("ALTER TABLE harmonic_closed_patterns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()");
            // 생애주기 upsert 키: signature 단일 유니크.
            jdbc.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_hcp_signature "
                    + "ON harmonic_closed_patterns(signature)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_hcp_symbol_exit "
                    + "ON harmonic_closed_patterns(symbol, exit_time DESC)");
            log.info("harmonic_closed_patterns 테이블 확인 완료");
        } catch (Exception e) {
            log.warn("harmonic_closed_patterns 테이블 자동 생성 실패: {}", e.getMessage());
        }
    }
}