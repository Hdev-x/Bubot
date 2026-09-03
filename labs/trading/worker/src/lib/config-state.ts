// 설정별 런타임 상태 — 통합 워커가 configId마다 보유 포지션/진입락을 추적.
// Phase 2-6 1단계: 인메모리. (이후 trade_positions DB 어댑터로 확장 가능)
import type { EntrySignal } from './signal-engine.ts';
import type { BitgetCredentials } from './bitget.ts';
import type { TradeConfig } from './config-loader.ts';

export interface ConfigState {
  cfg:         TradeConfig;
  creds:       BitgetCredentials;
  signature:   string;          // 구독 중인 엔진 signature
  activeEntry: EntrySignal | null;
  heldKey:     string | null;   // 보유 트래커 키 (type-obTime)
  entrySize:   number;
  entering:    boolean;         // 시장가 진입 중복 방지
  closing:     boolean;         // 청산 진행 중 (폴링/이벤트 중복기록 방지)
  paperPositionId: number | null; // 페이퍼 모드 보유 포지션 id (paper_positions) — 실거래는 null
  entryMeta: Record<string, unknown> | null; // 진입 시점 부가 기록(0.5라인가·슬리피지 등) — F4 태깅에 병합
}

export class ConfigStateStore {
  private map = new Map<number, ConfigState>();

  add(cfg: TradeConfig, creds: BitgetCredentials, signature: string): ConfigState {
    const st: ConfigState = {
      cfg, creds, signature,
      activeEntry: null, heldKey: null, entrySize: 0,
      entering: false, closing: false, paperPositionId: null, entryMeta: null,
    };
    this.map.set(cfg.id, st);
    return st;
  }

  get(id: number): ConfigState | undefined { return this.map.get(id); }
  has(id: number): boolean { return this.map.has(id); }
  delete(id: number): void { this.map.delete(id); }
  ids(): number[] { return [...this.map.keys()]; }
  all(): ConfigState[] { return [...this.map.values()]; }

  /** 보유 포지션이 있는 설정만 (정리/킬스위치용) */
  withPosition(): ConfigState[] {
    return this.all().filter(s => s.activeEntry !== null);
  }
}
