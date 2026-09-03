package com.bubot.trade.paper;

import org.springframework.context.annotation.Profile;

import com.bubot.market.coin.CoinMarketService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 모의투자 지정가 체결 루프 — 1.5초마다 미체결 주문을 현재가와 비교해 닿은 것만 체결(→포지션).
 * 롱 지정가: 현재가 ≤ 지정가 / 숏 지정가: 현재가 ≥ 지정가. 현재가는 Bitget 티커맵(MVP: Bitget USDT 기준).
 * 대기 주문 0건이면 즉시 return이라 부하 거의 없음.
 */
@Slf4j
@Profile("trading") // trading 프로필에서만 등록. Beta(프로필 없음)에서는 제외 (wp-02 d03)
@Service
@RequiredArgsConstructor
public class PaperFillService {

    private final PaperMapper mapper;
    private final PaperService paperService;
    private final CoinMarketService market;

    @Scheduled(fixedDelay = 1500)
    public void fillPending() {
        List<PaperOrderDTO> pending;
        try { pending = mapper.selectAllPending(); } catch (Exception e) { return; }
        if (pending == null || pending.isEmpty()) return;

        Map<String, Double> prices;
        try { prices = market.getTickerPriceMap(); } catch (Exception e) { return; }
        if (prices == null || prices.isEmpty()) return;

        for (PaperOrderDTO o : pending) {
            Double px = prices.get(o.getSymbol());
            if (px == null) continue; // 가격소스에 없는 심볼(타거래소 등)은 이번 MVP 미지원
            boolean hit = "long".equals(o.getDirection()) ? px <= o.getLimitPrice() : px >= o.getLimitPrice();
            if (!hit) continue;
            try {
                paperService.fillOrder(o); // markFilled(중복가드) + 포지션 생성
            } catch (Exception e) {
                log.warn("페이퍼 지정가 체결 실패 id={}", o.getId(), e);
            }
        }
    }
}
