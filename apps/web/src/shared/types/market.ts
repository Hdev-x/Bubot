export type Candle = {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type OrderSide = 'buy' | 'sell';

export type CoinTicker = {
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  name: string;
  last: number;
  change: number;
  changeRate: number;
  volume: number;
  tickDecimals: number;
};
