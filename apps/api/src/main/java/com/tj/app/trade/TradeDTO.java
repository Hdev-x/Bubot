package com.tj.app.trade;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.math.BigDecimal;

/**
 * 청산 체결 1건 기록 DTO.
 * 시각(entryTime/exitTime)은 epoch 초(Long)로 주고받는다 — 워커(Node)와 단위 통일.
 */
@Getter
@Setter
@ToString
public class TradeDTO {
    private Long id;
    private Integer configId;
    private String memberId;
    private String symbol;
    private String direction;      // long | short
    private BigDecimal entryPrice;
    private BigDecimal exitPrice;
    private BigDecimal size;
    private BigDecimal pnlUsdt;
    private String outcome;        // tp | sl1 | sl2 | sl3 | timeout | stopped
    private Long entryTime;        // epoch 초
    private Long exitTime;         // epoch 초
    private String tags;           // F4 매매당 태깅 JSON (패턴/신호시각/own50 등) — nullable
}
