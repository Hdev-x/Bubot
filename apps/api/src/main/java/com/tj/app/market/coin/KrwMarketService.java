package com.tj.app.market.coin;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * [클래스 읽기] 업비트/빗썸 KRW 마켓 리스트 티커를 서버에서 한 번 받아 캐시해 프론트로 뿌리는 서비스.
 * 기존엔 브라우저가 거래소를 직접 N번 폴링 → 멀티유저 시 IP별 레이트리밋(429)·중복 트래픽.
 * 서버 1개가 짧은 TTL(3초)로 받아 캐시하면 유저 수와 무관하게 거래소엔 ~1콜/3초만 나간다.
 * (반환은 정규화 배열: base/name/last/change/changeRate/volume — 프론트는 그대로 매핑)
 */
@Slf4j
@Service
public class KrwMarketService extends AbstractMarketService {

    private final WebClient upbit;
    private final WebClient bithumb;
    private static final int TICKER_TTL = 3;     // 티커 캐시 3초(동시 요청을 1콜로 흡수)
    private static final int NAME_TTL = 3600;    // 한글명(market/all)은 1시간

    public KrwMarketService() {
        this.upbit = WebClient.builder().baseUrl("https://api.upbit.com")
                .codecs(c -> c.defaultCodecs().maxInMemorySize(4 * 1024 * 1024)).build();
        this.bithumb = WebClient.builder().baseUrl("https://api.bithumb.com")
                .codecs(c -> c.defaultCodecs().maxInMemorySize(4 * 1024 * 1024)).build();
    }

    /** Upbit korean_name: base(예: BTC) → 한글명. 빗썸 한글명 보강에도 공용. */
    @SuppressWarnings("unchecked")
    private Map<String, String> upbitNames() {
        String key = "krw_upbit_names";
        if (isCacheValid(key)) return (Map<String, String>) cache.get(key);
        Map<String, String> names = new HashMap<>();
        try {
            List<Map<String, Object>> rows = upbit.get().uri("/v1/market/all?isDetails=false")
                    .retrieve().bodyToMono(List.class).block(Duration.ofSeconds(5));
            if (rows != null) for (Map<String, Object> r : rows) {
                String mkt = String.valueOf(r.get("market"));
                if (mkt.startsWith("KRW-")) names.put(mkt.substring(4), String.valueOf(r.get("korean_name")));
            }
        } catch (Exception e) {
            log.warn("Upbit market/all 실패: {}", e.getMessage());
        }
        if (!names.isEmpty()) putCache(key, names, NAME_TTL);
        return names;
    }

    /** 업비트 KRW 전체 티커(정규화). 실패 시 직전 캐시 유지(빈 목록 방지). */
    @SuppressWarnings("unchecked")
    public Object getUpbitTickers() {
        String key = "krw_upbit_tickers";
        if (isCacheValid(key)) return cache.get(key);
        try {
            List<Map<String, Object>> rows = upbit.get().uri("/v1/ticker/all?quote_currencies=KRW")
                    .retrieve().bodyToMono(List.class).block(Duration.ofSeconds(5));
            Map<String, String> names = upbitNames();
            List<Map<String, Object>> out = new ArrayList<>();
            if (rows != null) for (Map<String, Object> r : rows) {
                String mkt = String.valueOf(r.get("market"));
                if (!mkt.startsWith("KRW-")) continue;
                String base = mkt.substring(4);
                out.add(row(base, names.getOrDefault(base, base),
                        num(r.get("trade_price")), num(r.get("signed_change_price")),
                        num(r.get("signed_change_rate")), num(r.get("acc_trade_price_24h"))));
            }
            putCache(key, out, TICKER_TTL);
            return out;
        } catch (Exception e) {
            log.error("Upbit tickers 실패: {}", e.getMessage());
            Object stale = cache.get(key);
            return stale != null ? stale : Collections.emptyList();
        }
    }

    /** 빗썸 KRW 전체 티커(정규화). 한글명은 업비트 맵 보강. 실패 시 직전 캐시 유지. */
    @SuppressWarnings("unchecked")
    public Object getBithumbTickers() {
        String key = "krw_bithumb_tickers";
        if (isCacheValid(key)) return cache.get(key);
        try {
            Map<String, Object> resp = bithumb.get().uri("/public/ticker/ALL_KRW")
                    .retrieve().bodyToMono(Map.class).block(Duration.ofSeconds(5));
            Map<String, String> names = upbitNames();
            List<Map<String, Object>> out = new ArrayList<>();
            if (resp != null && "0000".equals(resp.get("status")) && resp.get("data") instanceof Map<?, ?> data) {
                for (Map.Entry<String, Object> e : ((Map<String, Object>) data).entrySet()) {
                    String base = e.getKey();
                    if ("date".equals(base) || !(e.getValue() instanceof Map<?, ?>)) continue;
                    Map<String, Object> v = (Map<String, Object>) e.getValue();
                    out.add(row(base, names.getOrDefault(base, base),
                            num(v.get("closing_price")), num(v.get("fluctate_24H")),
                            num(v.get("fluctate_rate_24H")) / 100.0, num(v.get("acc_trade_value_24H"))));
                }
            }
            putCache(key, out, TICKER_TTL);
            return out;
        } catch (Exception e) {
            log.error("Bithumb tickers 실패: {}", e.getMessage());
            Object stale = cache.get(key);
            return stale != null ? stale : Collections.emptyList();
        }
    }

    private static final int CANDLE_TTL = 3; // 캔들 캐시 3초 — 동시/멀티유저 요청을 1콜로 흡수

    /** web granularity → Upbit 캔들 경로(SSRF 방지: 화이트리스트 매핑만). 미지원은 null. */
    private static String upbitPath(String g) {
        switch (g) {
            case "1min":  return "minutes/1";
            case "3min":  return "minutes/3";
            case "5min":  return "minutes/5";
            case "15min": return "minutes/15";
            case "30min": return "minutes/30";
            case "1h":    return "minutes/60";
            case "4h":    return "minutes/240";
            case "1Dutc": return "days";
            case "1Wutc": return "weeks";
            case "1Mutc": return "months";
            default:      return null;
        }
    }

    /** web granularity → 빗썸 v1(업비트 호환) 캔들 경로. 빗썸 v1은 분(360/720 포함)·일·주·월 지원. 3Dutc만 미지원. */
    private static String bithumbPath(String g) {
        switch (g) {
            case "1min":  return "minutes/1";
            case "3min":  return "minutes/3";
            case "5min":  return "minutes/5";
            case "15min": return "minutes/15";
            case "30min": return "minutes/30";
            case "1h":    return "minutes/60";
            case "4h":    return "minutes/240";
            case "6Hutc": return "minutes/360";
            case "12Hutc":return "minutes/720";
            case "1Dutc": return "days";
            case "1Wutc": return "weeks";
            case "1Mutc": return "months";
            default:      return null; // 3Dutc 미지원
        }
    }

    public Object getUpbitCandles(String granularity, String symbol, int count, Long to) {
        String path = upbitPath(granularity);
        if (path == null) return Collections.emptyList();
        return fetchV1Candles(upbit, "krw_upbit_candles", path, "KRW-" + symbol.replaceAll("KRW$", ""), count, to);
    }

    public Object getBithumbCandles(String granularity, String symbol, int count, Long to) {
        String path = bithumbPath(granularity);
        if (path == null) return Collections.emptyList();
        return fetchV1Candles(bithumb, "krw_bithumb_candles", path, "KRW-" + symbol.replaceAll("KRW$", ""), count, to);
    }

    /**
     * 업비트/빗썸 v1(업비트 호환) 캔들 공통 조회 — 서버에서 받아 캐시·정규화. 브라우저 직결은 동시 버스트에
     * 즉시 429(차트 미표시) → 서버가 페이지 간 간격을 두고 받아 흡수한다.
     * 반환: [{time(초),open,high,low,close,volume}] 오름차순. (빗썸 v1도 업비트와 응답 필드 동일)
     */
    @SuppressWarnings("unchecked")
    private Object fetchV1Candles(WebClient client, String keyPrefix, String path, String market, int count, Long to) {
        String key = keyPrefix + "|" + path + "|" + market + "|" + count + "|" + (to == null ? "" : to);
        if (isCacheValid(key)) return cache.get(key);

        List<Map<String, Object>> out = new ArrayList<>();
        // to/cursor 포맷은 'yyyy-MM-ddTHH:mm:ss'(Z 없이) — 업비트·빗썸 v1 둘 다 수용(빗썸은 Z 붙으면 400).
        String cursor = (to != null && to > 0) ? Instant.ofEpochMilli(to).truncatedTo(ChronoUnit.SECONDS).toString().replace("Z", "") : null;
        int remaining = Math.min(count, 1000);
        try {
            for (int i = 0; i < 6 && remaining > 0; i++) {
                final int c = Math.min(remaining, 200);
                final String cur = cursor;
                List<Map<String, Object>> rows = client.get()
                        .uri(b -> {
                            var ub = b.path("/v1/candles/" + path).queryParam("market", market).queryParam("count", c);
                            if (cur != null) ub.queryParam("to", cur);
                            return ub.build();
                        })
                        .retrieve().bodyToMono(List.class).block(Duration.ofSeconds(5));
                if (rows == null || rows.isEmpty()) break;
                for (Map<String, Object> r : rows) {
                    String utc = String.valueOf(r.get("candle_date_time_utc"));
                    out.add(candleRow(Instant.parse(utc + "Z").getEpochSecond(),
                            num(r.get("opening_price")), num(r.get("high_price")),
                            num(r.get("low_price")), num(r.get("trade_price")),
                            num(r.get("candle_acc_trade_volume"))));
                }
                cursor = String.valueOf(rows.get(rows.size() - 1).get("candle_date_time_utc")); // 다음 페이지 커서(Z 없이)
                remaining -= rows.size();
                if (rows.size() < c) break;
                Thread.sleep(120); // KRW 거래소 버스트 한도 회피
            }
        } catch (Exception e) {
            log.error("KRW v1 candles 실패: key={}, error={}", key, e.getMessage());
            if (out.isEmpty()) { Object stale = cache.get(key); if (stale != null) return stale; }
        }
        out.sort((a, b) -> Long.compare(((Number) a.get("time")).longValue(), ((Number) b.get("time")).longValue()));
        putCache(key, out, CANDLE_TTL);
        return out;
    }

    private static Map<String, Object> candleRow(long time, double open, double high, double low, double close, double volume) {
        Map<String, Object> m = new HashMap<>();
        m.put("time", time);
        m.put("open", open);
        m.put("high", high);
        m.put("low", low);
        m.put("close", close);
        m.put("volume", volume);
        return m;
    }

    private static Map<String, Object> row(String base, String name, double last, double change, double changeRate, double volume) {
        Map<String, Object> m = new HashMap<>();
        m.put("base", base);
        m.put("name", name);
        m.put("last", last);
        m.put("change", change);
        m.put("changeRate", changeRate);
        m.put("volume", volume);
        return m;
    }

    private static double num(Object o) {
        if (o == null) return 0;
        try { return Double.parseDouble(String.valueOf(o)); }
        catch (NumberFormatException e) { return 0; }
    }
}
