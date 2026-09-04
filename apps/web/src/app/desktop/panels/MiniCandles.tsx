import type { ChartTheme } from '../../../chart/settings/ChartSettingsSheet';

// 테마 프리셋 카드 미리보기 캔들 (모바일 ChartSettingsSheet의 MiniCandles 복사)
export function MiniCandles({ upColor, downColor, bgColor }: Pick<ChartTheme, 'upColor' | 'downColor' | 'bgColor'>) {
  const candles = [
    { bull: true, y: 3, h: 14 }, { bull: false, y: 5, h: 12 }, { bull: true, y: 2, h: 16 },
    { bull: false, y: 6, h: 10 }, { bull: true, y: 1, h: 15 },
  ];
  return (
    <div className="mini-candles-wrap" style={{ background: bgColor }}>
      {candles.map((c, i) => (
        <svg key={i} width="5" height="24" viewBox="0 0 5 24">
          <line x1="2.5" y1="0" x2="2.5" y2={c.y} stroke={c.bull ? upColor : downColor} strokeWidth="1" />
          <rect x="0.5" y={c.y} width="4" height={c.h} fill={c.bull ? upColor : downColor} rx="0.5" />
          <line x1="2.5" y1={c.y + c.h} x2="2.5" y2="24" stroke={c.bull ? upColor : downColor} strokeWidth="1" />
        </svg>
      ))}
    </div>
  );
}
