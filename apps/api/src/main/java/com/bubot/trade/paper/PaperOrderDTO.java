package com.bubot.trade.paper;

import lombok.Getter;
import lombok.Setter;

/** 모의투자 지정가 미체결 주문 1건. 서버 루프가 현재가가 지정가에 닿으면 체결(→포지션). */
@Getter
@Setter
public class PaperOrderDTO {
    private Integer id;
    private String memberId;
    private String symbol;
    private String direction;   // long | short
    private double limitPrice;
    private double size;        // 체결 시 수량(증거금×레버리지/지정가)
    private int leverage;
    private double margin;      // 주문 시 잠근 증거금(USDT)
    private String status;      // pending | filled | canceled
    private String createdAt;
}
