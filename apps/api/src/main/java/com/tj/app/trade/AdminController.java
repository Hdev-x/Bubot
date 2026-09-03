package com.tj.app.trade;

import com.tj.app.common.config.SystemFlagService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 운영자(admin) 전용 — 글로벌 kill switch 토글.
 * kill switch ON = 통합 워커가 다음 폴링에서 전 설정 정지·전 포지션 시장가 청산.
 * (DB is_active는 그대로 두어 OFF 시 자동 재개되는 "비상 일시정지" 의미)
 */
@Slf4j
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final SystemFlagService flags;
    private final WorkerStatusHolder workerStatus;
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    @GetMapping("/kill-switch")
    public ResponseEntity<?> get() {
        if (!isAdmin()) return ResponseEntity.status(403).body(Map.of("error", "forbidden"));
        return ResponseEntity.ok(Map.of("active", flags.getBool(SystemFlagService.KILL_SWITCH)));
    }

    @PostMapping("/kill-switch")
    public ResponseEntity<?> set(@RequestBody Map<String, Object> body) {
        if (!isAdmin()) return ResponseEntity.status(403).body(Map.of("error", "forbidden"));
        boolean active = Boolean.parseBoolean(String.valueOf(body.get("active")));
        flags.setBool(SystemFlagService.KILL_SWITCH, active);
        log.warn("⚠️ KILL SWITCH {} by {}", active ? "ON" : "OFF", currentUser());
        return ResponseEntity.ok(Map.of("active", active));
    }

    @GetMapping("/trading-enabled")
    public ResponseEntity<?> getTrading() {
        if (!isAdmin()) return ResponseEntity.status(403).body(Map.of("error", "forbidden"));
        return ResponseEntity.ok(Map.of("enabled", flags.getBool(SystemFlagService.TRADING_ENABLED)));
    }

    @PostMapping("/trading-enabled")
    public ResponseEntity<?> setTrading(@RequestBody Map<String, Object> body) {
        if (!isAdmin()) return ResponseEntity.status(403).body(Map.of("error", "forbidden"));
        boolean enabled = Boolean.parseBoolean(String.valueOf(body.get("enabled")));
        flags.setBool(SystemFlagService.TRADING_ENABLED, enabled);
        log.warn("자동매매 {} by {}", enabled ? "ON" : "OFF", currentUser());
        return ResponseEntity.ok(Map.of("enabled", enabled));
    }

    /** 모니터링 하모닉 신호 푸시 알림 — TF별 on/off 조회 */
    @GetMapping("/harmonic-alerts")
    public ResponseEntity<?> getHarmonicAlerts() {
        if (!isAdmin()) return ResponseEntity.status(403).body(Map.of("error", "forbidden"));
        return ResponseEntity.ok(Map.of(
                "m30", flags.getBool(SystemFlagService.HARMONIC_ALERT_30M),
                "h4", flags.getBool(SystemFlagService.HARMONIC_ALERT_4H),
                "d1", flags.getBool(SystemFlagService.HARMONIC_ALERT_1D)));
    }

    /** 모니터링 하모닉 신호 푸시 알림 — TF별 on/off 설정 */
    @PostMapping("/harmonic-alerts")
    public ResponseEntity<?> setHarmonicAlerts(@RequestBody Map<String, Object> body) {
        if (!isAdmin()) return ResponseEntity.status(403).body(Map.of("error", "forbidden"));
        boolean m30 = Boolean.parseBoolean(String.valueOf(body.get("m30")));
        boolean h4 = Boolean.parseBoolean(String.valueOf(body.get("h4")));
        boolean d1 = Boolean.parseBoolean(String.valueOf(body.get("d1")));
        flags.setBool(SystemFlagService.HARMONIC_ALERT_30M, m30);
        flags.setBool(SystemFlagService.HARMONIC_ALERT_4H, h4);
        flags.setBool(SystemFlagService.HARMONIC_ALERT_1D, d1);
        log.info("하모닉 알림 TF 설정 by {} — 30m={} 4h={} 1d={}", currentUser(), m30, h4, d1);
        return ResponseEntity.ok(Map.of("m30", m30, "h4", h4, "d1", d1));
    }

    /** 통합 워커 상태 스냅샷 (대시보드용) */
    @GetMapping("/worker/status")
    public ResponseEntity<?> worker() {
        if (!isAdmin()) return ResponseEntity.status(403).body(Map.of("error", "forbidden"));
        java.util.Map<String, Object> body = new java.util.HashMap<>();
        body.put("alive", workerStatus.isAlive());
        body.put("updatedAt", workerStatus.getUpdatedAt());
        body.put("snapshot", workerStatus.getSnapshot());
        return ResponseEntity.ok(body);
    }

    /** DB에 보존된 하모닉 종료 패턴 조회 — 차트 재표시용. */
    @GetMapping("/harmonic-closed-patterns")
    public ResponseEntity<?> harmonicClosedPatterns(
            @RequestParam String symbol,
            @RequestParam String interval,
            @RequestParam(defaultValue = "sl") String exitReason,
            @RequestParam(defaultValue = "200") int limit
    ) {
        if (!isAdmin()) return ResponseEntity.status(403).body(Map.of("error", "forbidden"));

        String normalizedSymbol = symbol.toUpperCase();
        String normalizedInterval = interval;
        String normalizedReason = exitReason.toLowerCase();
        int safeLimit = Math.min(Math.max(limit, 1), 500);

        String sql;
        Object[] args;
        sql = """
            SELECT pattern::text
              FROM harmonic_closed_patterns
             WHERE symbol = ?
               AND interval_tf = ?
               AND phase = 'closed'
               AND exit_reason = ?
             ORDER BY exit_time DESC NULLS LAST, updated_at DESC
             LIMIT ?
        """;
        args = new Object[] { normalizedSymbol, normalizedInterval, normalizedReason, safeLimit };

        List<Map<String, Object>> patterns = jdbc.query(sql, (rs, rowNum) -> {
            try {
                return objectMapper.readValue(rs.getString("pattern"), new TypeReference<Map<String, Object>>() {});
            } catch (Exception e) {
                throw new IllegalStateException("stored pattern json parse failed", e);
            }
        }, args);
        return ResponseEntity.ok(Map.of("patterns", patterns));
    }

    private String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? "?" : auth.getName();
    }

    private boolean isAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return false;
        return auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }
}
