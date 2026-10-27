/**
 * COPPA GARA: una coppa stilizzata diversa per ognuno dei quindici Gran Premi.
 * Stesso stile delle icone del sito (tratto sottile, angoli arrotondati), con
 * la parte della coppa appena riempita d'oro. Ogni corsa combina una forma di
 * coppa, dei manici, uno stelo, una base e un piccolo simbolo diversi.
 */

type Spec = {
  coppa: keyof typeof COPPE;
  manici?: keyof typeof MANICI;
  stelo: "dritto" | "nodo" | "affusolato";
  base: keyof typeof BASI;
  cima?: keyof typeof CIME;
  simbolo?: keyof typeof SIMBOLI;
};

// Forma della coppa e quota (y) del suo fondo, dove parte lo stelo.
const COPPE = {
  tonda: { d: "M9 5h14v6a7 7 0 0 1-14 0z", fondo: 18 },
  cono: { d: "M8.5 5h15L16 17.5z", fondo: 17.5 },
  tulipano: { d: "M9.5 5c0 8 2 12 6.5 13c4.5-1 6.5-5 6.5-13z", fondo: 18 },
  anfora: { d: "M10 5h12M11 5c-3 4-3 11 5 13c8-2 8-9 5-13", fondo: 18 },
  calice: { d: "M8 7h16a8 8 0 0 1-16 0z", fondo: 15 },
  cilindro: { d: "M10.5 5h11v10q0 4-5.5 4t-5.5-4z", fondo: 19 },
  svasata: { d: "M7.5 5l2.5 9q2 5 6 5t6-5l2.5-9z", fondo: 19 },
} as const;

const MANICI = {
  orecchie: ["M9.2 7H7a2.5 2.5 0 0 0 0 5h2.4", "M22.8 7H25a2.5 2.5 0 0 1 0 5h-2.4"],
  anse: ["M9.5 6.5C4 6.5 4 15 10.6 15", "M22.5 6.5C28 6.5 28 15 21.4 15"],
  squadrati: ["M9.3 6.5H5.5v4l4.3 3", "M22.7 6.5h3.8v4l-4.3 3"],
  alti: ["M9.6 10.5c-4 0-5.2-6-1.6-7.5", "M22.4 10.5c4 0 5.2-6 1.6-7.5"],
  ali: ["M9 9.5C6 9.5 4 7.5 3 4.5c2 1 4.5 1.2 6.4 2", "M23 9.5c3 0 5-2 6-5c-2 1-4.5 1.2-6.4 2"],
} as const;

const BASI = {
  piatta: ["M11 25h10v2.6H11z", "M9 28.6h14"],
  gradini: ["M13 25h6v1.8h-6z", "M10 26.8h12v2.2H10z"],
  cupola: ["M10.5 28.6q5.5-6 11 0z", "M9 28.6h14"],
  trapezio: ["M10.5 28.6l2.5-3.6h6l2.5 3.6z"],
} as const;

const CIME = {
  coperchio: ["M10 4.6q6-3.6 12 0", "M16 1.2v1.8"],
  stella: ["M16 .6l.9 1.9 2 .2-1.5 1.3.5 2-1.9-1-1.9 1 .5-2-1.5-1.3 2-.2z"],
  corona: ["M11.5 4.4l.8-3 2 1.8L16 .6l1.7 2.6 2-1.8.8 3z"],
} as const;

const SIMBOLI = {
  ferro: ["M13.8 8.2v2.6a2.2 2.2 0 0 0 4.4 0V8.2"],
  globo: ["M16 7.3a3 3 0 1 0 0 6a3 3 0 1 0 0-6", "M13 10.3h6", "M16 7.3c-1.5 1.8-1.5 4.2 0 6", "M16 7.3c1.5 1.8 1.5 4.2 0 6"],
  onda: ["M11.5 10q1.1-1.4 2.25 0t2.25 0 2.25 0 2.25 0"],
  fascia: ["M9.6 9h12.8"],
  stelle: ["M16 7.2v.01", "M18.6 8.6v.01", "M18.6 11.4v.01", "M16 12.8v.01", "M13.4 11.4v.01", "M13.4 8.6v.01"],
  alloro: ["M13 13.5c-1.6-1.2-2.1-3.3-1.4-5.4", "M19 13.5c1.6-1.2 2.1-3.3 1.4-5.4", "M12 10.6l-1.2-.4", "M20 10.6l1.2-.4"],
  fiore: ["M16 8.2a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 1 0 0-2.4", "M16 6.9v.01", "M16 11.9v.01", "M13.6 9.4v.01", "M18.4 9.4v.01"],
  uno: ["M14.9 8.2l1.4-1v6"],
} as const;

export const COPPE_GARA: Record<string, Spec> = {
  derby:        { coppa: "tonda",    manici: "anse",      stelo: "nodo",       base: "gradini",  cima: "coperchio", simbolo: "ferro" },
  lotteria:     { coppa: "calice",   manici: "orecchie",  stelo: "dritto",     base: "piatta",   cima: "stella" },
  mangelli:     { coppa: "tulipano",                      stelo: "affusolato", base: "cupola",   simbolo: "fascia" },
  nazioni:      { coppa: "tonda",    manici: "squadrati", stelo: "dritto",     base: "trapezio", simbolo: "globo" },
  costa:        { coppa: "cilindro", manici: "orecchie",  stelo: "dritto",     base: "piatta",   simbolo: "onda" },
  continentale: { coppa: "svasata",  manici: "alti",      stelo: "nodo",       base: "gradini" },
  triossi:      { coppa: "anfora",   manici: "anse",      stelo: "affusolato", base: "trapezio", cima: "coperchio" },
  ue:           { coppa: "tonda",    manici: "orecchie",  stelo: "affusolato", base: "gradini",  simbolo: "stelle" },
  oaks:         { coppa: "cono",                          stelo: "nodo",       base: "cupola",   cima: "corona",    simbolo: "fiore" },
  turilli:      { coppa: "calice",   manici: "squadrati", stelo: "nodo",       base: "cupola" },
  giovanardi:   { coppa: "cilindro", manici: "alti",      stelo: "affusolato", base: "trapezio", cima: "stella" },
  marangoni:    { coppa: "anfora",   manici: "orecchie",  stelo: "dritto",     base: "piatta",   simbolo: "alloro" },
  italia:       { coppa: "tonda",    manici: "anse",      stelo: "affusolato", base: "gradini",  cima: "corona",    simbolo: "uno" },
  montecatini:  { coppa: "svasata",  manici: "orecchie",  stelo: "dritto",     base: "cupola",   simbolo: "fascia" },
  allevatori:   { coppa: "calice",   manici: "ali",       stelo: "nodo",       base: "gradini",  cima: "coperchio", simbolo: "ferro" },
};

export function CoppaGara({ gara, size = 24, color = "hsl(45 90% 58%)", title }: {
  gara: string; size?: number; color?: string; title?: string;
}) {
  const s = COPPE_GARA[gara] ?? COPPE_GARA.derby;
  const coppa = COPPE[s.coppa];
  const steli: string[] =
    s.stelo === "dritto" ? [`M16 ${coppa.fondo}V25`]
    : s.stelo === "nodo" ? [`M16 ${coppa.fondo}V21`, "M16 23.4V25", "M16 21a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 1 0 0-2.4"]
    : [`M14.8 ${coppa.fondo}L15.3 25`, `M17.2 ${coppa.fondo}L16.7 25`];
  const tratti = [
    ...(s.manici ? MANICI[s.manici] : []),
    ...steli,
    ...BASI[s.base],
    ...(s.cima ? CIME[s.cima] : []),
    ...(s.simbolo ? SIMBOLI[s.simbolo] : []),
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 32 30" fill="none" stroke={color} strokeWidth={1.5}
         strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={title ?? "Coppa"}
         style={{ flexShrink: 0, color }}>
      {title && <title>{title}</title>}
      <path d={coppa.d} fill={color} fillOpacity={0.16} />
      {tratti.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
