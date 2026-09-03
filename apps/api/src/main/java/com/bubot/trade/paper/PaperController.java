package com.bubot.trade.paper;

import com.bubot.common.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 모의투자(페이퍼 트레이딩) — 가상계좌 조회/주문/청산/초기화.
 * 인증 필요(/api/** 는 SecurityConfig에서 authenticated). 실거래(MainTrade)와 완전 분리.
 */
@Slf4j
@RestController
@RequestMapping("/api/paper")
@RequiredArgsConstructor
public class PaperController {

    private final PaperService service;

    @GetMapping("/account")
    public ResponseEntity<?> account() {
        return ResponseEntity.ok(service.overview(CurrentUser.username()));
    }

    @PostMapping("/order")
    public ResponseEntity<?> order(@RequestBody Map<String, Object> body) {
        try {
            String type = str(body.get("type")); // 'limit'이면 지정가, 아니면 시장가
            String memberId = CurrentUser.username();
            String symbol = str(body.get("symbol"));
            String direction = str(body.get("direction"));
            double margin = dbl(body.get("marginUsdt"));
            int leverage = (int) dbl(body.get("leverage"));
            double price = dbl(body.get("price"));
            Map<String, Object> result = "limit".equals(type)
                    ? service.placeLimit(memberId, symbol, direction, margin, leverage, price)
                    : service.placeOrder(memberId, symbol, direction, margin, leverage, price);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/cancel")
    public ResponseEntity<?> cancel(@RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.ok(service.cancelOrder(CurrentUser.username(), (int) dbl(body.get("orderId"))));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/close")
    public ResponseEntity<?> close(@RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.ok(service.closePosition(
                    CurrentUser.username(),
                    (int) dbl(body.get("positionId")),
                    dbl(body.get("price"))));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/reset")
    public ResponseEntity<?> reset() {
        return ResponseEntity.ok(service.reset(CurrentUser.username()));
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }
    private static double dbl(Object o) { return o == null ? 0 : Double.parseDouble(o.toString()); }
}
