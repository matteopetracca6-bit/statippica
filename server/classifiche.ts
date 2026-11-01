/**
 * CLASSIFICHE PER ETA' E CLASSIFICHE DEGLI STALLONI (novembre 2026).
 *
 * Idea presa dalle statistiche di gaet.it, ma i numeri sono calcolati qui,
 * dall'archivio corse di StatIppica (nessun dato copiato da quel sito).
 *
 *  1. leadersEta: i cavalli di un'eta' (2, 3, 4 anni, anziani) messi in fila
 *     per vincite, in carriera o in una sola stagione, con padre, madre,
 *     nonno materno e miglior tempo su distanza breve e lunga.
 *  2. stalloniStagione: per ogni stallone, cosa hanno fatto i figli in una
 *     stagione: quanti hanno corso, quanto hanno vinto, quanti hanno un
 *     record sotto certe soglie e quanti hanno superato certe vincite.
 *  3. nipotiStalloni: la linea paterna vista da sopra: quanto vincono i figli
 *     dei figli stalloni di uno stallone.
 *
 * Distanza "breve" = sotto i 2000 metri (miglio e dintorni), "lunga" = 2000
 * metri e oltre. Un tempo vale solo se il cavallo e' arrivato (piazzamento
 * presente) e il tempo al km e' plausibile (fra 1.08 e 1.30). Le vincite sono
 * quelle nette, come nel resto del sito.
 */
import type Database from "better-sqlite3";

export type FasciaEta = "2" | "3" | "4" | "anziani" | "tutte";
const FASCE: Record<FasciaEta, [number, number]> = {
  "2": [2, 2], "3": [3, 3], "4": [4, 4], anziani: [5, 14], tutte: [2, 10],
};
// Per gli stalloni le eta' "tutte" e "anziani" si fermano a 10 anni, come si
// usa nelle statistiche di monta: oltre, i figli corrono poco e falsano i conti.
const FASCE_STALLONI: Record<FasciaEta, [number, number]> = {
  "2": [2, 2], "3": [3, 3], "4": [4, 4], anziani: [5, 10], tutte: [2, 10],
};
export const SOGLIE_TEMPO = [12, 13, 14, 15, 16, 17]; // 1.12 ... 1.17
export const SOGLIE_VINCITE = [100_000, 50_000, 25_000, 10_000];
export const PRIMO_ANNO = 2014;

const TEMPO_OK = "r.time_km BETWEEN 8 AND 30 AND r.placement IS NOT NULL";

export function annoRiferimento(db: Database.Database): number {
  const r = db.prepare("SELECT MAX(race_date) d FROM races").get() as { d: string | null };
  return r?.d ? Number(r.d.slice(0, 4)) : new Date().getFullYear();
}

export function anniDisponibili(db: Database.Database): number[] {
  const a = annoRiferimento(db);
  const out: number[] = [];
  for (let y = a; y >= PRIMO_ANNO; y--) out.push(y);
  return out;
}

const fascia = (v: unknown): FasciaEta => (["2", "3", "4", "anziani", "tutte"].includes(String(v)) ? String(v) as FasciaEta : "3");

// ── 1. Classifiche per eta' ────────────────────────────────────────────────
export interface RigaLeader {
  nome: string; nato: number; sesso: string | null; padre: string | null; madre: string | null; nonno: string | null;
  corse: number; vittorie: number; primi_tre: number; vincite: number; breve: number | null; lunga: number | null;
  voto: string | null;
}
export interface Leaders {
  anno: number; anno_riferimento: number; periodo: "carriera" | "stagione"; eta: FasciaEta; nati: [number, number];
  totale_cavalli: number; totale_vincite: number; righe: RigaLeader[]; anni: number[];
}

export function leadersEta(db: Database.Database, q: { eta?: unknown; periodo?: unknown; sesso?: unknown; naz?: unknown; ordine?: unknown }): Leaders {
  const rif = annoRiferimento(db);
  const eta = fascia(q.eta === "tutte" ? "3" : q.eta);
  const stagione = q.periodo != null && q.periodo !== "carriera" && /^\d{4}$/.test(String(q.periodo));
  const anno = stagione ? Math.min(rif, Math.max(PRIMO_ANNO, Number(q.periodo))) : rif;
  const [amin, amax] = FASCE[eta];
  const natiDa = anno - amax, natiA = anno - amin;
  const sesso = q.sesso === "F" ? "F" : q.sesso === "M" ? "M" : null;
  const soloIta = q.naz !== "tutti";
  const ordine = ["vincite", "vittorie", "breve", "lunga"].includes(String(q.ordine)) ? String(q.ordine) : "vincite";

  const filtri: string[] = ["h.birth_year BETWEEN @natiDa AND @natiA"];
  if (soloIta) filtri.push("h.country = 'ITA'");
  // "Maschi" comprende i castroni, come nelle classifiche ufficiali.
  if (sesso === "M") filtri.push("h.sex IN ('M','C')");
  if (sesso === "F") filtri.push("h.sex = 'F'");
  const daData = `${anno}-01-01`, aData = `${anno}-12-31`;
  // In carriera gli anziani sono tanti e quasi tutti a riposo da anni: si
  // tengono solo quelli che hanno corso nella stagione di riferimento.
  if (!stagione && eta === "anziani") filtri.push("EXISTS (SELECT 1 FROM races x WHERE x.horse_name = h.name AND x.race_date >= @daData)");
  const dataRaces = stagione ? "AND r.race_date BETWEEN @daData AND @aData" : "";

  const sql = `
    WITH cav AS (SELECT h.name, h.birth_year, h.sex, h.sire, h.dam FROM horses h WHERE ${filtri.join(" AND ")}),
    agg AS (
      SELECT r.horse_name n, COUNT(*) corse, SUM(r.placement = 1) vitt, SUM(r.placement BETWEEN 1 AND 3) p3,
             COALESCE(SUM(r.prize_net), 0) vinc,
             MIN(CASE WHEN r.distance < 2000 AND ${TEMPO_OK} THEN r.time_km END) breve,
             MIN(CASE WHEN r.distance >= 2000 AND ${TEMPO_OK} THEN r.time_km END) lunga
      FROM races r WHERE r.horse_name IN (SELECT name FROM cav) ${dataRaces}
      GROUP BY r.horse_name)
    SELECT c.name nome, c.birth_year nato, c.sex sesso, c.sire padre, c.dam madre, d.sire nonno,
           a.corse, a.vitt vittorie, a.p3 primi_tre, a.vinc vincite, a.breve, a.lunga, hr.grade voto
    FROM cav c JOIN agg a ON a.n = c.name
    LEFT JOIN horses d ON d.name = c.dam
    LEFT JOIN horse_ratings hr ON hr.name = c.name AND hr.birth_year = c.birth_year AND hr.rating_mode = 'performance'`;
  const tutte = db.prepare(sql).all({ natiDa, natiA, daData, aData }) as RigaLeader[];
  const tot = tutte.reduce((s, r) => s + (r.vincite || 0), 0);
  const perTempo = (k: "breve" | "lunga") => (a: RigaLeader, b: RigaLeader) =>
    (a[k] ?? 99) - (b[k] ?? 99) || b.vincite - a.vincite;
  const cmp = ordine === "vittorie" ? (a: RigaLeader, b: RigaLeader) => b.vittorie - a.vittorie || b.vincite - a.vincite
    : ordine === "breve" ? perTempo("breve") : ordine === "lunga" ? perTempo("lunga")
    : (a: RigaLeader, b: RigaLeader) => b.vincite - a.vincite || b.vittorie - a.vittorie;
  const righe = tutte.filter(r => ordine === "breve" ? r.breve != null : ordine === "lunga" ? r.lunga != null : r.corse > 0)
    .sort(cmp).slice(0, 200)
    .map(r => ({ ...r, vincite: Math.round(r.vincite || 0), sesso: r.sesso || null }));
  return {
    anno, anno_riferimento: rif, periodo: stagione ? "stagione" : "carriera", eta, nati: [natiDa, natiA],
    totale_cavalli: tutte.length, totale_vincite: Math.round(tot), righe, anni: anniDisponibili(db),
  };
}

// ── 2. Classifica degli stalloni nella stagione ────────────────────────────
interface FiglioStagione {
  nome: string; nato: number; sesso: string | null; sire: string; madre: string | null;
  corse: number; vittorie: number; vincite: number; record: number | null; voto: string | null;
}
export interface RigaStalloneStagione {
  nome: string; figli: number; in_corsa: number; pct_in_corsa: number; vincite: number;
  media_partente: number; vittorie: number; tempi: number[]; soglie_vincite: number[];
  migliore: { nome: string; nato: number; vincite: number } | null; voto: string | null;
}

function figliNellaStagione(db: Database.Database, anno: number, eta: FasciaEta, soloIta: boolean, sire?: string): FiglioStagione[] {
  const [amin, amax] = FASCE_STALLONI[eta];
  const filtri = ["h.birth_year BETWEEN @natiDa AND @natiA", "h.sire IS NOT NULL", "h.sire <> ''"];
  if (soloIta) filtri.push("h.country = 'ITA'");
  if (sire) filtri.push("h.sire = @sire");
  const sql = `
    WITH cav AS (SELECT h.name, h.birth_year, h.sex, h.sire, h.dam FROM horses h WHERE ${filtri.join(" AND ")}),
    agg AS (
      SELECT r.horse_name n,
             SUM(r.race_date >= @daData) corse,
             SUM(r.race_date >= @daData AND r.placement = 1) vitt,
             COALESCE(SUM(CASE WHEN r.race_date >= @daData THEN r.prize_net END), 0) vinc,
             MIN(CASE WHEN ${TEMPO_OK} THEN r.time_km END) record
      FROM races r WHERE r.horse_name IN (SELECT name FROM cav) AND r.race_date <= @aData
      GROUP BY r.horse_name)
    SELECT c.name nome, c.birth_year nato, c.sex sesso, c.sire, c.dam madre,
           COALESCE(a.corse, 0) corse, COALESCE(a.vitt, 0) vittorie, COALESCE(a.vinc, 0) vincite, a.record,
           hr.grade voto
    FROM cav c LEFT JOIN agg a ON a.n = c.name
    LEFT JOIN horse_ratings hr ON hr.name = c.name AND hr.birth_year = c.birth_year AND hr.rating_mode = 'performance'`;
  return db.prepare(sql).all({ natiDa: anno - amax, natiA: anno - amin, daData: `${anno}-01-01`, aData: `${anno}-12-31`, sire: sire ?? null }) as FiglioStagione[];
}

export function stalloniStagione(db: Database.Database, q: { anno?: unknown; eta?: unknown; naz?: unknown }) {
  const rif = annoRiferimento(db);
  const anno = /^\d{4}$/.test(String(q.anno)) ? Math.min(rif, Math.max(PRIMO_ANNO, Number(q.anno))) : rif;
  const eta = q.eta == null ? "tutte" : fascia(q.eta);
  const soloIta = q.naz !== "tutti";
  const figli = figliNellaStagione(db, anno, eta, soloIta);
  const voti = new Map((db.prepare("SELECT sire, grade FROM stallion_rating_stats").all() as { sire: string; grade: string | null }[]).map(r => [r.sire, r.grade]));
  const per = new Map<string, FiglioStagione[]>();
  for (const f of figli) { const k = f.sire.trim().toUpperCase(); if (!per.has(k)) per.set(k, []); per.get(k)!.push(f); }
  const righe: RigaStalloneStagione[] = [];
  for (const [nome, fs] of Array.from(per.entries())) {
    const corsi = fs.filter(f => f.corse > 0);
    if (corsi.length === 0) continue;
    const vincite = corsi.reduce((s, f) => s + (f.vincite || 0), 0);
    const best = corsi.reduce((b, f) => (f.vincite > b.vincite ? f : b), corsi[0]);
    righe.push({
      nome, figli: fs.length, in_corsa: corsi.length, pct_in_corsa: Math.round((corsi.length / fs.length) * 1000) / 10,
      vincite: Math.round(vincite), media_partente: Math.round(vincite / corsi.length),
      vittorie: corsi.reduce((s, f) => s + f.vittorie, 0),
      // Record in carriera fino alla fine della stagione: "1.12" = 1.12,9 o meglio.
      tempi: SOGLIE_TEMPO.map(t => fs.filter(f => f.record != null && f.record < t + 1).length),
      soglie_vincite: SOGLIE_VINCITE.map(v => corsi.filter(f => f.vincite >= v).length),
      migliore: best.vincite > 0 ? { nome: best.nome, nato: best.nato, vincite: Math.round(best.vincite) } : null,
      voto: voti.get(nome) ?? null,
    });
  }
  righe.sort((a, b) => b.vincite - a.vincite || b.in_corsa - a.in_corsa);
  return {
    anno, anno_riferimento: rif, eta, nati: [anno - FASCE_STALLONI[eta][1], anno - FASCE_STALLONI[eta][0]],
    soglie_tempo: SOGLIE_TEMPO, soglie_vincite: SOGLIE_VINCITE, anni: anniDisponibili(db),
    stalloni: righe.length, totale_vincite: righe.reduce((s, r) => s + r.vincite, 0),
    righe: righe.slice(0, 150),
  };
}

export function figliStalloneStagione(db: Database.Database, q: { sire?: unknown; anno?: unknown; eta?: unknown; naz?: unknown }) {
  const rif = annoRiferimento(db);
  const anno = /^\d{4}$/.test(String(q.anno)) ? Math.min(rif, Math.max(PRIMO_ANNO, Number(q.anno))) : rif;
  const eta = q.eta == null ? "tutte" : fascia(q.eta);
  const sire = String(q.sire ?? "").trim().toUpperCase();
  if (!sire) return { anno, figli: [] };
  const figli = figliNellaStagione(db, anno, eta, q.naz !== "tutti", sire)
    .filter(f => f.corse > 0)
    .sort((a, b) => b.vincite - a.vincite || b.vittorie - a.vittorie)
    .slice(0, 60)
    .map(f => ({ ...f, vincite: Math.round(f.vincite) }));
  return { anno, figli };
}

// ── 3. Classifica dei nipoti per linea paterna ─────────────────────────────
export interface RigaNonno {
  nome: string; figli_stalloni: number; nipoti: number; nipoti_corsi: number; vincite: number;
  media_nipote: number; vittorie: number; di_vertice: number; voto: string | null;
  figli: { nome: string; nipoti: number; nipoti_corsi: number; vincite: number }[];
  migliori: { nome: string; nato: number; padre: string; vincite: number; voto: string | null }[];
}

const VERTICE = new Set(["S", "SS", "SSS"]);

export function nipotiStalloni(db: Database.Database, q: { periodo?: unknown; naz?: unknown }) {
  const rif = annoRiferimento(db);
  const stagione = q.periodo != null && q.periodo !== "carriera" && /^\d{4}$/.test(String(q.periodo));
  const anno = stagione ? Math.min(rif, Math.max(PRIMO_ANNO, Number(q.periodo))) : rif;
  const soloIta = q.naz !== "tutti";

  const cavalli = db.prepare(`
    SELECT h.name, h.birth_year, UPPER(TRIM(h.sire)) sire, h.country, hr.grade
    FROM horses h LEFT JOIN horse_ratings hr ON hr.name = h.name AND hr.birth_year = h.birth_year AND hr.rating_mode = 'performance'
    WHERE h.sire IS NOT NULL AND TRIM(h.sire) <> ''`).all() as { name: string; birth_year: number; sire: string; country: string | null; grade: string | null }[];
  const dataR = stagione ? "WHERE race_date BETWEEN @da AND @a" : "";
  const corse = new Map((db.prepare(`
    SELECT horse_name n, COUNT(*) c, SUM(placement = 1) v, COALESCE(SUM(prize_net), 0) p
    FROM races ${dataR} GROUP BY horse_name`).all({ da: `${anno}-01-01`, a: `${anno}-12-31` }) as { n: string; c: number; v: number; p: number }[])
    .map(r => [r.n, r]));
  const voti = new Map((db.prepare("SELECT sire, grade FROM stallion_rating_stats").all() as { sire: string; grade: string | null }[]).map(r => [r.sire, r.grade]));

  // padre di ogni cavallo e figli di ogni stallone
  const padreDi = new Map<string, string>();
  const figliDi = new Map<string, typeof cavalli>();
  for (const c of cavalli) {
    padreDi.set(c.name.trim().toUpperCase(), c.sire);
    if (!figliDi.has(c.sire)) figliDi.set(c.sire, []);
    figliDi.get(c.sire)!.push(c);
  }
  // Un figlio stallone e' un cavallo dell'archivio che a sua volta ha figli.
  const nonni = new Map<string, string[]>();
  for (const s of Array.from(figliDi.keys())) {
    const p = padreDi.get(s);
    if (!p || p === s) continue;
    if (!nonni.has(p)) nonni.set(p, []);
    nonni.get(p)!.push(s);
  }

  const righe: RigaNonno[] = [];
  for (const [nonno, figliStalloni] of Array.from(nonni.entries())) {
    const perFiglio: RigaNonno["figli"] = [];
    const tuttiNipoti: { nome: string; nato: number; padre: string; vincite: number; voto: string | null; corsi: boolean; vitt: number }[] = [];
    for (const s of figliStalloni) {
      const nip = (figliDi.get(s) ?? []).filter(n => !soloIta || n.country === "ITA");
      if (nip.length === 0) continue;
      let corsi = 0, vinc = 0;
      for (const n of nip) {
        const c = corse.get(n.name);
        if (c && c.c > 0) corsi++;
        vinc += c?.p ?? 0;
        tuttiNipoti.push({ nome: n.name, nato: n.birth_year, padre: s, vincite: c?.p ?? 0, voto: n.grade, corsi: !!(c && c.c > 0), vitt: c?.v ?? 0 });
      }
      perFiglio.push({ nome: s, nipoti: nip.length, nipoti_corsi: corsi, vincite: Math.round(vinc) });
    }
    const corsi = tuttiNipoti.filter(n => n.corsi);
    if (corsi.length === 0) continue;
    const vincite = corsi.reduce((s, n) => s + n.vincite, 0);
    perFiglio.sort((a, b) => b.vincite - a.vincite);
    righe.push({
      nome: nonno, figli_stalloni: perFiglio.length, nipoti: tuttiNipoti.length, nipoti_corsi: corsi.length,
      vincite: Math.round(vincite), media_nipote: Math.round(vincite / corsi.length),
      vittorie: corsi.reduce((s, n) => s + n.vitt, 0),
      di_vertice: tuttiNipoti.filter(n => n.voto && VERTICE.has(n.voto)).length,
      voto: voti.get(nonno) ?? null,
      figli: perFiglio.slice(0, 12),
      migliori: corsi.sort((a, b) => b.vincite - a.vincite).slice(0, 6)
        .map(n => ({ nome: n.nome, nato: n.nato, padre: n.padre, vincite: Math.round(n.vincite), voto: n.voto })),
    });
  }
  righe.sort((a, b) => b.vincite - a.vincite);
  return {
    anno, anno_riferimento: rif, periodo: stagione ? "stagione" : "carriera", anni: anniDisponibili(db),
    stalloni: righe.length, righe,
  };
}

/** Per la scheda di uno stallone: come va come nonno paterno (in carriera). */
export function nonnoStallone(db: Database.Database, nome: string, cache: { chiave: string; dati: ReturnType<typeof nipotiStalloni> | null }, chiave: string) {
  if (cache.chiave !== chiave || !cache.dati) { cache.dati = nipotiStalloni(db, { periodo: "carriera" }); cache.chiave = chiave; }
  const k = nome.trim().toUpperCase();
  const i = cache.dati.righe.findIndex(r => r.nome === k);
  if (i < 0) return null;
  return { ...cache.dati.righe[i], posto: i + 1, su: cache.dati.stalloni };
}
