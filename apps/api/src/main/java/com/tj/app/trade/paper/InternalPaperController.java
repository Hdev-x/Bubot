package com.tj.app.trade.paper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * trader 통합 워커 전용 페이퍼 트레이딩 내부 API (H-R50 실증, 인수인계 부록 F).
 * 사용자 JWT가 아니라 서버 간 공유 시크릿(X-Internal-Token)으로만 접근한다.
 * 워커의 페이퍼 실행 분기(paper-executor.ts)가 호출 — 진입/청산/부분청산/계좌 조회.
 */
@Slf4j
@RestController
@RequestMapping("/api/internal/paper")
@RequiredArgsConstructor
public class InternalPaperController {

    private final PaperService paperService;

    @Value("${app.bot.api-token}")
    private String internalToken;

    private boolean unauthorized(String token) {
        return internalToken == null || internalToken.isBlank()
                || "change-me".equals(internalToken) || !internalToken.equals(token);
    }

    /** 계좌 스냅샷 — 잔고·실현에쿼티 고점·보유 포지션 (워커 리스크 엔진 + reconcile용) */
    @GetMapping("/account")
    public ResponseEntity<?> account(@RequestParam String memberId,
                                     @RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        try {
            PaperAccountDTO acc = paperService.ensureAccount(memberId);
            return ResponseEntity.ok(Map.of(
                    "balance", acc.getBalance(),
                    "peakEquity", acc.getPeakEquity(),
                    "overview", paperService.overview(memberId)));
        } catch (Exception e) {
            log.error("페이퍼 계좌 조회 실패 | member={}", memberId, e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /** 시장가 진입 — 생성된 positionId 반환 */
    @PostMapping("/open")
    public ResponseEntity<?> open(@RequestBody Map<String, Object> body,
                                  @RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        try {
            PaperPositionDTO pos = paperService.openMarket(
                    String.valueOf(body.get("memberId")),
                    String.valueOf(body.get("symbol")),
                    String.valueOf(body.get("direction")),
                    Double.parseDouble(String.valueOf(body.get("marginUsdt"))),
                    Integer.parseInt(String.valueOf(body.get("leverage"))),
                    Double.parseDouble(String.valueOf(body.get("price"))));
            return ResponseEntity.ok(Map.of("positionId", pos.getId(), "size", pos.getSize()));
        } catch (Exception e) {
            log.warn("페이퍼 진입 실패 | {}", body, e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** 시장가 전량 청산 — 실현손익 반환 */
    @PostMapping("/close")
    public ResponseEntity<?> close(@RequestBody Map<String, Object> body,
                                   @RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        try {
            double pnl = paperService.closeMarket(
                    String.valueOf(body.get("memberId")),
                    Integer.parseInt(String.valueOf(body.get("positionId"))),
                    Double.parseDouble(String.valueOf(body.get("price"))));
            return ResponseEntity.ok(Map.of("pnl", pnl));
        } catch (Exception e) {
            log.warn("페이퍼 청산 실패 | {}", body, e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** 부분 청산(TP1 50% 등) — fraction 비율만큼 청산, 실현손익 반환 */
    @PostMapping("/close-partial")
    public ResponseEntity<?> closePartial(@RequestBody Map<String, Object> body,
                                          @RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (unauthorized(token)) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        try {
            double pnl = paperService.closePartial(
                    String.valueOf(body.get("memberId")),
                    Integer.parseInt(String.valueOf(body.get("positionId"))),
                    Double.parseDouble(String.valueOf(body.get("price"))),
                    Double.parseDouble(String.valueOf(body.get("fraction"))));
            return ResponseEntity.ok(Map.of("pnl", pnl));
        } catch (Exception e) {
            log.warn("페이퍼 부분청산 실패 | {}", body, e);
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
