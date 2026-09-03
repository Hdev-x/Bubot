package com.tj.app.trade;

import com.tj.app.common.config.SystemFlagService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * trader 통합 워커 전용 내부 API.
 * 사용자 JWT가 아니라 서버 간 공유 시크릿(X-Internal-Token)으로만 접근한다.
 */
@Slf4j
@RestController
@RequestMapping("/api/internal/trade-configs")
@RequiredArgsConstructor
public class InternalTradeController {

    private final TradeConfigMapper mapper;
    private final TradeMapper tradeMapper;
    private final SystemFlagService flags;

    @Value("${app.bot.api-token}")
    private String internalToken;

    private boolean unauthorized(String token) {
        return internalToken == null || internalToken.isBlank()
                || "change-me".equals(internalToken) || !internalToken.equals(token);
    }

    /** 전체 활성 설정 (member_id 포함) */
    @GetMapping("/active")
    public ResponseEntity<?> active(@RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        List<TradeConfigDTO> configs = mapper.selectAllActive();
        return ResponseEntity.ok(Map.of("configs", configs));
    }

    /** 청산 기록: 실현손익 누적 (+ 손실한도 초과 시 자동 STOPPED_LOSS) */
    @PostMapping("/{id}/pnl")
    public ResponseEntity<?> addPnl(@PathVariable Integer id,
                                    @RequestBody Map<String, Object> body,
                                    @RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        try {
            BigDecimal pnl = new BigDecimal(String.valueOf(body.get("pnl")));
            mapper.addRealizedPnl(id, pnl);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("실현손익 기록 실패 | id={}", id, e);
            return ResponseEntity.internalServerError().body(Map.of("error", "internal error"));
        }
    }

    /** 청산 체결 1건 기록 — 워커가 settle()마다 호출 (체결기록 표시용) */
    @PostMapping("/{id}/trade")
    public ResponseEntity<?> addTrade(@PathVariable Integer id,
                                      @RequestBody TradeDTO dto,
                                      @RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        try {
            dto.setConfigId(id);
            tradeMapper.insert(dto);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("체결기록 저장 실패 | id={}", id, e);
            return ResponseEntity.internalServerError().body(Map.of("error", "internal error"));
        }
    }

    /** 글로벌 kill switch 상태 — 워커가 폴링해 활성 시 전체 정지·청산 */
    @GetMapping("/kill-switch")
    public ResponseEntity<?> killSwitch(@RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        return ResponseEntity.ok(Map.of("active", flags.getBool(SystemFlagService.KILL_SWITCH)));
    }

    /** 워커가 안전장치(일일 손실 한도 등) 발동 시 글로벌 kill switch를 직접 켠다 */
    @PostMapping("/kill-switch")
    public ResponseEntity<?> setKillSwitch(@RequestHeader(value = "X-Internal-Token", required = false) String token,
                                           @RequestBody Map<String, Object> body) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        boolean active = Boolean.parseBoolean(String.valueOf(body.get("active")));
        String reason = String.valueOf(body.getOrDefault("reason", "worker"));
        flags.setBool(SystemFlagService.KILL_SWITCH, active);
        log.warn("⚠️ KILL SWITCH {} by worker | reason={}", active ? "ON" : "OFF", reason);
        return ResponseEntity.ok(Map.of("active", active));
    }

    /** 자동매매 ON/OFF 상태 — 워커가 폴링해 OFF면 신규 진입만 차단(포지션 유지) */
    @GetMapping("/trading-enabled")
    public ResponseEntity<?> tradingEnabled(@RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        return ResponseEntity.ok(Map.of("enabled", flags.getBool(SystemFlagService.TRADING_ENABLED)));
    }

    /** 모니터링 하모닉 신호 푸시 알림 TF별 on/off — 워커가 폴링해 발송 필터 */
    @GetMapping("/harmonic-alerts")
    public ResponseEntity<?> harmonicAlerts(@RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        return ResponseEntity.ok(Map.of(
                "m30", flags.getBool(SystemFlagService.HARMONIC_ALERT_30M),
                "h4", flags.getBool(SystemFlagService.HARMONIC_ALERT_4H),
                "d1", flags.getBool(SystemFlagService.HARMONIC_ALERT_1D)));
    }

    /** 워커가 설정 상태 보고 (RUNNING/ERROR/...) */
    @PutMapping("/{id}/status")
    public ResponseEntity<?> status(@PathVariable Integer id,
                                    @RequestBody Map<String, String> body,
                                    @RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        mapper.updateStatus(id, body.getOrDefault("status", "IDLE"));
        return ResponseEntity.ok(Map.of("success", true));
    }
}
