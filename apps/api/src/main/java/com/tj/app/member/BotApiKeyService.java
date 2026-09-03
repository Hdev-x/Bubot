package com.tj.app.member;

import com.tj.app.common.security.EncryptionUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class BotApiKeyService {

    private final BotApiKeyMapper mapper;

    /** 유효한 봇 슬롯 — MAIN + Bot 1~7 심볼 */
    private static final Set<String> VALID_TARGETS = Set.of(
            "MAIN", "SOL", "NEAR", "LTC", "WLD", "INJ", "BTC", "1000SHIB");

    /** 새 API 키 저장 (제한/중복 검사 → 암호화 → 슬롯 활성키 해제 → DB INSERT) */
    public BotApiKeyDTO saveKey(String memberId, BotApiKeyDTO dto, boolean isAdmin) throws Exception {
        String exchange = dto.getExchange() != null ? dto.getExchange() : "BITGET";
        String botTarget = dto.getBotTarget() != null ? dto.getBotTarget() : "MAIN";
        String plainApiKey = dto.getApiKey();

        if (!VALID_TARGETS.contains(botTarget)) {
            throw new IllegalArgumentException("유효하지 않은 봇 슬롯입니다: " + botTarget);
        }
        // 봇 슬롯 지정은 admin 전용 — 일반 사용자는 MAIN만
        if (!isAdmin && !"MAIN".equals(botTarget)) {
            throw new IllegalArgumentException("봇 슬롯 지정은 운영자만 가능합니다.");
        }

        List<BotApiKeyDTO> sameExchange = mapper.selectByMemberId(memberId).stream()
                .filter(k -> exchange.equals(k.getExchange()))
                .collect(Collectors.toList());

        // 일반 사용자는 거래소당 1개까지 (admin은 무제한)
        if (!isAdmin && !sameExchange.isEmpty()) {
            throw new IllegalArgumentException("일반 사용자는 거래소당 1개의 API 키만 등록할 수 있습니다.");
        }

        // 같은 거래소에 동일 API Key가 이미 있으면 거부
        boolean duplicate = sameExchange.stream()
                .anyMatch(k -> plainApiKey.equals(EncryptionUtil.decrypt(k.getApiKey())));
        if (duplicate) {
            throw new IllegalArgumentException("이미 등록된 API 키입니다.");
        }

        dto.setApiKey(EncryptionUtil.encrypt(plainApiKey));
        dto.setSecretKey(EncryptionUtil.encrypt(dto.getSecretKey()));
        dto.setPassphrase(EncryptionUtil.encrypt(dto.getPassphrase()));
        dto.setExchange(exchange);
        dto.setBotTarget(botTarget);

        // 같은 슬롯의 활성 키는 1개 — 해당 슬롯 키만 비활성화 후 새 키를 활성으로 INSERT
        mapper.deactivateByMemberExchangeAndTarget(memberId, exchange, botTarget);

        int rows = mapper.insert(dto);
        if (rows == 0) throw new RuntimeException("API 키 저장 실패");

        log.info("API 키 저장 완료 | member={} exchange={} target={}", memberId, exchange, botTarget);
        return dto;
    }

    /** 지정한 키를 활성화하고 같은 슬롯의 나머지 키는 비활성화 */
    public boolean activateKey(String memberId, Integer keyId) throws Exception {
        BotApiKeyDTO key = mapper.selectByIdAndMemberId(keyId, memberId);
        if (key == null) return false;

        mapper.deactivateByMemberExchangeAndTarget(memberId, key.getExchange(), key.getBotTarget());
        mapper.activateByIdAndMemberId(keyId, memberId);
        log.info("API 키 활성화 | member={} keyId={} target={}", memberId, keyId, key.getBotTarget());
        return true;
    }

    /** 사용자의 저장된 API 키 목록 (복호화 → 마스킹 처리 후 반환) */
    public List<BotApiKeyDTO> getKeys(String memberId) throws Exception {
        List<BotApiKeyDTO> keys = mapper.selectByMemberId(memberId);
        return keys.stream().map(key -> {
            String decrypted = EncryptionUtil.decrypt(key.getApiKey());
            key.setMaskedApiKey(EncryptionUtil.mask(decrypted));
            key.setApiKey(null);
            key.setSecretKey(null);
            key.setPassphrase(null);
            return key;
        }).collect(Collectors.toList());
    }

    /** 복호화된 봇 자격증명 (내부 전용) */
    public record BotCredentials(String apiKey, String secretKey, String passphrase) {}

    /**
     * 슬롯의 활성 키를 복호화해 반환 (봇 프로세스 자격증명 주입용).
     * 내부 전용 — 절대 사용자 응답 경로로 노출하지 말 것.
     */
    public BotCredentials getActiveCredentials(String memberId, String exchange, String botTarget) throws Exception {
        BotApiKeyDTO key = mapper.selectActiveByMemberExchangeAndTarget(memberId, exchange, botTarget);
        if (key == null) return null;
        return new BotCredentials(
                EncryptionUtil.decrypt(key.getApiKey()),
                EncryptionUtil.decrypt(key.getSecretKey()),
                EncryptionUtil.decrypt(key.getPassphrase()));
    }

    /**
     * 전체 키 재암호화 (키 회전용).
     * 현재 등록된 모든 키를 복호화(legacy 키 포함 시도) 후 primary 키로 다시 암호화한다.
     * APP_ENCRYPTION_KEY를 "NEW,OLD"로 설정해 기동한 뒤 1회 호출하면 OLD 의존을 제거할 수 있다.
     * @return 재암호화한 행 수
     */
    public int reEncryptAll() throws Exception {
        List<BotApiKeyDTO> all = mapper.selectAll();
        int n = 0;
        for (BotApiKeyDTO k : all) {
            BotApiKeyDTO upd = new BotApiKeyDTO();
            upd.setId(k.getId());
            upd.setApiKey(EncryptionUtil.encrypt(EncryptionUtil.decrypt(k.getApiKey())));
            upd.setSecretKey(EncryptionUtil.encrypt(EncryptionUtil.decrypt(k.getSecretKey())));
            upd.setPassphrase(EncryptionUtil.encrypt(EncryptionUtil.decrypt(k.getPassphrase())));
            mapper.updateEnc(upd);
            n++;
        }
        log.info("재암호화 완료 | {} 건", n);
        return n;
    }

    /** API 키 삭제 (소유자 확인 후) */
    public boolean deleteKey(String memberId, Integer keyId) throws Exception {
        int rows = mapper.deleteByIdAndMemberId(keyId, memberId);
        if (rows == 0) return false;
        log.info("API 키 삭제 완료 | member={} keyId={}", memberId, keyId);
        return true;
    }
}