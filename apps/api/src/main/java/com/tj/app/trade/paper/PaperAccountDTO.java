package com.tj.app.trade.paper;

import lombok.Getter;
import lombok.Setter;

/** 모의투자 가상계좌 — 가용 USDT 잔고. (페이퍼 머니라 double로 충분) */
@Getter
@Setter
public class PaperAccountDTO {
    private String memberId;   // 내부용(프론트 노출 안 함)
    private double balance;    // 자유 잔고(USDT)
    private double peakEquity; // 실현 에쿼티(잔고+잠긴 증거금) 역대 고점 — 워커 리스크 엔진 DD 기준
}
