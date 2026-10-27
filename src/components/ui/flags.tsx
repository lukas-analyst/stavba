// =====================================================================
// Flag SVGs — inline SVG flags for locale + currency selectors
// ---------------------------------------------------------------------
// Emoji flags (🇨🇿, 🇬🇧) don't render on Windows. We use inline SVG
// instead — works cross-platform, scales crisply, and matches MD3
// icon sizing (16-20px).
//
// Each flag is a simple <svg> with the correct aspect ratio (3:2).
// Colors are the official flag colors.
// =====================================================================

type FlagProps = {
  className?: string;
};

// Czech Republic flag (3:2, ratio 900x600)
export function FlagCZ({ className }: FlagProps) {
  return (
    <svg
      viewBox="0 0 900 600"
      className={className}
      role="img"
      aria-label="Czech Republic"
    >
      <rect width="900" height="300" y="0" fill="#ffffff" />
      <rect width="900" height="300" y="300" fill="#d7141a" />
      <path d="M0,0 L450,300 L0,600 Z" fill="#11457e" />
    </svg>
  );
}

// United Kingdom flag (3:2, ratio 60x40)
export function FlagGB({ className }: FlagProps) {
  return (
    <svg
      viewBox="0 0 60 40"
      className={className}
      role="img"
      aria-label="United Kingdom"
    >
      <clipPath id="t">
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#ffffff" strokeWidth="6" />
      <path d="M0,0 L60,40 M60,0 L0,40" clipPath="url(#t)" stroke="#c8102e" strokeWidth="4" />
      <path d="M30,0 v40 M0,20 h60" stroke="#ffffff" strokeWidth="10" />
      <path d="M30,0 v40 M0,20 h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  );
}

// European Union flag (3:2, ratio 810x540)
export function FlagEU({ className }: FlagProps) {
  return (
    <svg
      viewBox="0 0 810 540"
      className={className}
      role="img"
      aria-label="European Union"
    >
      <rect width="810" height="540" fill="#003399" />
      {[
        [405, 90],
        [493, 117],
        [543, 195],
        [493, 273],
        [405, 300],
        [317, 273],
        [267, 195],
        [317, 117],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={30}
          fill="none"
          stroke="#ffcc00"
          strokeWidth="15"
        />
      ))}
    </svg>
  );
}

// USA flag (3:2 simplified, ratio 60x40)
export function FlagUS({ className }: FlagProps) {
  return (
    <svg
      viewBox="0 0 60 40"
      className={className}
      role="img"
      aria-label="United States"
    >
      <rect width="60" height="40" fill="#ffffff" />
      {[3, 11, 19, 27, 35].map((y) => (
        <rect key={y} width="60" height="4" y={y} fill="#b22234" />
      ))}
      <rect width="24" height="22" fill="#3c3b6e" />
    </svg>
  );
}

// Hungary flag (3:2, ratio 900x600)
export function FlagHU({ className }: FlagProps) {
  return (
    <svg
      viewBox="0 0 900 600"
      className={className}
      role="img"
      aria-label="Hungary"
    >
      <rect width="900" height="200" fill="#ce2939" />
      <rect width="900" height="200" y="200" fill="#ffffff" />
      <rect width="900" height="200" y="400" fill="#477050" />
    </svg>
  );
}

// Poland flag (3:2, ratio 900x600)
export function FlagPL({ className }: FlagProps) {
  return (
    <svg
      viewBox="0 0 900 600"
      className={className}
      role="img"
      aria-label="Poland"
    >
      <rect width="900" height="300" fill="#ffffff" />
      <rect width="900" height="300" y="300" fill="#dc143c" />
    </svg>
  );
}

// Australia flag (3:2 simplified, ratio 60x40)
export function FlagAU({ className }: FlagProps) {
  return (
    <svg
      viewBox="0 0 60 40"
      className={className}
      role="img"
      aria-label="Australia"
    >
      <rect width="60" height="40" fill="#012169" />
      <rect width="30" height="20" fill="#012169" />
      <rect width="30" height="2" y="0" fill="#ffffff" />
      <rect width="30" height="2" y="6" fill="#ffffff" />
      <rect width="30" height="2" y="12" fill="#ffffff" />
      <rect width="30" height="2" y="18" fill="#ffffff" />
      <rect width="2" height="20" x="0" fill="#ffffff" />
      <rect width="2" height="20" x="6" fill="#ffffff" />
      <rect width="2" height="20" x="12" fill="#ffffff" />
      <rect width="2" height="20" x="18" fill="#ffffff" />
      <rect width="2" height="20" x="24" fill="#ffffff" />
      <rect width="2" height="20" x="14" y="0" fill="#c8102e" transform="rotate(0 14 10)" />
      <rect width="20" height="2" x="5" y="9" fill="#c8102e" />
      {/* Simplified Union Jack in top-left */}
      <path d="M0,0 L30,20 M30,0 L0,20" stroke="#ffffff" strokeWidth="1.5" />
      <path d="M0,0 L30,20 M30,0 L0,20" stroke="#c8102e" strokeWidth="0.8" clipPath="url(#au-clip)" />
      {/* Stars simplified as dots */}
      <circle cx="45" cy="10" r="1" fill="#ffffff" />
      <circle cx="50" cy="25" r="1.5" fill="#ffffff" />
      <circle cx="35" cy="30" r="1" fill="#ffffff" />
      <circle cx="40" cy="15" r="0.8" fill="#ffffff" />
      <circle cx="50" cy="8" r="0.8" fill="#ffffff" />
      <circle cx="15" cy="30" r="1.5" fill="#ffffff" />
    </svg>
  );
}

// Vietnam flag (3:2, ratio 900x600)
export function FlagVN({ className }: FlagProps) {
  return (
    <svg
      viewBox="0 0 900 600"
      className={className}
      role="img"
      aria-label="Vietnam"
    >
      <rect width="900" height="600" fill="#da251d" />
      <polygon
        points="450,134 522,356 333,212 567,212 378,356"
        fill="#ffff00"
      />
    </svg>
  );
}

// Spain flag (3:2, ratio 900x600)
export function FlagES({ className }: FlagProps) {
  return (
    <svg
      viewBox="0 0 900 600"
      className={className}
      role="img"
      aria-label="Spain"
    >
      <rect width="900" height="150" fill="#aa151b" />
      <rect width="900" height="300" y="150" fill="#f1bf00" />
      <rect width="900" height="150" y="450" fill="#aa151b" />
    </svg>
  );
}

// Italy flag (3:2, ratio 900x600)
export function FlagIT({ className }: FlagProps) {
  return (
    <svg
      viewBox="0 0 900 600"
      className={className}
      role="img"
      aria-label="Italy"
    >
      <rect width="300" height="600" fill="#009246" />
      <rect width="300" height="600" x="300" fill="#ffffff" />
      <rect width="300" height="600" x="600" fill="#ce2b37" />
    </svg>
  );
}

// =====================================================================
// Flag component — maps currency/locale code to the right SVG
// =====================================================================

const FLAG_MAP: Record<string, React.FC<FlagProps>> = {
  cs: FlagCZ,
  en: FlagGB,
  pl: FlagPL,
  vi: FlagVN,
  hu: FlagHU,
  es: FlagES,
  it: FlagIT,
  CZK: FlagCZ,
  EUR: FlagEU,
  USD: FlagUS,
  GBP: FlagGB,
  HUF: FlagHU,
  PLN: FlagPL,
  AUD: FlagAU,
  VND: FlagVN,
};

export function Flag({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const FlagComponent = FLAG_MAP[code];
  if (!FlagComponent) {
    // Fallback: a globe icon if we don't have a flag for this code
    return <span className={className}>🌐</span>;
  }
  return <FlagComponent className={className} />;
}
