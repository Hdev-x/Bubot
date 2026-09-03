import React, { useEffect, useState } from 'react';
import { fetchAllBinanceFuturesCandles } from '../../api/tpmApi';
import { HARMONIC_PRICE_LOSS_CAP_PCT, runBacktest } from '../../utils/backtestEngine';
import type { BacktestResult } from '../../utils/backtestEngine';
import { SYMBOLS_MAIN, SYMBOLS_4H_TOP5, SYMBOLS } from '../../constants/strategyConstants';
import type { StrategyConfig } from '../../constants/strategyConstants';
import { DEFAULT_STRATEGY_PARAMS } from '../../utils/backtestEngine';
import { buildReport, MIN_MEANINGFUL_TRADES } from '../../utils/backtestReport';
import { fetchBacktestRuns, saveBacktestRun, deleteBacktestRun, hashRunConfig } from '../../api/backtestRunApi';
import type { BacktestRun } from '../../api/backtestRunApi';
import { fromLegacyBacktest, toLegacyBacktest, normalizeConfig, validateConfig } from '../../../../../shared/strategy-schema';
import type { StrategyConfigInput } from '../../../../../shared/strategy-schema';
import { evColor, pctColor } from './StrategyUI';

export function BacktestPanel({
  strategy, strategies, activeIdx, onSelectStrategy, onUpdate, onApplyLive
}: {
  strategy: StrategyConfig;
  strategies: StrategyConfig[];
  activeIdx: number;
  onSelectStrategy: (idx: number) => void;
  onUpdate?: (idx: number, cfg: StrategyConfig) => void;
  onApplyLive?: (strategy: StrategyConfig, symbols: string[]) => void;
}) {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['BTCUSDT', 'ETHUSDT']);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, currentSymbol: '', candleCount: 0 });
  const [startDate, setStartDate] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showSymbolGroups, setShowSymbolGroups] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [showRuns, setShowRuns] = useState(false);

  const loadRuns = async () => {
    try { setRuns(await fetchBacktestRuns()); }
    catch { /* 미로그인 등 — 이력 없이 동작 */ }
  };
  useEffect(() => { void loadRuns(); }, []);
  const [jsonText, setJsonText] = useState('');
  const [jsonStatus, setJsonStatus] = useState<{ kind: 'ok' | 'error'; messages: string[] } | null>(null);

  // 현재 폼 상태 → 스키마 JSON (대상 심볼은 첫 선택 심볼 기준)
  const exportJson = () => {
    const cfg = fromLegacyBacktest(strategy, selectedSymbols[0] ?? 'BTCUSDT');
    setJsonText(JSON.stringify(cfg, null, 2));
    setJsonStatus(null);
  };

  // JSON → normalize + validate → 폼(전략 슬롯)에 반영. 심볼 선택은 건드리지 않음.
  const applyJson = () => {
    let parsed: StrategyConfigInput;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e: any) {
      setJsonStatus({ kind: 'error', messages: [`JSON 파싱 실패: ${e.message}`] });
      return;
    }
    if (!parsed || typeof parsed !== 'object' || !(parsed as any).detector?.kind) {
      setJsonStatus({ kind: 'error', messages: ['detector.kind가 없는 설정입니다.'] });
      return;
    }
    const cfg = normalizeConfig(parsed);
    const errors = validateConfig(cfg);
    if (errors.length) {
      setJsonStatus({ kind: 'error', messages: errors });
      return;
    }
    applySchemaConfig(cfg);
    setJsonStatus({ kind: 'ok', messages: ['설정을 폼에 적용했습니다. 스키마에 없는 백테스트 전용 필터는 기본값으로 초기화됩니다.'] });
  };

  // 스키마 설정 → 폼(전략 슬롯) 반영. JSON 적용과 이력 행 클릭이 공용.
  const applySchemaConfig = (cfg: ReturnType<typeof normalizeConfig>) => {
    const legacy = toLegacyBacktest(cfg);
    onUpdate?.(activeIdx, {
      name: legacy.name,
      obGranularity: legacy.obGranularity,
      entryGranularity: legacy.entryGranularity,
      initialCapital: legacy.initialCapital,
      params: { ...DEFAULT_STRATEGY_PARAMS, ...legacy.params },
    });
  };

  // 이력 행 클릭 → 설정 폼 + 심볼 + 기간 복원
  const applyRun = (run: BacktestRun) => {
    applySchemaConfig(normalizeConfig(run.config));
    setSelectedSymbols(run.symbols);
    setStartDate(run.rangeStart ?? '');
  };

  // 실험 이력 → 자동매매 설정 화면으로 직행 (스키마 JSON → 레거시 변환 후 기존 적용 경로 재사용)
  const applyRunLive = (run: BacktestRun) => {
    const legacy = toLegacyBacktest(normalizeConfig(run.config));
    onApplyLive?.({
      name: legacy.name,
      obGranularity: legacy.obGranularity,
      entryGranularity: legacy.entryGranularity,
      initialCapital: legacy.initialCapital,
      params: { ...DEFAULT_STRATEGY_PARAMS, ...legacy.params },
    }, run.symbols);
  };

  const toggleSymbol = (sym: string) =>
    setSelectedSymbols(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
    );

  const strategyName = (s: StrategyConfig) =>
    s.params.useFvgStrategy ? s.name.replace(/OB/g, 'FVG') : s.name;

  const timeframeLabel = (s: StrategyConfig) => {
    if (s.params.useHarmonicStrategy) {
      if (s.params.harmonicUseEqFilter === false) {
        return `${s.entryGranularity} 하모닉·진입 / EQ 미사용`;
      }
      return `${s.obGranularity} EQ / ${s.entryGranularity} 하모닉·진입`;
    }
    return `${s.obGranularity} ${s.params.useFvgStrategy ? 'FVG' : 'OB'} 기준 / ${s.entryGranularity} 진입`;
  };

  const familyOf = (s: StrategyConfig) => {
    if (s.params.useAbcdStrategy) return 'ABCD';
    if (s.params.useHarmonicStrategy) return 'HARMONIC';
    return 'SMC';
  };

  const selectFamily = (family: 'HARMONIC' | 'ABCD' | 'SMC') => {
    const idx = strategies.findIndex(s => familyOf(s) === family);
    if (idx >= 0) onSelectStrategy(idx);
  };

  const familyIcon = (family: 'HARMONIC' | 'ABCD' | 'SMC') => {
    const stroke = family === 'ABCD' ? '#3182f6' : family === 'SMC' ? '#f3ba2f' : '#0ecb81';
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {family === 'HARMONIC' ? (
          <path d="M3 20L8 6L12 14L16 4L21 20" />
        ) : family === 'ABCD' ? (
          <path d="M3 5L9 16L14 9L21 20" />
        ) : (
          <>
            <rect x="3" y="7" width="18" height="10" rx="1" />
            <line x1="3" y1="12" x2="21" y2="12" strokeWidth="1.5" />
          </>
        )}
      </svg>
    );
  };

  const handleRun = async () => {
    if (!selectedSymbols.length) return;
    setIsRunning(true);
    setResults([]);
    setProgress({ done: 0, total: selectedSymbols.length, currentSymbol: '', candleCount: 0 });
    const startTs = startDate ? new Date(startDate).getTime() / 1000 : 0;
    const newResults: BacktestResult[] = [];
    
    for (const symbol of selectedSymbols) {
      setProgress(p => ({ ...p, currentSymbol: symbol, candleCount: 0 }));
      try {
        const needsObCandles = !(strategy.params.useHarmonicStrategy && strategy.params.harmonicUseEqFilter === false);
        const rawObCandles = needsObCandles
          ? await fetchAllBinanceFuturesCandles(symbol, strategy.obGranularity, 99999)
          : [];
        const rawEntryCandles = await fetchAllBinanceFuturesCandles(symbol, strategy.entryGranularity, 20000, 
          (count) => setProgress(p => ({ ...p, candleCount: count }))
        );

        const obCandles    = startTs ? rawObCandles.filter(c => Number(c.time) >= startTs)    : rawObCandles;
        const entryCandles = startTs ? rawEntryCandles.filter(c => Number(c.time) >= startTs) : rawEntryCandles;

        if ((needsObCandles ? obCandles.length > 0 : true) && entryCandles.length > 0) {
          newResults.push(runBacktest(symbol, obCandles, entryCandles, strategy.params, strategy.initialCapital));
          setResults([...newResults]);
        }
      } catch (e) {
        // 심볼 단위 실패는 건너뛰되, 원인 파악을 위해 콘솔에 남긴다(네트워크/런타임 에러 모두).
        console.error(`[백테스트] ${symbol} 실패:`, e);
      }
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setIsRunning(false);

    // 실험 이력 자동 저장 — 설정 JSON + 표준 리포트 (거래 원장 미저장, 설정으로 재현)
    if (newResults.length > 0) {
      try {
        const cfg = fromLegacyBacktest(strategy, selectedSymbols[0] ?? 'BTCUSDT');
        const rep = buildReport(newResults, strategy.initialCapital);
        const rangeEnd = new Date().toISOString().slice(0, 10);
        await saveBacktestRun({
          name: `${strategyName(strategy)} · ${selectedSymbols.length}심볼`,
          config: cfg,
          symbols: selectedSymbols,
          rangeStart: startDate || undefined,
          rangeEnd,
          report: rep,
          configHash: hashRunConfig(cfg, selectedSymbols, startDate || undefined),
        });
        void loadRuns();
      } catch (e) {
        console.warn('[백테스트] 실험 이력 저장 실패(결과 표시는 정상):', e);
      }
    }
  };

  const { params: p } = strategy;
  const capitalModeLabel = (p.capitalMode ?? 'fixed') === 'compound' ? '복리' : '고정시드';
  const harmonicPatternLabel = p.useHarmonicStrategy
    ? (p.harmonicEnabledPatterns?.length ? p.harmonicEnabledPatterns.join(', ') : '전체')
    : null;
  const harmonicEntryLabel = () => {
    const mode = p.harmonicEntryMode ?? 'close';
    return mode === 'immediate'
      ? '꼬리 터치 즉시 진입 (high/low가 PRZ 터치, PRZ 중간값 체결)'
      : '봉마감 종가 진입 (close가 PRZ 안착, 종가 체결)';
  };
  const harmonicStopLabel = () => {
    const slCap = p.harmonicSlCapPct ?? HARMONIC_PRICE_LOSS_CAP_PCT;
    const accountLoss = slCap * p.leverage * (p.positionPct / 100);
    return `가격 손절 ${slCap}% 캡 (레버리지/비중 반영 계좌손실 최대 ${accountLoss.toFixed(2)}%, 패턴 SL이 더 가까우면 패턴 SL 사용)`;
  };
  const genericEntryLabel = () => {
    if (p.entryOnFirstTouch) return '첫 꼬리 터치 즉시 진입';
    if (p.fvgEntryAtBorder) return 'FVG 경계 터치 즉시 진입';
    if (p.fvgEntryAtLow) return 'FVG 딥 경계 터치 즉시 진입';
    if (p.fvgEntryAtLowAfterSignal) return '신호 이후 FVG 딥 경계 풀백 진입';
    return '전략 기본 진입 조건';
  };
  const formatUsd = (value?: number) => {
    if (value === undefined) return '-';
    const abs = Math.abs(value).toFixed(2);
    return value < 0 ? `-$${abs}` : `+$${abs}`;
  };
  const avgWinRate  = results.length ? +(results.reduce((s, r) => s + r.winRate, 0) / results.length).toFixed(1) : null;
  const avgEV       = results.length ? +(results.reduce((s, r) => s + r.ev, 0) / results.length).toFixed(3) : null;
  const totalTrades = results.reduce((s, r) => s + r.n, 0);
  const netProfit = results.reduce((sum, r) => sum + (r.finalBalance - strategy.initialCapital), 0);
  const maxDrawdown = results.length ? Math.max(...results.map(r => r.mdd)) : 0;
  const report = results.length ? buildReport(results, strategy.initialCapital) : null;
  const allTradesAsc = results
    .flatMap(r => r.trades.map((t, i) => ({ ...t, symbol: r.symbol, seq: i + 1 })))
    .sort((a, b) => a.entryTime - b.entryTime);
  const recentTrades = results
    .flatMap(r => r.trades.map((t, i) => ({ ...t, symbol: r.symbol, seq: i + 1 })))
    .sort((a, b) => b.entryTime - a.entryTime)
    .slice(0, 30);
  const equityCurve = (() => {
    let equity = strategy.initialCapital;
    const values = [equity, ...allTradesAsc.map(t => {
      equity += t.capitalDelta ?? 0;
      return equity;
    })];
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((value, idx) => {
      const x = (idx / (values.length - 1)) * 300;
      const y = 110 - ((value - min) / range) * 100;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  })();

  const handleDownloadTxt = () => {
    if (!results.length) return;
    
    const stratName = strategyName(strategy);
    let txt = `[백테스트 결과 리포트]\n`;
    txt += `전략명: ${stratName}\n`;
    txt += `설정: ${timeframeLabel(strategy)}\n`;
    txt += `자금 계산: ${capitalModeLabel}\n`;
    txt += `초기 시드: $${strategy.initialCapital}\n`;
    txt += `레버리지/진입비중: ${p.leverage}x / 계좌 ${p.positionPct}%\n`;
    if (harmonicPatternLabel) txt += `하모닉 패턴: ${harmonicPatternLabel}\n`;
    if (strategy.params.useHarmonicStrategy) {
      txt += `진입 방식: ${harmonicEntryLabel()}\n`;
      txt += `손절 기준: ${harmonicStopLabel()}\n`;
      txt += `TP 분할: TP1 ${p.harmonicTp1Pct ?? 50}% / TP2 ${p.harmonicTp2Pct ?? 50}%\n`;
      txt += `TP1 후 스탑 본절 이동: ${p.harmonicMoveStopToBreakeven ? 'ON' : 'OFF'}\n`;
      txt += `최대 보유 캔들: ${p.maxHoldCandles}개 (${strategy.entryGranularity})\n`;
    } else {
      txt += `진입 방식: ${genericEntryLabel()}\n`;
      txt += `TP/SL 설정: TP ${p.tpPercent}% / SL ${p.slPercent}%\n`;
    }
    txt += `데이터 시작일: ${startDate || '전체 기간'}\n\n`;
    
    txt += `[요약]\n`;
    txt += `총 체결: ${totalTrades}\n`;
    txt += `평균 승률: ${avgWinRate}%\n`;
    txt += `평균 기대수익(EV): ${avgEV}%\n\n`;

    if (strategy.params.useHarmonicStrategy) {
      const allTpDepths = results.flatMap(r => r.tpDepths ?? []);
      const allCancelledDepths = results.flatMap(r => r.cancelledDepths ?? []);
      
      const makeDist = (depths: number[]) => {
        let d0_2 = 0, d2_382 = 0, d382_5 = 0, d5_618 = 0, d618_786 = 0, d786_1 = 0, d1_over = 0;
        depths.forEach(d => {
          if (d < 0.2) d0_2++;
          else if (d < 0.382) d2_382++;
          else if (d < 0.5) d382_5++;
          else if (d < 0.618) d5_618++;
          else if (d < 0.786) d618_786++;
          else if (d <= 1.0) d786_1++;
          else d1_over++;
        });
        return { d0_2, d2_382, d382_5, d5_618, d618_786, d786_1, d1_over, total: depths.length };
      };
      
      const tpDist = makeDist(allTpDepths);
      const cancelDist = makeDist(allCancelledDepths);

      txt += `[PRZ 반전 깊이 통계 (D점=0, SL=1)]\n`;
      txt += `구간\t\t성공(TP)\t\t폐기(미체결TP)\n`;
      txt += `------------------------------------------------------------\n`;
      txt += `0.0 ~ 0.200\t${tpDist.d0_2}\t\t${cancelDist.d0_2}\n`;
      txt += `0.200 ~ 0.382\t${tpDist.d2_382}\t\t${cancelDist.d2_382}\n`;
      txt += `0.382 ~ 0.500\t${tpDist.d382_5}\t\t${cancelDist.d382_5}\n`;
      txt += `0.500 ~ 0.618\t${tpDist.d5_618}\t\t${cancelDist.d5_618}\n`;
      txt += `0.618 ~ 0.786\t${tpDist.d618_786}\t\t${cancelDist.d618_786}\n`;
      txt += `0.786 ~ 1.000\t${tpDist.d786_1}\t\t${cancelDist.d786_1}\n`;
      txt += `1.0 초과 (슬리피지 등)\t${tpDist.d1_over}\t\t${cancelDist.d1_over}\n`;
      txt += `------------------------------------------------------------\n`;
      txt += `총합\t\t${tpDist.total}\t\t${cancelDist.total}\n\n`;
    }
    
    txt += `[심볼별 상세 결과]\n`;
    const sl1H = p.useHarmonicStrategy ? 'SL' : 'SL1';
    const sl23H = p.useHarmonicStrategy ? '' : '\tSL2\tSL3';
    txt += `심볼\t횟수\tTP1\tTP2\t${sl1H}${sl23H}\t승률\tEV\tMDD\t1만불달성\t최종잔고\t수익률\n`;
    txt += `------------------------------------------------------------\n`;
    
    const sorted = [...results].sort((a, b) => b.ev - a.ev);
    sorted.forEach(r => {
      const tp1C = r.tp1Count ?? r.trades.filter(t => t.tpExitLevel === 1 || (t.tp1Hit && t.tpExitLevel !== 2)).length;
      const tp2C = r.tp2Count ?? r.trades.filter(t => t.tpExitLevel === 2).length;
      const tp1Pct = r.n > 0 ? ((tp1C / r.n) * 100).toFixed(1) : '0.0';
      const tp2Pct = r.n > 0 ? ((tp2C / r.n) * 100).toFixed(1) : '0.0';
      const sl1Pct = r.n > 0 ? ((r.sl1Count / r.n) * 100).toFixed(1) : '0.0';
      const sl2Pct = r.n > 0 ? ((r.sl2Count / r.n) * 100).toFixed(1) : '0.0';
      const sl3Pct = r.n > 0 ? ((r.sl3Count / r.n) * 100).toFixed(1) : '0.0';
      const winRatePct = r.n > 0 ? (((tp1C + tp2C) / r.n) * 100).toFixed(1) : '0.0';
      
      const effBalance = r.finalBalance + (r.hit10kCount || 0) * 10000;
      const ret = ((effBalance / strategy.initialCapital) - 1) * 100;

      const sl1Col = `${r.sl1Count}(${sl1Pct}%)`;
      const sl23Col = p.useHarmonicStrategy ? '' : `\t${r.sl2Count}(${sl2Pct}%)\t${r.sl3Count}(${sl3Pct}%)`;

      txt += `${r.symbol.padEnd(10)}\t${r.n}\t${tp1C}(${tp1Pct}%)\t${tp2C}(${tp2Pct}%)\t${sl1Col}${sl23Col}\t${winRatePct}%\t${r.ev}%\t-${r.mdd.toFixed(1)}%\t${r.hit10kCount || 0}회\t$${Math.round(effBalance)}\t${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%\n`;
    });
    
    txt += `\n[모든 거래 내역]\n`;
    sorted.forEach(r => {
      if (r.trades.length === 0) return;
      txt += `\n--- ${r.symbol} ---\n`;
      r.trades.forEach((t, i) => {
        const entryTime = new Date(t.entryTime * 1000).toLocaleString('ko-KR');
        const exitTime = new Date(t.exitTime * 1000).toLocaleString('ko-KR');
        const pnl = t.capitalPnl >= 0 ? `+${t.capitalPnl.toFixed(2)}` : t.capitalPnl.toFixed(2);
        const delta = formatUsd(t.capitalDelta);
        const balanceBefore = t.balanceBefore !== undefined ? `$${t.balanceBefore.toFixed(2)}` : '-';
        const balanceAfter = t.balanceAfter !== undefined ? `$${t.balanceAfter.toFixed(2)}` : '-';
        const pattern = t.patternName ? ` ${t.patternName}` : '';
        const tpLabel = t.tpExitLevel === 2 ? ' / TP2' : (t.tp1Hit || t.tpExitLevel === 1) ? ' / TP1' : '';
        const confluence = (t.confluenceCount ?? 1) > 1
          ? ` | 중첩: ${t.confluenceCount}개 (${(t.confluencePatterns ?? []).join(', ')})`
          : '';
        const targetText = t.stopLossPct !== undefined && t.tp1ProfitPct !== undefined && t.tp2ProfitPct !== undefined
          ? ` | 목표: SL -${t.stopLossPct.toFixed(2)}% / TP1 +${t.tp1ProfitPct.toFixed(2)}% / TP2 +${t.tp2ProfitPct.toFixed(2)}%`
          : '';
        const splitText = t.tp1RealizedDelta !== undefined || t.remainderDelta !== undefined
          ? ` | 분할손익: TP1 실현 ${formatUsd(t.tp1RealizedDelta)} / 잔여 ${t.remainderExitLabel ?? '-'} ${formatUsd(t.remainderDelta)}`
          : '';
        const abcdText = t.abcdRatio !== undefined
          ? ` | AB=CD: ${t.abcdMatch ? `${t.abcdTier} 충족` : '미충족'} (CD/AB ${t.abcdRatio.toFixed(3)})`
          : '';
        const bcText = t.bcAbRatio !== undefined
          ? ` | C되돌림: ${t.bcAbRatio.toFixed(3)} (${t.bcAbTier})`
          : '';
        const bcProjectionText = t.bcProjectionRatio !== undefined
          ? ` | BC Projection: ${t.bcProjectionMatch ? '충족' : '미충족'} (${t.bcProjectionRatio.toFixed(3)} / ${t.bcProjectionRange ?? '-'})`
          : '';
        const diagText =
          (t.abXaRatio !== undefined ? ` | AB/XA: ${t.abXaRatio.toFixed(3)}` : '') +
          (t.xcXaRatio !== undefined ? ` | XC/XA: ${t.xcXaRatio.toFixed(3)}` : '') +
          (t.abCdTimeRatio !== undefined ? ` | 시간대칭(CD/AB봉): ${t.abCdTimeRatio.toFixed(2)}` : '') +
          (t.entryPrecision !== undefined ? ` | 진입정밀도: ${t.entryPrecision.toFixed(3)}` : '') +
          (t.maxDepthRatio !== undefined ? ` | 최대역행(PRZ깊이): ${t.maxDepthRatio.toFixed(3)}` : '');
        const breakevenText = t.stopMovedToBreakeven ? ' | TP1 후 본절스탑 활성' : '';
        txt += `#${i+1} [${t.obType.toUpperCase()}]${pattern} ${t.outcome.toUpperCase()}${tpLabel} | 진입: ${entryTime} @ ${t.entryPrice.toFixed(4)} | 청산: ${exitTime} @ ${t.exitPrice.toFixed(4)}${targetText}${bcText}${bcProjectionText}${abcdText}${diagText} | 진입시드: ${balanceBefore}${splitText} | 최종손익: ${delta} (${pnl}%) | 청산후시드: ${balanceAfter}${breakevenText}${confluence}\n`;
      });
    });

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest_report_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bt-panel">
      <div className="bt-workbench-header">
        <div>
          <h3>Strategy Sandbox</h3>
          <p>전략 파라미터를 선택하고 과거 데이터로 바로 시뮬레이션합니다.</p>
        </div>
        <div className="bt-workbench-meta">
          <span>{selectedSymbols.length} symbols</span>
          <span>{strategy.entryGranularity}</span>
          <span>{capitalModeLabel}</span>
        </div>
      </div>

      <div className="bt-workbench">
        <div className="bt-config-card">
      <div className="st-section">
        <h4 className="st-section-title">Engine Parameters</h4>
        <div className="bt-family-grid">
          {([
            ['HARMONIC', 'Harmonic'],
            ['ABCD', 'AB=CD'],
            ['SMC', 'SMC'],
          ] as const).map(([family, label]) => (
            <button
              key={family}
              className={`bt-family-btn ${familyOf(strategy) === family ? 'active' : ''}`}
              onClick={() => selectFamily(family)}
            >
              <span>{familyIcon(family)}</span>
              <strong>{label}</strong>
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{ 
              width: '100%', 
              padding: '14px 18px', 
              background: '#000000', 
              color: '#eaecef', 
              border: '1px solid #1f1f1f', 
              borderRadius: '8px', 
              fontSize: '15px', 
              fontWeight: 600,
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              cursor: 'pointer',
              transition: 'border-color 0.2s',
              textAlign: 'left'
            }}
            onMouseOver={e => e.currentTarget.style.borderColor = '#333333'}
            onMouseOut={e => e.currentTarget.style.borderColor = '#1f1f1f'}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: 15 }}>
                {strategies[activeIdx] ? strategyName(strategies[activeIdx]) : ''}
              </h4>
              <div style={{ fontSize: 12, color: '#848e9c', marginTop: 4 }}>
                {strategies[activeIdx] ? timeframeLabel(strategies[activeIdx]) : ''}
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#848e9c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          
          {isDropdownOpen && (
            <div 
              className="custom-dropdown-list"
              style={{ 
              position: 'absolute', 
              top: '100%', left: 0, right: 0, 
              marginTop: 6, 
              background: '#000000', 
              border: '1px solid #141414', 
              borderRadius: '8px', 
              maxHeight: '300px',
              overflowY: 'auto', 
              zIndex: 100, 
              boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {strategies.map((s, idx) => (
                <div 
                  key={idx} 
                  className={`st-dropdown-item ${activeIdx === idx ? 'active' : ''}`}
                  onClick={() => {
                    onSelectStrategy(idx);
                    setIsDropdownOpen(false);
                  }}
                  style={{ 
                    padding: '14px 18px', 
                    cursor: 'pointer', 
                    background: activeIdx === idx ? '#0a0a0a' : 'transparent', 
                    borderBottom: idx === strategies.length - 1 ? 'none' : '1px solid #0a0a0a',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                  onMouseOver={e => { if (activeIdx !== idx) e.currentTarget.style.background = '#050505'; }}
                  onMouseOut={e => { if (activeIdx !== idx) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {strategyName(s)}
                  </div>
                  <div style={{ fontSize: 12, color: '#848e9c' }}>
                    {timeframeLabel(s)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="st-section">
        <h4 className="st-section-title">Target Assets ({selectedSymbols.length}/{SYMBOLS.length})</h4>
        
        <div className="bt-selected-assets">
          {selectedSymbols.slice(0, 8).map(sym => (
            <button key={sym} className="bt-asset-chip active" onClick={() => toggleSymbol(sym)}>
              {sym.replace('USDT', '')} <span>×</span>
            </button>
          ))}
          {selectedSymbols.length > 8 && <span className="bt-asset-chip muted">+{selectedSymbols.length - 8} more</span>}
          <button className="bt-asset-chip add" onClick={() => setShowSymbolGroups(v => !v)}>
            {showSymbolGroups ? '접기' : '+ Add'}
          </button>
        </div>

        {showSymbolGroups && (
          <div className="bt-symbol-picker">
            <div className="bt-symbol-picker-actions">
              <button className="st-chip" onClick={() => setSelectedSymbols(prev => Array.from(new Set([...prev, ...SYMBOLS_MAIN])))} style={{padding: '6px 12px', fontSize: 12, fontWeight: 'bold'}}>
                TOP 100 전체
              </button>
              <button className="st-chip" onClick={() => setSelectedSymbols(prev => prev.filter(s => !SYMBOLS_MAIN.includes(s)))} style={{padding: '6px 12px', fontSize: 12, color: '#f6465d'}}>
                전체 해제
              </button>
            </div>

            <div>
              <span style={{ fontSize: 12, color: '#8e929a', display: 'block', marginBottom: 6 }}>4H OB 종합 TOP5</span>
              <div className="st-chips" style={{gap: 6}}>
                {SYMBOLS_4H_TOP5.map(sym => (
                  <button key={sym} className={`st-chip ${selectedSymbols.includes(sym) ? 'active' : ''}`} onClick={() => toggleSymbol(sym)} style={{padding: '6px 12px', fontSize: 12}}>
                    {sym.replace('USDT', '')}
                  </button>
                ))}
              </div>
            </div>

            <div>
              {[...Array(10)].map((_, i) => {
                const groupSymbols = SYMBOLS_MAIN.slice(i*10, i*10+10);
                return (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#8e929a' }}>
                        시총 {i*10 + 1}~{i*10 + 10}위
                      </span>
                      <button 
                        style={{ fontSize: 10, padding: '2px 6px', background: '#1f1f1f', color: '#eaecef', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                        onClick={() => setSelectedSymbols(prev => Array.from(new Set([...prev, ...groupSymbols])))}
                      >
                        전체선택
                      </button>
                      <button 
                        style={{ fontSize: 10, padding: '2px 6px', background: '#1f1f1f', color: '#f6465d', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                        onClick={() => setSelectedSymbols(prev => prev.filter(s => !groupSymbols.includes(s)))}
                      >
                        해제
                      </button>
                    </div>
                    <div className="st-chips" style={{gap: 6}}>
                      {groupSymbols.map(sym => (
                        <button key={sym} className={`st-chip ${selectedSymbols.includes(sym) ? 'active' : ''}`} onClick={() => toggleSymbol(sym)} style={{padding: '6px 12px', fontSize: 12}}>
                          {sym.replace('USDT', '')}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="bt-param-grid">
        <div>
          <span>Resolution</span>
          <strong>{strategy.entryGranularity}</strong>
        </div>
        <div>
          <span>Date Start</span>
          <input type="date" className="bt-modern-date-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <span>Leverage</span>
          <strong>{p.leverage}x</strong>
        </div>
        <div>
          <span>TP / SL</span>
          <strong>{p.useHarmonicStrategy || p.useAbcdStrategy ? `T1 ${p.harmonicTp1Pct ?? p.abcdTp1Pct ?? 50}` : `${p.tpPercent}%`} / {p.useHarmonicStrategy || p.useAbcdStrategy ? 'Pattern SL' : `${p.slPercent}%`}</strong>
        </div>
        <div>
          <span>Cost Model</span>
          <strong>{((p.feePct ?? 0.04) + (p.slippagePct ?? 0.02)).toFixed(2)}%/체결 · 펀딩 {(p.fundingPctPer8h ?? 0.01)}%/8h</strong>
        </div>
      </div>

      <div className="bt-json-section">
        <button
          className="bt-json-toggle"
          onClick={() => {
            const next = !showJsonEditor;
            setShowJsonEditor(next);
            if (next && !jsonText) exportJson();
          }}
          aria-expanded={showJsonEditor}
        >
          전략 JSON {showJsonEditor ? '▴' : '▾'}
        </button>
        {showJsonEditor && (
          <div className="bt-json-editor">
            <textarea
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setJsonStatus(null); }}
              spellCheck={false}
              rows={14}
            />
            <div className="bt-json-actions">
              <button className="st-chip" onClick={exportJson}>현재 설정 내보내기</button>
              <button className="st-chip" onClick={() => navigator.clipboard?.writeText(jsonText)}>복사</button>
              <button className="st-chip" onClick={applyJson} disabled={!onUpdate}>폼에 적용</button>
            </div>
            {jsonStatus && (
              <div className={`bt-json-status ${jsonStatus.kind}`}>
                {jsonStatus.messages.map(m => <div key={m}>{m}</div>)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bt-json-section">
        <button className="bt-json-toggle" onClick={() => setShowRuns(v => !v)} aria-expanded={showRuns}>
          실험 이력 ({runs.length}) {showRuns ? '▴' : '▾'}
        </button>
        {showRuns && (
          <div className="bt-runs-list">
            {runs.length === 0 && <div className="bt-runs-empty">저장된 실험이 없습니다. 백테스트를 실행하면 자동 저장됩니다.</div>}
            {runs.map(run => {
              const dupCount = runs.filter(r => r.configHash === run.configHash).length;
              return (
                <div key={run.id} className="bt-run-row">
                  <div className="bt-run-main" onClick={() => applyRun(run)} title="클릭하면 이 실험 설정을 폼에 복원합니다">
                    <strong>{run.name ?? `실험 #${run.id}`}</strong>
                    <span className="bt-run-meta">
                      {run.createdAt} · {run.symbols.length}심볼{run.rangeStart ? ` · ${run.rangeStart}~` : ''}
                      {dupCount > 1 ? ` · 동일설정 ${dupCount}회` : ''}
                    </span>
                  </div>
                  <div className="bt-run-stats">
                    <span>{run.report.trades}건</span>
                    <span style={{ color: pctColor(run.report.winRate, 50) }}>{run.report.winRate.toFixed(1)}%</span>
                    <span style={{ color: run.report.netProfit >= 0 ? '#0ecb81' : '#f6465d' }}>{formatUsd(run.report.netProfit)}</span>
                  </div>
                  {onApplyLive && (
                    <button
                      className="bt-run-live"
                      onClick={() => applyRunLive(run)}
                      title="이 실험 설정으로 자동매매 설정 화면으로 이동"
                    >실전</button>
                  )}
                  <button
                    className="bt-run-delete"
                    onClick={() => { void deleteBacktestRun(run.id).then(loadRuns); }}
                    aria-label="삭제"
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button className="bt-run-btn-modern" onClick={handleRun} disabled={isRunning || !selectedSymbols.length} style={{ flex: 1 }}>
          {isRunning ? `수집 및 분석 중... (${progress.done}/${progress.total})` : '백테스트 엔진 구동'}
        </button>
        {results.length > 0 && onApplyLive && (
          <button 
            className="bt-apply-live-btn"
            onClick={() => onApplyLive(strategy, selectedSymbols)}
            style={{ flex: 1 }}
          >
            현재 설정으로 실전매매 적용
          </button>
        )}
      </div>
        </div>

        <div className="bt-results-column">
      {results.length === 0 && (
        <div className="bt-results-placeholder">
          <div className="bt-preview-grid">
            {['Net Profit', 'Win Rate', 'Max Drawdown', 'Profit Factor'].map(label => (
              <div key={label} className="bt-preview-card empty">
                <span>{label}</span>
                <strong>-</strong>
              </div>
            ))}
          </div>
          <div className="bt-preview-chart empty">
            <div className="bt-chart-head">
              <strong>Equity Curve</strong>
              <span>waiting</span>
            </div>
            <div className="bt-empty-chart">백테스트 실행 후 표시됩니다.</div>
          </div>
          <div className="bt-preview-ledger">
            <div className="bt-preview-ledger-head">
              <strong>Signal Ledger</strong>
              <span>waiting</span>
            </div>
            <div className="bt-preview-ledger-empty">거래 내역 없음</div>
          </div>
          <strong>Simulation Results</strong>
          <span>백테스트 엔진을 구동하면 실제 결과 카드, Equity Curve, Signal Ledger가 표시됩니다.</span>
        </div>
      )}

      {results.length > 0 && report && (
        <div className="bt-modern-results">
          {report.lowSample && (
            <div className="bt-low-sample-warning">
              ⚠️ 거래수 {report.trades}건 — {MIN_MEANINGFUL_TRADES}건 미만은 통계적으로 무의미합니다. 기간·심볼을 늘려서 검증하세요.
            </div>
          )}
          <div className="bt-modern-dashboard">
            <div className="bt-modern-stat">
              <span>Net Profit</span>
              <strong style={{color: netProfit >= 0 ? '#0ecb81' : '#f6465d'}}>{netProfit >= 0 ? '+' : '-'}${Math.abs(netProfit).toLocaleString(undefined, {maximumFractionDigits: 2})}</strong>
              <em>{totalTrades.toLocaleString()} trades · {capitalModeLabel}</em>
            </div>
            <div className="bt-modern-stat">
              <span>Win Rate</span>
              <strong style={{color: pctColor(report.winRate)}}>{report.winRate.toFixed(1)}%</strong>
              <em>{report.wins}W / {report.losses}L · {avgEV !== null ? `EV ${(avgEV ?? 0) >= 0 ? '+' : ''}${avgEV}%` : 'EV -'}</em>
            </div>
            <div className="bt-modern-stat">
              <span>Max Drawdown</span>
              <strong style={{color: report.maxDrawdownPct >= 30 ? '#f6465d' : '#fff'}}>-{report.maxDrawdownPct.toFixed(1)}%</strong>
              <em>Portfolio equity</em>
            </div>
            <div className="bt-modern-stat">
              <span>Profit Factor</span>
              <strong>{Number.isFinite(report.profitFactor) ? report.profitFactor.toFixed(2) : '∞'}</strong>
              <em>Gross P / Gross L</em>
            </div>
            <div className="bt-modern-stat">
              <span>손익비</span>
              <strong>{Number.isFinite(report.payoff) ? report.payoff.toFixed(2) : '∞'}</strong>
              <em>Avg Win / Avg Loss</em>
            </div>
            <div className="bt-modern-stat">
              <span>평균 익절</span>
              <strong className="positive">{formatUsd(report.avgWin)}</strong>
              <em>per winning trade</em>
            </div>
            <div className="bt-modern-stat">
              <span>평균 손절</span>
              <strong className="negative">{formatUsd(-report.avgLoss)}</strong>
              <em>per losing trade</em>
            </div>
            <div className="bt-modern-stat">
              <span>최대 연속손실</span>
              <strong>{report.maxLoseStreak}회</strong>
              <em>worst losing streak</em>
            </div>
          </div>

          <div className="bt-preview-chart">
            <div className="bt-chart-head">
              <strong>Equity Curve</strong>
              <span>{allTradesAsc.length.toLocaleString()} trades</span>
            </div>
            {equityCurve ? (
              <svg viewBox="0 0 300 120" preserveAspectRatio="none">
                <polyline points={equityCurve} fill="none" stroke={netProfit >= 0 ? '#0ecb81' : '#f6465d'} strokeWidth="3" />
              </svg>
            ) : (
              <div className="bt-empty-chart">거래 내역이 없습니다.</div>
            )}
          </div>

          <div className="bt-preview-ledger">
            <div className="bt-preview-ledger-head">
              <strong>Signal Ledger</strong>
              <span>{recentTrades.length.toLocaleString()} recent</span>
            </div>
            {recentTrades.slice(0, 8).map(t => {
              const delta = t.capitalDelta ?? 0;
              const side = t.obType?.toUpperCase?.() ?? '-';
              const reason = t.tpExitLevel === 2 ? 'TP2' : (t.tp1Hit || t.tpExitLevel === 1) ? 'TP1' : t.outcome.toUpperCase();
              return (
                <div key={`${t.symbol}-${t.seq}-${t.entryTime}-ledger`} className="bt-preview-ledger-row">
                  <span>{t.symbol.replace('USDT', '')}</span>
                  <span>{side}</span>
                  <strong className={delta >= 0 ? 'positive' : 'negative'}>{formatUsd(delta)}</strong>
                  <span>{reason}</span>
                </div>
              );
            })}
          </div>
          
          <div className="bt-modern-table-wrap">
            <table className="bt-modern-table">
              <thead>
                <tr>
                  <th>심볼</th><th>전체</th>
                  <th>TP1</th><th>TP2</th>
                  <th>{p.useHarmonicStrategy ? 'SL' : 'SL1'}</th>
                  {!p.useHarmonicStrategy && <th>SL2</th>}
                  {!p.useHarmonicStrategy && <th>SL3</th>}
                  <th>승률</th><th>MDD</th><th>EV</th><th>1만불달성</th><th>최종잔고</th><th>수익률</th>
                </tr>
              </thead>
              <tbody>
                {results.slice().sort((a, b) => b.ev - a.ev).map(r => {
                  const tp1C = r.tp1Count ?? r.trades.filter(t => t.tpExitLevel === 1 || (t.tp1Hit && t.tpExitLevel !== 2)).length;
                  const tp2C = r.tp2Count ?? r.trades.filter(t => t.tpExitLevel === 2).length;
                  const tp1Pct = r.n > 0 ? +((tp1C / r.n) * 100).toFixed(0) : 0;
                  const tp2Pct = r.n > 0 ? +((tp2C / r.n) * 100).toFixed(0) : 0;
                  const sl1Pct = r.n > 0 ? +(r.sl1Count / r.n * 100).toFixed(0) : 0;
                  const sl2Pct = r.n > 0 ? +(r.sl2Count / r.n * 100).toFixed(0) : 0;
                  const sl3Pct = r.n > 0 ? +(r.sl3Count / r.n * 100).toFixed(0) : 0;
                  const winRatePct = r.n > 0 ? +(((tp1C + tp2C) / r.n) * 100).toFixed(0) : 0;
                  const effBalance = r.finalBalance + (r.hit10kCount || 0) * 10000; // 리셋분 합산 실질 누적잔고
                  const ret    = (effBalance / strategy.initialCapital - 1) * 100;
                  return (
                    <tr key={r.symbol}>
                      <td>{r.symbol.replace('USDT', '')}</td>
                      <td>{r.n}</td>
                      <td style={{color: pctColor(tp1Pct, 50)}}>{tp1C} ({tp1Pct}%)</td>
                      <td style={{color: pctColor(tp2Pct, 50)}}>{tp2C} ({tp2Pct}%)</td>
                      <td style={{color: sl1Pct >= 30 ? '#f6465d' : '#8e929a'}}>{r.sl1Count} ({sl1Pct}%)</td>
                      {!p.useHarmonicStrategy && <td style={{color: '#8e929a'}}>{r.sl2Count} ({sl2Pct}%)</td>}
                      {!p.useHarmonicStrategy && <td style={{color: '#8e929a'}}>{r.sl3Count} ({sl3Pct}%)</td>}
                      <td style={{color: pctColor(winRatePct, 50), fontWeight: 600}}>{winRatePct}%</td>
                      <td style={{color: r.mdd >= 50 ? '#f6465d' : '#8e929a'}}>-{r.mdd.toFixed(1)}%</td>
                      <td style={{color: evColor(r.ev)}}>{r.ev >= 0 ? '+' : ''}{r.ev}%</td>
                      <td style={{color: (r.hit10kCount || 0) > 0 ? '#0ecb81' : '#8e929a'}}>{r.hit10kCount || 0}회</td>
                      <td style={{color: ret >= 0 ? '#0ecb81' : '#f6465d'}}>${Math.round(effBalance).toLocaleString()}</td>
                      <td style={{color: ret >= 0 ? '#0ecb81' : '#f6465d'}}>{ret >= 0 ? '+' : ''}{ret.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', marginTop: 12}}>
            <button className="bt-download-btn" onClick={handleDownloadTxt}>⬇ TXT 리포트 다운로드</button>
          </div>

          {report.monthly.length > 0 && (
            <div className="bt-modern-table-wrap" style={{marginTop: 16}}>
              <table className="bt-modern-table">
                <thead>
                  <tr><th>월</th><th>거래수</th><th>승률</th><th>순손익</th></tr>
                </thead>
                <tbody>
                  {report.monthly.map(row => (
                    <tr key={row.period}>
                      <td>{row.period}</td>
                      <td>{row.trades}</td>
                      <td style={{color: pctColor(row.winRate, 50)}}>{row.winRate.toFixed(1)}%</td>
                      <td style={{color: row.netPnl >= 0 ? '#0ecb81' : '#f6465d'}}>{formatUsd(row.netPnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {recentTrades.length > 0 && (
            <div className="bt-modern-table-wrap" style={{marginTop: 16}}>
              <table className="bt-modern-table">
                <thead>
                  <tr>
                    <th>시간</th><th>심볼</th><th>결과</th><th>목표</th>
                    {p.useHarmonicStrategy && <th>C</th>}
                    {p.useHarmonicStrategy && <th>BC Proj</th>}
                    {p.useHarmonicStrategy && <th>AB=CD</th>}
                    {p.useHarmonicStrategy && <th>분할손익</th>}
                    <th>진입시드</th><th>손익</th><th>청산후</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map(t => {
                    const time = new Date(t.entryTime * 1000).toLocaleDateString('ko-KR');
                    const delta = t.capitalDelta ?? 0;
                    const tpLabel = t.tpExitLevel === 2 ? '/TP2' : (t.tp1Hit || t.tpExitLevel === 1) ? '/TP1' : '';
                    const targetText = t.stopLossPct !== undefined && t.tp1ProfitPct !== undefined && t.tp2ProfitPct !== undefined
                      ? `SL -${t.stopLossPct.toFixed(1)} / T1 +${t.tp1ProfitPct.toFixed(1)} / T2 +${t.tp2ProfitPct.toFixed(1)}`
                      : '-';
                    const splitText = t.tp1RealizedDelta !== undefined || t.remainderDelta !== undefined
                      ? `TP1 ${formatUsd(t.tp1RealizedDelta)} / ${t.remainderExitLabel ?? '-'} ${formatUsd(t.remainderDelta)}`
                      : '-';
                    const abcdText = t.abcdRatio !== undefined
                      ? `${t.abcdMatch ? t.abcdTier : 'NO'} ${t.abcdRatio.toFixed(2)}`
                      : '-';
                    const bcText = t.bcAbRatio !== undefined ? t.bcAbRatio.toFixed(2) : '-';
                    const bcProjectionText = t.bcProjectionRatio !== undefined
                      ? `${t.bcProjectionMatch ? 'OK' : 'NO'} ${t.bcProjectionRatio.toFixed(2)}`
                      : '-';
                    return (
                      <tr key={`${t.symbol}-${t.seq}-${t.entryTime}`}>
                        <td>{time}</td>
                        <td>{t.symbol.replace('USDT', '')}</td>
                        <td>{t.outcome.toUpperCase()}{tpLabel}</td>
                        <td style={{color: '#8e929a'}}>{targetText}</td>
                        {p.useHarmonicStrategy && <td style={{color: '#8e929a'}}>{bcText}</td>}
                        {p.useHarmonicStrategy && <td style={{color: t.bcProjectionMatch ? '#0ecb81' : '#8e929a'}}>{bcProjectionText}</td>}
                        {p.useHarmonicStrategy && <td style={{color: t.abcdMatch ? '#0ecb81' : '#8e929a'}}>{abcdText}</td>}
                        {p.useHarmonicStrategy && <td style={{color: '#8e929a'}}>{splitText}</td>}
                        <td>${(t.balanceBefore ?? 0).toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                        <td style={{color: delta >= 0 ? '#0ecb81' : '#f6465d'}}>{delta >= 0 ? '+' : ''}${delta.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                        <td>${(t.balanceAfter ?? 0).toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
