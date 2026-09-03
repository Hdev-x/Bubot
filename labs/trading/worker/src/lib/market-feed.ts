// 공유 시세 서비스 — 활성 설정 심볼 합집합으로 CandleFeed 1개만 유지.
// 심볼당 1구독, 캔들을 EventEmitter로 broadcast → 여러 엔진이 공유.
// setSymbols()로 활성 심볼 집합이 바뀔 때만 CandleFeed를 재구축한다.
import { EventEmitter } from 'events';
import { CandleFeed, type Candle } from './candle-feed.ts';

// 신호 엔진이 쓰는 타임프레임(4h OB 감지 + 1h 진입)
// + 관찰용 하모닉(30m/4h/1d) + AB=CD(4h/1d/1w) + SMC 월봉/주봉/일봉(1M/1w/1d).
// bookTicker는 CandleFeed가 자동 포함. (Binance 스트림 인터벌은 대소문자 구분: 1m≠1M)
const INTERVALS = ['30m', '1h', '4h', '1d', '1w', '1M'];

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class MarketFeed extends EventEmitter {
  private feed: CandleFeed | null = null;
  private symbols: string[] = [];

  /** 활성 심볼 집합 갱신 — 변화가 있을 때만 CandleFeed 재구축. */
  setSymbols(symbols: string[]): void {
    const next = [...new Set(symbols.map(s => s.toUpperCase()))].sort();
    if (sameSet(next, this.symbols)) return;
    console.log(`[MarketFeed] 심볼 집합 변경: [${this.symbols.join(',')}] → [${next.join(',')}]`);
    this.symbols = next;
    this.rebuild();
  }

  private rebuild(): void {
    this.feed?.stop();
    if (this.symbols.length === 0) {
      this.feed = null;
      console.log('[MarketFeed] 활성 심볼 없음 — 피드 중지');
      return;
    }
    this.feed = new CandleFeed(this.symbols, INTERVALS);
    this.feed.onCandle(c => this.emit('candle', c));
    this.feed.onStale = (silentMs) => this.emit('stale', silentMs);
    this.feed.start();
  }

  getSymbols(): string[] {
    return [...this.symbols];
  }

  stop(): void {
    this.feed?.stop();
    this.feed = null;
    this.symbols = [];
  }
}

export type { Candle };
