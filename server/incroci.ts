/**
 * Come sono andati gli incroci simili (21/11/2026), per la classifica
 * "lo stallone giusto per la mia fattrice" dell'Advisor.
 *
 * Tre confronti, tutti contati sui cavalli dell'archivio:
 *  - stesso incrocio: figli dello stallone nati da figlie del padre della
 *    fattrice (il "nick" degli allevatori);
 *  - stessa linea: figli dei figli del padre dello stallone, sempre da figlie
 *    del padre della fattrice;
 *  - gia' provato: figli dello stallone nati proprio da questa fattrice.
 * "Buono" e' un figlio con voto A o meglio fra quelli che hanno un voto di
 * carriera: il quarto migliore, come nella previsione dei puledri.
 * Sono conti, non una previsione: con pochi figli dicono poco, e la pagina
 * lo scrive accanto al numero.
 */
import type { Database as DB } from "better-sqlite3";

export interface Conto { n: number; corrono: number; votati: number; buoni: number; media: number | null; migliore: { nome: string; voto: string; anno: number | null } | null }

const BUONI = new Set(["A", "S", "SS", "SSS"]);
const vuoto = (): Conto & { somma: number; top: number } => ({ n: 0, corrono: 0, votati: 0, buoni: 0, media: null, migliore: null, somma: 0, top: -1 });

function aggiungi(m: Map<string, ReturnType<typeof vuoto>>, k: string | null, r: any) {
  if (!k) return;
  const c = m.get(k) ?? vuoto();
  c.n += 1;
  if (r.corse > 0) c.corrono += 1;
  if (r.score != null) {
    c.votati += 1; c.somma += r.score;
    if (BUONI.has(r.grade)) c.buoni += 1;
    if (r.score > c.top) { c.top = r.score; c.migliore = { nome: r.name, voto: r.grade, anno: r.birth_year ?? null }; }
  }
  m.set(k, c);
}

function chiudi(c: ReturnType<typeof vuoto> | undefined): Conto | null {
  if (!c) return null;
  return { n: c.n, corrono: c.corrono, votati: c.votati, buoni: c.buoni,
           media: c.votati ? Math.round(c.somma / c.votati * 10) / 10 : null, migliore: c.migliore };
}

export interface Incroci {
  padre_fattrice: string | null;
  base: Conto | null;                         // tutti i nipoti del padre della fattrice
  stretto: (stallone: string) => Conto | null;
  linea: (padreStallone: string | null) => Conto | null;
  fratelli: (stallone: string) => Conto | null;
}

const pulisci = (s: any) => (s == null ? "" : String(s).toUpperCase().trim());

export function incrociPerFattrice(db: DB, fattrice: string, padreFattrice: string | null): Incroci {
  const pf = pulisci(padreFattrice);
  const perStallone = new Map<string, ReturnType<typeof vuoto>>();
  const perLinea = new Map<string, ReturnType<typeof vuoto>>();
  const base = vuoto();
  if (pf) {
    const righe = db.prepare(`
      SELECT h.name, h.birth_year, h.sire, s.sire AS nonno, COALESCE(h.career_races, 0) AS corse, r.score, r.grade
        FROM horses d
        JOIN horses h ON h.dam = d.name
        LEFT JOIN horses s ON s.rowid = (SELECT rowid FROM horses WHERE name = h.sire LIMIT 1)
        LEFT JOIN horse_ratings r ON r.name = h.name AND r.birth_year = h.birth_year AND r.rating_mode = 'performance'
       WHERE d.sire = ?`).all(pf) as any[];
    const tmp = new Map<string, ReturnType<typeof vuoto>>();
    for (const r of righe) {
      aggiungi(perStallone, pulisci(r.sire), r);
      aggiungi(perLinea, pulisci(r.nonno), r);
      aggiungi(tmp, "x", r);
    }
    Object.assign(base, tmp.get("x") ?? vuoto());
  }
  const perFratelli = new Map<string, ReturnType<typeof vuoto>>();
  for (const r of db.prepare(`
      SELECT h.name, h.birth_year, h.sire, COALESCE(h.career_races, 0) AS corse, r.score, r.grade
        FROM horses h
        LEFT JOIN horse_ratings r ON r.name = h.name AND r.birth_year = h.birth_year AND r.rating_mode = 'performance'
       WHERE h.dam = ?`).all(pulisci(fattrice)) as any[]) aggiungi(perFratelli, pulisci(r.sire), r);

  return {
    padre_fattrice: pf || null,
    base: pf ? chiudi(base) : null,
    stretto: s => chiudi(perStallone.get(pulisci(s))),
    linea: p => (p ? chiudi(perLinea.get(pulisci(p))) : null),
    fratelli: s => chiudi(perFratelli.get(pulisci(s))),
  };
}
