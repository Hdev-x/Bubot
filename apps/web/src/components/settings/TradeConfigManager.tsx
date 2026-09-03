// 매매설정 관리 — 사용자가 심볼/전략/투자금/안전장치를 설정
import { useState, useEffect, useCallback } from 'react';
import {
  fetchTradeConfigs, createTradeConfig, updateTradeConfig,
  setTradeConfigActive, deleteTradeConfig,
  type TradeConfig, type StrategyType, type SaveConfigInput,
} from '../../api/tradeConfigApi';
import { SYMBOLS_MAIN } from '../../constants/strategyConstants';
import { SUB_ACCOUNT_NAMES } from '../../config/bots';

// 봇(키 슬롯) — MAIN은 수동 전용이라 제외. 키1개=전략1개(여러 종목).
const BOT_OPTIONS: { value: string; label: string }[] =
  Object.entries(SUB_ACCOUNT_NAMES).map(([value, label]) => ({ value, label }));

const STATUS_COLOR: Record<string, string> = {
  RUNNING: '#0ecb81', IDLE: '#8b95a1', STOPPED_LOSS: '#f6465d', ERROR: '#f3ba2f', KILLED: '#f6465d',
};

import { StrategyConfig } from '../../constants/strategyConstants';

// 자동매매 폼은 돈/안전장치만 받는다. 전략 파라미터(TP/SL/패턴/TF 등)는 전략 설정이 단일 출처.
const emptyForm = {
  symbols: ['SOLUSDT'] as string[], botTarget: 'SOL',
  investUsdt: '10', leverage: '20', maxLossPct: '5.0',
};

const STRATEGY_LABEL: Record<string, string> = {
  HARMONIC: '하모닉', ABCD: 'AB=CD', FVG: 'FVG', BB: 'BB', OB: 'OB',
};

export default function TradeConfigManager({ initialStrategy, initialSymbols }: { initialStrategy?: StrategyConfig | null, initialSymbols?: string[] | null }) {
  const [configs, setConfigs] = useState<TradeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editBotTarget, setEditBotTarget] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  // 적용된 전략(파라미터 출처). 자동매매 등록은 전략 설정의 "적용"으로만 진입한다.
  const [strategySource, setStrategySource] = useState<{ strategy: StrategyType; params: any; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setConfigs(await fetchTradeConfigs());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (initialStrategy) {
      const p = initialStrategy.params as any;
      const stratEnum = p.useAbcdStrategy ? 'ABCD' : p.useHarmonicStrategy ? 'HARMONIC' : p.useFvgStrategy ? 'FVG' : p.useBbStrategy ? 'BB' : 'HARMONIC';
      setStrategySource({ strategy: stratEnum as StrategyType, params: p, name: initialStrategy.name });
      setForm(prev => ({
        ...prev,
        symbols: initialSymbols && initialSymbols.length > 0 ? initialSymbols : prev.symbols,
        leverage: String(p.leverage ?? prev.leverage),
      }));
      setShowForm(true);
      setEditBotTarget(null);
    }
  }, [initialStrategy, initialSymbols]);

  function resetForm() {
    setForm({ ...emptyForm });
    setStrategySource(null);
    setEditBotTarget(null);
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!strategySource) {
      setError('전략 설정에서 "자동매매 적용"으로 등록하세요.');
      return;
    }
    if (form.symbols.length === 0) {
      alert('심볼을 1개 이상 선택하세요.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // 전략 파라미터 통째 상속 + 전략 종류 플래그만 보정
      const params = {
        ...strategySource.params,
        useFvgStrategy: strategySource.strategy === 'FVG',
        useBbStrategy: strategySource.strategy === 'BB',
        useHarmonicStrategy: strategySource.strategy === 'HARMONIC',
        useAbcdStrategy: strategySource.strategy === 'ABCD',
      };
      const payload: Omit<SaveConfigInput, 'symbol'> = {
        botTarget: form.botTarget,
        strategy: strategySource.strategy,
        investUsdt: Number(form.investUsdt),
        leverage: Number(form.leverage),
        maxLossPct: 0, // Not used, hidden from UI
        params,
      } as any;

      if (editBotTarget != null) {
        const existingForBot = configs.filter(c => c.botTarget === editBotTarget);
        const existingSymbols = existingForBot.map(c => c.symbol);
        
        const toAdd = form.symbols.filter(s => !existingSymbols.includes(s));
        const toRemove = existingForBot.filter(c => !form.symbols.includes(c.symbol));
        const toUpdate = existingForBot.filter(c => form.symbols.includes(c.symbol));

        await Promise.all([
          ...toRemove.map(c => deleteTradeConfig(c.id)),
          ...toAdd.map(sym => createTradeConfig({ ...payload, symbol: sym })),
          ...toUpdate.map(c => updateTradeConfig(c.id, { ...payload, symbol: c.symbol }))
        ]);
      } else {
        await Promise.all(form.symbols.map(sym => createTradeConfig({ ...payload, symbol: sym })));
      }
      resetForm();
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  function startEditGroup(botTarget: string, botConfigs: TradeConfig[]) {
    if (botConfigs.length === 0) return;
    const c = botConfigs[0];
    let p: any = {};
    try { p = JSON.parse(c.params || '{}'); } catch { /* ignore */ }
    setStrategySource({ strategy: c.strategy, params: p, name: `${botTarget} 전략 그룹` });
    setForm({
      symbols: botConfigs.map(x => x.symbol), botTarget: c.botTarget ?? 'SOL',
      investUsdt: String(c.investUsdt), leverage: String(c.leverage), maxLossPct: String(c.maxLossPct),
    });
    setEditBotTarget(botTarget);
    setShowForm(true);
  }

  async function handleToggleTradeGroup(botConfigs: TradeConfig[], targetEnabled: boolean) {
    if (!confirm(`이 그룹의 ${botConfigs.length}개 종목의 자동매매를 ${targetEnabled ? '켜시겠습니까' : '끄시겠습니까'}?`)) return;
    try { 
      await Promise.all(botConfigs.map(c => {
        let p: any = {};
        try { p = JSON.parse(c.params || '{}'); } catch {}
        p.tradeEnabled = targetEnabled;
        return updateTradeConfig(c.id, { 
          botTarget: c.botTarget, strategy: c.strategy, symbol: c.symbol,
          investUsdt: c.investUsdt, leverage: c.leverage, maxLossPct: c.maxLossPct,
          params: p
        } as SaveConfigInput);
      }));
      await load(); 
    } catch (e: any) { setError(e.message); }
  }

  async function handleToggleGroup(botConfigs: TradeConfig[], targetActive: boolean) {
    if (!confirm(`이 그룹의 ${botConfigs.length}개 종목을 모두 ${targetActive ? '시작' : '중지'}하시겠습니까?`)) return;
    try { 
      await Promise.all(botConfigs.map(c => setTradeConfigActive(c.id, targetActive)));
      await load(); 
    } catch (e: any) { setError(e.message); }
  }

  async function handleDeleteGroup(botConfigs: TradeConfig[]) {
    if (!confirm(`이 그룹의 ${botConfigs.length}개 종목을 모두 삭제하시겠습니까?`)) return;
    try { 
      await Promise.all(botConfigs.map(c => deleteTradeConfig(c.id)));
      await load(); 
    } catch (e: any) { setError(e.message); }
  }

  const groupedConfigs = configs.reduce((acc, c) => {
    const key = c.botTarget || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {} as Record<string, TradeConfig[]>);

  return (
    <div className="premium-panel" style={{ padding: '20px' }}>
      <div className="premium-panel-header">
        <h3>자동매매 설정</h3>
        {showForm && (
          <button type="button" onClick={resetForm}
            className="btn-secondary" style={{ padding: '6px 14px', fontSize: '13px' }}>
            취소
          </button>
        )}
      </div>

      {error && <div style={{ color: '#f6465d', fontSize: 13, background: 'rgba(246, 70, 93, 0.1)', padding: '8px 12px', borderRadius: '6px', marginBottom: '16px' }}>⚠️ {error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid rgba(255,255,255,0.04)' }}>
          
          <div style={{ background: 'rgba(49, 130, 246, 0.05)', border: '1px solid rgba(49, 130, 246, 0.1)', padding: 14, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', marginBottom: 12 }}>대상 및 전략</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="premium-label" style={{ margin: 0 }}>심볼 (종목 추가/삭제 가능)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => setForm(p => ({ ...p, symbols: [...SYMBOLS_MAIN] }))}
                      className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}>
                      전체선택 ({SYMBOLS_MAIN.length})
                    </button>
                    <button type="button" onClick={() => setForm(p => ({ ...p, symbols: [] }))}
                      className="btn-danger-outline" style={{ padding: '4px 10px', fontSize: 11 }}>
                      전체해제
                    </button>
                  </div>
                </div>
                <div className="st-chips" style={{ gap: 6 }}>
                  {SYMBOLS_MAIN.map(s => {
                    const isSelected = form.symbols.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm(p => ({
                          ...p,
                          symbols: isSelected ? p.symbols.filter(x => x !== s) : [...p.symbols, s]
                        }))}
                        className={`st-chip ${isSelected ? 'active' : ''}`}
                        style={{ padding: '6px 12px', fontSize: 12 }}
                      >
                        {s.replace('USDT', '')}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="premium-label">봇 (키 슬롯) — 키1개=전략1개</label>
                <Select value={form.botTarget} onChange={v => setForm(p => ({ ...p, botTarget: v }))} options={BOT_OPTIONS} disabled={editBotTarget !== null} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="premium-label">전략 (전략 설정에서 적용됨)</label>
                <div className="premium-input" style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.85 }}>
                  <span className="badge-neon active">{STRATEGY_LABEL[strategySource?.strategy ?? ''] ?? strategySource?.strategy}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{strategySource?.name}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 16 }}>
            <div style={{ gridColumn: '1 / -1', fontSize: 13, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
              자금 / 안전장치 (선택된 모든 종목에 일괄 적용됩니다)
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Row label="레버리지"><Num value={form.leverage} onChange={v => setForm(p => ({ ...p, leverage: v }))} /></Row>
            </div>
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              ※ TP·SL·패턴·타임프레임 등 전략 파라미터는 <b>전략 설정 값</b>을 그대로 사용합니다. 바꾸려면 전략 설정에서 수정 후 다시 적용하세요.
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={saving}
              className="btn-glow"
              style={{ flex: 1, background: 'linear-gradient(135deg, #0ecb81 0%, #0a965f 100%)', boxShadow: '0 4px 12px rgba(14, 203, 129, 0.3)', padding: '12px 0' }}>
              {saving ? '저장 중...' : (editBotTarget != null ? '전략 그룹 수정 저장' : `선택된 ${form.symbols.length}개 종목 전략 그룹 등록`)}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>불러오는 중...</div>
      ) : configs.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '30px 0', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          등록된 매매설정이 없습니다.<br />
          <span style={{ fontSize: 11, opacity: 0.8 }}>전략 설정 탭에서 전략의 "⚡ 자동매매 적용"을 눌러 등록하세요.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {Object.entries(groupedConfigs).map(([botTarget, botConfigs]) => {
            const botLabel = SUB_ACCOUNT_NAMES[botTarget] ?? botTarget;
            const strategyName = botConfigs[0].strategy;
            const isAllActive = botConfigs.every(c => c.active);
            const isActiveAny = botConfigs.some(c => c.active);
            const totalRealizedPnl = botConfigs.reduce((sum, c) => sum + Number(c.realizedPnl || 0), 0);
            
            return (
              <div key={botTarget} style={{ 
                background: 'linear-gradient(145deg, rgba(30, 35, 45, 0.4) 0%, rgba(20, 24, 32, 0.6) 100%)', 
                border: '1px solid rgba(255,255,255,0.08)', 
                borderRadius: '20px', 
                padding: '24px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '20px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                backdropFilter: 'blur(12px)'
              }}>
                {/* Header Section */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      width: '42px', height: '42px', borderRadius: '12px', 
                      background: isActiveAny ? 'linear-gradient(135deg, rgba(14, 203, 129, 0.2), rgba(10, 150, 95, 0.1))' : 'rgba(255,255,255,0.05)', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: isActiveAny ? '1px solid rgba(14, 203, 129, 0.3)' : '1px solid rgba(255,255,255,0.1)'
                    }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: isActiveAny ? '#0ecb81' : '#8b95a1', boxShadow: isActiveAny ? '0 0 12px rgba(14, 203, 129, 0.8)' : 'none' }} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <strong style={{ color: '#fff', fontSize: '18px', letterSpacing: '-0.3px' }}>{botLabel}</strong>
                        <span style={{ fontSize: '11px', background: 'rgba(49, 130, 246, 0.15)', color: '#3182f6', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
                          {strategyName}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#8b95a1', fontWeight: '500' }}>
                        운용 중인 종목 <strong style={{ color: '#fff' }}>{botConfigs.length}</strong>개
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(() => {
                        let isTradeEnabled = false;
                        try {
                          const p = JSON.parse(botConfigs[0].params || '{}');
                          isTradeEnabled = !!p.tradeEnabled;
                        } catch {}
                        
                        return isTradeEnabled ? (
                          <button type="button" onClick={() => handleToggleTradeGroup(botConfigs, false)} className="btn-danger-outline" style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '10px' }}>
                            ⏸ 자동매매 끄기
                          </button>
                        ) : (
                          <button type="button" onClick={() => handleToggleTradeGroup(botConfigs, true)} className="btn-glow" disabled={!isAllActive} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '10px', background: !isAllActive ? '#58606c' : 'linear-gradient(135deg, #f39c12 0%, #d35400 100%)', color: '#fff', border: 'none', opacity: !isAllActive ? 0.5 : 1 }}>
                            🔥 자동매매 켜기
                          </button>
                        );
                      })()}
                      {isAllActive ? (
                        <button type="button" onClick={() => handleToggleGroup(botConfigs, false)} className="btn-danger-outline" style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '10px' }}>
                          ■ 스캐닝 종료
                        </button>
                      ) : (
                        <button type="button" onClick={() => handleToggleGroup(botConfigs, true)} className="btn-glow" style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '10px', background: 'linear-gradient(135deg, #0ecb81 0%, #0a965f 100%)', color: '#fff', border: 'none' }}>
                          ▶ 스캐닝 시작
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => startEditGroup(botTarget, botConfigs)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '8px' }}>⚙️ 설정 수정</button>
                      <button type="button" onClick={() => handleDeleteGroup(botConfigs)} className="btn-danger-outline" style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '8px', border: 'none', background: 'rgba(246, 70, 93, 0.1)' }}>삭제</button>
                    </div>
                  </div>
                </div>

                {/* Stats Section */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {(() => {
                    let isCompound = false;
                    let posPct = 0;
                    try {
                      const p = JSON.parse(botConfigs[0].params || '{}');
                      isCompound = p.capitalMode === 'compound';
                      posPct = p.positionPct || 0;
                    } catch { }

                    return isCompound ? (
                      <div style={{ background: 'linear-gradient(135deg, rgba(49, 130, 246, 0.1) 0%, rgba(49, 130, 246, 0.02) 100%)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid rgba(49, 130, 246, 0.2)' }}>
                        <span style={{ fontSize: '12px', color: '#8b95a1', fontWeight: '500' }}>투자 비중 <span style={{ color: '#3182f6', fontSize: '10px', background: 'rgba(49,130,246,0.15)', padding: '1px 4px', borderRadius: '4px' }}>복리</span></span>
                        <strong style={{ fontSize: '16px', color: '#fff' }}>{posPct} <span style={{ fontSize: '12px', color: '#58606c' }}>%</span></strong>
                      </div>
                    ) : (
                      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '12px', color: '#8b95a1', fontWeight: '500' }}>종목당 투자금 <span style={{ color: '#8b95a1', fontSize: '10px' }}>(고정)</span></span>
                        <strong style={{ fontSize: '16px', color: '#fff' }}>{botConfigs[0].investUsdt} <span style={{ fontSize: '12px', color: '#58606c' }}>USDT</span></strong>
                      </div>
                    );
                  })()}
                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#8b95a1', fontWeight: '500' }}>레버리지</span>
                    <strong style={{ fontSize: '16px', color: '#fff' }}>{botConfigs[0].leverage}<span style={{ fontSize: '13px' }}>x</span></strong>
                  </div>
                  <div style={{ background: 'rgba(14, 203, 129, 0.05)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid rgba(14, 203, 129, 0.1)' }}>
                    <span style={{ fontSize: '12px', color: '#8b95a1', fontWeight: '500' }}>총 실현 수익</span>
                    <strong style={{ fontSize: '16px', color: totalRealizedPnl > 0 ? '#0ecb81' : totalRealizedPnl < 0 ? '#f6465d' : '#fff' }}>
                      {totalRealizedPnl > 0 ? '+' : ''}{totalRealizedPnl.toFixed(2)} <span style={{ fontSize: '12px', color: '#0ecb81', opacity: 0.7 }}>USDT</span>
                    </strong>
                  </div>
                </div>

                {/* Symbols List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '13px', color: '#8b95a1', fontWeight: '600', paddingLeft: '4px' }}>운용 종목 리스트</div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', padding: '16px', borderRadius: '14px', display: 'flex', flexWrap: 'wrap', gap: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    {botConfigs.map(c => (
                      <div key={c.id} style={{ 
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', 
                        background: c.active ? 'rgba(14, 203, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${c.active ? 'rgba(14, 203, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)'}`,
                        transition: 'all 0.2s ease',
                        cursor: 'default'
                      }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.active ? '#0ecb81' : '#58606c', boxShadow: c.active ? '0 0 6px rgba(14,203,129,0.5)' : 'none' }} />
                        <span style={{ fontSize: '12px', color: c.active ? '#fff' : '#8b95a1', fontWeight: c.active ? 700 : 500, letterSpacing: '0.3px' }}>
                          {c.symbol.replace('USDT', '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="premium-label">{label}</label>
      {children}
    </div>
  );
}

function Num({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="number" step="any" value={value} onChange={e => onChange(e.target.value)} className="premium-input" />;
}

function Select({ value, onChange, options, disabled }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className="premium-input" style={{ opacity: disabled ? 0.6 : 1 }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function MultiSelectSymbols({ selected, onChange, options, disabled }: { selected: string[], onChange: (v: string[]) => void, options: string[], disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  
  if (disabled) {
    return (
      <div className="premium-input" style={{ opacity: 0.6, display: 'flex', alignItems: 'center' }}>
        {selected[0] || ''}
      </div>
    );
  }
  
  return (
    <div style={{ position: 'relative' }}>
      <div 
        className="premium-input" 
        style={{ cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 44, padding: '8px 10px', alignItems: 'center', height: 'auto' }}
        onClick={() => setOpen(!open)}
      >
        {selected.length === 0 ? <span style={{ color: '#8b96a8' }}>심볼을 선택하세요...</span> : null}
        {selected.length === options.length ? <span className="badge-neon active" style={{ fontSize: 13, padding: '4px 10px' }}>전체 종목 ({options.length})</span> : 
          selected.slice(0, 4).map(s => <span key={s} className="badge-neon" style={{ fontSize: 12 }}>{s}</span>)
        }
        {selected.length > 4 && selected.length !== options.length && <span style={{ fontSize: 12, color: 'var(--muted)' }}>+{selected.length - 4}</span>}
      </div>
      
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'rgba(21, 26, 35, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, marginTop: 8, padding: 12, zIndex: 50, maxHeight: 350, overflowY: 'auto', backdropFilter: 'blur(16px)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
             <button type="button" onClick={() => onChange(options)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>✅ 전체 선택</button>
             <button type="button" onClick={() => { onChange([]); setOpen(false); }} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>완료 / 닫기</button>
             <button type="button" onClick={() => onChange([])} className="btn-danger-outline" style={{ padding: '6px 12px', fontSize: 12 }}>전체 해제</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {options.map(opt => {
              const isSel = selected.includes(opt);
              return (
                <div 
                  key={opt} 
                  onClick={() => onChange(isSel ? selected.filter(x => x !== opt) : [...selected, opt])}
                  style={{ 
                    padding: '8px 4px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', textAlign: 'center',
                    background: isSel ? 'rgba(14, 203, 129, 0.2)' : 'rgba(255,255,255,0.03)',
                    color: isSel ? '#0ecb81' : '#aeb2ba',
                    border: `1px solid ${isSel ? 'rgba(14,203,129,0.4)' : 'rgba(255,255,255,0.05)'}`,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {opt}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
