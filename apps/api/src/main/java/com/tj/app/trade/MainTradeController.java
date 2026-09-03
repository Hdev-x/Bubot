package com.tj.app.trade;

import com.tj.app.member.BotApiKeyService;
import com.tj.app.member.BotApiKeyService.BotCredentials;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import com.tj.app.common.security.CurrentUser;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Trade(수동 매매) 페이지용 — MAIN 키 1개로 포지션·미체결·잔고를 한 번에 조회한다.
 * 봇 키(PositionController)와 분리: MAIN = 수동 전용. 1차는 보기 전용(주문 없음).
 * 폴링당 비트겟 서명콜을 줄이려고 3건을 한 응답으로 묶는다.
 */
@Slf4j
@RestController
@RequestMapping("/api/user/main-trade")
@RequiredArgsConstructor
public class MainTradeController {

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
                        "positions", List.of(),
                        "orders", List.of(),
                        "available", 0));
            }

            // 서브콜 하나가 실패해도(레이트리밋 등) 패널 전체가 비지 않도록 개별 격리.
            // 부분 실패는 빈값으로 떨구고 hasKey:true를 유지한다.
            List<Map<String, Object>> positions = List.of();
            try {
                positions = bitget.getAllPositions(creds.apiKey(), creds.secretKey(), creds.passphrase());
            } catch (Exception e) {
                log.warn("MAIN 포지션 조회 실패(부분)", e);
            }
            List<Map<String, Object>> orders = List.of();
            try {
                orders = bitget.getOpenOrders(creds.apiKey(), creds.secretKey(), creds.passphrase());
            } catch (Exception e) {
                log.warn("MAIN 미체결 조회 실패(부분)", e);
            }
            List<Map<String, Object>> planOrders = List.of();
            try {
                planOrders = bitget.getPlanOrders(creds.apiKey(), creds.secretKey(), creds.passphrase());
            } catch (Exception e) {
                log.warn("MAIN 플랜주문(TP/SL) 조회 실패(부분)", e);
            }
            double available = 0d;
            double equity = 0d;
            try {
                Map<String, Object> acct = bitget.getAccountInfo(creds.apiKey(), creds.secretKey(), creds.passphrase());
                available = ((Number) acct.get("available")).doubleValue();
                equity = ((Number) acct.get("equity")).doubleValue();
            } catch (Exception e) {
                log.warn("MAIN 잔고 조회 실패(부분)", e);
            }

            return ResponseEntity.ok(Map.of(
                    "hasKey", true,
                    "positions", positions,
                    "orders", orders,
                    "planOrders", planOrders,
                    "available", available,
                    "equity", equity));
        } catch (Exception e) {
            log.error("MAIN 트레이드 조회 실패", e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "트레이드 정보 조회 중 오류가 발생했습니다."));
        }
    }
}
