/** Trotting horse loader — detailed SVG horse with harness/sulky that trots in place. */
export default function TrottingHorseLoader({ label = "Caricamento...", size = 96 }: { label?: string; size?: number }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "14px",
      padding: "40px 20px",
    }}>
      <style>{`
        @keyframes trot-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes trot-leg-fl {
          0%, 100% { transform: rotate(25deg); }
          50% { transform: rotate(-20deg); }
        }
        @keyframes trot-leg-fr {
          0%, 100% { transform: rotate(-20deg); }
          50% { transform: rotate(25deg); }
        }
        @keyframes trot-leg-bl {
          0%, 100% { transform: rotate(-20deg); }
          50% { transform: rotate(25deg); }
        }
        @keyframes trot-leg-br {
          0%, 100% { transform: rotate(25deg); }
          50% { transform: rotate(-20deg); }
        }
        @keyframes trot-tail {
          0%, 100% { transform: rotate(-8deg); }
          50% { transform: rotate(12deg); }
        }
        @keyframes trot-mane {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-1px) rotate(-3deg); }
        }
        @keyframes trot-ear {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-5deg); }
        }
        @keyframes trot-dust {
          0% { opacity: 0.5; transform: translateX(0) scale(0.5); }
          100% { opacity: 0; transform: translateX(-35px) scale(1.4); }
        }
        @keyframes trot-track {
          0% { background-position: 0 0; }
          100% { background-position: -40px 0; }
        }
        .trot-horse-body { animation: trot-bounce 0.4s ease-in-out infinite; }
        .trot-leg-fl { animation: trot-leg-fl 0.4s ease-in-out infinite; transform-origin: 22px 30px; }
        .trot-leg-fr { animation: trot-leg-fr 0.4s ease-in-out infinite; transform-origin: 28px 30px; }
        .trot-leg-bl { animation: trot-leg-bl 0.4s ease-in-out infinite; transform-origin: 42px 30px; }
        .trot-leg-br { animation: trot-leg-br 0.4s ease-in-out infinite; transform-origin: 48px 30px; }
        .trot-tail { animation: trot-tail 0.4s ease-in-out infinite; transform-origin: 8px 22px; }
        .trot-mane { animation: trot-mane 0.4s ease-in-out infinite; transform-origin: 52px 18px; }
        .trot-ear { animation: trot-ear 0.4s ease-in-out infinite; transform-origin: 58px 8px; }
        .trot-dust { animation: trot-dust 0.6s ease-out infinite; }
        .trot-track {
          animation: trot-track 0.3s linear infinite;
          background-image: repeating-linear-gradient(
            90deg,
            transparent 0, transparent 8px,
            hsl(35 25% 40% / 0.2) 8px, hsl(35 25% 40% / 0.2) 12px
          );
        }
      `}</style>
      <svg width={size} height={size * 0.7} viewBox="0 0 80 56" fill="none" style={{ overflow: "visible" }}>
        <defs>
          {/* Body gradient */}
          <linearGradient id="horse-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(28 50% 48%)" />
            <stop offset="100%" stopColor="hsl(28 55% 35%)" />
          </linearGradient>
          <linearGradient id="horse-belly" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(28 45% 40%)" />
            <stop offset="100%" stopColor="hsl(28 40% 30%)" />
          </linearGradient>
          <linearGradient id="horse-head" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(28 50% 46%)" />
            <stop offset="100%" stopColor="hsl(28 55% 34%)" />
          </linearGradient>
          <linearGradient id="sulky-wheel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(0 0% 35%)" />
            <stop offset="100%" stopColor="hsl(0 0% 20%)" />
          </linearGradient>
        </defs>

        {/* Ground track line */}
        <rect x="0" y="50" width="80" height="3" className="trot-track" rx="1" />

        {/* Dust particles */}
        <circle className="trot-dust" cx="10" cy="48" r="3" fill="hsl(35 30% 50% / 0.3)" />
        <circle className="trot-dust" cx="10" cy="48" r="2" fill="hsl(35 30% 50% / 0.2)" style={{ animationDelay: "0.15s" }} />
        <circle className="trot-dust" cx="10" cy="48" r="2.5" fill="hsl(35 30% 50% / 0.25)" style={{ animationDelay: "0.3s" }} />
        <circle className="trot-dust" cx="10" cy="46" r="1.5" fill="hsl(35 30% 50% / 0.15)" style={{ animationDelay: "0.45s" }} />

        {/* Sulky (cart behind horse) */}
        <g opacity="0.85">
          {/* Sulky seat/poles */}
          <path d="M8 36 L22 30 L26 30 L14 38 Z" fill="hsl(0 0% 25%)" />
          {/* Sulky wheels */}
          <circle cx="6" cy="46" r="5" fill="none" stroke="url(#sulky-wheel)" strokeWidth="2" />
          <circle cx="6" cy="46" r="1.5" fill="hsl(0 0% 20%)" />
          <line x1="6" y1="41" x2="6" y2="51" stroke="hsl(0 0% 30%)" strokeWidth="0.5" />
          <line x1="1" y1="46" x2="11" y2="46" stroke="hsl(0 0% 30%)" strokeWidth="0.5" />
          <line x1="3" y1="42" x2="9" y2="50" stroke="hsl(0 0% 30%)" strokeWidth="0.5" />
          <line x1="9" y1="42" x2="3" y2="50" stroke="hsl(0 0% 30%)" strokeWidth="0.5" />
        </g>

        <g className="trot-horse-body">
          {/* Tail — flowing strands */}
          <g className="trot-tail">
            <path d="M10 20 Q3 16 5 26 Q7 31 12 28" fill="none" stroke="hsl(28 55% 38%)" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M10 22 Q1 20 3 30 Q5 34 11 31" fill="none" stroke="hsl(28 50% 42%)" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M11 18 Q5 14 7 22" fill="none" stroke="hsl(28 55% 35%)" strokeWidth="1" strokeLinecap="round" />
          </g>

          {/* Body — chest + barrel */}
          <path d="M12 20 Q14 14 24 12 Q34 10 44 14 Q52 16 54 22 Q54 30 48 34 Q38 36 28 35 Q18 34 12 30 Q10 25 12 20 Z" fill="url(#horse-body)" />
          {/* Belly highlight */}
          <path d="M16 28 Q24 34 38 33 Q46 31 48 28 Q40 31 30 31 Q22 31 16 28 Z" fill="url(#horse-belly)" opacity="0.6" />
          {/* Chest muscle definition */}
          <path d="M14 22 Q16 26 20 28" fill="none" stroke="hsl(28 50% 32%)" strokeWidth="0.5" opacity="0.5" />
          <path d="M18 20 Q20 24 22 27" fill="none" stroke="hsl(28 50% 32%)" strokeWidth="0.5" opacity="0.5" />

          {/* Neck */}
          <path d="M44 14 Q48 10 54 8 Q58 10 58 16 Q56 20 52 22 Q48 20 44 18 Z" fill="url(#horse-body)" />
          {/* Neck muscle lines */}
          <path d="M46 13 Q50 14 54 12" fill="none" stroke="hsl(28 50% 32%)" strokeWidth="0.5" opacity="0.4" />
          <path d="M47 16 Q51 17 55 15" fill="none" stroke="hsl(28 50% 32%)" strokeWidth="0.5" opacity="0.4" />

          {/* Head — more anatomically shaped */}
          <path d="M54 8 Q60 6 66 10 Q68 14 66 18 Q64 22 60 22 Q56 20 54 16 Z" fill="url(#horse-head)" />
          {/* Cheek definition */}
          <path d="M58 14 Q62 16 64 19" fill="none" stroke="hsl(28 50% 30%)" strokeWidth="0.5" opacity="0.4" />
          {/* Forehead bulge */}
          <path d="M56 9 Q58 7 62 8" fill="none" stroke="hsl(28 50% 30%)" strokeWidth="0.5" opacity="0.3" />

          {/* Ear — animated */}
          <g className="trot-ear">
            <path d="M60 7 L61 3 L64 6 Z" fill="hsl(28 50% 38%)" />
            <path d="M61 6 L62 4 L63 6 Z" fill="hsl(28 45% 30%)" />
          </g>

          {/* Mane — multiple animated strands */}
          <g className="trot-mane">
            <path d="M48 11 Q45 8 49 5 Q51 9 50 13" fill="none" stroke="hsl(28 55% 35%)" strokeWidth="2" strokeLinecap="round" />
            <path d="M52 9 Q50 5 54 3 Q55 7 54 12" fill="none" stroke="hsl(28 50% 38%)" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M46 14 Q43 12 45 8 Q47 12 48 16" fill="none" stroke="hsl(28 55% 32%)" strokeWidth="1" strokeLinecap="round" />
            <path d="M44 18 Q41 16 42 12 Q44 16 46 20" fill="none" stroke="hsl(28 50% 35%)" strokeWidth="1" strokeLinecap="round" />
            <path d="M42 22 Q39 20 40 16 Q42 20 44 24" fill="none" stroke="hsl(28 55% 33%)" strokeWidth="0.8" strokeLinecap="round" />
          </g>

          {/* Eye with highlight */}
          <ellipse cx="62" cy="13" rx="1.3" ry="1.5" fill="hsl(0 0% 12%)" />
          <circle cx="62.3" cy="12.5" r="0.4" fill="hsl(0 0% 85%)" />
          {/* Eyebrow ridge */}
          <path d="M60 10 Q63 9 65 11" fill="none" stroke="hsl(28 50% 28%)" strokeWidth="0.4" opacity="0.5" />

          {/* Nostril */}
          <ellipse cx="65" cy="16" rx="0.7" ry="1" fill="hsl(0 0% 15%)" opacity="0.6" />
          {/* Mouth line */}
          <path d="M63 19 Q65 20 67 19" fill="none" stroke="hsl(28 50% 25%)" strokeWidth="0.4" />

          {/* Bridle — straps */}
          <path d="M56 12 Q60 13 64 14" fill="none" stroke="hsl(0 0% 20%)" strokeWidth="0.6" />
          <path d="M58 8 Q60 10 62 12" fill="none" stroke="hsl(0 0% 20%)" strokeWidth="0.6" />
          {/* Reins connecting to sulky */}
          <path d="M66 18 Q60 24 50 28 Q30 34 14 36" fill="none" stroke="hsl(0 0% 25%)" strokeWidth="0.5" opacity="0.4" strokeDasharray="1 1" />

          {/* Saddle with number cloth */}
          <ellipse cx="32" cy="16" rx="7" ry="3" fill="hsl(20 45% 28%)" />
          <ellipse cx="32" cy="15" rx="5" ry="2" fill="hsl(20 40% 32%)" />
          {/* Number cloth */}
          <rect x="29" y="14" width="6" height="4" rx="0.5" fill="hsl(0 70% 50%)" />
          <text x="32" y="17.2" textAnchor="middle" fontSize="3" fill="hsl(0 0% 100%)" fontWeight="bold" fontFamily="monospace">1</text>

          {/* Legs — with joints (upper + lower + hoof) */}
          {/* Front-left (far side, lighter) */}
          <g className="trot-leg-fl">
            <path d="M22 30 L24 38 L22 46" fill="none" stroke="hsl(28 45% 40%)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="24" cy="38" r="1.2" fill="hsl(28 45% 36%)" />
            <ellipse cx="21" cy="47" rx="1.5" ry="1" fill="hsl(0 0% 12%)" />
          </g>
          {/* Front-right (near side, darker) */}
          <g className="trot-leg-fr">
            <path d="M28 30 L30 38 L28 46" fill="none" stroke="hsl(28 50% 38%)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="30" cy="38" r="1.2" fill="hsl(28 50% 34%)" />
            <ellipse cx="27" cy="47" rx="1.5" ry="1" fill="hsl(0 0% 10%)" />
          </g>
          {/* Back-left (far side, lighter) */}
          <g className="trot-leg-bl">
            <path d="M42 30 L40 38 L42 46" fill="none" stroke="hsl(28 45% 40%)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="40" cy="38" r="1.2" fill="hsl(28 45% 36%)" />
            <ellipse cx="41" cy="47" rx="1.5" ry="1" fill="hsl(0 0% 12%)" />
          </g>
          {/* Back-right (near side, darker) */}
          <g className="trot-leg-br">
            <path d="M48 30 L46 38 L48 46" fill="none" stroke="hsl(28 50% 38%)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="46" cy="38" r="1.2" fill="hsl(28 50% 34%)" />
            <ellipse cx="47" cy="47" rx="1.5" ry="1" fill="hsl(0 0% 10%)" />
          </g>

          {/* Muscle shading on barrel */}
          <path d="M24 20 Q28 18 34 19 Q40 20 44 22" fill="none" stroke="hsl(28 50% 30%)" strokeWidth="0.5" opacity="0.3" />
          <path d="M22 24 Q26 22 32 23 Q38 24 42 25" fill="none" stroke="hsl(28 50% 30%)" strokeWidth="0.5" opacity="0.3" />

          {/* Harness strap across chest */}
          <path d="M18 20 Q24 18 30 18 Q36 18 42 20" fill="none" stroke="hsl(0 0% 22%)" strokeWidth="0.5" strokeDasharray="2 1" opacity="0.5" />
        </g>
      </svg>
      <div style={{ fontSize: "13px", color: "hsl(210 8% 45%)", letterSpacing: "0.03em" }}>
        {label}
      </div>
    </div>
  );
}
