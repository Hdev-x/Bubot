import type {
  ISeriesPrimitive, IPrimitivePaneRenderer, IPrimitivePaneView,
  ISeriesApi, IChartApi, Time, SeriesAttachedParameter,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';
import type { Candle } from '../../types/market';
import type { FVG, OB, OBOptions } from '../analysis/chartIndicators';
import { detectFVGs, detectOBs, DEFAULT_OB_OPTIONS, eqBox, spentAt } from '../analysis/chartIndicators';

export type { OBOptions };
export type { OBTouchType } from '../analysis/chartIndicators';

export type TFKey = '1M' | '1W' | '3D' | '1D';

// 소진 컷·판정은 shared/smc.ts의 spentAt() 하나를 쓴다 — 낭독(smc_reading.ts)도 같은 것을
// import하므로 차트와 낭독이 구조적으로 어긋날 수 없다. 소진된 존은 지우지 않고 소진시킨
// 캔들까지만 그리고 끊는다: 선의 가로 길이가 곧 그 존의 수명이다. (DECISIONS.md 2026-07-15)

export type TFIndicators = {
  showOB: boolean;
  showOBBox: boolean;
  showFVG: boolean;
  showCE: boolean;
  showEQ: boolean;
};

export type IndicatorSettings = Record<TFKey, TFIndicators> & {
  hide1DOnLower?: boolean;
};

export type IndicatorLayer = {
  tf: TFKey;
  candles: Candle[];
};

type ComputedLayer = {
  tf: TFKey;
  fvgs: FVG[];
  obs: OB[];
};

// 신뢰도 랭킹 선(스캐너 산출) — SMC와 같은 캔버스에 그림
export type RankChartLine = {
  tier: '1M' | '1W' | '3D' | '1d'; score: number; from: number;
  price?: number;                    // 낱개 선
  priceLo?: number; priceHi?: number; count?: number; // 밴드(근접 클러스터)
};
const RANK_LINE_COLORS: Record<RankChartLine['tier'], string> = {
  '1M': 'rgba(176,124,240,0.9)', '1W': 'rgba(79,195,247,0.9)', '3D': 'rgba(230,162,60,0.9)', '1d': 'rgba(102,217,163,0.9)',
};

export const TF_SECONDS: Record<TFKey, number> = {
  '1M': 2592000,
  '1W': 604800,
  '3D': 259200,
  '1D': 86400,
};

const TF_COLORS: Record<TFKey, { fvg: string; fvgBorder: string; ce: string; ob: string; obBox: string; eq: string; eqBorder: string; text: string }> = {
  '1M': { fvg: 'rgba(170,100,255,0.1)', fvgBorder: 'rgba(170,100,255,0.4)', ce: 'rgba(170,100,255,0.4)', ob: 'rgba(170,100,255,0.6)', obBox: 'rgba(170,100,255,0.12)', eq: 'rgba(170,100,255,0.12)', eqBorder: 'rgba(170,100,255,0.3)', text: '#aa64ff' },
  '1W': { fvg: 'rgba(100,160,255,0.1)', fvgBorder: 'rgba(100,160,255,0.4)', ce: 'rgba(100,160,255,0.4)', ob: 'rgba(100,160,255,0.6)', obBox: 'rgba(100,160,255,0.12)', eq: 'rgba(100,160,255,0.12)', eqBorder: 'rgba(100,160,255,0.3)', text: '#64a0ff' },
  '3D': { fvg: 'rgba(255,180,0,0.1)',   fvgBorder: 'rgba(255,180,0,0.4)',   ce: 'rgba(255,180,0,0.4)',   ob: 'rgba(255,180,0,0.6)',   obBox: 'rgba(255,180,0,0.12)',   eq: 'rgba(255,180,0,0.12)',   eqBorder: 'rgba(255,180,0,0.3)',   text: '#ffb400' },
  '1D': { fvg: 'rgba(0,188,212,0.1)',   fvgBorder: 'rgba(0,188,212,0.4)',   ce: 'rgba(0,188,212,0.4)',   ob: 'rgba(0,188,212,0.4)',   obBox: 'rgba(0,188,212,0.08)',   eq: 'rgba(0,188,212,0.08)',   eqBorder: 'rgba(0,188,212,0.15)',   text: '#00bcd4' },
};

// rgba 색의 알파를 factor배로 (무터치 흐림 처리용)
function scaleAlpha(rgba: string, factor: number): string {
  const m = rgba.match(/rgba?\(([^)]+)\)/);
  if (!m) return rgba;
  const p = m[1].split(',').map(s => s.trim());
  const a = p.length === 4 ? parseFloat(p[3]) : 1;
  return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a * factor})`;
}

// EQ 박스(0.382~0.618)를 실선 테두리로 그림
function drawEqBox(
  ctx: CanvasRenderingContext2D, low: number, high: number,
  x0: number, xEnd: number, hr: number,
  toY: (p: number) => number, fill: string, border: string,
  logScale = true,
) {
  const eq = eqBox(low, high, logScale);
  const yH = toY(eq.high);
  const yL = toY(eq.low);
  if (Math.min(yH, yL) < -9000) return;
  ctx.fillStyle = fill;
  ctx.setLineDash([]);
  ctx.fillRect(x0, Math.min(yH, yL), xEnd - x0, Math.abs(yL - yH));
  ctx.strokeStyle = border;
  ctx.lineWidth = hr;
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x0, yH); ctx.lineTo(xEnd, yH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, yL); ctx.lineTo(xEnd, yL); ctx.stroke();
}

class OverlayRenderer implements IPrimitivePaneRenderer {
  constructor(
    private getLayers: () => ComputedLayer[],
    private getLogScale: () => boolean,
    private getSettings: () => IndicatorSettings,
    private getCurrentTfSeconds: () => number,
    private series: ISeriesApi<'Candlestick'>,
    private chart: IChartApi,
    private getRankLines: () => RankChartLine[] = () => [],
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace(scope => this._draw(scope));
  }

  private _draw({ context: ctx, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }: BitmapCoordinatesRenderingScope) {
    const { width } = bitmapSize;
    const offsetSeconds = -new Date().getTimezoneOffset() * 60;
    // 현재 TF 바 시각들(스냅용). 존 시작시각이 격자에 안 맞으면 timeToCoordinate가 null → 박스가 왼쪽
    // 끝(x0=0)에서 그려지던 버그(6H/12H). 가장 가까운 실제 바로 스냅해 제자리에 그린다.
    const barTimes: number[] = ((this.series as any)?.data?.() ?? []).map((d: any) => Number(d.time));
    const toX = (t: number) => {
      const shiftedTime = t + offsetSeconds;
      let c = this.chart.timeScale().timeToCoordinate(shiftedTime as Time);
      if (c == null && barTimes.length) {
        let best = barTimes[0], bestD = Infinity;
        for (const bt of barTimes) { const d = Math.abs(bt - shiftedTime); if (d < bestD) { bestD = d; best = bt; } }
        c = this.chart.timeScale().timeToCoordinate(best as Time);
      }
      return c != null ? c * hr : -99999;
    };
    const toY = (p: number) => {
      const c = this.series.priceToCoordinate(p);
      return c != null ? c * vr : -99999;
    };

    const layers = this.getLayers();
    const settings = this.getSettings();
    const currentTfSeconds = this.getCurrentTfSeconds();

    for (const layer of layers) {
      // 현재 TF 이상(같거나 상위)만 표시
      if (TF_SECONDS[layer.tf] < currentTfSeconds) continue;

      if (layer.tf === '1D' && settings.hide1DOnLower && currentTfSeconds === TF_SECONDS['1D']) {
        continue;
      }

      const s = settings[layer.tf];
      const pal = TF_COLORS[layer.tf];
      const tf = layer.tf;

      if (s.showFVG || s.showCE || s.showEQ) {
        for (const fvg of layer.fvgs) {
          const x0 = Math.max(0, toX(fvg.startTime));
          const yH = toY(fvg.high);
          const yL = toY(fvg.low);
          if (Math.min(yH, yL) < -9000) continue;

          // 채워짐(filled) 무시. 평생 무터치(bandFaded)는 통째로 숨기고, 소진은 지우지 않고
          // 소진시킨 캔들에서 선을 끊는다 — 규칙은 DECISIONS.md 2026-07-15 참조
          if (fvg.bandFaded) continue;
          const spent = spentAt(fvg.bandPassTimes);
          const xEnd = spent === null ? width : toX(spent);
          if (xEnd <= x0) continue;

          if (s.showEQ) {
            drawEqBox(ctx, fvg.low, fvg.high, x0, xEnd, hr, toY, pal.eq, pal.eqBorder, this.getLogScale());
          }
          if (s.showFVG) {
            ctx.fillStyle = pal.fvg;
            ctx.fillRect(x0, Math.min(yH, yL), xEnd - x0, Math.abs(yL - yH));
            ctx.strokeStyle = pal.fvgBorder;
            ctx.lineWidth = hr;
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(x0, yH); ctx.lineTo(xEnd, yH); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x0, yL); ctx.lineTo(xEnd, yL); ctx.stroke();
          }
          if (s.showCE) {
            const yCE = toY(fvg.ce);
            if (yCE > -9000) {
              ctx.strokeStyle = pal.ce;
              ctx.lineWidth = hr;
              ctx.setLineDash([]);
              ctx.beginPath(); ctx.moveTo(x0, yCE); ctx.lineTo(xEnd, yCE); ctx.stroke();
              ctx.font = `${10 * vr}px Pretendard`;
              ctx.fillStyle = pal.text;
              ctx.textAlign = 'right';
              ctx.textBaseline = 'middle';
              ctx.fillText(`${tf} CE`, xEnd - 4 * hr, yCE);
              ctx.textAlign = 'left';
              ctx.textBaseline = 'alphabetic';
            }
          }
        }
      }

      if (s.showOBBox || s.showOB || s.showEQ) {
        for (const ob of layer.obs) {
          const x0 = Math.max(0, toX(ob.time));
          const yH = toY(ob.high);
          const yL = toY(ob.low);
          const yM = toY(ob.mid);
          if (yM < -9000) continue;

          if (ob.bandFaded) continue;
          const obSpent = spentAt(ob.bandPassTimes);
          const xEnd = obSpent === null ? width : toX(obSpent);
          if (xEnd <= x0) continue;

          if (s.showEQ && Math.min(yH, yL) > -9000) {
            drawEqBox(ctx, ob.low, ob.high, x0, xEnd, hr, toY, pal.eq, pal.eqBorder, this.getLogScale());
          }
          if (s.showOBBox && Math.min(yH, yL) > -9000) {
            ctx.fillStyle = pal.obBox;
            ctx.setLineDash([]);
            ctx.fillRect(x0, Math.min(yH, yL), xEnd - x0, Math.abs(yL - yH));
          }
          if (s.showOB) {
            ctx.strokeStyle = pal.ob;
            ctx.lineWidth = hr;
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(x0, yM); ctx.lineTo(xEnd, yM); ctx.stroke();
            ctx.font = `${10 * vr}px Pretendard`;
            ctx.fillStyle = pal.text;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${tf} OB`, xEnd - 4 * hr, yM);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
          }
        }
      }
    }

    // ── 신뢰도 랭킹 — 낱개 선은 line, 근접 클러스터는 밴드(rect)로 (매물대 표현) ──
    for (const rl of this.getRankLines()) {
      const color = RANK_LINE_COLORS[rl.tier];
      const x0 = Math.max(0, toX(rl.from));
      ctx.font = `${10 * vr}px Pretendard`;
      ctx.setLineDash([]);
      if (rl.priceLo != null && rl.priceHi != null) {
        const yT = toY(rl.priceHi), yB = toY(rl.priceLo);
        if (Math.min(yT, yB) < -9000) continue;
        ctx.fillStyle = scaleAlpha(color, 0.18);
        ctx.fillRect(x0, Math.min(yT, yB), width - x0, Math.max(1, Math.abs(yB - yT)));
        ctx.strokeStyle = scaleAlpha(color, 0.7);
        ctx.lineWidth = hr;
        ctx.beginPath(); ctx.moveTo(x0, yT); ctx.lineTo(width, yT); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0, yB); ctx.lineTo(width, yB); ctx.stroke();
        ctx.fillStyle = color;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(`${rl.tier} ★${rl.score} ×${rl.count}`, width - 4 * hr, (yT + yB) / 2);
      } else if (rl.price != null) {
        const yy = toY(rl.price);
        if (yy < -9000) continue;
        ctx.strokeStyle = color;
        ctx.lineWidth = hr;
        ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(width, yy); ctx.stroke();
        ctx.fillStyle = color;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(`${rl.tier} ★${rl.score}`, width - 4 * hr, yy);
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }
}

export class ChartOverlay implements ISeriesPrimitive<Time> {
  private _computed: ComputedLayer[] = [];
  private _logScale = true;
  private _settings: IndicatorSettings = {
    '1M': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1W': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '3D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    hide1DOnLower: false,
  };
  private _currentTfSeconds = 0;
  private _rankLines: RankChartLine[] = [];
  private _series: ISeriesApi<'Candlestick'> | null = null;
  private _chart: IChartApi | null = null;
  private _requestUpdate?: () => void;

  attached(param: SeriesAttachedParameter<Time>) {
    this._series = param.series as unknown as ISeriesApi<'Candlestick'>;
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
  }

  detached() {
    this._series = null;
    this._chart = null;
  }

  paneViews(): IPrimitivePaneView[] {
    if (!this._series || !this._chart) return [];
    return [{
      renderer: () => new OverlayRenderer(
        () => this._computed,
        () => this._logScale,
        () => this._settings,
        () => this._currentTfSeconds,
        this._series!,
        this._chart!,
        () => this._rankLines,
      ),
      // 'normal': 캔들 위에 그리되 최상단 'top' 레이어는 아님.
      // (takeScreenshot이 'top' 레이어를 제외해 SMC가 캡쳐에서 빠지던 문제 해결 — 2026-07-08)
      zOrder: () => 'normal' as const,
    }];
  }

  update(layers: IndicatorLayer[], settings: IndicatorSettings, currentTfSeconds: number, obOptions: OBOptions = DEFAULT_OB_OPTIONS, logScale = true) {
    this._computed = layers.map(l => {
      // 진행중(라이브) 캔들은 종가가 실시간으로 바뀌어 새 박스 깜빡임·기존 박스
      // 오判 미티게이션을 유발하므로 감지 입력에서 제외(마감 확정봉만 사용).
      const confirmed = l.candles.length > 1 ? l.candles.slice(0, -1) : l.candles;
      return {
        tf: l.tf,
        fvgs: (settings[l.tf].showFVG || settings[l.tf].showCE || settings[l.tf].showEQ) ? detectFVGs(confirmed, { logScale }) : [],
        obs: (settings[l.tf].showOB || settings[l.tf].showOBBox || settings[l.tf].showEQ) ? detectOBs(confirmed, { ...obOptions, logScale }) : [],
      };
    });
    this._settings = settings;
    this._currentTfSeconds = currentTfSeconds;
    this._logScale = logScale;
    this._requestUpdate?.();
  }

  updateRankLines(lines: RankChartLine[]) {
    this._rankLines = lines;
    this._requestUpdate?.();
  }
}
