package com.tj.app.member;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

/**
 * 프론트엔드 API 키 요청/응답 DTO.
 * POST 요청 시 apiKey, secretKey, passphrase, label을 받고,
 * GET 응답 시 id, exchange, maskedApiKey, label, active, createdAt만 반환한다.
 * secretKey와 passphrase는 절대 프론트에 노출하지 않음.
 */
@Getter
@Setter
@ToString
public class BotApiKeyDTO {
    // ── 응답 필드 ──
    private Integer id;
    private String memberId;      // 내부용 — 프론트엔드에 노출 안 함
    private String exchange;
    private String botTarget;     // 봇 슬롯 (MAIN / SOL / NEAR / LTC / WLD / INJ / BTC / 1000SHIB)
    private String maskedApiKey;
    private String label;
    private Boolean active;
    private String createdAt;

    // ── 요청 필드 (저장 시에만 사용) ──
    private String apiKey;
    private String secretKey;
    private String passphrase;
}