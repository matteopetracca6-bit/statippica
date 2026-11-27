/**
 * Riproduttori, due aggiunte alle schede di stallone e fattrice (27/11/2026).
 *
 * 1) /api/riproduttore/anni?tipo=stallone|fattrice&nome=  Il voto negli anni:
 *    per ogni anno, il voto da riproduttore che avrebbe se contassero solo i
 *    figli nati fino a quell'anno. Stessa formula del lavoro notturno
 *    (nightly_update.phase_stallion_ratings / phase_dam_ratings): pesi delle
 *    lettere dei figli, per lo stallone la media tirata verso quella di tutti
 *    i figli (K=60) piu' il premio per i figli di vertice e il boost VP; per la
 *    fattrice il moltiplicatore sul numero di figli. La lettera viene dalle
 *    soglie di oggi (il punteggio piu' basso di ogni lettera nella tabella).
 *    Avvertenza: il voto di ogni figlio e' quello di oggi, non quello che
 *    aveva allora.
 *
 * 2) /api/stallion/:name/incroci  Con quali padri della madre i figli dello
 *    stallone vanno meglio. Media dei pesi delle lettere per gruppo, tirata
 *    verso la media dello stallone (k=5) perche' un gruppo da 5 figli non
 *    faccia da solo la classifica.
 */
import type { Express } from "express";

const PESI: Record<string, number> = { SSS: 100, SS: 85, S: 70, A: 55, B: 40, C: 25, D: 15, E: 8, F: 2 };
const K_STALLONE = 60, PESO_VERTICE = 6.0, K_INCROCIO = 5, MIN_INCROCIO = 5;
const VERTICE = new Set(["SSS", "SS", "S"]);
const volFattrice = (n: number) => n === 1 ? 0.70 : n === 2 ? 0.78 : n === 3 ? 0.84 : n === 4 ? 0.88 : n <= 6 ? 0.92 : n <= 9 ? 0.96 : 1.0;
const norm = (s: any) => String(s ?? "").trim().toUpperCase();

type Figlio = { nome: string; anno: number | null; voto: string; guadagni: number };

/** I voti di tutti i cavalli: storico, poi corse che lo sostituisce (come la notte). */
function votiTutti(db: any, soloAtleti: boolean) {
  const m = new Map<string, { voto: string; guadagni: number; sire: string }>();
  for (const r of db.prepare(`SELECT name, birth_year, sire, grade, career_earnings FROM horse_ratings
      WHERE rating_mode = 'storico' AND grade IS NOT NULL AND grade <> 'N/A'`).iterate() as any)
    m.set(`${r.name}|${r.birth_year}`, { voto: r.grade, guadagni: r.career_earnings ?? 0, sire: r.sire ?? "" });
  for (const r of db.prepare(`SELECT name, birth_year, sire, COALESCE(grade_annata, grade) AS g, career_earnings FROM horse_ratings
      WHERE rating_mode = 'performance' ${soloAtleti ? "AND COALESCE(horse_class, 'athlete') = 'athlete'" : ""}`).iterate() as any)
    if (r.g && r.g !== "N/A") m.set(`${r.name}|${r.birth_year}`, { voto: r.g, guadagni: r.career_earnings ?? 0, sire: r.sire ?? "" });
  return m;
}

let memoGlobale: { t: number; media: number; maxVertice: number } | null = null;
function globaleStalloni(db: any) {
  if (memoGlobale && Date.now() - memoGlobale.t < 6 * 3600_000) return memoGlobale;
  let somma = 0, n = 0;
  for (const v of Array.from(votiTutti(db, false).values())) if (v.sire.trim() && PESI[v.voto] != null) { somma += PESI[v.voto]; n++; }
  const mv = db.prepare(`SELECT MAX(COALESCE(n_SSS,0)+COALESCE(n_SS,0)+COALESCE(n_S,0)) AS m FROM stallion_rating_stats`).get() as any;
  memoGlobale = { t: Date.now(), media: n ? somma / n : 0, maxVertice: mv?.m ?? 0 };
  return memoGlobale;
}

function soglie(db: any, tabella: string): [number, string][] {
  return (db.prepare(`SELECT grade, MIN(final_score) AS s FROM ${tabella} WHERE grade IS NOT NULL AND grade <> 'N/A' AND final_score > 0 GROUP BY grade`).all() as any[])
    .map(r => [r.s, r.grade] as [number, string]).sort((a, b) => b[0] - a[0]);
}
const lettera = (s: number, thr: [number, string][]) => thr.find(([t]) => s >= t)?.[1] ?? "F";

function figliStallone(db: any, nome: string): Figlio[] {
  const out = new Map<string, Figlio>();
  for (const r of db.prepare(`SELECT name, birth_year, grade, career_earnings FROM horse_ratings WHERE rating_mode = 'storico'
      AND UPPER(TRIM(sire)) = ? AND grade IS NOT NULL AND grade <> 'N/A'`).iterate(nome) as any)
    out.set(`${r.name}|${r.birth_year}`, { nome: r.name, anno: r.birth_year, voto: r.grade, guadagni: r.career_earnings ?? 0 });
  for (const r of db.prepare(`SELECT name, birth_year, COALESCE(grade_annata, grade) AS g, career_earnings FROM horse_ratings WHERE rating_mode = 'performance'
      AND UPPER(TRIM(sire)) = ?`).iterate(nome) as any)
    if (r.g && r.g !== "N/A") out.set(`${r.name}|${r.birth_year}`, { nome: r.name, anno: r.birth_year, voto: r.g, guadagni: r.career_earnings ?? 0 });
  return Array.from(out.values());
}

function figliFattrice(db: any, nome: string): Figlio[] {
  const kids = db.prepare(`SELECT name, birth_year FROM horses WHERE UPPER(TRIM(dam)) = ?`).all(nome) as any[];
  if (!kids.length) return [];
  const out: Figlio[] = [];
  const st = db.prepare(`SELECT grade, career_earnings FROM horse_ratings WHERE name = ? AND birth_year IS ? AND rating_mode = 'storico' AND grade IS NOT NULL AND grade <> 'N/A'`);
  const pf = db.prepare(`SELECT COALESCE(grade_annata, grade) AS g, career_earnings FROM horse_ratings WHERE name = ? AND birth_year IS ? AND rating_mode = 'performance'
      AND COALESCE(horse_class, 'athlete') = 'athlete'`);
  for (const k of kids) {
    const p = pf.get(k.name, k.birth_year) as any;
    if (p?.g && p.g !== "N/A") { out.push({ nome: k.name, anno: k.birth_year, voto: p.g, guadagni: p.career_earnings ?? 0 }); continue; }
    const s = st.get(k.name, k.birth_year) as any;
    if (s) out.push({ nome: k.name, anno: k.birth_year, voto: s.grade, guadagni: s.career_earnings ?? 0 });
  }
  return out;
}

export function votoNegliAnni(db: any, tipo: string, nomeGrezzo: string) {
  const nome = norm(nomeGrezzo);
  const stallone = tipo !== "fattrice";
  const figli = (stallone ? figliStallone(db, nome) : figliFattrice(db, nome)).filter(f => f.anno && PESI[f.voto] != null);
  if (!figli.length) return { punti: [], n_figli: 0 };
  const thr = soglie(db, stallone ? "stallion_rating_stats" : "dam_rating_stats");
  const g = stallone ? globaleStalloni(db) : null;
  const riga = db.prepare(stallone ? `SELECT final_score, grade, vp_boost FROM stallion_rating_stats WHERE UPPER(TRIM(sire)) = ?`
    : `SELECT final_score, grade FROM dam_rating_stats WHERE UPPER(TRIM(dam)) = ?`).get(nome) as any;
  const vp = stallone ? (riga?.vp_boost ?? 0) : 0;
  const anni = figli.map(f => f.anno!) as number[];
  const da = Math.min(...anni), a = Math.max(...anni);
  const punti: { anno: number; figli: number; punteggio: number; voto: string; nuovi: number; migliore: string | null }[] = [];
  for (let y = da; y <= a; y++) {
    const fin = figli.filter(f => f.anno! <= y);
    const nuovi = figli.filter(f => f.anno === y);
    if (!nuovi.length && y !== a) continue;
    const n = fin.length;
    const base = fin.reduce((t, f) => t + PESI[f.voto], 0) / n;
    let s: number;
    if (stallone) {
      const peso = n / (n + K_STALLONE);
      const nv = fin.filter(f => VERTICE.has(f.voto)).length;
      const vertice = g!.maxVertice ? PESO_VERTICE * Math.log1p(nv) / Math.log1p(g!.maxVertice) : 0;
      s = Math.min(peso * base + (1 - peso) * g!.media + vertice + vp, 100);
    } else s = Math.min(base * volFattrice(n), 100);
    const top = nuovi.slice().sort((x, y2) => PESI[y2.voto] - PESI[x.voto] || y2.guadagni - x.guadagni)[0];
    punti.push({ anno: y, figli: n, punteggio: Math.round(s * 100) / 100, voto: lettera(s, thr), nuovi: nuovi.length, migliore: top ? `${top.nome} (${top.voto})` : null });
  }
  return { punti, n_figli: figli.length, oggi: riga ? { punteggio: riga.final_score, voto: riga.grade } : null };
}

export function incrociStallone(db: any, nomeGrezzo: string) {
  const nome = norm(nomeGrezzo);
  const figli = figliStallone(db, nome);
  if (!figli.length) return { gruppi: [], media: null, n_figli: 0 };
  const madreDi = db.prepare(`SELECT dam FROM horses WHERE name = ? AND (birth_year IS ? OR ? IS NULL) LIMIT 1`);
  const padreDi = db.prepare(`SELECT sire FROM horses WHERE UPPER(TRIM(name)) = ? AND sire IS NOT NULL AND TRIM(sire) <> '' LIMIT 1`);
  const cachePadre = new Map<string, string | null>();
  const gruppi = new Map<string, Figlio[]>();
  let conPm = 0;
  for (const f of figli) {
    const m = norm((madreDi.get(f.nome, f.anno, f.anno) as any)?.dam);
    if (!m) continue;
    if (!cachePadre.has(m)) cachePadre.set(m, norm((padreDi.get(m) as any)?.sire) || null);
    const pm = cachePadre.get(m);
    if (!pm) continue;
    conPm++;
    const l = gruppi.get(pm) ?? []; l.push(f); gruppi.set(pm, l);
  }
  const media = figli.reduce((t, f) => t + (PESI[f.voto] ?? 0), 0) / figli.length;
  const topTutti = figli.filter(f => VERTICE.has(f.voto)).length / figli.length;
  const righe = Array.from(gruppi.entries()).filter(([, l]) => l.length >= MIN_INCROCIO).map(([pm, l]) => {
    const somma = l.reduce((t, f) => t + (PESI[f.voto] ?? 0), 0);
    const migliore = l.slice().sort((x, y) => (PESI[y.voto] ?? 0) - (PESI[x.voto] ?? 0) || y.guadagni - x.guadagni)[0];
    return {
      padre_madre: pm, figli: l.length,
      media: Math.round(somma / l.length * 10) / 10,
      stimata: Math.round((somma + K_INCROCIO * media) / (l.length + K_INCROCIO) * 10) / 10,
      top: Math.round(l.filter(f => VERTICE.has(f.voto)).length / l.length * 1000) / 10,
      guadagno_medio: Math.round(l.reduce((t, f) => t + f.guadagni, 0) / l.length),
      migliore: migliore ? { nome: migliore.nome, anno: migliore.anno, voto: migliore.voto } : null,
    };
  }).sort((x, y) => y.stimata - x.stimata);
  return { gruppi: righe, media: Math.round(media * 10) / 10, top_tutti: Math.round(topTutti * 1000) / 10,
    n_figli: figli.length, con_padre_madre: conPm, minimo: MIN_INCROCIO };
}

export function registraRiproduttori(app: Express, getDb: () => any) {
  const memo = new Map<string, { t: number; v: any }>();
  const conMemo = (chiave: string, f: (db: any) => any) => {
    const m = memo.get(chiave);
    if (m && Date.now() - m.t < 3600_000) return m.v;
    const db = getDb();
    try { const v = f(db); memo.set(chiave, { t: Date.now(), v }); if (memo.size > 500) memo.delete(memo.keys().next().value as string); return v; }
    finally { db.close(); }
  };
  app.get("/api/riproduttore/anni", (req, res) => {
    try {
      const tipo = String(req.query.tipo ?? "stallone"), nome = String(req.query.nome ?? "");
      res.json(conMemo(`anni|${tipo}|${norm(nome)}`, db => votoNegliAnni(db, tipo, nome)));
    } catch (e: any) { res.status(500).json({ message: String(e?.message ?? e) }); }
  });
  app.get("/api/stallion/:name/incroci", (req, res) => {
    try {
      const nome = decodeURIComponent(req.params.name);
      res.json(conMemo(`incroci|${norm(nome)}`, db => incrociStallone(db, nome)));
    } catch (e: any) { res.status(500).json({ message: String(e?.message ?? e) }); }
  });
}
