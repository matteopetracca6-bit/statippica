/**
 * Bandiera del paese di nascita di un cavallo, disegnata in SVG.
 *
 * Le emoji bandiera non si vedono su Windows (compaiono due lettere), per
 * questo le disegniamo. Il paese si ricava prima dalla sigla che la fonte
 * aggiunge al nome dei cavalli esteri, poi dal campo paese dell'archivio.
 *
 * Sigle verificate sull'archivio (ottobre 2026):
 *   (S) Svezia · (D) Germania · (F) Francia · (DK) Danimarca
 *   (SL) Slovenia  - es. Nina From Brezina, corre a Ljutomer
 *   (SF) Finlandia · (NO) Norvegia
 *   (AU) Austria   - es. No Limit Ty, corre a Baden bei Wien
 *   (US) Stati Uniti · (NL) Paesi Bassi · (B) Belgio
 */

type Paese = { codice: string; nome: string };

const DA_SIGLA: Record<string, Paese> = {
  S: { codice: "se", nome: "Svezia" },
  D: { codice: "de", nome: "Germania" },
  F: { codice: "fr", nome: "Francia" },
  DK: { codice: "dk", nome: "Danimarca" },
  SL: { codice: "si", nome: "Slovenia" },
  SLO: { codice: "si", nome: "Slovenia" },
  SF: { codice: "fi", nome: "Finlandia" },
  FI: { codice: "fi", nome: "Finlandia" },
  NO: { codice: "no", nome: "Norvegia" },
  N: { codice: "no", nome: "Norvegia" },
  AU: { codice: "at", nome: "Austria" },
  A: { codice: "at", nome: "Austria" },
  US: { codice: "us", nome: "Stati Uniti" },
  USA: { codice: "us", nome: "Stati Uniti" },
  NL: { codice: "nl", nome: "Paesi Bassi" },
  B: { codice: "be", nome: "Belgio" },
  CH: { codice: "ch", nome: "Svizzera" },
  CA: { codice: "ca", nome: "Canada" },
};

const DA_PAESE: Record<string, Paese> = {
  ITA: { codice: "it", nome: "Italia" },
  USA: { codice: "us", nome: "Stati Uniti" },
  FRA: { codice: "fr", nome: "Francia" },
  SWE: { codice: "se", nome: "Svezia" },
  CAN: { codice: "ca", nome: "Canada" },
  GER: { codice: "de", nome: "Germania" },
  DEU: { codice: "de", nome: "Germania" },
  DEN: { codice: "dk", nome: "Danimarca" },
  DANIMARCA: { codice: "dk", nome: "Danimarca" },
  NED: { codice: "nl", nome: "Paesi Bassi" },
  "PAESI BASSI": { codice: "nl", nome: "Paesi Bassi" },
  NOR: { codice: "no", nome: "Norvegia" },
  FIN: { codice: "fi", nome: "Finlandia" },
  AUT: { codice: "at", nome: "Austria" },
  BEL: { codice: "be", nome: "Belgio" },
  SLO: { codice: "si", nome: "Slovenia" },
  SUI: { codice: "ch", nome: "Svizzera" },
  CHE: { codice: "ch", nome: "Svizzera" },
  SVN: { codice: "si", nome: "Slovenia" },
  DNK: { codice: "dk", nome: "Danimarca" },
  NLD: { codice: "nl", nome: "Paesi Bassi" },
  FINLANDIA: { codice: "fi", nome: "Finlandia" },
  BELGIO: { codice: "be", nome: "Belgio" },
  AUSTRIA: { codice: "at", nome: "Austria" },
  AUS: { codice: "au", nome: "Australia" },
  NZL: { codice: "nz", nome: "Nuova Zelanda" },
  GBR: { codice: "gb", nome: "Gran Bretagna" },
  IRE: { codice: "ie", nome: "Irlanda" },
  ESP: { codice: "es", nome: "Spagna" },
  POR: { codice: "pt", nome: "Portogallo" },
  RUS: { codice: "ru", nome: "Russia" },
  UKR: { codice: "ua", nome: "Ucraina" },
  HUN: { codice: "hu", nome: "Ungheria" },
  POL: { codice: "pl", nome: "Polonia" },
  CZE: { codice: "cz", nome: "Repubblica Ceca" },
  CRO: { codice: "hr", nome: "Croazia" },
  SER: { codice: "rs", nome: "Serbia" },
  ROM: { codice: "ro", nome: "Romania" },
  ITALIA: { codice: "it", nome: "Italia" },
  FRANCIA: { codice: "fr", nome: "Francia" },
  SVEZIA: { codice: "se", nome: "Svezia" },
  GERMANIA: { codice: "de", nome: "Germania" },
  NORVEGIA: { codice: "no", nome: "Norvegia" },
  // sigle di una lettera usate da alcune schede (I = Italia, F = Francia)
  I: { codice: "it", nome: "Italia" },
  F: { codice: "fr", nome: "Francia" },
};

/** Stalloni esteri molto usati in Italia, quando la scheda non ha il paese. */
const STALLONI_NOTI: Record<string, string> = {
  "FACE TIME BOURBON": "FRA", MAHARAJAH: "SWE", "NAD AL SHEBA": "SWE", "LOVE YOU": "FRA",
  "READY CASH": "FRA", "MUSCLE HILL": "USA", "MUSCLE MASS": "USA", TIMOKO: "FRA",
  "COKTAIL JET": "FRA", "CONWAY HALL": "USA", "WISHING STONE": "USA", "PINE CHIP": "USA",
  "DONATO HANOVER": "USA", "FATHER PATRICK": "USA", "SJ'S PHOTO": "USA", "TRIXTON": "USA",
  "CANTAB HALL": "USA", "ANDOVER HALL": "USA", "WALNER": "USA", "CHAPTER SEVEN": "USA",
  "EXPLOSIVE MATTER": "USA", "BOLD EAGLE": "FRA", "ORLANDO VICI": "FRA", "DJAG DE CHENU": "FRA",
  "GOOD FRIEND AS": "ITA",
  "KEN WARKETIN": "USA", "KEN WARKENTIN": "USA", "YANKEE GLIDE": "USA", "RUSSEL NOVEMBER": "GER",
};

/**
 * Paese di nascita. Ordine: sigla nel nome, campo paese, stalloni esteri noti.
 * Senza nessuna informazione: per chi corre in Italia la fonte scrive la sigla
 * solo agli esteri, quindi e' italiano (atleti); per un riproduttore non si sa
 * e non si mostra nulla (ignoto_se_vuoto).
 */
export function paeseCavallo(nome?: string | null, paese?: string | null, ignoto_se_vuoto = false): Paese | null {
  const m = (nome ?? "").match(/\(([A-Z]{1,3})\)\s*$/);
  if (m && DA_SIGLA[m[1]]) return DA_SIGLA[m[1]];
  const p = (paese ?? "").trim().toUpperCase();
  if (p && DA_PAESE[p]) return DA_PAESE[p];
  const noto = STALLONI_NOTI[(nome ?? "").trim().toUpperCase()];
  if (noto && DA_PAESE[noto]) return DA_PAESE[noto];
  if (p === "EST" || p === "E") return { codice: "xx", nome: "Estero (paese non indicato)" };
  if (m) return { codice: "xx", nome: `Estero (sigla ${m[1]})` };
  if (p) return { codice: "xx", nome: `Paese: ${p}` };
  if (ignoto_se_vuoto) return null;
  return { codice: "it", nome: "Italia" };
}

/** Vero se il cavallo e' nato in Italia (per le classifiche dei soli italiani). */
export function eItaliano(nome?: string | null, paese?: string | null): boolean {
  return paeseCavallo(nome, paese)?.codice === "it";
}

function Tre({ a, b, c, verticale }: { a: string; b: string; c: string; verticale?: boolean }) {
  return verticale ? (
    <>
      <rect width="6" height="12" x="0" fill={a} />
      <rect width="6" height="12" x="6" fill={b} />
      <rect width="6" height="12" x="12" fill={c} />
    </>
  ) : (
    <>
      <rect width="18" height="4" y="0" fill={a} />
      <rect width="18" height="4" y="4" fill={b} />
      <rect width="18" height="4" y="8" fill={c} />
    </>
  );
}

function Croce({ fondo, croce, interna }: { fondo: string; croce: string; interna?: string }) {
  return (
    <>
      <rect width="18" height="12" fill={fondo} />
      <rect x="5" y="0" width="3" height="12" fill={croce} />
      <rect x="0" y="4.5" width="18" height="3" fill={croce} />
      {interna && (
        <>
          <rect x="5.75" y="0" width="1.5" height="12" fill={interna} />
          <rect x="0" y="5.25" width="18" height="1.5" fill={interna} />
        </>
      )}
    </>
  );
}

function Disegno({ codice }: { codice: string }) {
  switch (codice) {
    case "it": return <Tre verticale a="#009246" b="#ffffff" c="#ce2b37" />;
    case "fr": return <Tre verticale a="#002654" b="#ffffff" c="#ce1126" />;
    case "be": return <Tre verticale a="#000000" b="#fdda24" c="#ef3340" />;
    case "de": return <Tre a="#000000" b="#dd0000" c="#ffce00" />;
    case "at": return <Tre a="#ed2939" b="#ffffff" c="#ed2939" />;
    case "nl": return <Tre a="#ae1c28" b="#ffffff" c="#21468b" />;
    case "si": return (
      <>
        <Tre a="#ffffff" b="#0057b8" c="#ed1c24" />
        <path d="M3.2 2.2h3.2v3.6c0 1.3-1.6 2-1.6 2s-1.6-.7-1.6-2z" fill="#0057b8" stroke="#ed1c24" strokeWidth="0.4" />
      </>
    );
    case "se": return <Croce fondo="#006aa7" croce="#fecc00" />;
    case "dk": return <Croce fondo="#c8102e" croce="#ffffff" />;
    case "fi": return <Croce fondo="#ffffff" croce="#002f6c" />;
    case "no": return <Croce fondo="#ba0c2f" croce="#ffffff" interna="#00205b" />;
    case "ch": return (
      <>
        <rect width="18" height="12" fill="#d52b1e" />
        <rect x="7.75" y="2.5" width="2.5" height="7" fill="#ffffff" />
        <rect x="5.5" y="4.75" width="7" height="2.5" fill="#ffffff" />
      </>
    );
    case "ie": return <Tre verticale a="#169b62" b="#ffffff" c="#ff883e" />;
    case "ro": return <Tre verticale a="#002b7f" b="#fcd116" c="#ce1126" />;
    case "hu": return <Tre a="#ce2939" b="#ffffff" c="#477050" />;
    case "ru": return <Tre a="#ffffff" b="#0039a6" c="#d52b1e" />;
    case "rs": return <Tre a="#c6363c" b="#0c4076" c="#ffffff" />;
    case "hr": return <Tre a="#ff0000" b="#ffffff" c="#171796" />;
    case "es": return (
      <>
        <rect width="18" height="12" fill="#aa151b" />
        <rect y="3" width="18" height="6" fill="#f1bf00" />
      </>
    );
    case "pt": return (
      <>
        <rect width="18" height="12" fill="#ff0000" />
        <rect width="7" height="12" fill="#006600" />
      </>
    );
    case "pl": return (
      <>
        <rect width="18" height="6" fill="#ffffff" />
        <rect y="6" width="18" height="6" fill="#dc143c" />
      </>
    );
    case "ua": return (
      <>
        <rect width="18" height="6" fill="#0057b7" />
        <rect y="6" width="18" height="6" fill="#ffd700" />
      </>
    );
    case "cz": return (
      <>
        <rect width="18" height="6" fill="#ffffff" />
        <rect y="6" width="18" height="6" fill="#d7141a" />
        <path d="M0 0L9 6L0 12z" fill="#11457e" />
      </>
    );
    case "gb": case "au": case "nz": return (
      <>
        <rect width="18" height="12" fill={codice === "gb" ? "#012169" : "#00008b"} />
        <g transform={codice === "gb" ? "" : "scale(0.5)"}>
          <path d="M0 0L18 12M18 0L0 12" stroke="#ffffff" strokeWidth="2.4" />
          <path d="M0 0L18 12M18 0L0 12" stroke="#c8102e" strokeWidth="0.9" />
          <rect x="7.5" width="3" height="12" fill="#ffffff" />
          <rect y="4.5" width="18" height="3" fill="#ffffff" />
          <rect x="8.1" width="1.8" height="12" fill="#c8102e" />
          <rect y="5.1" width="18" height="1.8" fill="#c8102e" />
        </g>
        {codice !== "gb" && [[13, 3], [11, 6.5], [15, 6], [13, 9.5]].map(([x, y], k) => (
          <circle key={k} cx={x} cy={y} r="0.8" fill={codice === "nz" ? "#c8102e" : "#ffffff"} />
        ))}
      </>
    );
    case "ca": return (
      <>
        <rect width="18" height="12" fill="#ffffff" />
        <rect width="4.5" height="12" fill="#d80621" />
        <rect x="13.5" width="4.5" height="12" fill="#d80621" />
        <path d="M9 3l.8 1.6 1.2-.4-.5 2 1-.3-.4 1.4-1.6.3.2 1.4h-1.4l.2-1.4-1.6-.3-.4-1.4 1 .3-.5-2 1.2.4z" fill="#d80621" />
      </>
    );
    case "us": return (
      <>
        <rect width="18" height="12" fill="#ffffff" />
        {[0, 1, 2, 3, 4, 5, 6].map(k => <rect key={k} y={k * 2 * (12 / 13)} width="18" height={12 / 13} fill="#b22234" />)}
        <rect width="8" height={12 * 7 / 13} fill="#3c3b6e" />
      </>
    );
    default: return (
      <>
        <rect width="18" height="12" fill="hsl(210 10% 35%)" />
        <text x="9" y="9" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ffffff" fontFamily="sans-serif">?</text>
      </>
    );
  }
}

export default function BandieraCavallo({ nome, paese, solo_estero = false, ignoto_se_vuoto = false, grande = false }:
  { nome?: string | null; paese?: string | null; solo_estero?: boolean; ignoto_se_vuoto?: boolean; grande?: boolean }) {
  const p = paeseCavallo(nome, paese, ignoto_se_vuoto);
  if (!p) return null;
  if (solo_estero && p.codice === "it") return null;
  return (
    <svg
      viewBox="0 0 18 12" width={grande ? 24 : 18} height={grande ? 16 : 12} role="img" aria-label={p.nome}
      style={{ display: "inline-block", verticalAlign: "-1px", borderRadius: 2, boxShadow: "0 0 0 1px hsl(0 0% 100% / 0.15)", flexShrink: 0 }}
    >
      <title>{p.nome}</title>
      <Disegno codice={p.codice} />
    </svg>
  );
}
