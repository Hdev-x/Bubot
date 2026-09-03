package com.bubot.push;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import com.bubot.common.security.CurrentUser;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/user/push")
@RequiredArgsConstructor
public class PushController {

    private final PushSubscriptionService service;

    @PostMapping("/subscribe")
    public ResponseEntity<?> subscribe(@RequestBody PushSubscriptionDTO dto) {
        try {
            dto.setMemberId(CurrentUser.username());
            service.saveSubscription(dto);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("푸시 구독 저장 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "구독 저장 중 오류가 발생했습니다."));
        }
    }
}
