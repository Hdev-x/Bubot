import React, { useState } from 'react';

interface CoinLogoProps {
  symbol: string;
  logoUrl: string | null;
  className?: string;
  style?: React.CSSProperties;
  color: string;
}

export const CoinLogo = ({ symbol, logoUrl, className, style, color }: CoinLogoProps) => {
  const [error, setError] = useState(false);

  if (error || !logoUrl) {
    return (
      <span 
        className={className} 
        style={{ 
          ...style, 
          background: '#fff', 
          display: 'inline-flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          color: color,
        }}
      >
        {symbol.slice(0, 1)}
      </span>
    );
  }

  return (
    <img 
      src={logoUrl} 
      alt={symbol} 
      className={className}
      style={{ ...style, background: 'radial-gradient(closest-side, #ffffff 92%, transparent 96%)' }}
      onError={() => setError(true)}
    />
  );
};
