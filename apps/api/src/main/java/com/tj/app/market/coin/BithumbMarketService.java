package com.tj.app.market.coin;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Collections;

/**
 * [클래스 읽기] Bithumb 거래소 API 전용 서비스.
 * 원화(KRW) 기준 시세 등을 담당합니다.
 */
@Slf4j
@Service
public class BithumbMarketService extends AbstractMarketService {

    public Object getBithumbTicker(String orderCurrency, String paymentCurrency) {
        String cacheKey = "bithumb_" + orderCurrency + "_" + paymentCurrency;
        if (isCacheValid(cacheKey)) return cache.get(cacheKey);

        try {
            WebClient client = WebClient.builder().baseUrl("https://api.bithumb.com").build();
            Object data = client.get()
                    .uri("/public/ticker/" + orderCurrency + "_" + paymentCurrency)
                    .retrieve()
                    .bodyToMono(Object.class)
                    .block(Duration.ofSeconds(3));

            if (data != null) {
                putCache(cacheKey, data, 2); // 2초 캐시
                return data;
            }
        } catch (Exception e) {
            log.warn("⚠️ Bithumb Ticker 조회 실패: {}", e.getMessage());
        }
        return Collections.emptyMap();
    }
}
