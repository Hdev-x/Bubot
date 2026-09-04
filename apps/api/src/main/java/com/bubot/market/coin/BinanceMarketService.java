package com.bubot.market.coin;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.codec.ClientCodecConfigurer;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * [클래스 읽기] Binance 거래소 API 전용 서비스.
 * 스팟 및 선물 시세, 캔들 데이터, 웹소켓 병합을 담당합니다.
 */
@Slf4j
@Service
public class BinanceMarketService extends AbstractMarketService {

    private static final Map<String, String> BINANCE_FUTURES_SYMBOL_ALIASES = Map.of(
            "PEPEUSDT", "1000PEPEUSDT"
    );

    private final WebClient binanceSpotClient;
    private final WebClient binanceFuturesClient;
    private final BinanceSpotRealtimeWebSocketService binanceSpotRealtimeService;
    private final BinanceFuturesRealtimeWebSocketService binanceFuturesRealtimeService;
    // 호가·캔들 프록시 보호막: 짧은 캐시로 클라이언트 폴링을 묶고 429/418이면 상류 요청을 멈춘다 (2026-09-05).
    private final BinanceRestGuard guard = new BinanceRestGuard();
    private static final long DEPTH_TTL_MS = 400;
    private static final long CANDLES_TTL_MS = 1_000;

    public BinanceMarketService(
            BinanceSpotRealtimeWebSocketService binanceSpotRealtimeService,
            BinanceFuturesRealtimeWebSocketService binanceFuturesRealtimeService) {
        this.binanceSpotRealtimeService = binanceSpotRealtimeService;
        this.binanceFuturesRealtimeService = binanceFuturesRealtimeService;
        
        this.binanceSpotClient = WebClient.builder()
                .baseUrl("https://api.binance.com")
                .codecs(this::configureLargeResponseBuffer)
                .build();
        this.binanceFuturesClient = WebClient.builder()
                .baseUrl("https://fapi.binance.com")
                .codecs(this::configureLargeResponseBuffer)
                .build();
    }

    private void configureLargeResponseBuffer(ClientCodecConfigurer codecs) {
        codecs.defaultCodecs().maxInMemorySize(2 * 1024 * 1024);
    }

    public Object getBinanceSpotTickers() {
        String cacheKey = "binance_spot_tickers";
        if (isCacheValid(cacheKey)) {
            return cache.get(cacheKey);
        }

        try {
            Object data = binanceSpotClient.get()
                    .uri("/api/v3/ticker/24hr")
                    .retrieve()
                    .bodyToMono(Object.class)
                    .block(Duration.ofSeconds(5));

            if (data != null) {
                data = applyBinanceUtcSnapshots(data, binanceSpotRealtimeService.getLatestTickers());
                putCache(cacheKey, data, 10);
                return data;
            }
        } catch (Exception e) {
            log.error("❌ Binance Spot Tickers 조회 실패: {}", e.getMessage());
        }
        return Collections.emptyList();
    }

    public Object getBinanceFuturesTickers() {
        String cacheKey = "binance_futures_tickers";
        if (isCacheValid(cacheKey)) {
            return cache.get(cacheKey);
        }

        try {
            Object data = binanceFuturesClient.get()
                    .uri("/fapi/v1/ticker/24hr")
                    .retrieve()
                    .bodyToMono(Object.class)
                    .block(Duration.ofSeconds(5));

            if (data != null) {
                data = applyBinanceUtcSnapshots(data, binanceFuturesRealtimeService.getLatestTickers());
                putCache(cacheKey, data, 10);
                return data;
            }
        } catch (Exception e) {
            log.error("❌ Binance Futures Tickers 조회 실패: {}", e.getMessage());
        }
        return Collections.emptyList();
    }

    @SuppressWarnings("unchecked")
    private Object applyBinanceUtcSnapshots(Object data, Map<String, Map<String, Object>> snapshots) {
        if (!(data instanceof List<?> rows) || snapshots.isEmpty()) {
            return data;
        }

        List<Map<String, Object>> adjusted = new java.util.ArrayList<>();
        for (Object rawRow : rows) {
            if (!(rawRow instanceof Map<?, ?> rawMap)) {
                continue;
            }

            Map<String, Object> row = new HashMap<>((Map<String, Object>) rawMap);
            String symbol = String.valueOf(row.getOrDefault("symbol", ""));
            Map<String, Object> live = snapshots.get(symbol);
            if (live != null) {
                row.put("lastPrice", live.get("price"));
                row.put("priceChange", live.get("change"));
                row.put("priceChangePercent", ((Number) live.get("changeRate")).doubleValue() * 100);
                // quoteVolume은 REST 24h 롤링 값을 유지한다.
                // (live.volume은 @kline_1d의 UTC 자정 이후 누적치라 24h 거래대금이 아님 → 덮어쓰면 과소표시)
            }
            adjusted.add(row);
        }
        return adjusted;
    }

    public Object getBinanceFuturesCandles(String symbol, String interval, String limit, String endTime) {
        String apiSymbol = toBinanceFuturesSymbol(symbol);
        try {
            return guard.get("fut-klines|" + apiSymbol + "|" + interval + "|" + limit + "|" + endTime, CANDLES_TTL_MS, () -> binanceFuturesClient.get()
                    .uri(uriBuilder -> {
                        var builder = uriBuilder.path("/fapi/v1/klines")
                                .queryParam("symbol", apiSymbol)
                                .queryParam("interval", interval)
                                .queryParam("limit", limit);
                        if (endTime != null && !endTime.isEmpty()) {
                            builder.queryParam("endTime", endTime);
                        }
                        return builder.build();
                    })
                    .retrieve()
                    .bodyToMono(Object.class)
                    .block(Duration.ofSeconds(10)), Collections.emptyList());
        } catch (Exception e) {
            log.error("❌ Binance Futures Candles 조회 실패: symbol={}({}), error={}", symbol, apiSymbol, e.getMessage());
            return Collections.emptyList();
        }
    }

    private String toBinanceFuturesSymbol(String symbol) {
        if (symbol == null) return "";
        return BINANCE_FUTURES_SYMBOL_ALIASES.getOrDefault(symbol.toUpperCase(), symbol.toUpperCase());
    }

    public Object getBinanceSpotCandles(String symbol, String interval, String limit, String endTime) {
        try {
            return guard.get("spot-klines|" + symbol + "|" + interval + "|" + limit + "|" + endTime, CANDLES_TTL_MS, () -> binanceSpotClient.get()
                    .uri(uriBuilder -> {
                        var builder = uriBuilder.path("/api/v3/klines")
                                .queryParam("symbol", symbol)
                                .queryParam("interval", interval)
                                .queryParam("limit", limit);
                        if (endTime != null && !endTime.isEmpty()) {
                            builder.queryParam("endTime", endTime);
                        }
                        return builder.build();
                    })
                    .retrieve()
                    .bodyToMono(Object.class)
                    .block(Duration.ofSeconds(10)), Collections.emptyList());
        } catch (Exception e) {
            log.error("❌ Binance Spot Candles 조회 실패: symbol={}, error={}", symbol, e.getMessage());
            return Collections.emptyList();
        }
    }
    
    /** Binance 선물 호가(depth) 프록시 — 브라우저 직결 차단(지역제한) 회피용. 원본 JSON({bids,asks}) 그대로 반환. */
    public Object getBinanceFuturesDepth(String symbol, String limit) {
        String apiSymbol = toBinanceFuturesSymbol(symbol);
        try {
            return guard.get("fut-depth|" + apiSymbol + "|" + limit, DEPTH_TTL_MS, () -> binanceFuturesClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/fapi/v1/depth")
                            .queryParam("symbol", apiSymbol)
                            .queryParam("limit", limit)
                            .build())
                    .retrieve()
                    .bodyToMono(Object.class)
                    .block(Duration.ofSeconds(5)), Collections.emptyMap());
        } catch (Exception e) {
            log.error("❌ Binance Futures Depth 조회 실패: symbol={}({}), error={}", symbol, apiSymbol, e.getMessage());
            return Collections.emptyMap();
        }
    }

    /** Binance 현물 호가(depth) 프록시. */
    public Object getBinanceSpotDepth(String symbol, String limit) {
        try {
            return guard.get("spot-depth|" + symbol + "|" + limit, DEPTH_TTL_MS, () -> binanceSpotClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/api/v3/depth")
                            .queryParam("symbol", symbol)
                            .queryParam("limit", limit)
                            .build())
                    .retrieve()
                    .bodyToMono(Object.class)
                    .block(Duration.ofSeconds(5)), Collections.emptyMap());
        } catch (Exception e) {
            log.error("❌ Binance Spot Depth 조회 실패: symbol={}, error={}", symbol, e.getMessage());
            return Collections.emptyMap();
        }
    }

    public WebClient getFuturesClient() {
        return this.binanceFuturesClient;
    }
}
