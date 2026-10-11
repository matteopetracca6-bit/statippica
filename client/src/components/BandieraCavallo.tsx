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
};

export function paeseCavallo(nome?: string | null, paese?: string | null): Paese | null {
  const m = (nome ?? "").match(/\(([A-Z]{1,3})\)\s*$/);
  if (m && DA_SIGLA[m[1]]) return DA_SIGLA[m[1]];
  const p = (paese ?? "").trim().toUpperCase();
  if (p && DA_PAESE[p]) return DA_PAESE[p];
  if (p === "EST") return { codice: "xx", nome: "Estero (paese non indicato)" };
  if (m) return { codice: "xx", nome: `Estero (sigla ${m[1]})` };
  // Senza sigla e senza paese: la fonte scrive la sigla solo per gli esteri.
  return { codice: "it", nome: "Italia" };
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

export default function BandieraCavallo({ nome, paese, solo_estero = false }:
  { nome?: string | null; paese?: string | null; solo_estero?: boolean }) {
  const p = paeseCavallo(nome, paese);
  if (!p) return null;
  if (solo_estero && p.codice === "it") return null;
  return (
    <svg
      viewBox="0 0 18 12" width="18" height="12" role="img" aria-label={p.nome}
      style={{ display: "inline-block", verticalAlign: "-1px", borderRadius: 2, boxShadow: "0 0 0 1px hsl(0 0% 100% / 0.15)", flexShrink: 0 }}
    >
      <title>{p.nome}</title>
      <Disegno codice={p.codice} />
    </svg>
  );
}
