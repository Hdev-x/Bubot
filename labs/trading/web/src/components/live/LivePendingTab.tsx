import React from 'react';
import { SUB_ACCOUNT_NAMES } from '../../config/bots';

export interface LivePendingTabProps {
  mainStatus: any;
  subPendingOrders: any[];
  getTickDecimals: (symbol: string) => number;
}

function fmt(sec: number) {
  return new Date(sec * 1000).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function LivePendingTab({ mainStatus, subPendingOrders, getTickDecimals }: LivePendingTabProps) {
  const mainOrders = mainStatus?.pendingOrders ?? [];
  const totalPending = mainOrders.length + subPendingOrders.length;

  return (
    <div style={{ paddingBottom: '24px' }}>
      {totalPending === 0 ? (
        <div className="live-no-pos" style={{ paddingLeft: '2px', fontSize: '12px', color: '#58606c', paddingTop: '20px' }}>
          미체결 주문이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 2px' }}>
          {/* 서브 계정 봇 미체결 */}
          {subPendingOrders.map((order) => (
            <div key={order.orderId} style={{ background: 'rgba(255, 255, 255, 0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#8e929a' }} />
                  <span style={{ fontSize: '10px', color: '#8e929a', fontWeight: '600' }}>
                    {order.botName === 'Worker' ? 'Worker' : (SUB_ACCOUNT_NAMES[order.botName || ''] || order.botName)}
                  </span>
                </div>
                <strong style={{ color: '#fff', fontSize: '14px', fontWeight: '700', marginLeft: '2px' }}>{order.symbol.replace('USDT', '')}</strong>
                <span style={{ fontSize: '9px', fontWeight: '700', color: order.direction === 'long' ? '#0ecb81' : '#f6465d', background: order.direction === 'long' ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)', padding: '2px 4px', borderRadius: '2px' }}>
                  {order.direction === 'long' ? 'Long' : 'Short'}
                </span>
                <span style={{ fontSize: '9px', color: '#f3ba2f', background: 'rgba(243,186,47,0.08)', padding: '2px 5px', borderRadius: '2px', marginLeft: 'auto' }}>
                  대기중
                </span>
              </div>
              <div className="live-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#58606c', marginBottom: '3px' }}>지정가</div>
                  <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600' }}>{order.price.toFixed(getTickDecimals(order.symbol))}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#58606c', marginBottom: '3px' }}>TP</div>
                  <div style={{ fontSize: '13px', color: '#0ecb81', fontWeight: '600' }}>{order.tpPrice != null ? order.tpPrice.toLocaleString() : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#58606c', marginBottom: '3px' }}>SL</div>
                  <div style={{ fontSize: '13px', color: '#f6465d', fontWeight: '600' }}>{order.sl1Price != null ? order.sl1Price.toLocaleString() : '—'}</div>
                </div>
              </div>
            </div>
          ))}
          {/* 메인 계정 미체결 */}
          {mainOrders.map((order: any) => (
            <div key={order.orderId} style={{ background: 'rgba(255, 255, 255, 0.025)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', fontWeight: '700', background: 'rgba(255,200,0,0.15)', color: '#f3ba2f' }}>메인</span>
                <strong style={{ color: '#fff', fontSize: '14px', fontWeight: '700' }}>{order.symbol.replace('USDT', '')}</strong>
                <span style={{ fontSize: '9px', fontWeight: '700', color: order.direction === 'long' ? '#0ecb81' : '#f6465d', background: order.direction === 'long' ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)', padding: '2px 4px', borderRadius: '2px' }}>
                  {order.direction === 'long' ? 'Long' : 'Short'}
                </span>
                <span style={{ fontSize: '9px', color: '#f3ba2f', background: 'rgba(243,186,47,0.08)', padding: '2px 5px', borderRadius: '2px', marginLeft: 'auto' }}>
                  대기중
                </span>
              </div>
              <div className="live-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#58606c', marginBottom: '3px' }}>지정가</div>
                  <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600' }}>{order.price.toFixed(getTickDecimals(order.symbol))}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#58606c', marginBottom: '3px' }}>수량</div>
                  <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600' }}>{order.size}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#58606c', marginBottom: '3px' }}>등록</div>
                  <div style={{ fontSize: '11px', color: '#8e929a' }}>{fmt(Math.floor(order.createTime / 1000))}</div>
                </div>
                {order.tpPrice && (
                  <div>
                    <div style={{ fontSize: '11px', color: '#58606c', marginBottom: '3px' }}>TP</div>
                    <div style={{ fontSize: '13px', color: '#0ecb81', fontWeight: '600' }}>{order.tpPrice.toLocaleString()}</div>
                  </div>
                )}
                {order.sl1Price && (
                  <div>
                    <div style={{ fontSize: '11px', color: '#58606c', marginBottom: '3px' }}>SL</div>
                    <div style={{ fontSize: '13px', color: '#f6465d', fontWeight: '600' }}>{order.sl1Price.toLocaleString()}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
