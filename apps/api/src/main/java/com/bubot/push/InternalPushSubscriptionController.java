package com.bubot.push;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/internal/push-subscriptions")
@RequiredArgsConstructor
public class InternalPushSubscriptionController {

    private final PushSubscriptionService service;

    @Value("${app.bot.api-token}")
    private String internalToken;

    @GetMapping
    public ResponseEntity<?> getSubscriptions(
            @RequestParam(required = false) String memberId,
            @RequestHeader(value = "X-Internal-Token", required = false) String token) {

        if (internalToken == null || internalToken.isBlank() || "change-me".equals(internalToken)
                || !internalToken.equals(token)) {
            log.warn("내부 푸시 구독 조회 요청 인증 실패");
            return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        }

        try {
            List<PushSubscriptionDTO> subscriptions = service.getSubscriptions(memberId);
            return ResponseEntity.ok(Map.of("subscriptions", subscriptions));
        } catch (Exception e) {
            log.error("내부 푸시 구독 조회 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "internal error"));
        }
    }
}
