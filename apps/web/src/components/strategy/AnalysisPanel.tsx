import React, { useState } from 'react';
import { fetchAllBinanceFuturesCandles } from '../../api/marketApi';
import { detectOBs, classifyCandle } from '../../utils/backtestEngine';

type AnalysisEvent = {
  obTime: number;
  eventTime: number;
  type: 'Bull 즉시 돌파' | 'Bull 지연 돌파' | 'Bear 즉시 돌파' | 'Bear 지연 돌파' | 'Bull 방어 성공' | 'Bear 방어 성공';
  profitPct?: number;
  candlesToBest?: number;
};

type SurvivedStats = {
  count: number;
  maxProfitPct: number;
  sumProfitPct: number;
  minCandles: number;
  maxCandles: number;
  sumCandles: number;
};

function createEmptyStats(): SurvivedStats {
  return { count: 0, maxProfitPct: 0, sumProfitPct: 0, minCandles: 999, maxCandles: 0, sumCandles: 0 };
}

export function AnalysisPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<{
    bull: { total: number, breakout: number, delayedBreakout: number, survived: number, stats: SurvivedStats },
    bear: { total: number, breakout: number, delayedBreakout: number, survived: number, stats: SurvivedStats }
  } | null>(null);
  const [analysisLogs, setAnalysisLogs] = useState<AnalysisEvent[]>([]);

  const handleRun = async () => {
    setIsRunning(true);
    setResults(null);
    try {
      const obCandles = await fetchAllBinanceFuturesCandles('BTCUSDT', '1Dutc', 5000);
      const entryCandles = await fetchAllBinanceFuturesCandles('BTCUSDT', '4h', 15000);

      const obs = detectOBs(obCandles);
      let bullTotal = 0, bullBreakout = 0, bullDelayed = 0, bullSurvived = 0;
      let bearTotal = 0, bearBreakout = 0, bearDelayed = 0, bearSurvived = 0;
      let bullStats = createEmptyStats();
      let bearStats = createEmptyStats();
      let logs: AnalysisEvent[] = [];

      const toSec = (t: string | number) => typeof t === 'number' ? t : Math.floor(new Date(t.includes(' ') ? t.replace(' ', 'T') : t).getTime() / 1000);

      for (const ob of obs) {
        const obIdx = obCandles.findIndex(c => toSec(c.time) === ob.time);
        if (obIdx < 0 || obIdx + 2 >= obCandles.length) continue;
        
        const lookAfterTime = toSec(obCandles[obIdx + 2].time);
        const firstIdx = entryCandles.findIndex(c => toSec(c.time) >= lookAfterTime);
        if (firstIdx < 0) continue;

        for (let i = firstIdx; i < entryCandles.length; i++) {
          const type = classifyCandle(ob, entryCandles[i]);
          if (type !== 'no_touch') {
            const isBull = ob.type === 'bull';
            let boWithin10 = false;
            let delayedBreakoutIdx = -1;
            
            if (type !== 'breakout') {
              for (let j = 1; j <= 10 && i + j < entryCandles.length; j++) {
                if (classifyCandle(ob, entryCandles[i + j]) === 'breakout') {
                  boWithin10 = true;
                  delayedBreakoutIdx = i + j;
                  break;
                }
              }
            }

            if (isBull) {
              bullTotal++;
              if (type === 'breakout') {
                bullBreakout++;
                logs.push({ obTime: ob.time, eventTime: toSec(entryCandles[i].time), type: 'Bull 즉시 돌파' });
              }
              else if (boWithin10) {
                bullDelayed++;
                logs.push({ obTime: ob.time, eventTime: toSec(entryCandles[delayedBreakoutIdx].time), type: 'Bull 지연 돌파' });
              }
              else {
                bullSurvived++;
                const entryClose = entryCandles[i].close;
                let bestClose = entryClose;
                let bestCandles = 0;
                for (let j = 1; j <= 10 && i + j < entryCandles.length; j++) {
                  const currentClose = entryCandles[i + j].close;
                  if (currentClose > bestClose) {
                    bestClose = currentClose;
                    bestCandles = j;
                  }
                }
                const profitPct = ((bestClose - entryClose) / entryClose) * 100;
                bullStats.count++;
                bullStats.sumProfitPct += profitPct;
                if (profitPct > bullStats.maxProfitPct) bullStats.maxProfitPct = profitPct;
                bullStats.sumCandles += bestCandles;
                if (bestCandles < bullStats.minCandles) bullStats.minCandles = bestCandles;
                if (bestCandles > bullStats.maxCandles) bullStats.maxCandles = bestCandles;

                logs.push({ obTime: ob.time, eventTime: toSec(entryCandles[i].time), type: 'Bull 방어 성공', profitPct, candlesToBest: bestCandles });
              }
            } else {
              bearTotal++;
              if (type === 'breakout') {
                bearBreakout++;
                logs.push({ obTime: ob.time, eventTime: toSec(entryCandles[i].time), type: 'Bear 즉시 돌파' });
              }
              else if (boWithin10) {
                bearDelayed++;
                logs.push({ obTime: ob.time, eventTime: toSec(entryCandles[delayedBreakoutIdx].time), type: 'Bear 지연 돌파' });
              }
              else {
                bearSurvived++;
                const entryClose = entryCandles[i].close;
                let bestClose = entryClose;
                let bestCandles = 0;
                for (let j = 1; j <= 10 && i + j < entryCandles.length; j++) {
                  const currentClose = entryCandles[i + j].close;
                  if (currentClose < bestClose) {
                    bestClose = currentClose;
                    bestCandles = j;
                  }
                }
                const profitPct = ((entryClose - bestClose) / entryClose) * 100;
                bearStats.count++;
                bearStats.sumProfitPct += profitPct;
                if (profitPct > bearStats.maxProfitPct) bearStats.maxProfitPct = profitPct;
                bearStats.sumCandles += bestCandles;
                if (bestCandles < bearStats.minCandles) bearStats.minCandles = bestCandles;
                if (bestCandles > bearStats.maxCandles) bearStats.maxCandles = bestCandles;

                logs.push({ obTime: ob.time, eventTime: toSec(entryCandles[i].time), type: 'Bear 방어 성공', profitPct, candlesToBest: bestCandles });
              }
            }
            break; 
          }
        }
      }
      setResults({
        bull: { total: bullTotal, breakout: bullBreakout, delayedBreakout: bullDelayed, survived: bullSurvived, stats: bullStats },
        bear: { total: bearTotal, breakout: bearBreakout, delayedBreakout: bearDelayed, survived: bearSurvived, stats: bearStats }
      });
      setAnalysisLogs(logs);
    } catch (e) {
      console.error(e);
    }
    setIsRunning(false);
  };

  const handleDownloadLogs = () => {
    if (analysisLogs.length === 0 || !results) return;
    let txt = '[OB 4H 첫 터치 분석 상세 내역]\n\n';
    txt += '분석 기준: 1D OB / 4H 터치 판별\n';
    txt += '* 돌파: 첫 터치 시 뚫린 경우 (즉시) / 첫 터치 후 10캔들 내 뚫린 경우 (지연)\n';
    txt += '* 방어 성공: 10캔들 동안 방어한 경우 (수익은 다음 10캔들 중 최고 종가 기준)\n';
    txt += '--------------------------------------------------------------------------------\n';
    txt += '유형\t\t\tOB 생성 시간(1D)\t\t\t이벤트 발생 시간(4H)\t\t수익률\t도달 캔들\n';
    txt += '--------------------------------------------------------------------------------\n';
    
    analysisLogs.forEach(log => {
      const obDate = new Date(log.obTime * 1000).toLocaleString('ko-KR');
      const evDate = new Date(log.eventTime * 1000).toLocaleString('ko-KR');
      const profitStr = log.profitPct !== undefined ? `${log.profitPct.toFixed(2)}%` : '-';
      const candleStr = log.candlesToBest !== undefined ? `${log.candlesToBest}개` : '-';
      txt += `${log.type.padEnd(14)}\t${obDate}\t\t${evDate}\t\t${profitStr.padEnd(8)}\t${candleStr}\n`;
    });
    
    const printStats = (name: string, stats: SurvivedStats) => {
      if (stats.count === 0) return;
      txt += `\n[${name} 방어 성공 요약 (총 ${stats.count}건)]\n`;
      txt += `- 평균 최고 수익률: ${(stats.sumProfitPct / stats.count).toFixed(2)}%\n`;
      txt += `- 최대 최고 수익률: ${stats.maxProfitPct.toFixed(2)}%\n`;
      txt += `- 최고가 도달 캔들 수 (평균): ${(stats.sumCandles / stats.count).toFixed(1)}개\n`;
      txt += `- 최고가 도달 캔들 수 (최소): ${stats.minCandles === 999 ? 0 : stats.minCandles}개\n`;
      txt += `- 최고가 도달 캔들 수 (최대): ${stats.maxCandles}개\n`;
    };

    txt += '\n================================================================================\n';
    printStats('Bull', results.bull.stats);
    printStats('Bear', results.bear.stats);

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ob_analysis_logs_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bt-panel">
      <div className="st-section">
        <h4 className="st-section-title">OB 첫 터치 이탈률 분석 (BTCUSDT)</h4>
        <p style={{color: '#8e929a', fontSize: 13, marginBottom: 16}}>
          1D 기준으로 생성된 OB 영역에 4H 캔들이 처음 도달했을 때, 즉시 반대편 밖으로 종가 마감(Breakout)해버리는 비율을 계산합니다.
        </p>
        <button className="bt-run-btn-modern" onClick={handleRun} disabled={isRunning}>
          {isRunning ? '데이터 수집 및 분석 중...' : '분석 실행'}
        </button>
      </div>
      
      {results && (
        <div className="st-section">
          <h4 className="st-section-title">분석 결과</h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: 8, padding: 16 }}>
              <h5 style={{ margin: '0 0 12px 0', color: '#0ecb81' }}>Bull OB (롱)</h5>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#8e929a' }}>전체 터치 OB</span>
                <strong>{results.bull.total}개</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#f6465d' }}>첫 터치 즉시 돌파 (Breakout)</span>
                <strong>{results.bull.breakout}개 ({(results.bull.breakout / Math.max(1, results.bull.total) * 100).toFixed(1)}%)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#f0b90b' }}>첫 터치 후 10캔들 내 돌파</span>
                <strong>{results.bull.delayedBreakout}개 ({(results.bull.delayedBreakout / Math.max(1, results.bull.total) * 100).toFixed(1)}%)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#0ecb81' }}>방어 성공 (최대수익 {results.bull.stats.count > 0 ? results.bull.stats.maxProfitPct.toFixed(2) : 0}%)</span>
                <strong>{results.bull.survived}개 ({(results.bull.survived / Math.max(1, results.bull.total) * 100).toFixed(1)}%)</strong>
              </div>
            </div>
            
            <div style={{ background: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: 8, padding: 16 }}>
              <h5 style={{ margin: '0 0 12px 0', color: '#f6465d' }}>Bear OB (숏)</h5>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#8e929a' }}>전체 터치 OB</span>
                <strong>{results.bear.total}개</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#0ecb81' }}>첫 터치 즉시 돌파 (Breakout)</span>
                <strong>{results.bear.breakout}개 ({(results.bear.breakout / Math.max(1, results.bear.total) * 100).toFixed(1)}%)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#f0b90b' }}>첫 터치 후 10캔들 내 돌파</span>
                <strong>{results.bear.delayedBreakout}개 ({(results.bear.delayedBreakout / Math.max(1, results.bear.total) * 100).toFixed(1)}%)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#f6465d' }}>방어 성공 (최대수익 {results.bear.stats.count > 0 ? results.bear.stats.maxProfitPct.toFixed(2) : 0}%)</span>
                <strong>{results.bear.survived}개 ({(results.bear.survived / Math.max(1, results.bear.total) * 100).toFixed(1)}%)</strong>
              </div>
            </div>
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', marginTop: 16}}>
            <button className="bt-download-btn" onClick={handleDownloadLogs} disabled={analysisLogs.length === 0}>
              ⬇ 분석 상세 내역 TXT 다운로드
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
