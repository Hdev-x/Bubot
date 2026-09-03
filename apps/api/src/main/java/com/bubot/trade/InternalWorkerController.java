package com.bubot.trade;

import org.springframework.context.annotation.Profile;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 통합 워커 전용 내부 API — 워커가 자기 상태 스냅샷을 주기적으로 push한다.
 * X-Internal-Token으로만 접근. 대시보드는 /api/admin/worker/status(JWT)로 읽는다.
 */
@Slf4j
@Profile("trading") // trading 프로필에서만 등록. Beta(프로필 없음)에서는 제외 (wp-02 d03)
@RestController
@RequestMapping("/api/internal/worker")
@RequiredArgsConstructor
public class InternalWorkerController {

    private final WorkerStatusHolder holder;
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    @Value("${app.bot.api-token}")
    private String internalToken;

    private boolean unauthorized(String token) {
        return internalToken == null || internalToken.isBlank() || "change-me".equals(internalToken)
                || !internalToken.equals(token);
    }

    @PostMapping("/status")
    public ResponseEntity<?> pushStatus(@RequestBody Object snapshot,
                                        @RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) {
            return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        }
        holder.update(snapshot);
        return ResponseEntity.ok(Map.of("success", true));
    }

    /**
     * 하모닉 패턴 생애주기(signal→체결→종료)를 DB 한 줄로 upsert.
     * 패턴 1개 = 1 row(고유키 = pattern.signature = symbol|interval|xabcKey).
     * 단계가 진행되면 같은 행의 phase / entry_time / exit_time / exit_reason / pattern(JSON)을 갱신한다.
     * 차트가 자동 지표로 더 이상 못 그리는 과거/종료 패턴을 다시 불러오기 위함.
     */
    @PostMapping("/closed-pattern")
    public ResponseEntity<?> saveClosedPattern(@RequestBody Map<String, Object> body,
                                               @RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) {
            return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> p = (Map<String, Object>) body.get("pattern");
            if (p == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "missing pattern"));
            }

            // 패턴별 고유 signature(symbol|interval|xabcKey). 없으면 저장 불가(upsert 키).
            String signature = str(p.get("signature"));
            if (signature == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "missing signature"));
            }

            String type = str(p.get("type"));
            String direction = "bull".equals(type) ? "long" : "bear".equals(type) ? "short" : type;
            String phase = str(p.get("phase"));
            String patternJson = objectMapper.writeValueAsString(p);

            jdbc.update(
                "INSERT INTO harmonic_closed_patterns "
                + "(signature, symbol, interval_tf, pattern_name, direction, phase, exit_reason, entry_time, exit_time, pattern, updated_at) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, now()) "
                + "ON CONFLICT (signature) DO UPDATE SET "
                + "phase = EXCLUDED.phase, exit_reason = EXCLUDED.exit_reason, "
                + "entry_time = EXCLUDED.entry_time, exit_time = EXCLUDED.exit_time, "
                + "pattern = EXCLUDED.pattern, updated_at = now()",
                signature,
                str(p.get("symbol")),
                str(p.get("interval")),
                str(p.get("patternName")),
                direction,
                phase,
                str(p.get("exitReason")),
                asLong(p.get("entryTime")),
                asLong(p.get("exitTime")),
                patternJson
            );
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.warn("패턴 저장 실패: {}", e.getMessage());
            return ResponseEntity.status(500).body(Map.of("error", "save failed"));
        }
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static Long asLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(o.toString()); } catch (NumberFormatException e) { return null; }
    }
}
