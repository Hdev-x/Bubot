package com.bubot.trade;

import org.springframework.context.annotation.Profile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import com.bubot.common.security.CurrentUser;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@Profile("trading") // trading 프로필에서만 등록. Beta(프로필 없음)에서는 제외 (wp-02 d03)
@RestController
@RequestMapping("/api/user/trade-configs")
@RequiredArgsConstructor
public class TradeConfigController {

    private final TradeConfigService service;

    @GetMapping
    public ResponseEntity<?> list() {
        try {
            List<TradeConfigDTO> configs = service.list(CurrentUser.username());
            return ResponseEntity.ok(Map.of("configs", configs));
        } catch (Exception e) {
            log.error("매매설정 목록 조회 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "조회 중 오류가 발생했습니다."));
        }
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody TradeConfigDTO dto) {
        try {
            service.create(CurrentUser.username(), dto);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("매매설정 생성 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "저장 중 오류가 발생했습니다."));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Integer id, @RequestBody TradeConfigDTO dto) {
        try {
            boolean ok = service.update(CurrentUser.username(), id, dto);
            if (!ok) return ResponseEntity.status(404).body(Map.of("error", "설정을 찾을 수 없습니다."));
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("매매설정 수정 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "수정 중 오류가 발생했습니다."));
        }
    }

    /** 활성/비활성 토글 — body { "active": true } */
    @PutMapping("/{id}/active")
    public ResponseEntity<?> setActive(@PathVariable Integer id, @RequestBody Map<String, Boolean> body) {
        try {
            boolean active = Boolean.TRUE.equals(body.get("active"));
            boolean ok = service.setActive(CurrentUser.username(), id, active);
            if (!ok) return ResponseEntity.status(404).body(Map.of("error", "설정을 찾을 수 없습니다."));
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("매매설정 활성화 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "활성화 중 오류가 발생했습니다."));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        try {
            boolean ok = service.delete(CurrentUser.username(), id);
            if (!ok) return ResponseEntity.status(404).body(Map.of("error", "설정을 찾을 수 없습니다."));
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("매매설정 삭제 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "삭제 중 오류가 발생했습니다."));
        }
    }
}
