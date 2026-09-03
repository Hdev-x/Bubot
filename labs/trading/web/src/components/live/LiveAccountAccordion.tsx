import { BOT_KEYS, SUB_ACCOUNT_NAMES } from '../../config/bots';
import { useCurrency } from '@web/shared/contexts/CurrencyContext';
import type { WorkerStatus } from '../../api/adminApi';

export interface LiveAccountAccordionProps {
  isAccountExpanded: boolean;
  setIsAccountExpanded: (val: boolean) => void;
  expandedAccount: string | null;
  setExpandedAccount: (val: string | null) => void;
  usdKrw: number;
  hasMainBalance: boolean;
  mainTotalEquity: number;
  subTotalEquity: number;
  totalBotCount: number;
  mainOnline: boolean;
  mainStatus: any;
  botResults: Record<string, any>;
  combinedPositions: any[];
  realtimePrices: Record<string, number>;
  LEVERAGE: number;
  SEED_RATIO: number;
  workerStatus?: WorkerStatus | null;
}

export default function LiveAccountAccordion({
  isAccountExpanded, setIsAccountExpanded,
  expandedAccount, setExpandedAccount,
  usdKrw,
  hasMainBalance, mainTotalEquity, subTotalEquity,
  totalBotCount, mainOnline, mainStatus, botResults,
  combinedPositions, realtimePrices,
  LEVERAGE, SEED_RATIO, workerStatus
}: LiveAccountAccordionProps) {
  const { displayCurrency, isHideBalance } = useCurrency();
  const workerAlive = workerStatus?.alive ?? false;
  const workerSnapshot = workerStatus?.snapshot ?? null;
  const workerUpdatedAgo = workerStatus?.updatedAt ? Math.round((Date.now() - workerStatus.updatedAt) / 1000) : null;
  const useUnifiedWorkerStatus = workerStatus !== undefined;
  const formatUsdt = (value: number) => Math.abs(value) < 1 ? value.toFixed(4) : value.toFixed(1);

  return (
    <>
      <div 
        onClick={() => setIsAccountExpanded(!isAccountExpanded)}
        style={{
          background: '#000', padding: '14px 20px 24px', borderBottom: 'none',
          display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', userSelect: 'none'
        }}
      >
        <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255,255,255,0.06)', padding: '5px 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ color: '#cfd3da', fontSize: '11px', fontWeight: 700 }}>{isAccountExpanded ? '계정 현황 접기' : '계정 현황 보기'}</span>
          <span style={{
            color: '#8b95a1', fontSize: '9px',
            transform: isAccountExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease', display: 'inline-block'
          }}>▼</span>
        </div>
      </div>

      {isAccountExpanded && (
        <div style={{ background: '#000', borderBottom: 'none', padding: '0 20px 20px' }}>
          {/* MAIN ACCOUNT는 전략(봇) 탭에서 제외 — 메인은 수동(선물) 계정이라 봇 총자산과 분리. SUB BOTS만 표시 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', padding: '14px', border: '1px solid #000', borderRadius: '12px', background: '#000' }}>
            <div style={{ background: '#000', border: '1px solid #000', borderRadius: '10px', padding: '11px 12px' }}>
              <span style={{ color: '#8b95a1', fontSize: '11px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>SUB BOTS</span>
              <strong style={{ color: '#fff', fontSize: '16px', fontWeight: '800', letterSpacing: '-0.2px' }}>
                {isHideBalance ? '••••' : (displayCurrency === 'USDT' ? `${subTotalEquity.toFixed(1)} USDT` : `${Math.round(subTotalEquity * usdKrw).toLocaleString()}원`)}
              </strong>
              <p style={{ color: '#58606c', fontSize: '11px', margin: '2px 0 0' }}>
                {isHideBalance ? '' : (displayCurrency === 'USDT' ? `≈ ${Math.round(subTotalEquity * usdKrw).toLocaleString()}원` : `≈ ${subTotalEquity.toFixed(2)} USDT`)}
              </p>
            </div>
          </div>

          <div style={{ marginTop: '20px' }}>
            <div className="live-card-label" style={{ color: '#8b95a1', marginBottom: '10px', fontSize: '13px', fontWeight: '600' }}>
              계정 현황 ({totalBotCount})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {useUnifiedWorkerStatus && (
                <>
                  <div style={{ background: '#000', border: '1px solid #000', borderRadius: '10px', boxSizing: 'border-box', overflow: 'hidden' }}>
                    <div
                      onClick={() => setExpandedAccount(expandedAccount === 'worker' ? null : 'worker')}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: workerAlive ? '#0ecb81' : '#f6465d', boxShadow: workerAlive ? '0 0 6px rgba(14,203,129,0.6)' : 'none', transition: 'background 0.3s', flexShrink: 0 }} />
                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#fff', letterSpacing: '0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Sub Bots</span>
                        <span style={{ flexShrink: 0, fontSize: '9px', fontWeight: '700', color: workerAlive ? '#0ecb81' : '#8e929a', background: workerAlive ? 'rgba(14, 203, 129, 0.1)' : 'rgba(255, 255, 255, 0.04)', border: `1px solid ${workerAlive ? 'rgba(14, 203, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)'}`, borderRadius: '4px', padding: '2px 5px', lineHeight: 1, whiteSpace: 'nowrap' }}>
                          {workerAlive ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#c9ccd1', minWidth: '52px', textAlign: 'right' }}>
                          설정 {workerSnapshot?.configs.length ?? 0}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8e929a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: expandedAccount === 'worker' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                    {expandedAccount === 'worker' && (
                      <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                        <div style={{ display: 'flex', gap: '16px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                          <span style={{ fontSize: '11px', color: '#8e929a', fontWeight: '600' }}>
                            엔진 <strong style={{ color: '#c9ccd1', marginLeft: '2px' }}>{workerSnapshot?.engineCount ?? 0}</strong>
                          </span>
                          <span style={{ fontSize: '11px', color: '#8e929a', fontWeight: '600' }}>
                            심볼 <strong style={{ color: '#c9ccd1', marginLeft: '2px' }}>{workerSnapshot?.symbols.length ?? 0}</strong>
                          </span>
                          {workerUpdatedAgo !== null && (
                            <span style={{ fontSize: '11px', color: '#58606c', fontWeight: '600' }}>
                              {workerUpdatedAgo}초 전
                            </span>
                          )}
                        </div>
                        {workerSnapshot?.configs.length ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {workerSnapshot.configs.map(cfg => (
                              <div key={cfg.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', background: 'rgba(255, 255, 255, 0.025)', borderRadius: '6px', padding: '7px 8px', fontSize: '11px' }}>
                                <span style={{ color: '#c9ccd1', fontWeight: 700 }}>{cfg.symbol}</span>
                                <span style={{ color: '#8e929a' }}>{cfg.strategy} · {cfg.leverage}x</span>
                                <span style={{ color: cfg.hasPosition ? '#0ecb81' : '#58606c', fontWeight: 700 }}>{cfg.hasPosition ? '보유' : '대기'}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '11px', color: '#58606c', background: 'rgba(255, 255, 255, 0.025)', borderRadius: '6px', padding: '8px' }}>
                            활성 매매설정이 없습니다.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {!useUnifiedWorkerStatus && (
                <>
              {/* Main Account Row */}
              <div style={{ background: '#000', border: '1px solid #000', borderRadius: '10px', boxSizing: 'border-box', overflow: 'hidden' }}>
                <div 
                  onClick={() => setExpandedAccount(expandedAccount === 'main' ? null : 'main')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: mainOnline ? '#f3ba2f' : '#58606c', boxShadow: mainOnline ? '0 0 6px #f3ba2f' : 'none', flexShrink: 0 }} />
                    <span style={{ fontSize: '14px', fontWeight: '800', color: '#fff', letterSpacing: '0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Main</span>
                    <span style={{ flexShrink: 0, fontSize: '9px', fontWeight: '700', color: '#c9ccd1', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '4px', padding: '2px 5px', lineHeight: 1, whiteSpace: 'nowrap' }}>ALL</span>
                    {(mainStatus?.positions.length ?? 0) > 0 && (
                      <span style={{ flexShrink: 0, fontSize: '9px', fontWeight: '700', color: '#0ecb81', background: 'rgba(14, 203, 129, 0.1)', border: '1px solid rgba(14, 203, 129, 0.2)', borderRadius: '4px', padding: '2px 5px', lineHeight: 1, whiteSpace: 'nowrap' }}>
                        P {mainStatus!.positions.length}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <span style={{ fontSize: '14px', fontWeight: '800', color: '#fff', letterSpacing: '-0.3px', textAlign: 'right' }}>
                      {mainStatus
                        ? (isHideBalance ? '••••' : (displayCurrency === 'USDT' ? `${formatUsdt(mainTotalEquity)} USDT` : `${Math.round(mainTotalEquity * usdKrw).toLocaleString()}원`))
                        : <span style={{ color: '#58606c' }}>—</span>
                      }
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: '800', color: mainStatus ? ( ((mainTotalEquity - 70) / 70) * 100 >= 0 ? '#0ecb81' : '#f6465d' ) : '#58606c', minWidth: '52px', textAlign: 'right' }}>
                      {mainStatus 
                        ? `${((mainTotalEquity - 70) / 70) * 100 >= 0 ? '+' : ''}${(((mainTotalEquity - 70) / 70) * 100).toFixed(2)}%`
                        : '—'
                      }
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8e929a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: expandedAccount === 'main' ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
                {expandedAccount === 'main' && (
                  <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    <div style={{ display: 'flex', gap: '16px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <span style={{ fontSize: '11px', color: (mainStatus?.positions.length ?? 0) > 0 ? '#0ecb81' : '#58606c', fontWeight: '600' }}>
                        포지션 P<strong style={{ color: (mainStatus?.positions.length ?? 0) > 0 ? '#0ecb81' : '#8e929a', marginLeft: '2px' }}>{mainStatus?.positions.length ?? 0}</strong>
                      </span>
                      <span style={{ fontSize: '11px', color: (mainStatus?.pendingOrders.length ?? 0) > 0 ? '#f3ba2f' : '#58606c', fontWeight: '600' }}>
                        OB<strong style={{ color: (mainStatus?.pendingOrders.length ?? 0) > 0 ? '#f3ba2f' : '#8e929a', marginLeft: '2px' }}>{mainStatus?.pendingOrders.length ?? 0}</strong>
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' }}>
                      {[
                        ['배율', '수동', '#c9ccd1'],
                        ['비중', '수동', '#c9ccd1'],
                        ['TP', '—', '#0ecb81'],
                        ['SL', '—', '#f6465d'],
                      ].map(([label, val, c]) => (
                        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', background: 'rgba(255, 255, 255, 0.025)', borderRadius: '6px', padding: '6px 4px' }}>
                          <span style={{ fontSize: '9px', color: '#6b727c', fontWeight: '600' }}>{label}</span>
                          <strong style={{ fontSize: '12px', color: c as string, fontWeight: '700' }}>{val}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sub Bot Rows */}
              {BOT_KEYS.map(key => {
                const res = botResults[key];
                const name = SUB_ACCOUNT_NAMES[key] || key;
                const online = res?.success;
                const isRunning = res?.data?.status === 'running';
                const pCount = res?.data?.position ? 1 : 0;
                const obCount = online && res.data ? res.data.engineStatus.trackers : 0;
                let balance = online && res.data ? res.data.balance : null;
                if (balance !== null) {
                  const botPnL = combinedPositions.filter(p => p.botName === key).reduce((sum, p) => {
                    const cp = realtimePrices[p.symbol] || p.entryPrice;
                    return sum + (p.direction === 'long' ? 1 : -1) * (cp - p.entryPrice) * p.size;
                  }, 0);
                  balance += botPnL;
                }
                const statusColor = online ? (isRunning ? '#0ecb81' : '#f6465d') : '#58606c';
                const cfg = res?.data?.symbolConfigs ? Object.values(res.data.symbolConfigs)[0] : undefined;
                const symbolKey = res?.data?.symbolConfigs ? Object.keys(res.data.symbolConfigs)[0] : undefined;
                const coin = (symbolKey || key).replace(/USDT$/, '');
                const perf = res?.data?.stats;
                const totalReturn = perf?.totalReturnPct ?? 0;
                const isExpanded = expandedAccount === key;
                const stats: [string, string, string][] = [
                  ['배율', `${LEVERAGE}x`, '#c9ccd1'],
                  ['비중', `${SEED_RATIO}%`, '#c9ccd1'],
                  ['TP', cfg ? `${(cfg as any).tpPercent}%` : '—', '#0ecb81'],
                  ['SL1', cfg ? `${(cfg as any).slPercent}%` : '—', '#f6465d'],
                ];
                return (
                  <div key={key} style={{
                    background: '#000', border: '1px solid #000',
                    borderRadius: '10px', boxSizing: 'border-box', overflow: 'hidden'
                  }}>
                    <div
                      onClick={() => setExpandedAccount(isExpanded ? null : key)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusColor, boxShadow: online && isRunning ? `0 0 6px ${statusColor}` : 'none', flexShrink: 0 }} />
                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#fff', letterSpacing: '0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                        <span style={{ flexShrink: 0, fontSize: '9px', fontWeight: '700', color: '#c9ccd1', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '4px', padding: '2px 5px', lineHeight: 1, whiteSpace: 'nowrap' }}>{coin}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#fff', letterSpacing: '-0.3px' }}>
                          {balance !== null
                            ? (isHideBalance ? '••••' : (displayCurrency === 'USDT' ? `${balance.toFixed(1)} USDT` : `${Math.round(balance * usdKrw).toLocaleString()}원`))
                            : <span style={{ color: '#58606c' }}>—</span>
                          }
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: '800', color: totalReturn >= 0 ? '#0ecb81' : '#f6465d', minWidth: '52px', textAlign: 'right' }}>
                          {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
                        </span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8e929a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                        <div style={{ display: 'flex', gap: '16px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                          <span style={{ fontSize: '11px', color: pCount > 0 ? '#0ecb81' : '#58606c', fontWeight: '600' }}>
                            포지션 P<strong style={{ color: pCount > 0 ? '#0ecb81' : '#8e929a', marginLeft: '2px' }}>{pCount}</strong>
                          </span>
                          <span style={{ fontSize: '11px', color: '#58606c', fontWeight: '600' }}>
                            OB<strong style={{ color: '#8e929a', marginLeft: '2px' }}>{obCount}</strong>
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' }}>
                          {stats.map(([label, val, c]) => (
                            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', background: 'rgba(255, 255, 255, 0.025)', borderRadius: '6px', padding: '6px 4px' }}>
                              <span style={{ fontSize: '9px', color: '#6b727c', fontWeight: '600' }}>{label}</span>
                              <strong style={{ fontSize: '12px', color: c, fontWeight: '700' }}>{val}</strong>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '10px', color: '#6b727c', fontWeight: '600' }}>승률</span>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#c9ccd1' }}>
                              {(perf?.winRate ?? 0).toFixed(0)}% <span style={{ color: '#58606c', fontWeight: '600' }}>({perf?.wins ?? 0}/{perf?.completed ?? 0})</span>
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '10px', color: '#6b727c', fontWeight: '600' }}>TP1 / TP2 / SL</span>
                            <span style={{ fontSize: '12px', fontWeight: '700' }}>
                              <span style={{ color: '#0ecb81' }}>{perf?.tp1Count ?? (perf?.tpCount ?? 0)}</span>
                              <span style={{ color: '#58606c' }}> / </span>
                              <span style={{ color: '#0ecb81' }}>{perf?.tp2Count ?? 0}</span>
                              <span style={{ color: '#58606c' }}> / </span>
                              <span style={{ color: '#f6465d' }}>{(perf?.sl1Count ?? 0) + (perf?.sl2Count ?? 0) + (perf?.sl3Count ?? 0)}</span>
                              {(perf?.timeoutCount ?? 0) > 0 && <span style={{ color: '#8e929a', fontWeight: '600' }}> · T{perf?.timeoutCount}</span>}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
