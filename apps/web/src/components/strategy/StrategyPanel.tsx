import React, { useEffect, useState } from 'react';
import type { StrategyConfig } from '../../constants/strategyConstants';
import { OB_TF_OPTIONS, ENTRY_TF_OPTIONS } from '../../constants/strategyConstants';
import { fetchTradeConfigs } from '../../api/tradeConfigApi';
import type { StrategyParams } from '../../utils/backtestEngine';
import { Stepper, Toggle } from './StrategyUI';

const HARMONIC_TF_PRESETS = [
  { label: '1W EQ + 1D 하모닉', obGranularity: '1Wutc', entryGranularity: '1Dutc' },
  { label: '1D EQ + 4h 하모닉', obGranularity: '1Dutc', entryGranularity: '4h' },
  { label: '4h EQ + 1h 하모닉', obGranularity: '4h', entryGranularity: '1h' },
  { label: '4h EQ + 15m 하모닉', obGranularity: '4h', entryGranularity: '15m' },
];

const HARMONIC_PATTERNS = [
  'Gartley',
  'Deep Gartley',
  'Bat',
  'Alt Bat',
  'Butterfly',
  'Crab',
  'Deep Crab',
  'Shark',
  'Cypher',
  '5-0',
];

const TF_RANK: Record<string, number> = {
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1Dutc': 1440,
  '1Wutc': 10080,
};

export function StrategyPanel({
  strategies, activeIdx, onUpdate, onGoToBacktest, onGoToLive
}: {
  strategies: StrategyConfig[];
  activeIdx: number;
  onUpdate: (idx: number, cfg: StrategyConfig) => void;
  onGoToBacktest?: (idx: number) => void;
  onGoToLive?: (cfg: StrategyConfig) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Record<number, boolean>>({});
  const [expandedSymbols, setExpandedSymbols] = useState<Record<number, boolean>>({});
  const [showHiddenStrategies, setShowHiddenStrategies] = useState(false);
  const [showHarmonicAdvanced, setShowHarmonicAdvanced] = useState(false);
  // 전략 종류별 활성 자동매매 설정 심볼 (BTC·ETH는 항상 기본 포함)
  const [configSymbols, setConfigSymbols] = useState<Record<'HARMONIC' | 'AB=CD' | 'SMC', string[]>>({
    HARMONIC: [], 'AB=CD': [], SMC: [],
  });

  useEffect(() => {
    let cancelled = false;
    fetchTradeConfigs()
      .then(configs => {
        if (cancelled) return;
        const groups: Record<'HARMONIC' | 'AB=CD' | 'SMC', string[]> = { HARMONIC: [], 'AB=CD': [], SMC: [] };
        for (const c of configs) {
          if (!c.active) continue;
          const group = c.strategy === 'HARMONIC' ? 'HARMONIC' : c.strategy === 'ABCD' ? 'AB=CD' : 'SMC';
          if (!groups[group].includes(c.symbol)) groups[group].push(c.symbol);
        }
        setConfigSymbols(groups);
      })
      .catch(() => { /* 미로그인 등 조회 실패 시 기본 칩(BTC/ETH)만 표시 */ });
    return () => { cancelled = true; };
  }, []);

  const setParam = (idx: number, key: keyof StrategyParams, val: any) => {
    const s = strategies[idx];
    onUpdate(idx, { ...s, params: { ...s.params, [key]: val } });
  };

  const setHarmonicTp1Pct = (idx: number, val: number) => {
    const s = strategies[idx];
    onUpdate(idx, {
      ...s,
      params: {
        ...s.params,
        harmonicTp1Pct: val,
        harmonicTp2Pct: 100 - val,
      },
    });
  };

  const toggleHarmonicPattern = (idx: number, pattern: string) => {
    const s = strategies[idx];
    const current = s.params.harmonicEnabledPatterns?.length
      ? s.params.harmonicEnabledPatterns
      : HARMONIC_PATTERNS;
    const next = current.includes(pattern)
      ? current.filter(p => p !== pattern)
      : [...current, pattern];
    onUpdate(idx, {
      ...s,
      params: {
        ...s.params,
        harmonicEnabledPatterns: next.length === HARMONIC_PATTERNS.length ? [] : next,
      },
    });
  };

  const strategyKind = (p: StrategyParams) => {
    if (p.useAbcdStrategy) return 'AB=CD';
    if (p.useHarmonicStrategy) return 'HARMONIC';
    if (p.useFvgStrategy) return 'FVG';
    if (p.useBbStrategy) return 'BB';
    if (p.useEqStrategy) return 'EQ';
    return 'SMC';
  };

  const strategyIcon = (kind: string) => {
    const stroke = kind === 'AB=CD' ? '#3182f6' : kind === 'SMC' ? '#f3ba2f' : '#0ecb81';
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {kind === 'HARMONIC' ? (
          <path d="M3 20L8 6L12 14L16 4L21 20" />
        ) : kind === 'AB=CD' ? (
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

  const monitoringCards = ([
    ['HARMONIC', strategies.findIndex(s => s.params.useHarmonicStrategy)],
    ['AB=CD', strategies.findIndex(s => s.params.useAbcdStrategy)],
    ['SMC', strategies.findIndex(s => !s.params.useHarmonicStrategy && !s.params.useAbcdStrategy)],
  ] as const)
    .filter(([, idx]) => idx >= 0)
    .map(([label, idx]) => ({ label, idx, strategy: strategies[idx] }));
  const visibleStrategyIndexes = new Set(monitoringCards.map(card => card.idx));
  const hiddenStrategyCards = strategies
    .map((strategy, idx) => ({ strategy, idx }))
    .filter(({ idx }) => !visibleStrategyIndexes.has(idx));

  const renderCard = (s: StrategyConfig, idx: number, displayName: string, isInactive = false) => {
    const isEditing = editingIdx === idx;
    const isDetailsOpen = !!expandedDetails[idx];
    const obTfLabel    = OB_TF_OPTIONS.find(t => t.granularity === s.obGranularity)?.label    ?? s.obGranularity;
    const entryTfLabel = ENTRY_TF_OPTIONS.find(t => t.granularity === s.entryGranularity)?.label ?? s.entryGranularity;
    const { params: p } = s;
    const useHarmonicEq = p.harmonicUseEqFilter !== false;
    const activeHarmonicPreset = HARMONIC_TF_PRESETS.find(preset =>
      preset.obGranularity === s.obGranularity && preset.entryGranularity === s.entryGranularity
    );
    const isTfOrderValid = (obGranularity: string, entryGranularity: string) =>
      (TF_RANK[obGranularity] ?? 0) >= (TF_RANK[entryGranularity] ?? Infinity);
    const kind = strategyKind(p);
    const modeLabel = p.useAbcdStrategy
      ? (p.abcdEntryMode === 'close' ? '종가 신호' : '즉시 신호')
      : p.useHarmonicStrategy
        ? (p.harmonicEntryMode === 'immediate' ? 'PRZ 터치' : '봉마감')
        : p.useEqStrategy
          ? 'EQ 진입'
          : 'Mid 진입';
    const marginLabel = (p.capitalMode ?? 'fixed') === 'compound'
      ? '-'
      : `$${p.fixedEntryMargin ?? 100}`;
    const positionLabel = (p.capitalMode ?? 'fixed') === 'compound'
      ? `${p.positionPct}%`
      : '-';
    const symbolGroup = p.useHarmonicStrategy ? 'HARMONIC' : p.useAbcdStrategy ? 'AB=CD' : 'SMC';
    const allSymbolChips = Array.from(new Set(['BTCUSDT', 'ETHUSDT', ...configSymbols[symbolGroup]]))
      .map(sym => sym.replace(/USDT$/, '/USDT'));
    // 한 줄 유지: 4개까지만 표시, 나머지는 +N more로 접기
    const isSymbolsOpen = !!expandedSymbols[idx];
    const symbolChips = isSymbolsOpen ? allSymbolChips : allSymbolChips.slice(0, 4);
    const hiddenSymbolCount = allSymbolChips.length - symbolChips.length;
    return (
      <div key={idx} className={`st-card ${isInactive ? 'inactive' : ''}`}>
        <div className="st-card-head st-strategy-head">
          <div className="st-strategy-title-block">
            <div className={`st-strategy-icon ${isInactive ? 'inactive' : ''}`}>{strategyIcon(kind)}</div>
            <div>
              <div className="st-card-title">
                <h3>{displayName}</h3>
              </div>
              <div className="st-status-line">
                <span className={`st-status-dot ${isInactive ? 'inactive' : 'active'}`} />
                <span className={isInactive ? 'inactive' : 'active'}>{isInactive ? 'PAUSED' : 'RUNNING'}</span>
                <span>· {p.useFvgStrategy ? s.name.replace(/OB/g, 'FVG') : s.name}</span>
              </div>
            </div>
          </div>
          <div className="st-strategy-actions">
            {isEditing ? (
              <button
                className="st-edit-btn editing"
                onClick={() => setEditingIdx(null)}
              >
                완료
              </button>
            ) : (
              <button className={`st-card-switch ${isInactive ? '' : 'on'}`} aria-label="strategy status preview">
                <span />
              </button>
            )}
          </div>
        </div>

        {!isEditing && (
          <div className="st-strategy-symbols">
            {symbolChips.map(chip => (
              <span key={chip} className="st-profile-chip">{chip}</span>
            ))}
            {(hiddenSymbolCount > 0 || isSymbolsOpen) && (
              <button
                className="st-profile-chip st-symbol-more"
                onClick={() => setExpandedSymbols(prev => ({ ...prev, [idx]: !isSymbolsOpen }))}
              >
                {isSymbolsOpen ? '접기' : `+${hiddenSymbolCount} more`}
              </button>
            )}
          </div>
        )}

        {!isEditing && (
          <div className="st-strategy-kpis">
            <div><span>전략</span><strong>{kind}</strong></div>
            <div><span>타임프레임</span><strong>{entryTfLabel}</strong></div>
            <div><span>진입방식</span><strong>{modeLabel}</strong></div>
            <div><span>진입시드</span><strong>{marginLabel}</strong></div>
            <div><span>비중</span><strong>{positionLabel}</strong></div>
            <div><span>레버리지</span><strong>{p.leverage}x</strong></div>
          </div>
        )}

        {!isEditing && (
          <button
            className="st-detail-accordion-btn"
            onClick={() => setExpandedDetails(prev => ({ ...prev, [idx]: !isDetailsOpen }))}
            aria-expanded={isDetailsOpen}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: isDetailsOpen ? 'rotate(-90deg)' : 'rotate(90deg)' }}>
              <polyline points="9 6 15 12 9 18" fill="none" stroke="#8e929a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {!isEditing && (
          <div className={`st-detail-collapse ${isDetailsOpen ? 'open' : ''}`}>
          {p.useAbcdStrategy ? (
          <div className="st-card-body">
            <div className="st-flow">
              <div className="st-flow-step">{entryTfLabel} AB=CD 예측</div>
              <div className="st-flow-arrow">›</div>
              <div className="st-flow-step">{p.abcdEntryMode === 'close' ? 'PRZ 종가 안착 신호' : 'PRZ 터치 신호'}</div>
              <div className="st-flow-arrow">›</div>
              <div className="st-flow-step">0.5 체결 › TP/SL 추적</div>
            </div>
            <div className="st-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="st-stat-box"><span>진입시드</span><strong>{(p.capitalMode ?? 'fixed') === 'compound' ? `${p.positionPct}%` : `$${p.fixedEntryMargin ?? 100}`}</strong></div>
              <div className="st-stat-box"><span>레버리지</span><strong>{p.leverage}x</strong></div>
              <div className="st-stat-box"><span>스케일</span><strong>{p.abcdLogScale !== false ? '로그' : '선형'}</strong></div>
              <div className="st-stat-box"><span>신호모드</span><strong>{p.abcdEntryMode === 'close' ? '종가' : '즉시'}</strong></div>
              <div className="st-stat-box"><span>TP 분할</span><strong>{p.abcdTp1Pct ?? 50}/{p.abcdTp2Pct ?? 50}</strong></div>
              <div className="st-stat-box"><span>초기자본</span><strong>${s.initialCapital.toLocaleString()}</strong></div>
            </div>
            <div className="st-filter-list">
              <div className="st-filter-item">
                <span className="st-filter-label" style={{color:'#3182f6'}}>트리거</span>
                <span className="st-filter-val">A-B-C 성립 › 1:1/1.272/1.618 PRZ 추적 › 0.5 체결</span>
              </div>
              <div className="st-filter-item">
                <span className="st-filter-label">청산</span>
                <span className="st-filter-val">TP1 {p.abcdTp1Pct ?? 50}% · TP2 {p.abcdTp2Pct ?? 50}%(전량) · SL 전량</span>
              </div>
              <div className="st-filter-item">
                <span className="st-filter-label" style={{color:'#f6465d'}}>무효화</span>
                <span className="st-filter-val">SL 돌파 · C 역돌파 · B 종가 이탈 조건 미충족</span>
              </div>
            </div>
          </div>
          ) : p.useHarmonicStrategy ? (
          <div className="st-card-body">
            <div className="st-flow">
              <div className="st-flow-step">{useHarmonicEq ? `${obTfLabel} EQ + ` : ''}{entryTfLabel} PRZ</div>
              <div className="st-flow-arrow">›</div>
              <div className="st-flow-step">{useHarmonicEq ? 'PRZ∩EQ 컨플루언스' : 'PRZ 단독 필터'}</div>
              <div className="st-flow-arrow">›</div>
              <div className="st-flow-step">{p.harmonicEntryMode === 'immediate' ? 'PRZ 터치 신호' : '봉마감 종가 신호'} › 0.5 체결</div>
            </div>
            <div className="st-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="st-stat-box"><span>진입시드</span><strong>{(p.capitalMode ?? 'fixed') === 'compound' ? `${p.positionPct}%` : `$${p.fixedEntryMargin ?? 100}`}</strong></div>
              <div className="st-stat-box"><span>레버리지</span><strong>{p.leverage}x</strong></div>
              <div className="st-stat-box"><span>가격 SL캡</span><strong>{p.harmonicSlCapPct ?? 10}%</strong></div>
              <div className="st-stat-box"><span>신호모드</span><strong>{p.harmonicEntryMode === 'immediate' ? '즉시' : '종가'}</strong></div>
              <div className="st-stat-box"><span>필터</span><strong>{useHarmonicEq ? `EQ <${p.eqAlivePasses}` : 'PRZ 단독'}</strong></div>
              <div className="st-stat-box"><span>초기자본</span><strong>${s.initialCapital.toLocaleString()}</strong></div>
            </div>
            <div className="st-filter-list">
              <div className="st-filter-item">
                <span className="st-filter-label" style={{color:'#b931f6'}}>트리거</span>
                <span className="st-filter-val">{useHarmonicEq ? '예측성립 › PRZ∩EQ 겹침 › PRZ존 터치 › 진입' : '예측성립 › PRZ존 터치/안착 › 진입'}</span>
              </div>
              <div className="st-filter-item">
                <span className="st-filter-label">청산</span>
                <span className="st-filter-val">
                  TP1 {p.harmonicTp1Pct}% · TP2 {p.harmonicTp2Pct}%(전량) · SL 전량
                  {p.harmonicMoveStopToBreakeven && ' · TP1 후 본절'}
                </span>
              </div>
              <div className="st-filter-item">
                <span className="st-filter-label" style={{color:'#f6465d'}}>무효화</span>
                <span className="st-filter-val">SL 돌파(공통) · C 돌파(진입 전)</span>
              </div>
              <div className="st-filter-item">
                <span className="st-filter-label" style={{color:'#f0b90b'}}>프리셋</span>
                <span className="st-filter-val">{useHarmonicEq ? (activeHarmonicPreset?.label ?? `${obTfLabel} EQ + ${entryTfLabel} 하모닉`) : `${entryTfLabel} 하모닉`}</span>
              </div>
            </div>
          </div>
          ) : (
          <div className="st-card-body">
            {/* 시각적 로직 플로우 */}
            <div className="st-flow">
              <div className="st-flow-step">{obTfLabel} {p.useFvgStrategy ? 'FVG' : 'OB'} 감지</div>
              <div className="st-flow-arrow">›</div>
              <div className="st-flow-step">{p.fvgSignalDeep ? '딥 영역(CE~경계) 종가 마감' : `${entryTfLabel} 신호`}</div>
              <div className="st-flow-arrow">›</div>
              <div className="st-flow-step">
                {p.fvgEntryAtLow ? '딥 경계(Low/High) 즉시진입' : 
                  (p.fvgEntryAtBorder ? '경계(High/Low) 즉시진입' : 
                    (p.fvgEntryAtLowAfterSignal ? '딥 경계(Low/High) 풀백 진입' : 'Mid 풀백 진입'))}
              </div>
            </div>

            {/* 핵심 지표 그리드 */}
            <div className="st-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="st-stat-box"><span>TP</span><strong>{p.tpPercent}%</strong></div>
              {p.slAtDeepBorder ? (
                <div className="st-stat-box"><span>손절</span><strong>딥경계</strong></div>
              ) : (
                <div className="st-stat-box"><span>SL1</span><strong>{p.slPercent}%</strong></div>
              )}
              <div className="st-stat-box"><span>진입시드</span><strong>{(p.capitalMode ?? 'fixed') === 'compound' ? `${p.positionPct}%` : `$${p.fixedEntryMargin ?? 100}`}</strong></div>
              <div className="st-stat-box"><span>레버리지</span><strong>{p.leverage}x</strong></div>
              <div className="st-stat-box"><span>진입대기</span><strong>{p.useEqStrategy ? '-' : `${p.maxWaitCandles}봉`}</strong></div>
              <div className="st-stat-box"><span>초기자본</span><strong>${s.initialCapital.toLocaleString()}</strong></div>
            </div>

            {/* 세부 필터 및 설정 상태 리스트 */}
            <div className="st-filter-list">
              <div className="st-filter-item">
                <span className="st-filter-label">청산</span>
                <span className="st-filter-val">
                  {p.slAtDeepBorder ? (
                    '딥경계 터치 시 즉각 칼손절 (SL2/SL3 비활성)'
                  ) : (
                    <>
                      SL2 종가이탈({p.sl2Tf === 'obTf' ? obTfLabel : entryTfLabel})
                      {p.useSl3 && ` · SL3 완전이탈(진입TF)`}
                    </>
                  )}
                </span>
              </div>
              
              {(p.useDataFilter || p.filterReverseBull1d || p.filterPriceAboveMa20Bear1d || p.filterEntryMa20) && (
                <div className="st-filter-item">
                  <span className="st-filter-label" style={{color:'#0ecb81'}}>추가필터</span>
                  <span className="st-filter-val">
                    {p.useDataFilter && '1D 데이터부족제외 '}
                    {p.filterReverseBull1d && '1D 역배열 롱제외 '}
                    {p.filterPriceAboveMa20Bear1d && '1D MA20 위 숏제외 '}
                    {p.filterEntryMa20 && `${entryTfLabel} MA20 역추세제외`}
                  </span>
                </div>
              )}
              {p.closeDepth < 1.0 && (
                <div className="st-filter-item">
                  <span className="st-filter-label" style={{color:'#f0b90b'}}>진입깊이</span>
                  <span className="st-filter-val">신호 종가 mid~high 상위 {Math.round(p.closeDepth * 100)}% 이내</span>
                </div>
              )}
              {p.switching && (
                <div className="st-filter-item">
                  <span className="st-filter-label" style={{color:'#f6465d'}}>스위칭</span>
                  <span className="st-filter-val">OB 첫 터치 실패 시 반대 방향 진입</span>
                </div>
              )}
              {p.combinedSwitch && (
                <div className="st-filter-item">
                  <span className="st-filter-label" style={{color:'#f6465d'}}>스위칭</span>
                  <span className="st-filter-val">정방향 진입 + mid 이탈 후 반대방향 진입 (TP {p.swTpPercent}% / SL {p.swSlPercent}%)</span>
                </div>
              )}
              {p.volumeTrigger && (
                <div className="st-filter-item">
                  <span className="st-filter-label" style={{color:'#f0b90b'}}>거래량</span>
                  <span className="st-filter-val">진입TF 거래량 급등(≥ 평균 x{p.volumeMultiplier}){p.volumeTriggerBullish ? ' + 방향성' : ''} → Mid 진입</span>
                </div>
              )}
              {p.useBbStrategy && (
                <div className="st-filter-item">
                  <span className="st-filter-label" style={{color:'#3182f6'}}>BB역매매</span>
                  <span className="st-filter-val">OB 완전 이탈(돌파) 또는 SL3 발생 시 반대 방향 BB 전환</span>
                </div>
              )}
              {p.useFvgStrategy && (
                <div className="st-filter-item">
                  <span className="st-filter-label" style={{color:'#b931f6'}}>FVG전략</span>
                  <span className="st-filter-val">3캔들 갭 생성 시 FVG 박스 형성 (CE=mid)</span>
                </div>
              )}
            </div>
          </div>
          )}
          </div>
        )}
        {!isEditing && (
          <div className="st-strategy-footer">
            <button
              className={`st-edit-btn ${isEditing ? 'editing' : ''}`}
              onClick={() => setEditingIdx(isEditing ? null : idx)}
            >
              설정
            </button>
            <button 
              className="st-edit-btn" 
              onClick={() => onGoToBacktest?.(idx)}
            >
              백테스팅
            </button>
            <button 
              className="st-edit-btn st-live-apply-btn"
              onClick={() => onGoToLive?.(s)}
            >
              자동매매 적용
            </button>
          </div>
        )}
        {isEditing && (
          p.useHarmonicStrategy ? (
          <div className="st-edit-body">
            <div className="st-section">
              <h4 className="st-section-title">타임프레임</h4>
              {useHarmonicEq ? (
                <>
                  <div className="st-chips">
                    {HARMONIC_TF_PRESETS.map(preset => {
                      const active = s.obGranularity === preset.obGranularity && s.entryGranularity === preset.entryGranularity;
                      return (
                        <button
                          key={`${preset.obGranularity}-${preset.entryGranularity}`}
                          className={`st-chip ${active ? 'active' : ''}`}
                          onClick={() => onUpdate(idx, {
                            ...s,
                            obGranularity: preset.obGranularity,
                            entryGranularity: preset.entryGranularity,
                          })}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="st-fold-btn"
                    style={{ marginTop: 12, width: '100%' }}
                    onClick={() => setShowHarmonicAdvanced(v => !v)}
                  >
                    {showHarmonicAdvanced ? '고급설정 닫기' : '고급설정'}
                  </button>
                </>
              ) : (
                <div className="st-chips">
                  <span style={{fontSize: 12, color: '#8e929a', width: '72px', paddingTop: 8}}>하모닉</span>
                  {ENTRY_TF_OPTIONS.map(tf => (
                    <button
                      key={tf.granularity}
                      className={`st-chip ${s.entryGranularity === tf.granularity ? 'active' : ''}`}
                      onClick={() => onUpdate(idx, { ...s, obGranularity: tf.granularity, entryGranularity: tf.granularity })}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              )}
              {useHarmonicEq && showHarmonicAdvanced && (
                <div style={{ marginTop: 12 }}>
                  <div className="st-chips" style={{marginBottom: 12}}>
                    <span style={{fontSize: 12, color: '#8e929a', width: '40px', paddingTop: 8}}>EQ</span>
                    {OB_TF_OPTIONS.map(tf => {
                      const disabled = !isTfOrderValid(tf.granularity, s.entryGranularity);
                      return (
                        <button
                          key={tf.granularity}
                          className={`st-chip ${s.obGranularity === tf.granularity ? 'active' : ''}`}
                          disabled={disabled}
                          onClick={() => onUpdate(idx, { ...s, obGranularity: tf.granularity })}
                          title={disabled ? 'EQ TF는 하모닉/진입 TF보다 같거나 커야 합니다.' : undefined}
                        >
                          {tf.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="st-chips">
                    <span style={{fontSize: 12, color: '#8e929a', width: '40px', paddingTop: 8}}>진입</span>
                    {ENTRY_TF_OPTIONS.map(tf => {
                      const disabled = !isTfOrderValid(s.obGranularity, tf.granularity);
                      return (
                        <button
                          key={tf.granularity}
                          className={`st-chip ${s.entryGranularity === tf.granularity ? 'active' : ''}`}
                          disabled={disabled}
                          onClick={() => onUpdate(idx, { ...s, entryGranularity: tf.granularity })}
                          title={disabled ? '하모닉/진입 TF는 EQ TF보다 같거나 작아야 합니다.' : undefined}
                        >
                          {tf.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="st-section">
              <h4 className="st-section-title">하모닉 진입 조건</h4>
              <div className="st-stepper-row">
                <span className="st-stepper-label">신호 모드</span>
                <div className="st-chips">
                  <button className={`st-chip ${p.harmonicEntryMode === 'immediate' ? 'active' : ''}`} onClick={() => setParam(idx, 'harmonicEntryMode', 'immediate')}>즉시(PRZ터치)</button>
                  <button className={`st-chip ${p.harmonicEntryMode === 'close' ? 'active' : ''}`} onClick={() => setParam(idx, 'harmonicEntryMode', 'close')}>봉마감 종가</button>
                </div>
              </div>
              <Stepper label="EQ 유효 (종가 관통 N회 미만)" value={p.eqAlivePasses ?? 3} unit="회" step={1} min={1} max={10} onChange={v => setParam(idx, 'eqAlivePasses', v)} />
              <div className="st-stepper-row" style={{alignItems: 'flex-start'}}>
                <span className="st-stepper-label" style={{paddingTop: 8}}>패턴</span>
                <div className="st-chips">
                  {HARMONIC_PATTERNS.map(pattern => {
                    const active = !p.harmonicEnabledPatterns?.length || p.harmonicEnabledPatterns.includes(pattern);
                    return (
                      <button
                        key={pattern}
                        className={`st-chip ${active ? 'active' : ''}`}
                        onClick={() => toggleHarmonicPattern(idx, pattern)}
                      >
                        {pattern}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="st-section">
              <h4 className="st-section-title">청산 / 자금</h4>
              <Stepper label="TP1 익절 비율" value={p.harmonicTp1Pct ?? 50} unit="%" step={5} min={0} max={100} onChange={v => setHarmonicTp1Pct(idx, v)} />
              <div className="st-stepper-row">
                <span className="st-stepper-label">TP2 익절 비율</span>
                <strong style={{fontSize: 13, color: '#eaecef'}}>{p.harmonicTp2Pct ?? 50}%</strong>
              </div>
              <Toggle
                label="TP1 후 잔여 스탑 본절 이동"
                checked={!!p.harmonicMoveStopToBreakeven}
                onChange={() => setParam(idx, 'harmonicMoveStopToBreakeven', !p.harmonicMoveStopToBreakeven)}
              />
              <Stepper label="손절 캡(가격%)" value={p.harmonicSlCapPct ?? 10.0} unit="%" step={0.1} min={0.1} max={20} onChange={v => setParam(idx, 'harmonicSlCapPct', v)} />
              <Stepper label="타임아웃(최대보유)" value={p.maxHoldCandles} unit="캔들" step={5} min={1} max={500} onChange={v => setParam(idx, 'maxHoldCandles', v)} />
              <Stepper label="레버리지" value={p.leverage} unit="x" step={1} min={1} max={100} onChange={v => setParam(idx, 'leverage', v)} />
              <div className="st-stepper-row">
                <span className="st-stepper-label">자금 계산</span>
                <div className="st-chips">
                  <button className={`st-chip ${(p.capitalMode ?? 'fixed') === 'fixed' ? 'active' : ''}`} onClick={() => setParam(idx, 'capitalMode', 'fixed')}>고정진입금</button>
                  <button className={`st-chip ${p.capitalMode === 'compound' ? 'active' : ''}`} onClick={() => setParam(idx, 'capitalMode', 'compound')}>복리(잔고비율)</button>
                </div>
              </div>
              
              {(p.capitalMode ?? 'fixed') === 'fixed' ? (
                <>
                  <Stepper label="1회 고정 진입시드" value={p.fixedEntryMargin ?? 100} unit="$" step={10} min={10} max={10000} onChange={v => setParam(idx, 'fixedEntryMargin', v)} />
                  <Stepper label="시작 잔고 (누적용)" value={s.initialCapital} unit="" step={100} min={100} max={100000} onChange={v => onUpdate(idx, { ...s, initialCapital: v })} format={v => '$' + v.toLocaleString()} />
                </>
              ) : (
                <>
                  <Stepper label="진입 비중" value={p.positionPct} unit="%" step={5} min={5} max={100} onChange={v => setParam(idx, 'positionPct', v)} />
                  <Stepper label="시작 잔고" value={s.initialCapital} unit="" step={100} min={100} max={100000} onChange={v => onUpdate(idx, { ...s, initialCapital: v })} format={v => '$' + v.toLocaleString()} />
                </>
              )}
            </div>
          </div>
          ) : (
          <div className="st-edit-body">
            <div className="st-section">
              <h4 className="st-section-title">타임프레임</h4>
              <div className="st-chips" style={{marginBottom: 12}}>
                <span style={{fontSize: 12, color: '#8e929a', width: '40px', paddingTop: 8}}>{p.useFvgStrategy ? 'FVG' : 'OB'}</span>
                {OB_TF_OPTIONS.map(tf => (
                  <button key={tf.granularity} className={`st-chip ${s.obGranularity === tf.granularity ? 'active' : ''}`}
                    onClick={() => onUpdate(idx, { ...s, obGranularity: tf.granularity })}>{tf.label}</button>
                ))}
              </div>
              <div className="st-chips">
                <span style={{fontSize: 12, color: '#8e929a', width: '40px', paddingTop: 8}}>진입</span>
                {ENTRY_TF_OPTIONS.map(tf => (
                  <button key={tf.granularity} className={`st-chip ${s.entryGranularity === tf.granularity ? 'active' : ''}`}
                    onClick={() => onUpdate(idx, { ...s, entryGranularity: tf.granularity })}>{tf.label}</button>
                ))}
              </div>
            </div>

            <div className="st-section">
              <h4 className="st-section-title">주요 수치 설정</h4>
              <Stepper label="TP 목표" value={p.tpPercent} unit="%" step={0.1} min={0.1} max={20} onChange={v => setParam(idx, 'tpPercent', v)} />
              {!p.slAtDeepBorder && (
                <Stepper label="SL1 손절" value={p.slPercent} unit="%" step={0.1} min={0.1} max={20} onChange={v => setParam(idx, 'slPercent', v)} />
              )}
              {!p.useEqStrategy && (
                <Stepper label="진입 대기" value={p.maxWaitCandles} unit="캔들" step={5} min={1} max={200} onChange={v => setParam(idx, 'maxWaitCandles', v)} />
              )}
              <Stepper label="타임아웃" value={p.maxHoldCandles} unit="캔들" step={5} min={1} max={500} onChange={v => setParam(idx, 'maxHoldCandles', v)} />
              <Stepper label="레버리지" value={p.leverage} unit="x" step={1} min={1} max={100} onChange={v => setParam(idx, 'leverage', v)} />
              <div className="st-stepper-row">
                <span className="st-stepper-label">자금 계산</span>
                <div className="st-chips">
                  <button className={`st-chip ${(p.capitalMode ?? 'fixed') === 'fixed' ? 'active' : ''}`} onClick={() => setParam(idx, 'capitalMode', 'fixed')}>고정진입금</button>
                  <button className={`st-chip ${p.capitalMode === 'compound' ? 'active' : ''}`} onClick={() => setParam(idx, 'capitalMode', 'compound')}>복리(잔고비율)</button>
                </div>
              </div>
              
              {(p.capitalMode ?? 'fixed') === 'fixed' ? (
                <>
                  <Stepper label="1회 고정 진입시드" value={p.fixedEntryMargin ?? 100} unit="$" step={10} min={10} max={10000} onChange={v => setParam(idx, 'fixedEntryMargin', v)} />
                  <Stepper label="시작 잔고 (누적용)" value={s.initialCapital} unit="" step={100} min={100} max={100000} onChange={v => onUpdate(idx, { ...s, initialCapital: v })} format={v => '$' + v.toLocaleString()} />
                </>
              ) : (
                <>
                  <Stepper label="진입 비중" value={p.positionPct} unit="%" step={5} min={5} max={100} onChange={v => setParam(idx, 'positionPct', v)} />
                  <Stepper label="시작 잔고" value={s.initialCapital} unit="" step={100} min={100} max={100000} onChange={v => onUpdate(idx, { ...s, initialCapital: v })} format={v => '$' + v.toLocaleString()} />
                </>
              )}
            </div>

            {!p.useEqStrategy && (
            <div className="st-section">
              <h4 className="st-section-title">상세 청산 및 진입 조건</h4>
              {!p.slAtDeepBorder && (
                <div className="st-stepper-row">
                  <span className="st-stepper-label">SL2 종가이탈 기준</span>
                  <div className="st-chips">
                    <button className={`st-chip ${p.sl2Tf === 'entryTf' ? 'active' : ''}`} onClick={() => setParam(idx, 'sl2Tf', 'entryTf')}>진입TF</button>
                    <button className={`st-chip ${p.sl2Tf === 'obTf' ? 'active' : ''}`} onClick={() => setParam(idx, 'sl2Tf', 'obTf')}>{p.useFvgStrategy ? 'FVG TF' : 'OB TF'}</button>
                  </div>
                </div>
              )}
              <Stepper label="진입 깊이 제한" value={p.closeDepth} unit="" step={0.1} min={0.1} max={1.0} onChange={v => setParam(idx, 'closeDepth', v)} format={v => v >= 1.0 ? '전체 허용' : `상위 ${Math.round(v * 100)}%`} />
            </div>
            )}

            <div className="st-section">
              <h4 className="st-section-title">스위치(토글) 옵션</h4>
              {!p.useEqStrategy && <>
                <Toggle label={`SL3 (${p.useFvgStrategy ? 'FVG' : 'OB'} 완전이탈 손절)`} checked={p.useSl3} onChange={() => setParam(idx, 'useSl3', !p.useSl3)} />
                <Toggle label={`${entryTfLabel} 혼합 구간 필터`} checked={p.filterMixed4h} onChange={() => setParam(idx, 'filterMixed4h', !p.filterMixed4h)} />
                <Toggle label="반대 방향 스위칭" checked={p.switching} onChange={() => setParam(idx, 'switching', !p.switching)} />
                <Toggle label="정방향+SL후 스위칭" checked={p.combinedSwitch} onChange={() => setParam(idx, 'combinedSwitch', !p.combinedSwitch)} />
                <Toggle label="1D 데이터 부족 제외 필터" checked={p.useDataFilter} onChange={() => setParam(idx, 'useDataFilter', !p.useDataFilter)} />
                <Toggle label="1D 역배열 롱 진입 제한" checked={p.filterReverseBull1d} onChange={() => setParam(idx, 'filterReverseBull1d', !p.filterReverseBull1d)} />
                <Toggle label={`${entryTfLabel} MA20 역추세 진입 제한`} checked={!!p.filterEntryMa20} onChange={() => setParam(idx, 'filterEntryMa20', !p.filterEntryMa20)} />
                <Toggle label="진입 TF 거래량 급등 트리거" checked={p.volumeTrigger} onChange={() => setParam(idx, 'volumeTrigger', !p.volumeTrigger)} />
                <Toggle label="BB 역매매 (OB 돌파 시 전환)" checked={p.useBbStrategy} onChange={() => setParam(idx, 'useBbStrategy', !p.useBbStrategy)} />
              </>}
              <Toggle label="EQ 전략 (mid 첫터치 진입, EQ 손절)" checked={!!p.useEqStrategy} onChange={() => setParam(idx, 'useEqStrategy', !p.useEqStrategy)} />
            </div>
            
            {p.volumeTrigger && (
              <div className="st-section">
                <h4 className="st-section-title">거래량 세부 옵션</h4>
                <Toggle label="방향성 캔들 필터" checked={p.volumeTriggerBullish} onChange={() => setParam(idx, 'volumeTriggerBullish', !p.volumeTriggerBullish)} />
                <Stepper label="거래량 기준치" value={p.volumeMultiplier} unit="x" step={0.1} min={1.0} max={5.0} onChange={v => setParam(idx, 'volumeMultiplier', v)} format={v => `평균 x${v.toFixed(1)}`} />
              </div>
            )}
          </div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="st-list">
      <div className="st-management-header">
        <div>
          <span className="st-status-dot active" />
          <strong>{monitoringCards.length} MONITORS RUNNING</strong>
        </div>
        <button className="st-filter-btn">☰ Filter</button>
      </div>

      {monitoringCards.map(({ label, idx, strategy }) => renderCard(strategy, idx, label, false))}

      {hiddenStrategyCards.length > 0 && (
        <button className="st-fold-btn" onClick={() => setShowHiddenStrategies(v => !v)}>
          {showHiddenStrategies ? '▲ 숨긴 전략 접기' : `▼ 숨긴 전략 ${hiddenStrategyCards.length}개 펼쳐보기`}
        </button>
      )}

      {showHiddenStrategies && hiddenStrategyCards.map(({ strategy, idx }) =>
        renderCard(strategy, idx, strategy.params.useFvgStrategy ? strategy.name.replace(/OB/g, 'FVG') : strategy.name, true)
      )}
    </div>
  );
}
