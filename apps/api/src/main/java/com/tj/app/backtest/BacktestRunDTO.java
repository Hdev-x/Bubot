package com.tj.app.backtest;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

/**
 * 백테스트 실험 이력 DTO.
 * config는 shared/strategy-schema.ts StrategyConfig JSON,
 * report는 utils/backtestReport.ts BacktestReport JSON 문자열.
 */
@Getter
@Setter
@ToString
public class BacktestRunDTO {
    private Integer id;
    private String memberId;     // 내부용 — 프론트 노출 안 함
    private String name;         // 사람용 라벨
    private String config;       // 전략 스키마 JSON 문자열
    private String symbols;      // 심볼 배열 JSON 문자열
    private String rangeStart;   // 'YYYY-MM-DD' (없으면 전체 기간)
    private String rangeEnd;     // 실행 시점 기준 마지막 캔들
    private String report;       // 표준 리포트 JSON 문자열
    private String configHash;   // config+symbols+range 해시
    private String createdAt;
}
