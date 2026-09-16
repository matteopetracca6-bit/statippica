/** Trotting horse loader — small CSS/SVG horse that trots in place. */
export default function TrottingHorseLoader({ label = "Caricamento..." }: { label?: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "12px",
      padding: "40px 20px",
    }}>
      <style>{`
        @keyframes trot-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes trot-leg-front {
          0%, 100% { transform: rotate(20deg); }
          50% { transform: rotate(-15deg); }
        }
        @keyframes trot-leg-back {
          0%, 100% { transform: rotate(-15deg); }
          50% { transform: rotate(20deg); }
        }
        @keyframes trot-tail {
          0%, 100% { transform: rotate(-5deg); }
          50% { transform: rotate(10deg); }
        }
        @keyframes trot-dust {
          0% { opacity: 0.4; transform: translateX(0) scale(0.6); }
          100% { opacity: 0; transform: translateX(-30px) scale(1.2); }
        }
        .trot-horse-body {
          animation: trot-bounce 0.35s ease-in-out infinite;
        }
        .trot-leg-fl { animation: trot-leg-front 0.35s ease-in-out infinite; transform-origin: top center; }
        .trot-leg-fr { animation: trot-leg-back 0.35s ease-in-out infinite; transform-origin: top center; }
        .trot-leg-bl { animation: trot-leg-back 0.35s ease-in-out infinite; transform-origin: top center; }
        .trot-leg-br { animation: trot-leg-front 0.35s ease-in-out infinite; transform-origin: top center; }
        .trot-tail { animation: trot-tail 0.35s ease-in-out infinite; transform-origin: left center; }
        .trot-dust { animation: trot-dust 0.5s ease-out infinite; }
      `}</style>
      <svg width="64" height="48" viewBox="0 0 64 48" fill="none" style={{ overflow: "visible" }}>
        {/* Dust */}
        <circle className="trot-dust" cx="8" cy="40" r="3" fill="hsl(35 30% 50% / 0.3)" />
        <circle className="trot-dust" cx="8" cy="40" r="2" fill="hsl(35 30% 50% / 0.2)" style={{ animationDelay: "0.15s" }} />
        <circle className="trot-dust" cx="8" cy="40" r="2.5" fill="hsl(35 30% 50% / 0.25)" style={{ animationDelay: "0.3s" }} />

        <g className="trot-horse-body">
          {/* Tail */}
          <path className="trot-tail" d="M8 22 Q2 18 4 28 Q6 32 10 28" fill="none" stroke="hsl(30 60% 45%)" strokeWidth="3" strokeLinecap="round" />

          {/* Body */}
          <ellipse cx="30" cy="24" rx="18" ry="10" fill="hsl(30 55% 42%)" stroke="hsl(30 60% 35%)" strokeWidth="1" />

          {/* Head */}
          <ellipse cx="50" cy="16" rx="8" ry="6" fill="hsl(30 55% 42%)" stroke="hsl(30 60% 35%)" strokeWidth="1" />
          {/* Ear */}
          <path d="M54 10 L55 6 L58 9 Z" fill="hsl(30 55% 38%)" />
          {/* Mane */}
          <path d="M44 12 Q42 8 46 6 Q48 10 46 14" fill="none" stroke="hsl(30 60% 35%)" strokeWidth="2.5" strokeLinecap="round" />

          {/* Eye */}
          <circle cx="52" cy="15" r="1.2" fill="hsl(0 0% 15%)" />

          {/* Legs — front */}
          <g className="trot-leg-fl">
            <line x1="44" y1="32" x2="44" y2="44" stroke="hsl(30 55% 38%)" strokeWidth="3" strokeLinecap="round" />
            <line x1="44" y1="44" x2="42" y2="46" stroke="hsl(30 55% 30%)" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g className="trot-leg-fr">
            <line x1="48" y1="32" x2="48" y2="44" stroke="hsl(30 55% 38%)" strokeWidth="3" strokeLinecap="round" />
            <line x1="48" y1="44" x2="50" y2="46" stroke="hsl(30 55% 30%)" strokeWidth="2" strokeLinecap="round" />
          </g>
          {/* Legs — back */}
          <g className="trot-leg-bl">
            <line x1="16" y1="32" x2="16" y2="44" stroke="hsl(30 55% 38%)" strokeWidth="3" strokeLinecap="round" />
            <line x1="16" y1="44" x2="14" y2="46" stroke="hsl(30 55% 30%)" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g className="trot-leg-br">
            <line x1="20" y1="32" x2="20" y2="44" stroke="hsl(30 55% 38%)" strokeWidth="3" strokeLinecap="round" />
            <line x1="20" y1="44" x2="22" y2="46" stroke="hsl(30 55% 30%)" strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* Saddle */}
          <ellipse cx="32" cy="18" rx="6" ry="3" fill="hsl(20 40% 30%)" />
        </g>
      </svg>
      <div style={{ fontSize: "13px", color: "hsl(210 8% 45%)", letterSpacing: "0.03em" }}>
        {label}
      </div>
    </div>
  );
}
