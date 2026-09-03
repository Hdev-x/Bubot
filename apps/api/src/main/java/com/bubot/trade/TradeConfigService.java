package com.bubot.trade;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class TradeConfigService {

    private final TradeConfigMapper mapper;

    private static final Set<String> STRATEGIES = Set.of("OB", "FVG", "BB", "HARMONIC", "ABCD");
    // 봇(키 슬롯) — MAIN은 수동 전용이라 자동매매 설정 대상에서 제외
    private static final Set<String> BOT_TARGETS = Set.of(
            "SOL", "NEAR", "LTC", "WLD", "INJ", "BTC", "1000SHIB");

    public List<TradeConfigDTO> list(String memberId) {
        return mapper.selectByMemberId(memberId);
    }

    /** 신규 설정 저장 (검증 후 INSERT). 생성 직후엔 비활성(IDLE). */
    public TradeConfigDTO create(String memberId, TradeConfigDTO dto) {
        normalizeAndValidate(dto);
        dto.setMemberId(memberId);
        dto.setActive(false);
        dto.setStatus("IDLE");
        try {
            if (mapper.insert(dto) == 0) throw new RuntimeException("설정 저장 실패");
        } catch (DuplicateKeyException e) {
            throw new IllegalArgumentException("이미 해당 심볼의 설정이 있습니다: " + dto.getSymbol());
        }
        log.info("매매설정 생성 | member={} symbol={} strategy={}", memberId, dto.getSymbol(), dto.getStrategy());
        return dto;
    }

    /** 설정 수정 (전략/파라미터/투자금/레버리지/손실한도) */
    public boolean update(String memberId, Integer id, TradeConfigDTO dto) {
        normalizeAndValidate(dto);
        dto.setId(id);
        dto.setMemberId(memberId);
        return mapper.updateByIdAndMemberId(dto) > 0;
    }

    /** 활성/비활성 토글. 활성화 시 status=RUNNING, 비활성 시 IDLE. */
    public boolean setActive(String memberId, Integer id, boolean active) {
        TradeConfigDTO cur = mapper.selectByIdAndMemberId(id, memberId);
        if (cur == null) return false;
        String status = active ? "RUNNING" : "IDLE";
        return mapper.setActive(id, memberId, active, status) > 0;
    }

    public boolean delete(String memberId, Integer id) {
        return mapper.deleteByIdAndMemberId(id, memberId) > 0;
    }

    private void normalizeAndValidate(TradeConfigDTO dto) {
        if (dto.getExchange() == null || dto.getExchange().isBlank()) dto.setExchange("BITGET");
        if (dto.getStrategy() == null || dto.getStrategy().isBlank()) dto.setStrategy("OB");
        if (dto.getParams() == null || dto.getParams().isBlank()) dto.setParams("{}");
        if (dto.getLeverage() == null) dto.setLeverage(5);
        if (dto.getBotTarget() == null || dto.getBotTarget().isBlank()) dto.setBotTarget("SOL");

        // 심볼은 *USDT 형식만 검증 (키1개로 다수 종목 운용 — 고정 목록 제약 없음)
        if (dto.getSymbol() == null || !dto.getSymbol().matches("[A-Z0-9]+USDT")) {
            throw new IllegalArgumentException("지원하지 않는 심볼입니다: " + dto.getSymbol());
        }
        if (!BOT_TARGETS.contains(dto.getBotTarget())) {
            throw new IllegalArgumentException("지원하지 않는 봇입니다: " + dto.getBotTarget());
        }
        if (!STRATEGIES.contains(dto.getStrategy())) {
            throw new IllegalArgumentException("지원하지 않는 전략입니다: " + dto.getStrategy());
        }
        if (dto.getMaxLossPct() == null || dto.getMaxLossPct().signum() <= 0) {
            throw new IllegalArgumentException("최대손실%는 0보다 큰 값이어야 합니다.");
        }
        if (dto.getInvestUsdt() == null || dto.getInvestUsdt().signum() <= 0) {
            throw new IllegalArgumentException("투자금은 0보다 커야 합니다.");
        }
        if (dto.getLeverage() < 1 || dto.getLeverage() > 125) {
            throw new IllegalArgumentException("레버리지는 1~125 사이여야 합니다.");
        }
        // 잔고 대비 invest_usdt 합 검증은 거래소 조회가 필요하므로 trader 워커(부팅 가드)에서 수행한다.
    }
}
