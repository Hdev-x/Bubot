package com.tj.app.market.coin;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * [클래스 읽기] CoinGecko API 전용 서비스.
 * 코인 로고 이미지와 시가총액 등의 부가 정보를 수집합니다.
 */
@Slf4j
@Service
public class CoinGeckoMarketService extends AbstractMarketService {

    private final WebClient geckoClient;

    public CoinGeckoMarketService() {
        this.geckoClient = WebClient.builder()
                .baseUrl("https://api.coingecko.com")
                .build();
    }

    public Object getExtraStats(String ticker) {
        String cacheKey = "gecko_" + ticker.toLowerCase();
        if (isCacheValid(cacheKey)) {
            return cache.get(cacheKey);
        }

        try {
            Object data = geckoClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v3/coins/markets")
                            .queryParam("vs_currency", "usd")
                            .queryParam("symbols", ticker.toLowerCase())
                            .queryParam("order", "market_cap_desc")
                            .queryParam("per_page", "1")
                            .queryParam("page", "1")
                            .queryParam("sparkline", "false")
                            .build())
                    .retrieve()
                    .bodyToMono(Object.class)
                    .block(Duration.ofSeconds(5));

            if (data != null) {
                putCache(cacheKey, data, 600); // 10분 캐시
                return data;
            }
        } catch (Exception e) {
            log.warn("⚠️ CoinGecko 조회 실패 (정상 동작 중 429 가능성 높음): {}", e.getMessage());
        }
        return Collections.emptyList();
    }

    @SuppressWarnings("unchecked")
    public Map<String, String> getLogos() {
        String cacheKey = "gecko_logos";
        if (isCacheValid(cacheKey)) return (Map<String, String>) cache.get(cacheKey);

        Map<String, String> result = new HashMap<>();

        // 시총 상위 6페이지(250×6=1500개)까지 수집해 로고 커버리지 확대.
        // 페이지는 market_cap_desc 순이므로 putIfAbsent로 "심볼당 최고 시총" 로고를 유지(저시총이 덮어쓰지 않게).
        for (int page = 1; page <= 6; page++) {
            final int p = page;
            try {
                List<Map<String, Object>> data = geckoClient.get()
                        .uri(ub -> ub.path("/api/v3/coins/markets")
                                .queryParam("vs_currency", "usd")
                                .queryParam("order", "market_cap_desc")
                                .queryParam("per_page", "250")
                                .queryParam("page", p)
                                .build())
                        .retrieve()
                        .bodyToMono(new ParameterizedTypeReference<List<Map<String, Object>>>() {})
                        .block(Duration.ofSeconds(5));

                if (data != null) {
                    for (Map<String, Object> coin : data) {
                        Object sym = coin.get("symbol");
                        Object img = coin.get("image");
                        if (sym != null && img != null) {
                            result.putIfAbsent(sym.toString().toUpperCase(), img.toString());
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("⚠️ CoinGecko 로고 페이지 {} 조회 실패: {}", p, e.getMessage());
            }
        }

        if (!result.isEmpty()) putCache(cacheKey, result, 3600); // 1시간 캐시
        return result;
    }
}
