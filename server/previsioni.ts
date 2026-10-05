/**
 * Previsioni dei modelli XGBoost lette dal sito.
 *
 *  - stima dei premi nei prossimi 12 mesi (tabella stima_premi, scritta di
 *    notte da stima_premi.py), con la probabilita' di coprire un costo dato;
 *  - pronostico dei primi tre per la prossima corsa e lo storico delle stime
 *    passate confrontate con l'arrivo (tabelle pronostico_top3*).
 *
 * La probabilita' di coprire i costi non viene da un secondo modello: si
 * guarda come sono andati davvero, nel periodo di prova, i cavalli con una
 * stima simile (le "fasce" salvate dall'allenamento).
 */
import type Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let _verificaPremi: any | null | undefined;
export function leggiVerificaPremi(): any | null {
  if (_verificaPremi !== undefined) return _verificaPremi;
  _verificaPremi = null;
  for (const p of [path.resolve(process.cwd(), "modelli", "premi_verifica.json"), path.resolve(process.cwd(), "..", "modelli", "premi_verifica.json")]) {
    try { _verificaPremi = JSON.parse(fs.readFileSync(p, "utf-8")); break; } catch { /* prossimo */ }
  }
  return _verificaPremi;
}

const tabella = (db: Database.Database, nome: string) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(nome);

/** P(premi >= soglia) dai percentili (5%..95%) dei cavalli con stima simile. */
export function probDaPercentili(q: number[], soglia: number): { p: number; estremo: "sotto" | "sopra" | null } {
  const ps = q.map((_, i) => 0.05 + 0.05 * i);
  if (soglia <= 0) return { p: 1, estremo: null };
  if (soglia <= q[0]) return { p: 0.95, estremo: "sopra" };
  if (soglia > q[q.length - 1]) return { p: 0.05, estremo: "sotto" };
  for (let i = 0; i < q.length - 1; i++) {
    if (q[i] < soglia && soglia <= q[i + 1]) {
      const F = ps[i] + (ps[i + 1] - ps[i]) * (soglia - q[i]) / (q[i + 1] - q[i]);
      return { p: 1 - F, estremo: null };
    }
  }
  return { p: 0.05, estremo: "sotto" };
}

export function fasciaDi(attesi: number) {
  const v = leggiVerificaPremi();
  const f: any[] = v?.fasce ?? [];
  if (!f.length) return null;
  return f.find((x, i) => attesi >= x.da && (attesi < x.a || i === f.length - 1)) ?? (attesi < f[0].da ? f[0] : f[f.length - 1]);
}

export function stimaPremiCavallo(db: Database.Database, nome: string, costoAnno: number) {
  if (!tabella(db, "stima_premi")) return null;
  const r = db.prepare("SELECT * FROM stima_premi WHERE horse_name = ?").get(nome) as any;
  if (!r) return null;
  const fascia = fasciaDi(r.premi_attesi);
  const prob = fascia ? probDaPercentili(fascia.percentili, costoAnno) : null;
  let motivi: any[] = [];
  try { motivi = JSON.parse(r.motivi || "[]"); } catch { /* niente */ }
  return {
    attesi: Math.round(r.premi_attesi),
    ultimo_anno: Math.round(r.premi_ultimo_anno),
    corse_ultimo_anno: r.corse_ultimo_anno,
    verificato: !!r.verificato,
    calcolato_il: r.calcolato_il,
    motivi,
    costo_anno: Math.round(costoAnno),
    saldo_atteso: Math.round(r.premi_attesi - costoAnno),
    prob_copre: prob ? Math.round(prob.p * 1000) / 10 : null,
    prob_estremo: prob?.estremo ?? null,
    // Meta' dei cavalli con stima simile ha vinto tra questi due importi.
    simili: fascia ? {
      n: fascia.n, basso: fascia.percentili[4], mediano: fascia.percentili[9], alto: fascia.percentili[14],
      zero: fascia.zero,
      percentili: fascia.percentili,
    } : null,
  };
}

export function pronosticoCavallo(db: Database.Database, nome: string) {
  let prossima: any = null;
  if (tabella(db, "pronostico_top3")) {
    const p = db.prepare(`
      SELECT p.*, (SELECT COUNT(*) FROM upcoming_races u WHERE u.track = p.track AND u.race_date = p.race_date AND u.race_time = p.race_time) partenti
        FROM pronostico_top3 p WHERE p.horse_name = ? AND p.race_date >= date('now')
       ORDER BY p.race_date, p.race_time LIMIT 1`).get(nome) as any;
    if (p) {
      let motivi: any[] = [];
      try { motivi = JSON.parse(p.motivi || "[]"); } catch { /* niente */ }
      prossima = {
        pista: p.track, data: p.race_date, ora: p.race_time, partenti: p.partenti,
        prob: p.partenti > 3 ? Math.round(p.prob * 1000) / 10 : null,
        affidabile: !!p.affidabile, n_corse: p.n_corse, motivi, verificato: !!p.verificato,
      };
    }
  }
  let storico: any[] = [];
  if (tabella(db, "pronostico_top3_storico")) {
    storico = (db.prepare(`
      SELECT s.race_date data, s.pista, s.corsa, s.prob, s.tipo, s.campo_completo,
             r.placement arrivo, r.placement_raw arrivo_testo
        FROM pronostico_top3_storico s
        JOIN races r ON r.horse_name = s.horse_name AND r.race_date = s.race_date AND r.track = s.pista
       WHERE s.horse_name = ? AND s.race_date < date('now')
       ORDER BY s.race_date DESC LIMIT 10`).all(nome) as any[]).map(s => ({
      data: s.data, pista: s.pista, tipo: s.tipo,
      prob: Math.round(s.prob * 1000) / 10,
      arrivo: s.arrivo != null ? `${s.arrivo}°` : s.arrivo_testo,
      top3: s.arrivo != null && s.arrivo >= 1 && s.arrivo <= 3,
    }));
  }
  return { prossima, storico };
}

// ── TENERE O FERMARE: tutti i cavalli in attivita' insieme ──────────────────

const esitoSaldo = (saldo: number, costo: number) =>
  Math.abs(saldo) <= 0.1 * costo ? "pareggio" : saldo > 0 ? "profitto" : "perdita";

/** Ogni cavallo stimato, con probabilita' ed esito al costo dato. */
function cavalliStimati(db: Database.Database, costoAnno: number) {
  if (!tabella(db, "stima_premi")) return [];
  const righe = db.prepare(`
    SELECT s.horse_name nome, s.premi_attesi attesi, s.premi_ultimo_anno ultimo, s.corse_ultimo_anno corse,
           s.eta, h.birth_year anno, h.sex sesso, h.sire padre,
           (SELECT grade FROM horse_ratings r WHERE r.name = s.horse_name AND r.rating_mode = 'performance' LIMIT 1) voto
      FROM stima_premi s LEFT JOIN horses h ON h.name = s.horse_name
  `).all() as any[];
  return righe.map(r => {
    const f = fasciaDi(r.attesi);
    const pr = f ? probDaPercentili(f.percentili, costoAnno) : null;
    const saldo = r.attesi - costoAnno;
    return {
      nome: r.nome, anno: r.anno, eta: r.eta, sesso: r.sesso, padre: r.padre, voto: r.voto,
      attesi: Math.round(r.attesi), ultimo: Math.round(r.ultimo), corse: r.corse,
      prob: pr ? Math.round(pr.p * 1000) / 10 : null, estremo: pr?.estremo ?? null,
      saldo: Math.round(saldo), esito: esitoSaldo(saldo, costoAnno),
    };
  });
}

export function tenereElenco(db: Database.Database, o: {
  costoAnno: number; etaMin?: number; etaMax?: number; padre?: string; sesso?: string; esito?: string;
  cerca?: string; ordina?: string; pagina?: number; perPagina?: number;
}) {
  let c = cavalliStimati(db, o.costoAnno);
  if (o.etaMin) c = c.filter(x => x.eta != null && x.eta >= o.etaMin!);
  if (o.etaMax) c = c.filter(x => x.eta != null && x.eta <= o.etaMax!);
  if (o.padre) c = c.filter(x => x.padre === o.padre);
  if (o.sesso) c = c.filter(x => (x.sesso ?? "").toUpperCase().startsWith(o.sesso!));
  if (o.cerca) { const q = o.cerca.toUpperCase(); c = c.filter(x => x.nome.includes(q)); }
  const conti = { perdita: 0, pareggio: 0, profitto: 0 } as Record<string, number>;
  for (const x of c) conti[x.esito]++;
  const totale = c.length;
  const probMedia = totale ? c.reduce((s, x) => s + (x.prob ?? 0), 0) / totale : null;
  if (o.esito) c = c.filter(x => x.esito === o.esito);
  const ord = o.ordina ?? "prob";
  const chiave: Record<string, (x: any) => number | string> = {
    prob: x => -(x.prob ?? -1), attesi: x => -x.attesi, saldo: x => -x.saldo, eta: x => x.eta ?? 99, nome: x => x.nome,
    peggiori: x => (x.prob ?? 101),
  };
  const k = chiave[ord] ?? chiave.prob;
  c.sort((a, b) => { const A = k(a), B = k(b); return A < B ? -1 : A > B ? 1 : (b.attesi - a.attesi) || a.nome.localeCompare(b.nome); });
  const per = o.perPagina ?? 50, pag = Math.max(1, o.pagina ?? 1);
  return {
    costo_anno: Math.round(o.costoAnno), totale, filtrati: c.length, conti,
    prob_media: probMedia != null ? Math.round(probMedia * 10) / 10 : null,
    pagina: pag, pagine: Math.max(1, Math.ceil(c.length / per)),
    righe: c.slice((pag - 1) * per, pag * per),
  };
}

/** Per stallone: quanti figli in attivita' hanno buone probabilita' di
 *  coprire le spese nei prossimi 12 mesi. Dato misurato sui figli che
 *  corrono, non una previsione dai genitori. */
export function tenereStalloni(db: Database.Database, costoAnno: number, minimo = 5) {
  const c = cavalliStimati(db, costoAnno);
  const g = new Map<string, any[]>();
  for (const x of c) if (x.padre) { if (!g.has(x.padre)) g.set(x.padre, []); g.get(x.padre)!.push(x); }
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const out = Array.from(g.entries()).filter(([, f]) => f.length >= minimo).map(([padre, f]) => ({
    padre, figli: f.length,
    attesi_mediani: Math.round(med(f.map(x => x.attesi))),
    prob_media: Math.round(10 * f.reduce((s, x) => s + (x.prob ?? 0), 0) / f.length) / 10,
    quota_probabili: Math.round(1000 * f.filter(x => (x.prob ?? 0) >= 50).length / f.length) / 10,
    in_utile: f.filter(x => x.esito === "profitto").length,
    in_pari: f.filter(x => x.esito === "pareggio").length,
    in_perdita: f.filter(x => x.esito === "perdita").length,
    saldo_medio: Math.round(f.reduce((s, x) => s + x.saldo, 0) / f.length),
    migliore: [...f].sort((a, b) => b.attesi - a.attesi)[0],
  }));
  out.sort((a, b) => b.prob_media - a.prob_media || b.figli - a.figli);
  return { costo_anno: Math.round(costoAnno), minimo, stalloni: out };
}

// ── CONTROLLO DEI MODELLI ───────────────────────────────────────────────────
export function controlloModelli(db: Database.Database) {
  if (!tabella(db, "controllo_modelli")) return { mesi: [] };
  return { mesi: db.prepare("SELECT * FROM controllo_modelli ORDER BY mese DESC, modello LIMIT 36").all() };
}
