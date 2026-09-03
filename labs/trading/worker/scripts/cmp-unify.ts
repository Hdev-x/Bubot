import { fetchCandles } from '../src/lib/warmup.ts';
import { detectHarmonicPatterns, predictHarmonicPatterns } from '../../../../shared/harmonic.ts';
import { getPivots } from '../../../../shared/pivots.ts';
const SYMS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'];
const TFS=['30m','4h','1d'] as const;
const core=(n:string)=>n.replace(/\s*\(Emerging\)/,'');
const key=(p:any)=>`${p.points.A.time}_${p.points.B.time}_${core(p.name)}_${p.isBullish}`;
let dTot=0,pTot=0,both=0,dOnly=0,pOnly=0; const dOnlyNames:Record<string,number>={};
for(const sym of SYMS){ for(const tf of TFS){
  const candles=(await fetchCandles(sym,tf,1200)).slice(0,-1);
  const last=candles[candles.length-1].close;
  const dSet=new Set<string>(), pSet=new Set<string>(); const dByKey=new Map<string,any>();
  for(const len of [55,34,21,13,8,5]){ if(candles.length<=len*2)continue;
    const piv=getPivots(candles,len,'wick');
    for(const p of detectHarmonicPatterns(piv,true,candles)){ const k=key(p); if(!dSet.has(k)){dSet.add(k);dByKey.set(k,p);} }
    for(const p of predictHarmonicPatterns(piv,last,true,candles,{mode:'display'} as any) as any[]){ if(p.lifecycle==='completed'){const k=key(p); pSet.add(k);} }
  }
  dTot+=dSet.size; pTot+=pSet.size;
  for(const k of dSet){ if(pSet.has(k))both++; else {dOnly++; const nm=core(dByKey.get(k).name); dOnlyNames[nm]=(dOnlyNames[nm]||0)+1;} }
  for(const k of pSet){ if(!dSet.has(k))pOnly++; }
}}
console.log('detect 완성(클린):',dTot,'| predict 완성(전부):',pTot);
console.log('교집합(predict가 detect 커버):',both);
console.log('detect-only(제거시 손실 위험):',dOnly,`(detect의 ${(dOnly/dTot*100).toFixed(0)}%)`);
console.log('predict-only(predict가 추가):',pOnly);
console.log('detect-only 패턴별:', Object.entries(dOnlyNames).sort((a,b)=>b[1]-a[1]).map(([n,c])=>`${n}:${c}`).join(', '));
