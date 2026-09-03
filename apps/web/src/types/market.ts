export type ChartRange = 'min' | '1y' | '3y' | '10y';

export type Candle = {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StockChartResponse = {
  stockCode: string;
  stockName: string;
  output2: Candle[];
  rt_cd?: string;
  message?: string;
};

export type TickerResponse = {
  code?: string;
  name?: string;
  price?: string | number;
  rate?: string | number;
  diff?: string | number;
};

export type StockSummary = {
  code?: string;
  stockCode?: string;
  name?: string;
  stockName?: string;
  price?: string | number;
  rate?: string | number;
  diff?: string | number;
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
