import type { CSSProperties, ReactNode } from 'react';

/** sets a CSS custom property inline (e.g. the accent colour --c used by the tiles) */
export const cssVar = (name: string, value: string): CSSProperties => ({ [name]: value }) as CSSProperties;

/** The WRC (World Robot Championship) hexagon emblem */
export function Emblem({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="emblem-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#23335f" />
          <stop offset="1" stopColor="#090d1c" />
        </linearGradient>
      </defs>
      <polygon points="50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5" fill="url(#emblem-fill)" stroke="#ffffff" strokeWidth="4" />
      <polygon points="50,12 83,31 83,69 50,88 17,69 17,31" fill="none" stroke="#ff3b3b" strokeWidth="2" />
      <text x="50" y="58" textAnchor="middle" fontFamily="Impact, 'Arial Black', sans-serif" fontSize="30" fill="#ffffff" letterSpacing="1">
        WRC
      </text>
      <rect x="30" y="66" width="40" height="3" fill="#ffb030" />
    </svg>
  );
}

/** a physical-looking keyboard key */
export function Key({ children }: { children: ReactNode }) {
  return <kbd className="keycap">{children}</kbd>;
}
