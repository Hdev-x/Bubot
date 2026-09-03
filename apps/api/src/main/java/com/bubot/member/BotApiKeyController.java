package com.bubot.member;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import com.bubot.common.security.CurrentUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/user/api-keys")
@RequiredArgsConstructor
public class BotApiKeyController {

    private final BotApiKeyService service;

    /** 저장된 API 키 목록 조회 (마스킹 처리) */
    @GetMapping
    public ResponseEntity<?> list() {
        try {
            String username = CurrentUser.username();
            List<BotApiKeyDTO> keys = service.getKeys(username);
            return ResponseEntity.ok(Map.of("keys", keys));
        } catch (Exception e) {
            log.error("API 키 목록 조회 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "API 키 조회 중 오류가 발생했습니다."));
        }
    }

    /** 새 API 키 저장 */
    @PostMapping
    public ResponseEntity<?> save(@RequestBody BotApiKeyDTO dto) {
        try {
            if (dto.getApiKey() == null || dto.getApiKey().isBlank()
                    || dto.getSecretKey() == null || dto.getSecretKey().isBlank()
                    || dto.getPassphrase() == null || dto.getPassphrase().isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "API 키, Secret 키, Passphrase는 필수입니다."));
            }

            String username = CurrentUser.username();
            dto.setMemberId(username);
            service.saveKey(username, dto, isAdmin());
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("API 키 저장 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "API 키 저장 중 오류가 발생했습니다."));
        }
    }

    /** 지정한 API 키를 활성화 (같은 거래소의 나머지는 비활성화) */
    @PutMapping("/{id}/activate")
    public ResponseEntity<?> activate(@PathVariable Integer id) {
        try {
            String username = CurrentUser.username();
            boolean ok = service.activateKey(username, id);
            if (!ok) {
                return ResponseEntity.status(404).body(Map.of("error", "해당 API 키를 찾을 수 없습니다."));
            }
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("API 키 활성화 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "API 키 활성화 중 오류가 발생했습니다."));
        }
    }

    /** API 키 삭제 */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Integer id) {
        try {
            String username = CurrentUser.username();
            boolean deleted = service.deleteKey(username, id);
            if (!deleted) {
                return ResponseEntity.status(404).body(Map.of("error", "해당 API 키를 찾을 수 없습니다."));
            }
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("API 키 삭제 실패", e);
            return ResponseEntity.internalServerError().body(Map.of("error", "API 키 삭제 중 오류가 발생했습니다."));
        }
    }


    /** 현재 사용자가 ADMIN 권한인지 */
    private boolean isAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) return false;
        return auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }
}