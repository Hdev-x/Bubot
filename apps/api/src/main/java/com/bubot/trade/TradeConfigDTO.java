package com.bubot.trade;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.math.BigDecimal;

/**
 * 사용자 자동매매 설정 DTO.
 * params는 SignalEngineParams 부분집합을 담은 JSON 문자열.
 */
@Getter
@Setter
@ToString
public class TradeConfigDTO {
    private Integer id;
    private String memberId;        // 내부용 — 프론트 노출 안 함
    private String exchange;        // 기본 BITGET
    private String symbol;          // SOLUSDT 등
    private String botTarget;       // 이 설정을 돌릴 봇(키 슬롯): SOL(Bot1)|NEAR(Bot2)|... 키1개=전략1개
    private String strategy;        // OB | FVG | BB | HARMONIC | ABCD
    private String params;          // JSON 문자열 (tpPercent, slPercent, longOnly ...)
    private BigDecimal investUsdt;  // 설정별 고정 투자금
    private Integer leverage;
    private BigDecimal maxLossPct;  // 최대손실%(필수)
    private Boolean active;
    private String status;          // IDLE|RUNNING|STOPPED_LOSS|ERROR|KILLED
    private BigDecimal realizedPnl;
    private String createdAt;
    private String updatedAt;
}
