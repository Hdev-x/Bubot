package com.tj.app.trade;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

/**
 * 사용자 입력 현물 매수평균가 DTO. (member_id, exchange, coin) 단위.
 * 조회 시 coin + avgCost만 사용한다.
 */
@Getter
@Setter
@ToString
public class SpotManualCostDTO {
    private String coin;     // 'SOL' 등
    private double avgCost;  // 사용자 입력 매수평균가(USDT)
}
