package com.bubot.trade;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Bitget REST 호출 클라이언트 (서명 포함).
 * Node trader bitget.ts와 동일한 서명 규약: ts + METHOD + path(쿼리포함) + body → HMAC-SHA256 → base64.
 */
@Slf4j
@Component
public class BitgetClient {

    private static final String BASE_URL = "https://api.bitget.com";
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();
    private final ObjectMapper om = new ObjectMapper();

    private String sign(String ts, String method, String path, String body, String secretKey) throws Exception {
        String msg = ts + method.toUpperCase() + path + body;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] sig = mac.doFinal(msg.getBytes(StandardCharsets.UTF_8));
        return java.util.Base64.getEncoder().encodeToString(sig);
    }

    /** GET 서명 호출 → data 노드 반환. code != 00000 이면 예외. */
    private JsonNode get(String path, String apiKey, String secretKey, String passphrase) throws Exception {
        String ts = String.valueOf(System.currentTimeMillis());
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + path))
                .header("ACCESS-KEY", apiKey)
                .header("ACCESS-SIGN", sign(ts, "GET", path, "", secretKey))
                .header("ACCESS-TIMESTAMP", ts)
                .header("ACCESS-PASSPHRASE", passphrase)
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(15))
                .GET().build();

        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        JsonNode root = om.readTree(res.body());
        if (!"00000".equals(root.path("code").asText())) {
            throw new RuntimeException("Bitget [" + root.path("code").asText() + "] " + root.path("msg").asText());
        }
        return root.path("data");
    }

    /** 보유 포지션(total>0)만 정제해 반환. */
    public List<Map<String, Object>> getAllPositions(String apiKey, String secretKey, String passphrase) throws Exception {
        JsonNode data = get(
                "/api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT",
                apiKey, secretKey, passphrase);

        List<Map<String, Object>> out = new ArrayList<>();
        if (data.isArray()) {
            for (JsonNode p : data) {
                double total = p.path("total").asDouble(0);
                if (total <= 0) continue;
                out.add(Map.ofEntries(
                        Map.entry("symbol", p.path("symbol").asText("")),
                        Map.entry("direction", "short".equals(p.path("holdSide").asText()) ? "short" : "long"),
                        Map.entry("entryPrice", p.path("openPriceAvg").asDouble(0)),
                        Map.entry("size", total),
                        Map.entry("markPrice", p.path("markPrice").asDouble(0)),
                        Map.entry("unrealizedPl", p.path("unrealizedPL").asDouble(0)),
                        Map.entry("leverage", p.path("leverage").asDouble(1)),
                        Map.entry("marginMode", p.path("marginMode").asText("isolated")),
                        // 카드 정보량 확장(Bitget 정합): 청산가·MMR·증거금·실현손익
                        Map.entry("liqPrice", p.path("liquidationPrice").asDouble(0)),
                        Map.entry("mmr", p.path("marginRatio").asDouble(0)),    // 유지증거금률(비율, ×100=%)
                        Map.entry("margin", p.path("marginSize").asDouble(0)),  // 포지션 증거금(USDT)
                        // 실현손익 = 청산이익(achievedProfits) + 펀딩(totalFee) - 거래수수료(deductedFee).
                        // 비트겟 앱 카드의 Realized PnL 정합(achievedProfits만 쓰면 수수료·펀딩 누락).
                        Map.entry("realizedPl", p.path("achievedProfits").asDouble(0)
                                + p.path("totalFee").asDouble(0)
                                - p.path("deductedFee").asDouble(0)),
                        // 포지션 전체 TP/SL (all-position 응답에 포함됨, 0=미설정)
                        Map.entry("takeProfit", p.path("takeProfit").asDouble(0)),
                        Map.entry("stopLoss", p.path("stopLoss").asDouble(0))
                ));
            }
        }
        return out;
    }

    /** 미체결(대기) 주문 목록 정제. */
    public List<Map<String, Object>> getOpenOrders(String apiKey, String secretKey, String passphrase) throws Exception {
        JsonNode data = get(
                "/api/v2/mix/order/orders-pending?productType=USDT-FUTURES",
                apiKey, secretKey, passphrase);

        List<Map<String, Object>> out = new ArrayList<>();
        // 응답은 { entrustedList: [...] } 형태
        JsonNode list = data.path("entrustedList");
        if (list.isArray()) {
            for (JsonNode o : list) {
                double size = o.path("size").asDouble(0);
                double filled = o.path("baseVolume").asDouble(0); // 체결된 수량
                out.add(Map.ofEntries(
                        Map.entry("orderId", o.path("orderId").asText("")),
                        Map.entry("symbol", o.path("symbol").asText("")),
                        // 비트겟 v2: side(buy/sell) + tradeSide(open/close) 또는 posSide
                        Map.entry("side", o.path("side").asText("")),
                        Map.entry("tradeSide", o.path("tradeSide").asText("")),
                        Map.entry("orderType", o.path("orderType").asText("")), // limit / market
                        Map.entry("price", o.path("price").asDouble(0)),
                        Map.entry("size", size),
                        Map.entry("filledQty", filled),
                        Map.entry("leverage", o.path("leverage").asDouble(1)),
                        Map.entry("status", o.path("status").asText("")),
                        Map.entry("cTime", o.path("cTime").asLong(0))
                ));
            }
        }
        return out;
    }

    /** TP/SL 등 플랜(트리거) 미체결 주문. orders-pending엔 안 들어와 별도 조회. */
    public List<Map<String, Object>> getPlanOrders(String apiKey, String secretKey, String passphrase) throws Exception {
        JsonNode data = get(
                "/api/v2/mix/order/orders-plan-pending?productType=USDT-FUTURES&planType=profit_loss",
                apiKey, secretKey, passphrase);

        List<Map<String, Object>> out = new ArrayList<>();
        JsonNode list = data.path("entrustedList");
        if (list.isArray()) {
            for (JsonNode o : list) {
                out.add(Map.ofEntries(
                        Map.entry("orderId", o.path("orderId").asText("")),
                        Map.entry("symbol", o.path("symbol").asText("")),
                        Map.entry("planType", o.path("planType").asText("")),       // pos_profit/pos_loss/profit_plan/loss_plan
                        Map.entry("triggerPrice", o.path("triggerPrice").asDouble(0)),
                        Map.entry("triggerType", o.path("triggerType").asText("")),  // mark_price/fill_price
                        Map.entry("executePrice", o.path("executePrice").asDouble(o.path("price").asDouble(0))), // <=0 = 시장가
                        Map.entry("size", o.path("size").asDouble(0)),
                        Map.entry("side", o.path("side").asText("")),
                        Map.entry("tradeSide", o.path("tradeSide").asText("")),      // open/close
                        Map.entry("posSide", o.path("posSide").asText("")),          // long/short
                        Map.entry("marginMode", o.path("marginMode").asText("")),
                        Map.entry("orderType", o.path("orderType").asText("")),
                        Map.entry("cTime", o.path("cTime").asLong(0))
                ));
            }
        }
        return out;
    }

    /** USDT-FUTURES 계정 available(주문가능) 잔고. 조회 실패/없으면 0. */
    /** 계좌 요약 — available(가용)·equity(총 평가자산=잔고+미실현손익). accounts 1콜로 둘 다. */
    public Map<String, Object> getAccountInfo(String apiKey, String secretKey, String passphrase) throws Exception {
        JsonNode data = get(
                "/api/v2/mix/account/accounts?productType=USDT-FUTURES",
                apiKey, secretKey, passphrase);
        if (data.isArray()) {
            for (JsonNode a : data) {
                if ("USDT".equals(a.path("marginCoin").asText())) {
                    double available = a.path("available").asDouble(0);
                    double equity = a.path("accountEquity").asDouble(a.path("usdtEquity").asDouble(0));
                    return Map.of("available", available, "equity", equity);
                }
            }
        }
        return Map.of("available", 0d, "equity", 0d);
    }

    // ── 현물(Spot) ──────────────────────────────────────────────

    /** 현물 보유자산 — available 또는 frozen 이 있는 코인만 정제. */
    public List<Map<String, Object>> getSpotAssets(String apiKey, String secretKey, String passphrase) throws Exception {
        JsonNode data = get("/api/v2/spot/account/assets", apiKey, secretKey, passphrase);
        List<Map<String, Object>> out = new ArrayList<>();
        if (data.isArray()) {
            for (JsonNode a : data) {
                double available = a.path("available").asDouble(0);
                double frozen = a.path("frozen").asDouble(0);
                double locked = a.path("locked").asDouble(0);
                if (available + frozen + locked <= 0) continue;
                out.add(Map.ofEntries(
                        Map.entry("coin", a.path("coin").asText("")),
                        Map.entry("available", available),
                        Map.entry("frozen", frozen + locked)
                ));
            }
        }
        return out;
    }

    /** 현물 미체결 주문 목록 정제. */
    public List<Map<String, Object>> getSpotOpenOrders(String apiKey, String secretKey, String passphrase) throws Exception {
        JsonNode data = get("/api/v2/spot/trade/unfilled-orders", apiKey, secretKey, passphrase);
        List<Map<String, Object>> out = new ArrayList<>();
        if (data.isArray()) {
            for (JsonNode o : data) {
                out.add(Map.ofEntries(
                        Map.entry("orderId", o.path("orderId").asText("")),
                        Map.entry("symbol", o.path("symbol").asText("")),
                        Map.entry("side", o.path("side").asText("")),        // buy / sell
                        Map.entry("orderType", o.path("orderType").asText("")), // limit / market
                        Map.entry("price", o.path("price").asDouble(0)),
                        Map.entry("size", o.path("size").asDouble(0)),
                        Map.entry("filledQty", o.path("baseVolume").asDouble(0)),
                        Map.entry("status", o.path("status").asText("")),
                        Map.entry("cTime", o.path("cTime").asLong(0))
                ));
            }
        }
        return out;
    }

    /**
     * 현물 체결내역(fills) 정제. side(buy/sell)·price·size·cTime.
     * ⚠️ Bitget은 과거 일정 기간(약 90일)만 제공 → 그 이전 매수는 누락될 수 있음(평균단가 부정확).
     * limit 100 단일 페이지(1차). 더 필요하면 idLessThan 페이지네이션 추가.
     */
    public List<Map<String, Object>> getSpotFills(String apiKey, String secretKey, String passphrase, String symbol) throws Exception {
        JsonNode data = get("/api/v2/spot/trade/fills?symbol=" + symbol + "&limit=100", apiKey, secretKey, passphrase);
        List<Map<String, Object>> out = new ArrayList<>();
        if (data.isArray()) {
            for (JsonNode f : data) {
                out.add(Map.ofEntries(
                        Map.entry("side", f.path("side").asText("")),
                        Map.entry("price", f.path("priceAvg").asDouble(f.path("price").asDouble(0))),
                        Map.entry("size", f.path("size").asDouble(0)),
                        Map.entry("cTime", f.path("cTime").asLong(0))
                ));
            }
        }
        return out;
    }
}
