package com.tj.app.trade.paper;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 모의투자(페이퍼 트레이딩) 로직 — 가상 잔고로 시장가 진입/청산.
 * 체결가는 클라이언트가 보는 실시간가를 받아 사용(페이퍼 머니라 신뢰성 부담 작음, 서버 가격소스 일원화는 후속 하드닝).
 * 평가손익/총자산은 프론트가 실시간가로 계산 — 서버는 진입 정보와 잔고만 보관.
 */
@Service
@RequiredArgsConstructor
public class PaperService {

    private static final double DEFAULT_BALANCE = 10000d; // 신규 가상계좌 기본 잔고(USDT)
    private final PaperMapper mapper;

    /** 계좌 없으면 기본 잔고로 생성 후 반환. */
    @Transactional
    public PaperAccountDTO ensureAccount(String memberId) {
        PaperAccountDTO acc = mapper.selectAccount(memberId);
        if (acc == null) {
            mapper.insertAccount(memberId, DEFAULT_BALANCE);
            acc = mapper.selectAccount(memberId);
        }
        return acc;
    }

    /** { balance, positions, orders(미체결 지정가) } — 평가손익/총자산은 프론트에서 실시간가로 계산. */
    @Transactional
    public Map<String, Object> overview(String memberId) {
        PaperAccountDTO acc = ensureAccount(memberId);
        Map<String, Object> m = new HashMap<>();
        m.put("balance", acc.getBalance());
        m.put("peakEquity", acc.getPeakEquity()); // 실현 에쿼티 고점 — 프론트 DD/감속 단계 표시용
        m.put("positions", mapper.selectPositions(memberId));
        m.put("orders", mapper.selectOrders(memberId));
        return m;
    }

    /** 시장가 진입 — 증거금 차감 후 포지션 생성. size = 증거금×레버리지/진입가. */
    @Transactional
    public Map<String, Object> placeOrder(String memberId, String symbol, String direction,
                                          double marginUsdt, int leverage, double price) {
        openMarket(memberId, symbol, direction, marginUsdt, leverage, price);
        return overview(memberId);
    }

    /** 시장가 진입(내부 공용) — 생성된 포지션(id 포함) 반환. 워커 페이퍼 경로가 사용. */
    @Transactional
    public PaperPositionDTO openMarket(String memberId, String symbol, String direction,
                                       double marginUsdt, int leverage, double price) {
        if (!"long".equals(direction) && !"short".equals(direction)) throw new IllegalArgumentException("방향(long/short)이 올바르지 않음");
        if (symbol == null || symbol.isBlank() || marginUsdt <= 0 || leverage < 1 || price <= 0) throw new IllegalArgumentException("주문 값이 올바르지 않음");
        PaperAccountDTO acc = ensureAccount(memberId);
        if (acc.getBalance() < marginUsdt) throw new IllegalStateException("잔고 부족");

        PaperPositionDTO pos = new PaperPositionDTO();
        pos.setMemberId(memberId);
        pos.setSymbol(symbol);
        pos.setDirection(direction);
        pos.setEntryPrice(price);
        pos.setSize(marginUsdt * leverage / price);
        pos.setLeverage(leverage);
        pos.setMargin(marginUsdt);
        mapper.insertPosition(pos);
        mapper.addBalance(memberId, -marginUsdt);
        return pos;
    }

    /** 지정가 주문 — 증거금을 잠그고(잔고 차감) 미체결로 등록. 체결은 서버 루프(PaperFillService)가. */
    @Transactional
    public Map<String, Object> placeLimit(String memberId, String symbol, String direction,
                                          double marginUsdt, int leverage, double limitPrice) {
        if (!"long".equals(direction) && !"short".equals(direction)) throw new IllegalArgumentException("방향(long/short)이 올바르지 않음");
        if (symbol == null || symbol.isBlank() || marginUsdt <= 0 || leverage < 1 || limitPrice <= 0) throw new IllegalArgumentException("주문 값이 올바르지 않음");
        PaperAccountDTO acc = ensureAccount(memberId);
        if (acc.getBalance() < marginUsdt) throw new IllegalStateException("잔고 부족");

        PaperOrderDTO o = new PaperOrderDTO();
        o.setMemberId(memberId);
        o.setSymbol(symbol);
        o.setDirection(direction);
        o.setLimitPrice(limitPrice);
        o.setSize(marginUsdt * leverage / limitPrice);
        o.setLeverage(leverage);
        o.setMargin(marginUsdt);
        mapper.insertOrder(o);
        mapper.addBalance(memberId, -marginUsdt); // 증거금 잠금
        return overview(memberId);
    }

    /** 미체결 지정가 취소 — 잠근 증거금 환원. */
    @Transactional
    public Map<String, Object> cancelOrder(String memberId, Integer orderId) {
        PaperOrderDTO o = mapper.selectPendingOrder(orderId, memberId);
        if (o == null) throw new IllegalStateException("취소할 주문을 찾을 수 없음");
        if (mapper.cancelOrder(orderId, memberId) > 0) {
            mapper.addBalance(memberId, o.getMargin()); // 증거금 환원
        }
        return overview(memberId);
    }

    /** 체결 루프가 호출 — 미체결 주문을 포지션으로 전환(증거금은 주문 시 이미 잠겨 잔고 변동 없음). */
    @Transactional
    public void fillOrder(PaperOrderDTO o) {
        if (mapper.markFilled(o.getId()) == 0) return; // 다른 루프가 선점했으면 스킵(중복 체결 방지)
        PaperPositionDTO pos = new PaperPositionDTO();
        pos.setMemberId(o.getMemberId());
        pos.setSymbol(o.getSymbol());
        pos.setDirection(o.getDirection());
        pos.setEntryPrice(o.getLimitPrice());
        pos.setSize(o.getSize());
        pos.setLeverage(o.getLeverage());
        pos.setMargin(o.getMargin());
        mapper.insertPosition(pos);
    }

    /** 시장가 청산 — 증거금 + 실현손익을 잔고로 환원 후 포지션 삭제. 실현손익 반환. */
    @Transactional
    public double closeMarket(String memberId, Integer positionId, double price) {
        if (price <= 0) throw new IllegalArgumentException("청산가가 올바르지 않음");
        PaperPositionDTO pos = mapper.selectPosition(positionId, memberId);
        if (pos == null) throw new IllegalStateException("포지션을 찾을 수 없음");
        double dir = "long".equals(pos.getDirection()) ? 1 : -1;
        double pnl = (price - pos.getEntryPrice()) * pos.getSize() * dir;
        mapper.addBalance(memberId, pos.getMargin() + pnl);
        mapper.deletePosition(positionId, memberId);
        mapper.bumpPeakEquity(memberId); // 실현 에쿼티 고점 갱신(리스크 엔진 DD 기준)
        return pnl;
    }

    /** 시장가 청산(기존 REST 경로) — overview 반환. */
    @Transactional
    public Map<String, Object> closePosition(String memberId, Integer positionId, double price) {
        closeMarket(memberId, positionId, price);
        return overview(memberId);
    }

    /** 부분 청산 — fraction(0~1)만큼 size/margin 축소, 해당분 증거금+손익 환원. 실현손익 반환. */
    @Transactional
    public double closePartial(String memberId, Integer positionId, double price, double fraction) {
        if (price <= 0) throw new IllegalArgumentException("청산가가 올바르지 않음");
        if (fraction <= 0 || fraction >= 1) throw new IllegalArgumentException("청산 비율(0~1)이 올바르지 않음");
        PaperPositionDTO pos = mapper.selectPosition(positionId, memberId);
        if (pos == null) throw new IllegalStateException("포지션을 찾을 수 없음");
        double dir = "long".equals(pos.getDirection()) ? 1 : -1;
        double pnl = (price - pos.getEntryPrice()) * pos.getSize() * fraction * dir;
        mapper.addBalance(memberId, pos.getMargin() * fraction + pnl);
        mapper.reducePosition(positionId, memberId, 1 - fraction);
        mapper.bumpPeakEquity(memberId);
        return pnl;
    }

    /** 계좌 초기화 — 포지션 전부 삭제 + 잔고 기본값. */
    @Transactional
    public Map<String, Object> reset(String memberId) {
        ensureAccount(memberId);
        mapper.deleteAllPositions(memberId);
        mapper.deleteAllOrders(memberId);
        mapper.setBalance(memberId, DEFAULT_BALANCE);
        return overview(memberId);
    }
}
