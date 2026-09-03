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
 * [클래스 읽기] Bitget 거래소 API 전용 서비스.
 * 스팟 및 선물 시세, 캔들 데이터를 담당합니다.
 */
@Slf4j
@Service
public class BitgetMarketService extends AbstractMarketService {

    // 큰 TF(1D/3D/1W/1M) 깊은 캔들 페이징 결과 캐시 — 최대 12콜짜리 조회를 TTL당 1회로 흡수.
    // 주봉 등은 자주 안 바뀌니 30초로도 체감 지연 없음(초기 로딩 느려짐 대응).
    private static final int DEEP_CANDLE_TTL = 30;

    private final WebClient bitgetClient;

    public BitgetMarketService() {
        this.bitgetClient = WebClient.builder()
                .baseUrl("https://api.bitget.com")
                .codecs(this::configureLargeResponseBuffer)
                .build();
    }

    private void configureLargeResponseBuffer(ClientCodecConfigurer codecs) {
        codecs.defaultCodecs().maxInMemorySize(2 * 1024 * 1024);
    }

    public Object getTickers() {
        String cacheKey = "bitget_tickers";
        if (isCacheValid(cacheKey)) {
            return cache.get(cacheKey);
        }

        try {
            Object data = bitgetClient.get()
                    .uri("/api/v2/spot/market/tickers")
                    .retrieve()
                    .bodyToMono(Object.class)
                    .block(Duration.ofSeconds(5));

            if (data != null) {
                putCache(cacheKey, data, 10);
                return data;
            }
        } catch (Exception e) {
            log.error("❌ Bitget Tickers 조회 실패: {}", e.getMessage());
        }
        return Collections.emptyMap();
    }

    public Object getFuturesTickers(String productType) {
        String safeProductType = (productType == null || productType.isBlank()) ? "USDT-FUTURES" : productType;
        String cacheKey = "bitget_futures_tickers_" + safeProductType;
        if (isCacheValid(cacheKey)) {
            return cache.get(cacheKey);
        }

        try {
            Object data = bitgetClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/v2/mix/market/tickers")
                            .queryParam("productType", safeProductType)
                            .build())
                    .retrieve()
                    .bodyToMono(Object.class)
                    .block(Duration.ofSeconds(5));

            if (data != null) {
                putCache(cacheKey, data, 10);
                return data;
            }
        } catch (Exception e) {
            log.error("❌ Bitget Futures Tickers 조회 실패: productType={}, error={}", safeProductType, e.getMessage());
        }
        return Collections.emptyMap();
    }

    @SuppressWarnings("unchecked")
    public Map<String, Double> getTickerPriceMap() {
        Object tickersObj = getTickers();
        if (!(tickersObj instanceof Map)) return Collections.emptyMap();

        Map<String, Object> res = (Map<String, Object>) tickersObj;
        Object dataListObj = res.get("data");
        if (!(dataListObj instanceof java.util.List)) return Collections.emptyMap();

        java.util.List<Map<String, Object>> dataList = (java.util.List<Map<String, Object>>) dataListObj;
        Map<String, Double> priceMap = new java.util.HashMap<>();

        for (Map<String, Object> item : dataList) {
            String symbol = (String) item.get("symbol");
            Object lastPr = item.get("lastPr");
            if (symbol != null && lastPr != null) {
                try {
                    priceMap.put(symbol, Double.parseDouble(lastPr.toString()));
                } catch (Exception e) {
                    // 무시
                }
            }
        }
        return priceMap;
    }

    public Object getCandles(String symbol, String granularity, String limit, String endTime, String productType) {
        boolean isFutures = productType != null && !productType.isEmpty();
        String resolvedGranularity = isFutures ? toFuturesGranularity(granularity) : granularity;
        // endTime이 있으면 과거 페이징 → recent(candles)는 일정 기간 이전을 0개로 반환(특히 1H/4H)하므로
        // history-candles 엔드포인트를 쓴다. history-candles의 limit 상한은 200.
        boolean historical = endTime != null && !endTime.isEmpty();

        // 큰 TF(1D/3D/1W/1M) 초기 로드: recent는 ~90일치만 보유(선물 1M=4개)라 부족.
        // ⚠️ 비트겟은 1D/3D/1W/1M 캔들을 단일 호출당 소량(예: 1Wutc는 limit 무관 13개 고정)만
        // 반환하는 특성이 있어, 한 번의 history-candles 호출로는 SMC 지표가 필요한 깊이(≈300개)에
        // 한참 못 미친다(예: XLM 1W가 최근 14주치만 로드돼 그보다 오래된 FVG/OB존이 통째로 안 보이던 버그).
        // → endTime을 과거로 옮겨가며 반복 조회해 채운다(최대 12페이지, 300개 채워지면 조기종료).
        // 페이지당 순차 호출이라 캐시 없이는 초기 로딩이 눈에 띄게 느려짐(사용자 확인, 최대 12콜) →
        // 결과를 짧은 TTL로 캐시해 동시/반복 요청을 흡수(유저 수·TF전환 무관 거래소 호출은 TTL당 1회).
        // 텀(sleep) 제거 — 20연속 호출 무에러 실측 확인, 캐시가 반복비용을 어차피 없애줌.
        if (!historical && isLargeGranularity(resolvedGranularity)) {
            String cacheKey = "deepCandles:" + symbol + ":" + resolvedGranularity + ":" + isFutures + ":" + productType;
            if (isCacheValid(cacheKey)) return cache.get(cacheKey);

            java.util.TreeMap<Long, List<Object>> byTs = new java.util.TreeMap<>();
            String endTimeCursor = null;
            for (int page = 0; page < 12; page++) {
                Object hist = fetchCandlesOnce(symbol, resolvedGranularity, "200", endTimeCursor, isFutures, productType, true);
                List<List<Object>> rows = extractCandleData(hist);
                if (rows == null || rows.isEmpty()) break;
                long oldest = Long.MAX_VALUE;
                for (List<Object> row : rows) {
                    long ts = Long.parseLong(String.valueOf(row.get(0)));
                    byTs.put(ts, row);
                    if (ts < oldest) oldest = ts;
                }
                if (byTs.size() >= 300) break;
                String nextEndTime = String.valueOf(oldest - 1);
                if (nextEndTime.equals(endTimeCursor)) break; // 진전 없음(더 과거 데이터 없음)
                endTimeCursor = nextEndTime;
            }
            Object rec = fetchCandlesOnce(symbol, resolvedGranularity, "100", null, isFutures, productType, false);
            List<List<Object>> recRows = extractCandleData(rec);
            if (recRows != null) for (List<Object> row : recRows) byTs.put(Long.parseLong(String.valueOf(row.get(0))), row);
            if (byTs.isEmpty()) return rec;
            Map<String, Object> out = new HashMap<>();
            out.put("code", "00000");
            out.put("msg", "success");
            out.put("data", new java.util.ArrayList<>(byTs.values()));
            putCache(cacheKey, out, DEEP_CANDLE_TTL);
            return out;
        }

        String resolvedLimit = limit;
        if (historical) {
            try { if (Integer.parseInt(limit) > 200) resolvedLimit = "200"; }
            catch (NumberFormatException ignored) {}
        }
        return fetchCandlesOnce(symbol, resolvedGranularity, resolvedLimit, endTime, isFutures, productType, historical);
    }

    /** Bitget 캔들 단일 조회(recent 또는 history-candles). */
    private Object fetchCandlesOnce(String symbol, String resolvedGranularity, String limit, String endTime,
                                    boolean isFutures, String productType, boolean historical) {
        final String reqLimit = limit;
        try {
            return bitgetClient.get()
                    .uri(uriBuilder -> {
                        String spotPath = historical ? "/api/v2/spot/market/history-candles" : "/api/v2/spot/market/candles";
                        String mixPath  = historical ? "/api/v2/mix/market/history-candles"  : "/api/v2/mix/market/candles";
                        var builder = isFutures
                                ? uriBuilder.path(mixPath)
                                        .queryParam("symbol", symbol)
                                        .queryParam("productType", productType)
                                        .queryParam("granularity", resolvedGranularity)
                                        .queryParam("limit", reqLimit)
                                : uriBuilder.path(spotPath)
                                        .queryParam("symbol", symbol)
                                        .queryParam("granularity", resolvedGranularity)
                                        .queryParam("limit", reqLimit);

                        if (historical && endTime != null && !endTime.isEmpty()) {
                            builder.queryParam("endTime", endTime);
                        }

                        return builder.build();
                    })
                    .retrieve()
                    .bodyToMono(Object.class)
                    .block(java.time.Duration.ofSeconds(5));
        } catch (Exception e) {
            System.err.println("❌ Bitget Candles 조회 실패: symbol=" + symbol + ", error=" + e.getMessage());
            return java.util.Collections.emptyMap();
        }
    }

    private boolean isLargeGranularity(String g) {
        return switch (g) {
            case "1Dutc", "3Dutc", "1Wutc", "1Mutc", "1D", "3D", "1W", "1M" -> true;
            default -> false;
        };
    }

    @SuppressWarnings("unchecked")
    private List<List<Object>> extractCandleData(Object resp) {
        if (resp instanceof Map<?, ?> m && m.get("data") instanceof List<?> l) {
            return (List<List<Object>>) (Object) l;
        }
        return null;
    }

    private String toFuturesGranularity(String granularity) {
        return switch (granularity) {
            case "1min"  -> "1m";
            case "3min"  -> "3m";
            case "5min"  -> "5m";
            case "15min" -> "15m";
            case "30min" -> "30m";
            case "1h"    -> "1H";
            case "2h"    -> "2H";
            case "4h"    -> "4H";
            case "6h", "6Hutc"    -> "6H";
            case "12h", "12Hutc"  -> "12H";
            default      -> granularity;
        };
    }
    
    public WebClient getClient() {
        return this.bitgetClient;
    }
}
