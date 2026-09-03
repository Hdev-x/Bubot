package com.tj.app.market.coin;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.reactive.function.client.WebClient;



import java.util.List;

/** ============================================================
 * [클래스 읽기] 코인 관련 모든 요청을 처리하는 컨트롤러.
 *
 * [@Controller + @ResponseBody]
 *   JSP 뷰와 모의 지갑 API는 TPM 잔해 정리(2026-09-02)에서 제거했다. 남은 메서드는 모두 JSON 프록시다.
 *
 * [@RequestMapping("/coin/*")]
 *   이 컨트롤러의 모든 엔드포인트는 /coin/ 아래에 매핑된다.
 *   * 와일드카드: /coin/chart, /coin/buy, /coin/api/tickers 등 모두 포함.
 *
 * [프록시 엔드포인트 존재 이유]
 *   브라우저의 Same-Origin Policy(동일 출처 정책)로 인해
 *   JavaScript에서 Bitget·CoinGecko·Bithumb API를 직접 호출하면 CORS 오류가 발생한다.
 *   Spring 서버를 중간 프록시로 두면 서버 → 외부 API → 브라우저 흐름으로 우회할 수 있다.
 *   캐싱(CoinMarketService)도 함께 적용돼 외부 API 호출 횟수를 줄인다.
 * ============================================================ */
@Controller
@RequestMapping("/coin/*")
public class CoinController {

	/** CoinService: 매수·매도·보유·주문 내역 등 비즈니스 로직 처리 */

	/** CoinMarketService: Bitget·CoinGecko·Bithumb 외부 API 호출 + 캐싱 */
	@Autowired
	private CoinMarketService marketService;

	// ============================================================
	// [외부 API 프록시 엔드포인트] — @ResponseBody → JSON 반환
	// ============================================================

	/** ============================================================
	 * [메서드 읽기] Bitget 전체 Ticker 목록을 프록시로 반환한다.
	 *
	 * [흐름] GET /coin/api/tickers → CoinMarketService.getTickers() → Bitget API (캐시 10초)
	 * [이유] 브라우저 CORS 제한 우회. JS가 직접 Bitget을 호출하지 않아도 된다.
	 * ============================================================ */
	@GetMapping("api/tickers")
	@ResponseBody
	public Object getTickers() {
		return marketService.getTickers();
	}

	@GetMapping("api/futures/tickers")
	@ResponseBody
	public Object getFuturesTickers(@RequestParam(value = "productType", defaultValue = "USDT-FUTURES") String productType) {
		return marketService.getFuturesTickers(productType);
	}

	@GetMapping("api/price-precision")
	@ResponseBody
	public Map<String, Integer> getPricePrecision() {
		return marketService.getPricePrecision();
	}

	@GetMapping("api/binance/spot/tickers")
	@ResponseBody
	public Object getBinanceSpotTickers() {
		return marketService.getBinanceSpotTickers();
	}

	// KRW 마켓 리스트 — 서버 캐시 집약(업비트/빗썸 직접 폴링을 백엔드 1콜로). 멀티유저 429 방지.
	@GetMapping("api/upbit/tickers")
	@ResponseBody
	public Object getUpbitTickers() {
		return marketService.getUpbitTickers();
	}

	@GetMapping("api/bithumb/tickers")
	@ResponseBody
	public Object getBithumbTickers() {
		return marketService.getBithumbTickers();
	}

	// KRW 캔들 — 서버 캐시 집약. 업비트는 동시 버스트 시 즉시 429라 브라우저 직결이면 차트가 안 뜸 → 백엔드 경유.
	@GetMapping("api/upbit/candles")
	@ResponseBody
	public Object getUpbitCandles(@RequestParam("symbol") String symbol,
								  @RequestParam("granularity") String granularity,
								  @RequestParam(value = "count", defaultValue = "200") int count,
								  @RequestParam(value = "to", required = false) Long to) {
		return marketService.getUpbitCandles(granularity, symbol, count, to);
	}

	@GetMapping("api/bithumb/candles")
	@ResponseBody
	public Object getBithumbCandles(@RequestParam("symbol") String symbol,
									@RequestParam("granularity") String granularity,
									@RequestParam(value = "count", defaultValue = "200") int count,
									@RequestParam(value = "to", required = false) Long to) {
		return marketService.getBithumbCandles(granularity, symbol, count, to);
	}

	@GetMapping("api/binance/futures/tickers")
	@ResponseBody
	public Object getBinanceFuturesTickers() {
		return marketService.getBinanceFuturesTickers();
	}

	@GetMapping("api/binance/futures/candles")
	@ResponseBody
	public Object getBinanceFuturesCandles(@RequestParam("symbol") String symbol,
										   @RequestParam("interval") String interval,
										   @RequestParam(value = "limit", defaultValue = "1500") String limit,
										   @RequestParam(value = "endTime", required = false) String endTime) {
		return marketService.getBinanceFuturesCandles(symbol, interval, limit, endTime);
	}

	@GetMapping("api/binance/spot/candles")
	@ResponseBody
	public Object getBinanceSpotCandles(@RequestParam("symbol") String symbol,
										@RequestParam("interval") String interval,
										@RequestParam(value = "limit", defaultValue = "1500") String limit,
										@RequestParam(value = "endTime", required = false) String endTime) {
		return marketService.getBinanceSpotCandles(symbol, interval, limit, endTime);
	}

	// Binance 호가(depth) 프록시 — 브라우저 직결이 지역차단되는 환경 회피(서버 경유).
	@GetMapping("api/binance/futures/depth")
	@ResponseBody
	public Object getBinanceFuturesDepth(@RequestParam("symbol") String symbol,
										 @RequestParam(value = "limit", defaultValue = "500") String limit) {
		return marketService.getBinanceFuturesDepth(symbol, limit);
	}

	@GetMapping("api/binance/spot/depth")
	@ResponseBody
	public Object getBinanceSpotDepth(@RequestParam("symbol") String symbol,
									  @RequestParam(value = "limit", defaultValue = "500") String limit) {
		return marketService.getBinanceSpotDepth(symbol, limit);
	}

	/** ============================================================
	 * [메서드 읽기] Bitget 캔들(OHLCV) 데이터를 프록시로 반환한다.
	 *
	 * [@RequestParam defaultValue] limit을 전달하지 않으면 "200"이 기본값.
	 * [@RequestParam required=false] endTime은 없어도 되는 선택적 파라미터.
	 *   값이 없으면 null로 넘어가고, CoinMarketService에서 null 체크 후 생략한다.
	 * ============================================================ */
	@GetMapping("api/candles")
	@ResponseBody
	public Object getCandles(@RequestParam("symbol") String symbol,
							 @RequestParam("granularity") String granularity,
							 @RequestParam(value = "limit", defaultValue = "200") String limit,
							 @RequestParam(value = "endTime", required = false) String endTime,
							 @RequestParam(value = "productType", required = false) String productType) {
		return marketService.getCandles(symbol, granularity, limit, endTime, productType);
	}

	/** ============================================================
	 * [메서드 읽기] CoinGecko 코인 부가 정보(시가총액·등락률 등)를 프록시로 반환한다.
	 *
	 * [주의] CoinGecko 무료 플랜은 분당 요청 수가 제한된다(429 Too Many Requests).
	 *   CoinMarketService에서 10분 캐시를 적용해 과도한 호출을 방지한다.
	 * ============================================================ */
	@GetMapping("api/extra-stats")
	@ResponseBody
	public Object getExtraStats(@RequestParam("ticker") String ticker) {
		return marketService.getExtraStats(ticker);
	}

	/** ============================================================
	 * [메서드 읽기] CoinGecko 코인 로고 이미지 URL 맵을 프록시로 반환한다.
	 *
	 * [반환 형태] { "BTC": "https://...", "ETH": "https://..." }
	 * [캐시] 1시간. 로고는 자주 바뀌지 않으므로 긴 TTL 적용.
	 * ============================================================ */
	@GetMapping("api/logos")
	@ResponseBody
	public Map<String, String> getLogos() {
		return marketService.getLogos();
	}

	/** ============================================================
	 * [메서드 읽기] Bithumb 원화(KRW) 기준 Ticker를 프록시로 반환한다.
	 *
	 * [defaultValue] order="BTC", payment="KRW" → 파라미터 없으면 BTC/KRW 조회.
	 * [캐시] CoinMarketService 내부에서 2초 캐싱 처리.
	 * ============================================================ */
	@GetMapping("api/bithumb/ticker")
	@ResponseBody
	public Object getBithumbTicker(@RequestParam(value="order", defaultValue="BTC") String order,
								   @RequestParam(value="payment", defaultValue="KRW") String payment) {
		return marketService.getBithumbTicker(order, payment);
	}

}
