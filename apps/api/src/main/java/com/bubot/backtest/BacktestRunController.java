package com.bubot.backtest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import com.bubot.common.security.CurrentUser;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/user/backtest-runs")
@RequiredArgsConstructor
public class BacktestRunController {

    private final BacktestRunService service;

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(defaultValue = "50") int limit) {
        try {
            List<BacktestRunDTO> runs = service.list(CurrentUser.username(), limit);
            return ResponseEntity.ok(Map.of("runs", runs));
        } catch (Exception e) {
            log.error("백테스트 이력 조회 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "조회 중 오류가 발생했습니다."));
        }
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody BacktestRunDTO dto) {
        try {
            service.create(CurrentUser.username(), dto);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("백테스트 이력 저장 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "저장 중 오류가 발생했습니다."));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        try {
            boolean ok = service.delete(CurrentUser.username(), id);
            if (!ok) return ResponseEntity.status(404).body(Map.of("error", "이력을 찾을 수 없습니다."));
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("백테스트 이력 삭제 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "삭제 중 오류가 발생했습니다."));
        }
    }
}
