import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import './sheets.css';

type TimeframeOption = {
  label: string;
  value: string;
  granularity: string;
  channel: string;
  category: 'min' | 'hour' | 'day' | 'week' | 'month';
};

const TIMEFRAMES: TimeframeOption[] = [
  { label: '1분',   value: '1m',  granularity: '1min',  channel: 'candle1m',  category: 'min' },
  { label: '3분',   value: '3m',  granularity: '3min',  channel: 'candle3m',  category: 'min' },
  { label: '5분',   value: '5m',  granularity: '5min',  channel: 'candle5m',  category: 'min' },
  { label: '15분',  value: '15m', granularity: '15min', channel: 'candle15m', category: 'min' },
  { label: '30분',  value: '30m', granularity: '30min', channel: 'candle30m', category: 'min' },
  { label: '1시간', value: '1h',  granularity: '1h',    channel: 'candle1H',  category: 'hour' },
  { label: '4시간', value: '4h',  granularity: '4h',    channel: 'candle4H',  category: 'hour' },
  { label: '6시간', value: '6h',  granularity: '6Hutc',  channel: 'candle6Hutc',  category: 'hour' },
  { label: '12시간',value: '12h', granularity: '12Hutc', channel: 'candle12Hutc', category: 'hour' },
  { label: '1일',   value: '1d',  granularity: '1Dutc', channel: 'candle1Dutc',  category: 'day' },
  { label: '3일',   value: '3d',  granularity: '3Dutc', channel: 'candle3Dutc',  category: 'day' },
  { label: '1주',   value: '1w',  granularity: '1Wutc', channel: 'candle1Wutc',  category: 'week' },
  { label: '1달',   value: '1mo', granularity: '1Mutc', channel: 'candle1Mutc',category: 'month' },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  selectedTimeframe: string;
  onSelect: (timeframe: TimeframeOption) => void;
};

type SheetSize = 'compact' | 'full';

export default function TimeframeSheet({ isOpen, onClose, selectedTimeframe, onSelect }: Props) {
  const [sheetSize, setSheetSize] = useState<SheetSize>('compact');

  useEffect(() => {
    if (!isOpen) return;

    setSheetSize('compact');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="interval-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
          />
          <motion.div
            className={`interval-sheet ${sheetSize}`}
            initial={{ y: '100%', opacity: 0.98 }}
            animate={{
              y: 0,
              opacity: 1,
              height: sheetSize === 'full' ? '100dvh' : '73dvh',
              borderTopLeftRadius: sheetSize === 'full' ? 0 : 20,
              borderTopRightRadius: sheetSize === 'full' ? 0 : 20
            }}
            exit={{ y: '100%', opacity: 0.98 }}
            transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.9 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.03, bottom: 0.18 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -78 || info.velocity.y < -650) {
                setSheetSize('full');
                return;
              }
              if (info.offset.y > 92 || info.velocity.y > 700) {
                if (sheetSize === 'full') {
                  setSheetSize('compact');
                } else {
                  onClose();
                }
              }
            }}
          >
            <div className="interval-drag-zone">
              <div className="sheet-handle" />
            </div>
            <header className="interval-sheet-header">
              <h3>인터벌</h3>
              <button className="interval-close-btn" type="button" onClick={onClose} aria-label="닫기">✕</button>
            </header>

            <div className="interval-sheet-content">
              <section className="interval-section">
                <p className="interval-section-title">즐겨찾기</p>
                <div className="interval-grid">
                  {TIMEFRAMES.slice(0, 5).map((tf) => (
                    <button
                      key={tf.value}
                      className={`interval-button ${selectedTimeframe === tf.value ? 'active' : ''}`}
                      onClick={() => {
                        onSelect(tf);
                        onClose();
                      }}
                    >
                      {tf.label} <span className="interval-star">★</span>
                    </button>
                  ))}
                </div>
              </section>

              {(['min', 'hour', 'day', 'week', 'month'] as const).map(cat => (
                <section key={cat} className="interval-section">
                  <p className="interval-section-title">
                    {{ min: '분', hour: '시간', day: '일', week: '주', month: '월' }[cat]}
                  </p>
                  <div className="interval-grid">
                    {TIMEFRAMES.filter(tf => tf.category === cat).map((tf) => (
                      <button
                        key={tf.value}
                        className={`interval-button ${selectedTimeframe === tf.value ? 'active' : ''}`}
                        onClick={() => { onSelect(tf); onClose(); }}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
