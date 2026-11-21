/**
 * Potenziale dinamico (novembre 2026, potenziale.py).
 *
 * Il calcolo avviene di notte in Python e finisce nella tabella
 * potenziale_storico (il registro: una riga per stima, mai cambiata). Qui si
 * leggono il registro di un cavallo, il suo traguardo vero se e' gia' maturo,
 * e l'esito della verifica per stadio (modelli/potenziale_verifica.json), che
 * dice accanto a ogni numero quanto ci si puo' fidare a quello stadio.
 */
import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";

let CACHE: { mtime: number; dati: any } | null = null;

export function verificaPotenziale(root = process.cwd()): any | null {
  const file = path.join(root, "modelli", "potenziale_verifica.json");
  try {
    const mtime = fs.statSync(file).mtimeMs;
    if (!CACHE || CACHE.mtime !== mtime) CACHE = { mtime, dati: JSON.parse(fs.readFileSync(file, "utf8")) };
    return CACHE.dati;
  } catch {
    return null;
  }
}

/** Etichetta di uno stadio: "affidabile" o "in verifica", con il motivo. */
export function etichettaStadio(stadio: string | null | undefined): { esito: string; motivo: string | null } | null {
  const v = verificaPotenziale();
  const s = stadio && v?.stadi?.[stadio];
  return s ? { esito: s.esito, motivo: s.motivo ?? null } : null;
}

function tabella(db: Database.Database, nome: string): boolean {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(nome);
}

export function potenzialeCavallo(db: Database.Database, nome: string, natoIl: number | null) {
  if (!tabella(db, "potenziale_storico")) return null;
  const versione = (db.prepare(`SELECT versione FROM potenziale_storico WHERE horse_name = ?
                                ORDER BY data DESC LIMIT 1`).get(nome) as any)?.versione;
  if (!versione) return null;
  const storia = db.prepare(`
    SELECT data, eta_mesi, stadio, n_corse, potenziale, basso, alto, origine
    FROM potenziale_storico WHERE horse_name = ? AND versione = ? ORDER BY data`).all(nome, versione) as any[];
  if (!storia.length) return null;
  const traguardo = tabella(db, "potenziale_traguardo")
    ? ((db.prepare(`SELECT posizione FROM potenziale_traguardo WHERE horse_name = ?`).get(nome) as any)?.posizione ?? null)
    : null;
  const ultima = storia[storia.length - 1];
  const v = verificaPotenziale();
  return {
    versione,
    anno_traguardo: natoIl != null ? natoIl + 4 : null,
    traguardo,
    ultima: { ...ultima, etichetta: etichettaStadio(ultima.stadio) },
    storia,
    stadi: v?.stadi ? Object.fromEntries(Object.entries(v.stadi).map(([k, s]: [string, any]) => [k, s.esito])) : null,
  };
}

// ── Potenziale alla nascita di un puledro che non c'e' ancora (Advisor) ─────
// Lo stesso modello della notte (modelli/potenziale_modello.json), percorso qui
// albero per albero, con le sole informazioni dello stadio nascita: come vanno
// i figli maturi del padre, quelli della madre e i nipoti del padre della
// madre, eta' e carriera della madre. Il sesso non si sa: media fra i due.

let MODELLO: { mtime: number; m: any } | null = null;
function modello(root = process.cwd()): any | null {
  const file = path.join(root, "modelli", "potenziale_modello.json");
  try {
    const mtime = fs.statSync(file).mtimeMs;
    // Il modello lo scrive Python, che mette Infinity nelle soglie degli
    // alberi: per JSON.parse non e' un numero, e dal 17/11/2026 la lettura
    // falliva in silenzio (niente potenziale alla nascita nell'Advisor).
    // 1e308 fa lo stesso lavoro: ogni valore vero ci sta sotto.
    if (!MODELLO || MODELLO.mtime !== mtime) MODELLO = { mtime, m: JSON.parse(
      fs.readFileSync(file, "utf8").replace(/-Infinity\b/g, "-1e308").replace(/\bInfinity\b/g, "1e308").replace(/\bNaN\b/g, "null")) };
    return MODELLO.m;
  } catch {
    return null;
  }
}

function percorri(q: any, x: number[]): number {
  let out = q.base;
  for (const a of q.alberi) {
    let n = 0;
    while (!a.x[n]) {
      const v = x[a.f[n]];
      const sx = Number.isNaN(v) ? a.m[n] === 1 : v <= a.t[n];
      n = sx ? a.l[n] : a.r[n];
    }
    out += a.v[n];
  }
  return out;
}

const K = { padre: 15, madre: 2, pm: 15 };
const media = (r: any, k: number) => ({ m: ((r?.s ?? 0) + k * 50) / ((r?.n ?? 0) + k), n: r?.n ?? 0 });

/** Dati della madre che non dipendono dallo stallone: si calcolano una volta. */
export function contestoMadre(db: Database.Database, madre: string) {
  if (!tabella(db, "potenziale_traguardo") || !modello()) return null;
  const d = db.prepare(`SELECT birth_year, sire, COALESCE(career_races, 0) corse, COALESCE(career_earnings, 0) premi
                        FROM horses WHERE name = ?`).get(madre) as any;
  const rm = db.prepare(`SELECT SUM(t.posizione) s, COUNT(*) n FROM potenziale_traguardo t JOIN horses h ON h.name = t.horse_name
                         WHERE UPPER(TRIM(h.dam)) = ?`).get(madre) as any;
  const pm = d?.sire ? String(d.sire).toUpperCase().trim() : null;
  const rpm = pm ? db.prepare(`SELECT SUM(t.posizione) s, COUNT(*) n FROM potenziale_traguardo t
                               JOIN horses h ON h.name = t.horse_name JOIN horses d ON d.name = h.dam
                               WHERE UPPER(TRIM(d.sire)) = ?`).get(pm) as any : null;
  return {
    madre: madre && rm ? media(rm, K.madre) : { m: NaN, n: 0 },
    pm: pm ? media(rpm, K.pm) : { m: NaN, n: 0 },
    eta_madre: d?.birth_year ? new Date().getFullYear() + 1 - d.birth_year : NaN,
    madre_corse: d ? d.corse : NaN,
    madre_premi_log: d ? Math.log1p(Math.max(0, d.premi)) : NaN,
  };
}

// I traguardi dei figli di tutti i padri in una sola lettura, tenuta un'ora
// (21/11/2026): la lettura per singolo padre scorreva tutto l'archivio.
let TRAGUARDI_PADRI: { quando: number; m: Map<string, { s: number; n: number }> } | null = null;
function traguardiPadri(db: Database.Database) {
  if (TRAGUARDI_PADRI && Date.now() - TRAGUARDI_PADRI.quando < 60 * 60 * 1000) return TRAGUARDI_PADRI.m;
  const m = new Map<string, { s: number; n: number }>();
  for (const r of db.prepare(`SELECT UPPER(TRIM(h.sire)) k, SUM(t.posizione) s, COUNT(*) n FROM potenziale_traguardo t
                              JOIN horses h ON h.name = t.horse_name WHERE h.sire IS NOT NULL GROUP BY 1`).all() as any[])
    m.set(r.k, { s: r.s, n: r.n });
  TRAGUARDI_PADRI = { quando: Date.now(), m };
  return m;
}

export function potenzialeNascita(db: Database.Database, padre: string, ctx: ReturnType<typeof contestoMadre>) {
  const mod = modello();
  if (!mod || !ctx) return null;
  const rp = traguardiPadri(db).get(padre.toUpperCase().trim());
  const p = media(rp, K.padre);
  const valori: Record<string, number> = {
    eta_mesi: 12, padre_m: p.m, padre_n: p.n, madre_m: ctx.madre.m, madre_n: ctx.madre.n,
    pm_m: ctx.pm.m, pm_n: ctx.pm.n, eta_madre: ctx.eta_madre, madre_corse: ctx.madre_corse,
    madre_premi_log: ctx.madre_premi_log, q_n: 0, gare: 0,
  };
  const stima = (q: string) => {
    const per = (f: number) => percorri(mod.quantili[q], mod.variabili.map((v: string) =>
      v === "femmina" ? f : (v in valori ? valori[v] : NaN)));
    return (per(0) + per(1)) / 2;
  };
  // Stesso calcolo della notte: mediana, poi i limiti allargati con la
  // taratura dello stadio nascita.
  const k = mod.taratura?.nascita ?? 1;
  const p50 = Math.min(100, Math.max(0, stima("50")));
  const p10 = Math.max(0, p50 - k * (p50 - Math.min(p50, stima("10"))));
  const p90 = Math.min(100, p50 + k * (Math.max(p50, stima("90")) - p50));
  return { p10: Math.round(p10 * 10) / 10, p50: Math.round(p50 * 10) / 10, p90: Math.round(p90 * 10) / 10,
           etichetta: etichettaStadio("nascita") };
}
