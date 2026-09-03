package com.bubot.member;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 봇(trader) 프로세스 전용 내부 API.
 * 사용자 JWT가 아니라 서버 간 공유 시크릿(X-Internal-Token)으로만 접근한다.
 * 운영자(operator) 계정의 슬롯별 활성 키를 복호화해 반환한다.
 *
 * ⚠️ 평문 시크릿을 응답하므로 절대 외부에 노출하면 안 됨.
 *    네트워크 경계(내부망/localhost) + 토큰 검증으로만 보호된다.
 */
@Slf4j
@RestController
@RequestMapping("/api/internal/bot-credentials")
@RequiredArgsConstructor
public class InternalBotCredentialController {

    private final BotApiKeyService service;

    @Value("${app.bot.api-token}")
    private String internalToken;

    @Value("${app.bot.operator-member-id}")
    private String operatorMemberId;

    @GetMapping("/{botTarget}")
    public ResponseEntity<?> get(
            @PathVariable String botTarget,
            @RequestParam(defaultValue = "BITGET") String exchange,
            @RequestHeader(value = "X-Internal-Token", required = false) String token) {

        // 공유 시크릿 검증 — 기본값(change-me)이면 거부
        if (internalToken == null || internalToken.isBlank() || "change-me".equals(internalToken)
                || !internalToken.equals(token)) {
            log.warn("내부 자격증명 요청 인증 실패 | target={}", botTarget);
            return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        }

        try {
            var creds = service.getActiveCredentials(operatorMemberId, exchange, botTarget);
            if (creds == null) {
                return ResponseEntity.status(404).body(Map.of("error", "active credentials not found"));
            }
            return ResponseEntity.ok(Map.of(
                    "apiKey", creds.apiKey(),
                    "secretKey", creds.secretKey(),
                    "passphrase", creds.passphrase()));
        } catch (Exception e) {
            log.error("내부 자격증명 조회 실패 | target={}", botTarget, e);
            return ResponseEntity.internalServerError().body(Map.of("error", "internal error"));
        }
    }

    /**
     * 멀티유저 통합 워커용 — 임의 회원의 슬롯별 활성 키 반환.
     * operator 고정인 /{botTarget} 과 달리 memberId를 명시한다.
     */
    @GetMapping("/by-member")
    public ResponseEntity<?> getByMember(
            @RequestParam String memberId,
            @RequestParam(defaultValue = "BITGET") String exchange,
            @RequestParam String botTarget,
            @RequestHeader(value = "X-Internal-Token", required = false) String token) {

        if (internalToken == null || internalToken.isBlank() || "change-me".equals(internalToken)
                || !internalToken.equals(token)) {
            log.warn("내부 자격증명(by-member) 요청 인증 실패 | member={} target={}", memberId, botTarget);
            return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        }

        try {
            var creds = service.getActiveCredentials(memberId, exchange, botTarget);
            if (creds == null) {
                return ResponseEntity.status(404).body(Map.of("error", "active credentials not found"));
            }
            return ResponseEntity.ok(Map.of(
                    "apiKey", creds.apiKey(),
                    "secretKey", creds.secretKey(),
                    "passphrase", creds.passphrase()));
        } catch (Exception e) {
            log.error("내부 자격증명(by-member) 조회 실패 | member={} target={}", memberId, botTarget, e);
            return ResponseEntity.internalServerError().body(Map.of("error", "internal error"));
        }
    }

    /** 전체 키 재암호화 (키 회전용). X-Internal-Token 필요. */
    @PostMapping("/reencrypt")
    public ResponseEntity<?> reencrypt(
            @RequestHeader(value = "X-Internal-Token", required = false) String token) {
        if (internalToken == null || internalToken.isBlank() || "change-me".equals(internalToken)
                || !internalToken.equals(token)) {
            return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        }
        try {
            int n = service.reEncryptAll();
            return ResponseEntity.ok(Map.of("reencrypted", n));
        } catch (Exception e) {
            log.error("재암호화 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "internal error"));
        }
    }
}
