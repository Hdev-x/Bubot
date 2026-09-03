package com.tj.app.common.config;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * system_flags 테이블 기반 전역 플래그(kill switch 등).
 * MyBatis 매퍼 대신 JdbcTemplate로 간단히 처리한다.
 */
@Service
@RequiredArgsConstructor
public class SystemFlagService {

    private final JdbcTemplate jdbc;

    public static final String KILL_SWITCH = "kill_switch";
    /** 자동매매 ON/OFF — OFF면 워커가 신규 진입만 차단(기존 포지션은 유지). */
    public static final String TRADING_ENABLED = "trading_enabled";
    /** 모니터링 하모닉 신호 푸시 알림 TF별 on/off (워커가 폴링해 발송 필터). */
    public static final String HARMONIC_ALERT_30M = "harmonic_alert_30m";
    public static final String HARMONIC_ALERT_4H = "harmonic_alert_4h";
    public static final String HARMONIC_ALERT_1D = "harmonic_alert_1d";

    public boolean getBool(String key) {
        try {
            String v = jdbc.queryForObject(
                    "SELECT flag_value FROM system_flags WHERE flag_key = ?", String.class, key);
            return "true".equalsIgnoreCase(v);
        } catch (Exception e) {
            return false; // 행이 없거나 DB 오류면 안전하게 off로 간주
        }
    }

    public void setBool(String key, boolean value) {
        jdbc.update("""
            INSERT INTO system_flags (flag_key, flag_value, updated_at)
            VALUES (?, ?, NOW())
            ON CONFLICT (flag_key) DO UPDATE SET flag_value = EXCLUDED.flag_value, updated_at = NOW()
        """, key, String.valueOf(value));
    }
}
