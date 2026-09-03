import { isBinanceFuturesSupported } from '../api/exchange/binance/binanceSymbols';

export type ChartTarget = { exchange: 'BITGET' | 'BINANCE'; productType: string | undefined };

/**
 * 트레이드 컨텍스트(트레이드 시트 선택 · 마켓에서 트레이드 진입)에서 종목을 볼 때 차트 거래소 정책:
 *  - 선물: 바이낸스 선물 우선(없으면 비트겟 선물), productType='USDT-FUTURES'
 *  - 현물: 무조건 비트겟 현물, productType=undefined
 * (차트 버튼으로 직접 진입할 때는 이 정책을 쓰지 않고 마켓 거래소를 존중한다.)
 */
export async function resolveTradeChartTarget(symbol: string, market: 'spot' | 'futures'): Promise<ChartTarget> {
  if (market === 'futures') {
    const onBinance = await isBinanceFuturesSupported(symbol);
    return { exchange: onBinance ? 'BINANCE' : 'BITGET', productType: 'USDT-FUTURES' };
  }
  return { exchange: 'BITGET', productType: undefined };
}
