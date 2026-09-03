package com.tj.app.trade;

import com.tj.app.member.BotApiKeyService;
import com.tj.app.member.BotApiKeyService.BotCredentials;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import com.tj.app.common.security.CurrentUser;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 사용자 실시간 포지션 — 활성 자동매매 봇(키 슬롯)들의 키로 Bitget all-position 직접 조회.
 * 키1개=전략1개(여러 종목). 봇별로 조회해 병합한다. (MAIN은 수동 전용이라 제외)
 */
@Slf4j
@RestController
@RequestMapping("/api/user/positions")
@RequiredArgsConstructor
public class PositionController {

    private final BotApiKeyService keyService;
    private final TradeConfigMapper configMapper;
    private final BitgetClient bitget;

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(defaultValue = "BITGET") String exchange) {
        try {
            String memberId = CurrentUser.username();
            List<String> botTargets = configMapper.selectActiveBotTargets(memberId);
            if (botTargets.isEmpty()) {
                return ResponseEntity.ok(Map.of("positions", List.of(), "hasKey", false));
            }

            List<Map<String, Object>> all = new ArrayList<>();
            boolean anyKey = false;
            for (String botTarget : botTargets) {
                BotCredentials creds = keyService.getActiveCredentials(memberId, exchange, botTarget);
                if (creds == null) continue;
                anyKey = true;
                List<Map<String, Object>> positions =
                        bitget.getAllPositions(creds.apiKey(), creds.secretKey(), creds.passphrase());
                for (Map<String, Object> p : positions) {
                    Map<String, Object> withBot = new java.util.HashMap<>(p);
                    withBot.put("botTarget", botTarget);
                    all.add(withBot);
                }
            }
            return ResponseEntity.ok(Map.of("positions", all, "hasKey", anyKey));
        } catch (Exception e) {
            log.error("포지션 조회 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "포지션 조회 중 오류가 발생했습니다."));
        }
    }
}
