package com.tj.app.trade;

import com.tj.app.common.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 현물 매수평균가 수동 입력 — 거래소 체결내역으로 원가를 못 받아오는 코인(90일 초과/권한 없음)에
 * 사용자가 직접 원가를 저장/수정/삭제한다. 조회는 coin→avgCost 맵으로 반환(프론트에서 병합).
 */
@Slf4j
@RestController
@RequestMapping("/api/user/spot-manual-cost")
@RequiredArgsConstructor
public class SpotManualCostController {

    private final SpotManualCostMapper mapper;

    /** 회원의 (exchange) 수동원가 전체 → { coin: avgCost } */
    @GetMapping
    public ResponseEntity<?> list(@RequestParam(defaultValue = "BITGET") String exchange) {
        String memberId = CurrentUser.username();
        Map<String, Double> out = new LinkedHashMap<>();
        for (SpotManualCostDTO d : mapper.selectByMember(memberId, exchange)) {
            out.put(d.getCoin(), d.getAvgCost());
        }
        return ResponseEntity.ok(out);
    }

    /** 저장/수정(업서트) — body: { exchange?, coin, avgCost } */
    @PutMapping
    public ResponseEntity<?> upsert(@RequestBody Map<String, Object> body) {
        String memberId = CurrentUser.username();
        String exchange = String.valueOf(body.getOrDefault("exchange", "BITGET"));
        Object coinRaw = body.get("coin");
        Object costRaw = body.get("avgCost");
        if (coinRaw == null || !(costRaw instanceof Number)) {
            return ResponseEntity.badRequest().body(Map.of("error", "coin/avgCost 필요"));
        }
        String coin = String.valueOf(coinRaw).trim().toUpperCase();
        double avgCost = ((Number) costRaw).doubleValue();
        if (coin.isBlank() || avgCost <= 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "coin/avgCost 값 오류"));
        }
        mapper.upsert(memberId, exchange, coin, avgCost);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** 삭제 */
    @DeleteMapping
    public ResponseEntity<?> delete(@RequestParam(defaultValue = "BITGET") String exchange,
                                    @RequestParam String coin) {
        String memberId = CurrentUser.username();
        mapper.delete(memberId, exchange, coin.trim().toUpperCase());
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
