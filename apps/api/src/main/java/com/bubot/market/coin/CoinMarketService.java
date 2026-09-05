package com.bubot.market.coin;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * [클래스 읽기] 기존의 거대한 CoinMarketService를 대체하는 Facade(퍼사드) 서비스.
 * 컨트롤러와 타 서비스의 의존성 파괴를 막기 위해 기존 인터페이스를 그대로 유지하고,
 * 실제 처리는 거래소별 전용 서비스(Bitget, Binance, CoinGecko, Bithumb)로 위임합니다.
 */
@Slf4j
@Service
public class CoinMarketService extends AbstractMarketService {

    private final BitgetMarketService bitgetMarketService;
    private final BinanceMarketService binanceMarketService;
    private final CoinGeckoMarketService coinGeckoMarketService;
    private final BithumbMarketService bithumbMarketService;
    private final KrwMarketService krwMarketService;

    public CoinMarketService(
            BitgetMarketService bitgetMarketService,
            BinanceMarketService binanceMarketService,
            CoinGeckoMarketService coinGeckoMarketService,
            BithumbMarketService bithumbMarketService,
            KrwMarketService krwMarketService) {
        this.bitgetMarketService = bitgetMarketService;
        this.binanceMarketService = binanceMarketService;
        this.coinGeckoMarketService = coinGeckoMarketService;
        this.bithumbMarketService = bithumbMarketService;
        this.krwMarketService = krwMarketService;
    }

    // ============================================================
    // KRW 마켓 리스트 위임(업비트/빗썸 — 서버 캐시 집약)
    // ============================================================
    public Object getUpbitTickers() {
        return krwMarketService.getUpbitTickers();
    }

    public Object getBithumbTickers() {
        return krwMarketService.getBithumbTickers();
    }

    public Object getUpbitCandles(String granularity, String symbol, int count, Long to) {
        return krwMarketService.getUpbitCandles(granularity, symbol, count, to);
    }

    public Object getBithumbCandles(String granularity, String symbol, int count, Long to) {
        return krwMarketService.getBithumbCandles(granularity, symbol, count, to);
    }

    // ============================================================
    // Bithumb 위임
    // ============================================================
    public Object getBithumbTicker(String orderCurrency, String paymentCurrency) {
        return bithumbMarketService.getBithumbTicker(orderCurrency, paymentCurrency);
    }

    // ============================================================
    // Bitget 위임
    // ============================================================
    public Object getTickers() {
        return bitgetMarketService.getTickers();
    }

    public Object getFuturesTickers(String productType) {
        return bitgetMarketService.getFuturesTickers(productType);
    }

    public Map<String, Double> getTickerPriceMap() {
        return bitgetMarketService.getTickerPriceMap();
    }

    public Object getCandles(String symbol, String granularity, String limit, String endTime, String productType) {
        return bitgetMarketService.getCandles(symbol, granularity, limit, endTime, productType);
    }

    // ============================================================
    // Binance 위임
    // ============================================================
    public Object getBinanceSpotTickers() {
        return binanceMarketService.getBinanceSpotTickers();
    }

    public Object getBinanceFuturesTickers() {
        return binanceMarketService.getBinanceFuturesTickers();
    }

    public Object getBinanceFuturesCandles(String symbol, String interval, String limit, String endTime) {
        return binanceMarketService.getBinanceFuturesCandles(symbol, interval, limit, endTime);
    }

    public Object getBinanceSpotCandles(String symbol, String interval, String limit, String endTime) {
        return binanceMarketService.getBinanceSpotCandles(symbol, interval, limit, endTime);
    }

    public Object getBinanceFuturesDepth(String symbol, String limit) {
        return binanceMarketService.getBinanceFuturesDepth(symbol, limit);
    }

    public Object getBinanceSpotDepth(String symbol, String limit) {
        return binanceMarketService.getBinanceSpotDepth(symbol, limit);
    }

    // ============================================================
    // CoinGecko 위임
    // ============================================================
    public Object getExtraStats(String ticker) {
        return coinGeckoMarketService.getExtraStats(ticker);
    }

    public Map<String, String> getLogos() {
        return coinGeckoMarketService.getLogos();
    }

    // ============================================================
    // 다중 거래소 통합 로직 (Price Precision)
    // ============================================================
    private static final int PRECISION_TTL_SECONDS = 3600;
    private static final int PRECISION_RETRY_SECONDS = 60;

    /**
     * 가격 소수 자릿수 — 거래소별로 따로 캐시한다. 한쪽(Binance 차단 등)이 실패해 빈 결과가 나와도 다른 쪽과 묶여
     * 1시간 굳지 않고, 빈 결과는 1분 뒤 다시 조회한다(3차 리뷰 P1: 부분 실패 결과를 3,600초 캐시하던 문제).
     */
    public Map<String, Integer> getPricePrecision() {
        Map<String, Integer> result = new HashMap<>(precisionPart("price_precision_bitget", this::loadBitgetPrecision));
        result.putAll(precisionPart("price_precision_binance", this::loadBinancePrecision));
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Integer> precisionPart(String cacheKey, java.util.function.Supplier<Map<String, Integer>> loader) {
        if (isCacheValid(cacheKey)) {
            return (Map<String, Integer>) cache.get(cacheKey);
        }
        Map<String, Integer> part = loader.get();
        putCache(cacheKey, part, part.isEmpty() ? PRECISION_RETRY_SECONDS : PRECISION_TTL_SECONDS);
        return part;
    }

    /** Bitget futures contracts → pricePlace */
    private Map<String, Integer> loadBitgetPrecision() {
        Map<String, Integer> result = new HashMap<>();
        for (String productType : List.of("USDT-FUTURES", "USDC-FUTURES")) {
            try {
                Object data = bitgetMarketService.getClient().get()
                        .uri(uriBuilder -> uriBuilder
                                .path("/api/v2/mix/market/contracts")
                                .queryParam("productType", productType)
                                .build())
                        .retrieve()
                        .bodyToMono(Object.class)
                        .block(Duration.ofSeconds(5));

                if (data instanceof Map<?, ?> root) {
                    Object dataField = ((Map<?, ?>) root).get("data");
                    if (dataField instanceof List<?> rows) {
                        for (Object row : rows) {
                            if (!(row instanceof Map<?, ?> map)) continue;
                            Object symObj = map.get("symbol");
                            Object pricePlace = map.get("pricePlace");
                            if (symObj == null || pricePlace == null) continue;
                            String symbol = symObj.toString();
                            if (!symbol.isEmpty()) {
                                result.put(symbol, Integer.parseInt(pricePlace.toString()));
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Bitget contracts 조회 실패: productType={}, error={}", productType, e.getMessage());
            }
        }

        return result;
    }

    /** Binance futures exchangeInfo → PRICE_FILTER tickSize (guard 경유, 차단 중 raw 호출 금지) */
    private Map<String, Integer> loadBinancePrecision() {
        Map<String, Integer> result = new HashMap<>();
        try {
            Object data = binanceMarketService.getBinanceFuturesExchangeInfo(); // guard 경유 — 차단 중 raw 호출 금지

            if (data instanceof Map<?, ?> root) {
                Object symbolsField = ((Map<?, ?>) root).get("symbols");
                if (symbolsField instanceof List<?> symbols) {
                    for (Object s : symbols) {
                        if (!(s instanceof Map<?, ?> sMap)) continue;
                        Object symObj = sMap.get("symbol");
                        if (symObj == null) continue;
                        String symbol = symObj.toString();
                        Object filters = sMap.get("filters");
                        if (symbol.isEmpty() || !(filters instanceof List<?>)) continue;
                        for (Object f : (List<?>) filters) {
                            if (!(f instanceof Map<?, ?> fMap)) continue;
                            if (!"PRICE_FILTER".equals(fMap.get("filterType"))) continue;
                            Object tsObj = fMap.get("tickSize");
                            String tickSize = tsObj != null ? tsObj.toString() : "";
                            if (!tickSize.isEmpty()) {
                                result.put("BN_" + symbol, tickSizeToDecimals(tickSize));
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Binance futures exchangeInfo 조회 실패: {}", e.getMessage());
        }

        return result;
    }

    private int tickSizeToDecimals(String tickSize) {
        String stripped = tickSize.replaceAll("0+$", "");
        int dot = stripped.indexOf('.');
        return dot == -1 ? 0 : stripped.length() - dot - 1;
    }
}
