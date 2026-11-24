/**
 * CHI RENDE DI PIU' (24/11/2026).
 *
 * Con 1.200 euro al mese quasi ogni cavallo e' in perdita: chiedere "conviene?"
 * da' quasi sempre "no". Qui la domanda cambia: fra stalloni, allenatori,
 * ippodromi e puledri d'asta, chi rende di piu'? Le differenze si vedono anche
 * quando quasi tutti perdono.
 *
 *  - stalloni:   premi medi per figlio NATO (chi non ha mai corso conta zero),
 *                nati 2014-2019 (carriere quasi chiuse), e premi per euro di monta;
 *  - allenatori: ultimi 12 mesi, premi per cavallo allenato contro la spesa di un anno;
 *  - ippodromi:  ultimi 12 mesi, premi per partente e quota di partenti premiati;
 *  - aste:       i puledri venduti alle aste 2024 e 2025, premi vinti finora contro il prezzo.
 *
 * I conti sono pesanti (scorrono le corse di un anno): si tengono sei ore.
 */
import fs from "fs";
import path from "path";
import type { Express } from "express";
import { NUMERO_SQL } from "./simulatore";

const ORE6 = 6 * 60 * 60 * 1000;
const MEMO = new Map<string, { quando: number; v: any }>();
function memo<T>(k: string, f: () => T): T {
  const c = MEMO.get(k);
  if (c && Date.now() - c.quando < ORE6) return c.v;
  const v = f();
  MEMO.set(k, { quando: Date.now(), v });
  return v;
}
const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(10 * x) / 10;

export function stalloniRende(db: any) {
  return memo("stalloni", () => {
    const righe = db.prepare(`
      WITH nati AS (
        SELECT UPPER(TRIM(r.sire)) sire, r.rating_mode = 'performance' corso, COALESCE(h.career_earnings, 0) e
          FROM horse_ratings r LEFT JOIN horses h ON h.name = r.name AND h.birth_year = r.birth_year
         WHERE r.birth_year BETWEEN 2014 AND 2019 AND COALESCE(r.horse_class, 'athlete') = 'athlete'
           AND r.sire IS NOT NULL AND TRIM(r.sire) <> '')
      SELECT n.sire nome, COUNT(*) nati, AVG(n.corso) corsi, AVG(n.e) premi, SUM(n.e >= 50000) * 1.0 / COUNT(*) sopra50,
             SUM(n.e >= 100000) * 1.0 / COUNT(*) sopra100, MAX(s.stud_fee_eur) monta
        FROM nati n LEFT JOIN stallions s ON s.name = n.sire
       GROUP BY n.sire HAVING COUNT(*) >= 20`).all() as any[];
    const voci = righe.map(r => ({
      nome: r.nome, nati: r.nati, corsi: r1(100 * r.corsi), premi_per_nato: r0(r.premi),
      sopra_50mila: r1(100 * r.sopra50), sopra_100mila: r1(100 * r.sopra100),
      monta: r.monta > 0 ? r0(r.monta) : null,
      premi_per_euro_di_monta: r.monta > 0 ? Math.round(100 * r.premi / r.monta) / 100 : null,
    }));
    const media = voci.length ? r0(righe.reduce((t, r) => t + r.premi * r.nati, 0) / righe.reduce((t, r) => t + r.nati, 0)) : 0;
    return { annate: [2014, 2019], minimo_nati: 20, media_premi_per_nato: media, voci };
  });
}

export function allenatoriRende(db: any, mensile: number) {
  const base = memo("allenatori", () => {
    const fine = (db.prepare(`SELECT MAX(race_date) d FROM races`).get() as any)?.d;
    const per = db.prepare(`
      SELECT trainer t, horse_name c, SUM(COALESCE(prize_net, 0)) e, COUNT(*) p, SUM(placement = 1) v
        FROM races
       WHERE race_date > date(?, '-365 day') AND trainer IS NOT NULL AND TRIM(trainer) <> '' AND track <> 'ESTERO'
       GROUP BY trainer, horse_name`).all(fine) as any[];
    const m = new Map<string, { cav: number[]; p: number; v: number }>();
    for (const r of per) {
      const x = m.get(r.t) ?? { cav: [], p: 0, v: 0 };
      x.cav.push(r.e); x.p += r.p; x.v += r.v; m.set(r.t, x);
    }
    return { fine, m };
  });
  const spesa = 12 * mensile;
  const voci = [...base.m.entries()].filter(([, x]) => x.cav.length >= 10).map(([nome, x]) => {
    const tot = x.cav.reduce((a, b) => a + b, 0);
    const ord = [...x.cav].sort((a, b) => a - b);
    return {
      nome, cavalli: x.cav.length, partenze: x.p, vittorie: r1(100 * x.v / x.p),
      premi_per_cavallo: r0(tot / x.cav.length), premi_tipici: r0(ord[Math.floor(ord.length / 2)]),
      coprono_la_spesa: r1(100 * x.cav.filter(e => e >= spesa).length / x.cav.length),
    };
  });
  return { fino_al: base.fine, spesa_anno: spesa, minimo_cavalli: 10, voci };
}

export function ippodromiRende(db: any) {
  return memo("ippodromi", () => {
    const fine = (db.prepare(`SELECT MAX(race_date) d FROM races`).get() as any)?.d;
    const righe = db.prepare(`
      SELECT track nome, COUNT(DISTINCT race_date || '|' || (${NUMERO_SQL})) corse, COUNT(*) partenze,
             SUM(COALESCE(prize_net, 0)) premi, AVG(COALESCE(prize_net, 0) > 0) premiati
        FROM races
       WHERE race_date > date(?, '-365 day') AND track IS NOT NULL AND track <> 'ESTERO'
       GROUP BY track HAVING COUNT(*) >= 300`).all(fine) as any[];
    return {
      fino_al: fine, minimo_partenze: 300,
      voci: righe.map(r => ({
        nome: r.nome, corse: r.corse, partenze: r.partenze, partenti_per_corsa: r1(r.partenze / Math.max(1, r.corse)),
        premi_per_partente: r0(r.premi / r.partenze), premi_per_corsa: r0(r.premi / Math.max(1, r.corse)),
        premiati: r1(100 * r.premiati),
      })),
    };
  });
}

const norm = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
export function asteRende(db: any, root = process.cwd()) {
  return memo("aste", () => {
    const file = path.join(root, "aste_yearling.csv");
    if (!fs.existsSync(file)) return { voci: [], per_padre: [] };
    const righe = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    const testa = righe[0].split(",");
    const col = (n: string) => testa.indexOf(n);
    // CSV semplice: nessun campo con la virgola dentro le virgolette in questo file.
    const lotti = righe.slice(1).map(l => l.split(",")).filter(c => ["I", "L"].includes(c[col("generazione")]) && c[col("venduto")] === "si" && Number(c[col("prezzo_eur")]) > 0);
    const perNome = db.prepare(`SELECT name, career_earnings e, career_races n, sire FROM horses WHERE name = ? AND birth_year = ?`);
    const perMadre = db.prepare(`SELECT name, career_earnings e, career_races n, sire FROM horses WHERE UPPER(TRIM(dam)) = ? AND birth_year = ?`);
    const voci: any[] = [];
    for (const c of lotti) {
      const gen = c[col("generazione")];
      const nato = c[col("nato")];
      const anno = /\d{4}$/.test(nato) ? Number(nato.slice(-4)) : gen === "I" ? 2023 : 2024;
      const h = perNome.get(norm(c[col("puledro")]), anno) ?? (c[col("madre")] ? perMadre.get(norm(c[col("madre")]), anno) : null);
      if (!h) continue;
      const prezzo = Number(c[col("prezzo_eur")]);
      const premi = Math.round(h.e ?? 0);
      voci.push({
        nome: h.name, anno, asta: c[col("anno_asta")], padre: norm(c[col("padre")]), madre: norm(c[col("madre")]) || null,
        prezzo, premi, corse: h.n ?? 0, saldo: premi - prezzo, rende_per_euro: Math.round(100 * premi / prezzo) / 100,
      });
    }
    const pp = new Map<string, any[]>();
    for (const v of voci) pp.set(v.padre, [...(pp.get(v.padre) ?? []), v]);
    const per_padre = [...pp.entries()].filter(([, x]) => x.length >= 4).map(([nome, x]) => {
      const sp = x.reduce((t, v) => t + v.prezzo, 0), pr = x.reduce((t, v) => t + v.premi, 0);
      return { nome, lotti: x.length, prezzo_medio: r0(sp / x.length), premi_medi: r0(pr / x.length), rende_per_euro: Math.round(100 * pr / sp) / 100 };
    });
    return { lotti_venduti: lotti.length, ritrovati: voci.length, voci, per_padre };
  });
}

export function registraRende(app: Express, getDb: () => any) {
  const con = (f: (db: any) => any) => (_req: any, res: any) => {
    const db = getDb();
    try { res.json(f(db)); } catch (e: any) { res.status(500).json({ message: String(e?.message ?? e) }); } finally { db.close(); }
  };
  app.get("/api/rende/stalloni", con(stalloniRende));
  app.get("/api/rende/ippodromi", con(ippodromiRende));
  app.get("/api/rende/aste", con(db => asteRende(db)));
  app.get("/api/rende/allenatori", (req, res) => {
    const m = Math.min(10000, Math.max(100, Number(req.query.mensile) || 1200));
    con(db => allenatoriRende(db, m))(req, res);
  });
}
