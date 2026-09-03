package com.tj.app.trade.paper;

import lombok.Getter;
import lombok.Setter;

/** 모의투자 보유 포지션 1건. markPrice/평가손익은 프론트가 실시간가로 계산(서버는 진입 정보만 보관). */
@Getter
@Setter
public class PaperPositionDTO {
    private Integer id;
    private String memberId;   // 내부용
    private String symbol;     // BTCUSDT 등
    private String direction;  // long | short
    private double entryPrice;
    private double size;       // 코인 수량
    private int leverage;
    private double margin;     // 투입 증거금(USDT)
    private String openedAt;
}
