package com.bubot.trade;

import org.springframework.context.annotation.Profile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import com.bubot.common.security.CurrentUser;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 사용자 체결기록 조회 — 전략 탭 표시용. 본인(member_id) 거래만.
 */
@Slf4j
@Profile("trading") // trading 프로필에서만 등록. Beta(프로필 없음)에서는 제외 (wp-02 d03)
@RestController
@RequestMapping("/api/user/trades")
@RequiredArgsConstructor
public class TradeController {

    private final TradeMapper tradeMapper;

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(defaultValue = "100") int limit) {
        try {
            int cap = Math.min(Math.max(limit, 1), 500);
            List<TradeDTO> trades = tradeMapper.selectByMemberId(CurrentUser.username(), cap);
            return ResponseEntity.ok(Map.of("trades", trades));
        } catch (Exception e) {
            log.error("체결기록 조회 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "조회 중 오류가 발생했습니다."));
        }
    }
}
