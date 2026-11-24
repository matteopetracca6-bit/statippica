/**
 * GENERAZIONI (24/11/2026): una scheda per ogni annata di nascita, con
 * andamenti, voti, premi e tante statistiche.
 *
 * Quali annate entrano:
 *  - dal 2012 in poi: tutte quelle nell'archivio delle corse (fino ai nati di
 *    due anni fa: i piu' giovani non hanno ancora corso). Le annate di chi
 *    corre ancora sono segnate "in corso";
 *  - prima del 2012 (i cavalli "storici", ricostruiti dal registro UNIRE):
 *    solo le annate gia' finite dal recupero notturno, cioe' senza ricerche
 *    ancora da fare (storici_unire_ricerche) e senza cavalli ancora da leggere
 *    (storici_unire_cavalli). Ogni volta che la notte finisce un'annata, qui
 *    compare da sola.
 *
 * I premi "per eta'" vengono dalle corse una per una: si mostrano solo per le
 * annate in cui le corse dell'archivio coprono quasi tutti i premi di carriera.
 */
import type { Express } from "express";

const ORDINE = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
const ORE6 = 6 * 60 * 60 * 1000;
let MEMO: { quando: number; chiave: string; v: any } | null = null;
const MEMO_ANNO = new Map<string, { quando: number; v: any }>();

const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(10 * x) / 10;
function esiste(db: any, t: string) {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t);
}
/** "1'13\"3", "1.13.3", "13.3", "20.1" -> secondi al km (73,3 / 80,1). 0 o assurdi -> null. */
export function secondiRecord(raw: any): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/['’]/g, ".").replace(/["”]/g, ".").replace(/\s+/g, "").replace(/\.+$/, "").replace(/\.{2,}/g, ".");
  if (!/\d/.test(s)) return null;
  const p = s.split(".").map(Number);
  let sec: number;
  if (p.length >= 3) sec = p[0] * 60 + p[1] + (p[2] || 0) / 10;
  else if (p.length === 2) sec = 60 + p[0] + p[1] / 10;
  else sec = 60 + p[0];
  return sec >= 65 && sec <= 100 ? Math.round(sec * 10) / 10 : null;
}
const mediana = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Le annate storiche (prima del 2012) gia' complete nel recupero UNIRE. */
function storicheComplete(db: any): number[] {
  if (!esiste(db, "storici_unire_ricerche")) return [];
  const anni = db.prepare(`SELECT anno, SUM(stato = 'da_fare') manca, COUNT(*) n FROM storici_unire_ricerche GROUP BY anno`).all() as any[];
  const daLeggere = new Set<number>(esiste(db, "storici_unire_cavalli")
    ? (db.prepare(`SELECT DISTINCT anno FROM storici_unire_cavalli WHERE stato = 'da_leggere'`).all() as any[]).map(r => r.anno) : []);
  return anni.filter(a => a.n > 0 && a.manca === 0 && !daLeggere.has(a.anno) && a.anno < 2012).map(a => a.anno);
}

function righeAnnata(db: any, anno: number) {
  return db.prepare(`
    SELECT r.name, r.sire, r.grade, r.rating_mode modo, r.score, COALESCE(r.career_races, 0) corse, COALESCE(r.career_wins, 0) vitt,
           COALESCE(r.career_places, 0) piazz, COALESCE(r.career_earnings, 0) premi, r.record_career rec, h.sex sesso, h.dam madre
      FROM horse_ratings r LEFT JOIN horses h ON h.name = r.name AND h.birth_year = r.birth_year
     WHERE r.birth_year = ? AND r.rating_mode IN ('performance', 'storico', 'pedigree')
       AND (COALESCE(r.horse_class, 'athlete') = 'athlete' OR r.rating_mode = 'storico')`).all(anno) as any[];
}

function statistiche(righe: any[], anno: number, oggi: number) {
  const corsi = righe.filter(r => r.modo !== "pedigree" && r.corse > 0);
  const premi = corsi.map(r => r.premi).sort((a, b) => b - a);
  const tot = premi.reduce((a, b) => a + b, 0);
  const top10 = premi.slice(0, Math.max(1, Math.ceil(premi.length / 10))).reduce((a, b) => a + b, 0);
  const rec = corsi.map(r => secondiRecord(r.rec)).filter((x): x is number => x != null);
  const fem = righe.filter(r => r.sesso === "F");
  const femCorsi = corsi.filter(r => r.sesso === "F"), maschiCorsi = corsi.filter(r => r.sesso !== "F");
  const voti: Record<string, number> = Object.fromEntries(ORDINE.map(v => [v, 0]));
  for (const r of corsi) if (r.grade && voti[r.grade] != null) voti[r.grade]++;
  const padri = new Map<string, number>();
  for (const r of righe) if (r.sire) padri.set(String(r.sire).toUpperCase().trim(), (padri.get(String(r.sire).toUpperCase().trim()) ?? 0) + 1);
  const top5padri = [...padri.values()].sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0);
  const campione = [...corsi].sort((a, b) => b.premi - a.premi)[0];
  const eta = oggi - anno;
  return {
    anno, eta, in_corso: eta <= 6, fonte: anno < 2012 ? "registro UNIRE" : "archivio delle corse",
    nati: righe.length, corsi: corsi.length, quota_corsi: r1(100 * corsi.length / Math.max(1, righe.length)),
    vincitori: corsi.filter(r => r.vitt > 0).length,
    quota_vincitori: r1(100 * corsi.filter(r => r.vitt > 0).length / Math.max(1, corsi.length)),
    premi_totali: r0(tot), premi_medi: r0(tot / Math.max(1, corsi.length)), premi_mediani: r0(mediana(premi) ?? 0),
    premi_per_nato: r0(tot / Math.max(1, righe.length)),
    quota_top10: r1(100 * top10 / Math.max(1, tot)),
    sopra_100mila: corsi.filter(r => r.premi >= 100000).length,
    corse_medie: r1(corsi.reduce((t, r) => t + r.corse, 0) / Math.max(1, corsi.length)),
    vittorie_medie: r1(corsi.reduce((t, r) => t + r.vitt, 0) / Math.max(1, corsi.length)),
    record_migliore: rec.length ? Math.min(...rec) : null, record_mediano: rec.length ? r1(mediana(rec)!) : null,
    con_record: rec.length,
    quota_femmine: r1(100 * fem.length / Math.max(1, righe.length)),
    premi_medi_femmine: r0(femCorsi.reduce((t, r) => t + r.premi, 0) / Math.max(1, femCorsi.length)),
    premi_medi_maschi: r0(maschiCorsi.reduce((t, r) => t + r.premi, 0) / Math.max(1, maschiCorsi.length)),
    padri: padri.size, quota_primi5_padri: r1(100 * top5padri / Math.max(1, righe.length)),
    voti,
    campione: campione ? { nome: campione.name, premi: r0(campione.premi), voto: campione.grade ?? null } : null,
  };
}

export function elencoGenerazioni(db: any) {
  const chiave = String((db.prepare(`SELECT COUNT(*) n, MAX(last_updated) u FROM horse_ratings`).get() as any)?.u ?? "");
  if (MEMO && MEMO.chiave === chiave && Date.now() - MEMO.quando < ORE6) return MEMO.v;
  const oggi = new Date().getFullYear();
  const moderne = (db.prepare(`SELECT DISTINCT birth_year y FROM horse_ratings WHERE birth_year >= 2012 AND birth_year <= ? AND rating_mode = 'performance'`).all(oggi - 2) as any[]).map(r => r.y);
  const storiche = storicheComplete(db);
  const anni = [...new Set([...storiche, ...moderne])].sort((a, b) => a - b);
  const v = {
    anni, storiche_complete: storiche, prima_moderna: 2012,
    in_recupero: esiste(db, "storici_unire_ricerche")
      ? (db.prepare(`SELECT anno, SUM(stato <> 'da_fare') fatte, COUNT(*) n FROM storici_unire_ricerche GROUP BY anno HAVING SUM(stato = 'da_fare') > 0 AND SUM(stato <> 'da_fare') > 0 ORDER BY anno DESC LIMIT 1`).get() as any) ?? null
      : null,
    generazioni: anni.map(a => statistiche(righeAnnata(db, a), a, oggi)),
  };
  MEMO = { quando: Date.now(), chiave, v };
  return v;
}

export function dettaglioGenerazione(db: any, anno: number) {
  const k = String(anno);
  const c = MEMO_ANNO.get(k);
  if (c && Date.now() - c.quando < ORE6) return c.v;
  const righe = righeAnnata(db, anno);
  const corsi = righe.filter(r => r.modo !== "pedigree" && r.corse > 0);
  const migliori = [...corsi].sort((a, b) => b.premi - a.premi).slice(0, 15).map(r => ({
    nome: r.name, padre: r.sire, madre: r.madre, voto: r.grade, premi: r0(r.premi), corse: r.corse, vittorie: r.vitt, record: secondiRecord(r.rec),
  }));
  const pp = new Map<string, { nati: number; corsi: number; premi: number; migliore: string; mp: number }>();
  for (const r of righe) {
    const s = String(r.sire ?? "").toUpperCase().trim(); if (!s) continue;
    const x = pp.get(s) ?? { nati: 0, corsi: 0, premi: 0, migliore: "", mp: -1 };
    x.nati++; if (r.modo !== "pedigree" && r.corse > 0) x.corsi++; x.premi += r.premi;
    if (r.premi > x.mp) { x.mp = r.premi; x.migliore = r.name; }
    pp.set(s, x);
  }
  const stalloni = [...pp.entries()].sort((a, b) => b[1].premi - a[1].premi).slice(0, 15).map(([nome, x]) => ({
    nome, nati: x.nati, corsi: x.corsi, premi: r0(x.premi), premi_per_nato: r0(x.premi / x.nati), migliore: x.migliore,
  }));
  // Premi per eta', dalle corse una per una (se coprono la carriera).
  const perEta = db.prepare(`
    SELECT CAST(substr(r.race_date, 1, 4) AS INTEGER) - ? eta, SUM(COALESCE(r.prize_net, 0)) premi, COUNT(*) partenze,
           COUNT(DISTINCT r.horse_name) cavalli, SUM(r.placement = 1) vittorie
      FROM races r JOIN horses h ON h.name = r.horse_name AND h.birth_year = ?
     WHERE r.race_date IS NOT NULL GROUP BY 1 HAVING eta BETWEEN 2 AND 16 ORDER BY 1`).all(anno, anno) as any[];
  const totCorse = perEta.reduce((t, x) => t + x.premi, 0);
  const totCarriera = corsi.reduce((t, r) => t + r.premi, 0);
  const copertura = totCarriera > 0 ? totCorse / totCarriera : 0;
  // Distribuzione dei record al km, a mezzo secondo.
  const rec = corsi.map(r => secondiRecord(r.rec)).filter((x): x is number => x != null);
  const fasce = new Map<number, number>();
  for (const s of rec) { const f = Math.floor(s * 2) / 2; fasce.set(f, (fasce.get(f) ?? 0) + 1); }
  const v = {
    anno, migliori, stalloni,
    copertura_corse: r1(100 * copertura),
    per_eta: copertura >= 0.85 ? perEta.map(x => ({ eta: x.eta, premi: r0(x.premi), partenze: x.partenze, cavalli: x.cavalli, vittorie: x.vittorie })) : null,
    record: [...fasce.entries()].sort((a, b) => a[0] - b[0]).map(([da, n]) => ({ da, n })),
  };
  MEMO_ANNO.set(k, { quando: Date.now(), v });
  return v;
}

export function registraGenerazioni(app: Express, getDb: () => any) {
  app.get("/api/generazioni", (_req, res) => {
    const db = getDb();
    try { res.json(elencoGenerazioni(db)); } catch (e: any) { res.status(500).json({ message: String(e?.message ?? e) }); } finally { db.close(); }
  });
  app.get("/api/generazioni/:anno", (req, res) => {
    const anno = Number(req.params.anno);
    if (!Number.isInteger(anno) || anno < 1950 || anno > 2100) return res.status(400).json({ message: "anno non valido" });
    const db = getDb();
    try { res.json(dettaglioGenerazione(db, anno)); } catch (e: any) { res.status(500).json({ message: String(e?.message ?? e) }); } finally { db.close(); }
  });
}
