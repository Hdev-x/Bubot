// 거래소 단일 소스 — 마켓/거래/자산 전역이 이 메타를 참조한다.
// 새 거래소 추가는 여기 한 곳만 손대면 되도록 유지.
import bitgetLogo from '../assets/exchanges/bitget.svg';
import binanceLogo from '../assets/exchanges/binance.svg';
import upbitLogo from '../assets/exchanges/upbit.svg';
import bithumbLogo from '../assets/exchanges/bithumb.svg';

export type ExchangeId = 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';

export interface ExchangeMeta {
  id: ExchangeId;
  label: string;
  logo: string;
  quote: 'USDT' | 'KRW';        // 기본 견적 통화
  supportsFutures: boolean;     // 선물(무기한) 지원 여부 — 업비트/빗썸은 false
  requiresPassphrase: boolean;  // API 키 등록 시 passphrase 필요(비트겟만 true)
  apiKeyLabel: string;          // API 탭 입력 필드 라벨(거래소별 용어 차이)
  secretKeyLabel: string;
  apiKeyPlaceholder: string;
  color: string;                // 브랜드 텍스트 컬러(거래소 배지 등)
}

export const EXCHANGES: Record<ExchangeId, ExchangeMeta> = {
  BITGET: {
    id: 'BITGET', label: 'Bitget', logo: bitgetLogo, quote: 'USDT',
    supportsFutures: true, requiresPassphrase: true,
    apiKeyLabel: 'API Key', secretKeyLabel: 'Secret Key', apiKeyPlaceholder: 'bg_...',
    color: '#00f0ff',
  },
  BINANCE: {
    id: 'BINANCE', label: 'Binance', logo: binanceLogo, quote: 'USDT',
    supportsFutures: true, requiresPassphrase: false,
    apiKeyLabel: 'API Key', secretKeyLabel: 'Secret Key', apiKeyPlaceholder: 'API Key',
    color: '#f0b90b',
  },
  UPBIT: {
    id: 'UPBIT', label: 'Upbit', logo: upbitLogo, quote: 'KRW',
    supportsFutures: false, requiresPassphrase: false,
    apiKeyLabel: 'Access Key', secretKeyLabel: 'Secret Key', apiKeyPlaceholder: 'Access Key',
    color: '#ffffff',
  },
  BITHUMB: {
    id: 'BITHUMB', label: 'Bithumb', logo: bithumbLogo, quote: 'KRW',
    supportsFutures: false, requiresPassphrase: false,
    apiKeyLabel: 'Connect Key', secretKeyLabel: 'Secret Key', apiKeyPlaceholder: 'Connect Key',
    color: '#f47320',
  },
};

// 표시 순서(마켓 바텀시트·API 탭 셀렉트 공통)
export const EXCHANGE_OPTIONS: ExchangeMeta[] = [
  EXCHANGES.BITGET,
  EXCHANGES.BINANCE,
  EXCHANGES.UPBIT,
  EXCHANGES.BITHUMB,
];

// 마켓 필터바/바텀시트가 기대하는 형태({ label, value, logo })
export const EXCHANGE_SELECT_OPTIONS: Array<{ label: string; value: ExchangeId; logo: string }> =
  EXCHANGE_OPTIONS.map((e) => ({ label: e.label, value: e.id, logo: e.logo }));

export const isFuturesSupported = (id: ExchangeId): boolean => EXCHANGES[id].supportsFutures;
export const isKrwExchange = (id: ExchangeId): boolean => EXCHANGES[id].quote === 'KRW';
export const exchangeLogo = (id: ExchangeId): string => EXCHANGES[id].logo;
export const exchangeLabel = (id: ExchangeId): string => EXCHANGES[id].label;
