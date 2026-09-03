package com.bubot.trade;

import com.bubot.member.BotApiKeyService;
import com.bubot.member.BotApiKeyService.BotCredentials;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import com.bubot.common.security.CurrentUser;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Trade(수동) 페이지 현물 — MAIN 키 1개로 보유자산·미체결을 한 번에 조회한다.
 * 선물 MainTradeController와 동일 패턴, 마켓만 spot. 1차는 보기 전용(주문 없음).
 * 현물엔 포지션·레버리지 개념이 없어 holdings(코인 잔고)로 표현한다.
 */
@Slf4j
@RestController
@RequestMapping("/api/user/spot-trade")
@RequiredArgsConstructor
public class SpotTradeController {

    private final BotApiKeyService keyService;
    private final BitgetClient bitget;

    @GetMapping
    public ResponseEntity<?> overview(@RequestParam(defaultValue = "BITGET") String exchange) {
        try {
            String memberId = CurrentUser.username();
            BotCredentials creds = keyService.getActiveCredentials(memberId, exchange, "MAIN");
            if (creds == null) {
                return ResponseEntity.ok(Map.of(
                        "hasKey", false,
                        "holdings", List.of(),
                        "orders", List.of(),
                        "usdtAvailable", 0));
            }

            // 서브콜 하나가 실패해도 패널 전체가 비지 않도록 개별 격리(hasKey:true 유지).
            List<Map<String, Object>> holdings = List.of();
            try {
                holdings = bitget.getSpotAssets(creds.apiKey(), creds.secretKey(), creds.passphrase());
            } catch (Exception e) {
                log.warn("현물 보유자산 조회 실패(부분)", e);
            }
            List<Map<String, Object>> orders = List.of();
            try {
                orders = bitget.getSpotOpenOrders(creds.apiKey(), creds.secretKey(), creds.passphrase());
            } catch (Exception e) {
                log.warn("현물 미체결 조회 실패(부분)", e);
            }

            double usdtAvailable = holdings.stream()
                    .filter(h -> "USDT".equals(h.get("coin")))
                    .map(h -> ((Number) h.get("available")).doubleValue())
                    .findFirst().orElse(0d);

            // 평균단가·미실현 — 코인별 체결내역(fills) 재생으로 가중평균 매입가 산출.
            // 체결내역이 없거나(약 90일 초과) 보유량을 다 못 덮으면 costReliable=false → 프론트에서 "원가 조회불가" 표시.
            List<Map<String, Object>> enriched = new ArrayList<>();
            for (Map<String, Object> h : holdings) {
                Map<String, Object> hm = new HashMap<>(h);
                String coin = String.valueOf(h.get("coin"));
                double amount = num(h.get("available")) + num(h.get("frozen"));
                if (!"USDT".equals(coin) && !"USDC".equals(coin) && amount > 0) {
                    try {
                        List<Map<String, Object>> fills =
                                bitget.getSpotFills(creds.apiKey(), creds.secretKey(), creds.passphrase(), coin + "USDT");
                        double[] r = avgCostFromFills(fills, amount); // [평균단가, 신뢰성(1/0)]
                        if (r != null) {
                            hm.put("avgCost", r[0]);
                            hm.put("costReliable", r[1] == 1d);
                        } else {
                            hm.put("costReliable", false); // 체결내역 없음 → 원가 조회불가
                        }
                    } catch (Exception e) {
                        log.warn("현물 체결내역 조회 실패: {}", coin, e);
                        hm.put("costReliable", false);
                    }
                }
                enriched.add(hm);
            }

            return ResponseEntity.ok(Map.of(
                    "hasKey", true,
                    "holdings", enriched,
                    "orders", orders,
                    "usdtAvailable", usdtAvailable));
        } catch (Exception e) {
            log.error("현물 트레이드 조회 실패", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "현물 정보 조회 중 오류가 발생했습니다."));
        }
    }

    private static double num(Object o) {
        return o instanceof Number ? ((Number) o).doubleValue() : 0d;
    }

    /**
     * 체결내역(시간순 buy/sell 재생) → 가중평균 매입가. 반환 [평균단가, 신뢰성(1=보유량 커버)].
     * 매수=원가·수량 가중평균, 매도=수량만 차감(이동평균법). 남은 수량/평균이 0이면 null(사용불가).
     * 재생 후 남은 수량이 현재 보유량의 95% 미만이면 매수기록 누락(기간초과)으로 보고 신뢰성=0.
     */
    private static double[] avgCostFromFills(List<Map<String, Object>> fills, double holdingAmount) {
        fills.sort((a, b) -> Long.compare(
                ((Number) a.get("cTime")).longValue(), ((Number) b.get("cTime")).longValue()));
        double qty = 0, avg = 0;
        for (Map<String, Object> f : fills) {
            double price = num(f.get("price"));
            double size = num(f.get("size"));
            if (price <= 0 || size <= 0) continue;
            if ("buy".equals(f.get("side"))) {
                double nq = qty + size;
                avg = (avg * qty + price * size) / nq;
                qty = nq;
            } else {
                qty -= size;
                if (qty <= 1e-9) { qty = 0; avg = 0; }
            }
        }
        if (qty <= 0 || avg <= 0) return null;
        boolean reliable = qty >= holdingAmount * 0.95;
        return new double[]{ avg, reliable ? 1d : 0d };
    }
}
