/**
 * PORTAFOGLIO DELLA SCUDERIA (e rischio della scuderia).
 *
 * L'utente mette insieme i suoi cavalli: cavalli dell'archivio (per nome) o
 * puledri non ancora in archivio (padre, madre, anno di nascita). Per ognuno:
 *
 *  PROSSIMI 12 MESI (la cassa)
 *   - cavallo in attivita': i premi attesi sono la stima del sito (tabella
 *     stima_premi, la stessa di "Tenere o fermare"); la distribuzione e'
 *     quella VERA dei cavalli con stima simile nel periodo di prova (i 19
 *     percentili salvati in modelli/premi_verifica.json), riportata alla
 *     stima del cavallo;
 *   - puledro: si pesca un cavallo vero fra i figli dello stesso padre nati
 *     2018-2022 (con peso n / (n + 30), come la simulazione della generazione
 *     M) o fra tutti i nati, e se ne prendono i premi a 2 e 3 anni, nella
 *     parte di stagione che cade nei prossimi 12 mesi;
 *   - costo: 12 x costo mensile.
 *  Poi si simulano 5.000 anni della scuderia intera, sommando i cavalli.
 *  IPOTESI DICHIARATA: i cavalli sono trattati come indipendenti fra loro.
 *  Nella realta' chi ha lo stesso allenatore o corre sulle stesse piste tende
 *  ad andare bene o male insieme: il rischio vero e' un po' piu' alto.
 *
 *  CARRIERA (il patrimonio)
 *   - cavallo in attivita': premi che puo' ancora vincere (tabella
 *     valore_residuo) meno l'allenamento degli anni in cui restera' in
 *     attivita';
 *   - puledro: il valore atteso di "Quanto vale un puledro".
 */
import type Database from "better-sqlite3";
import { fasciaDi } from "./previsioni";
import { valutaPuledro, FATTORE_ASTA } from "./pareggio";

export interface VoceScuderia {
  id?: string;
  tipo: "cavallo" | "puledro";
  nome?: string | null;
  anno?: number | null;
  padre?: string | null;
  madre?: string | null;
  prezzo?: number | null;
  asta?: boolean;
  mensile?: number | null;
}

const SIMULAZIONI = 5000;
const K_PADRE = 30;

// Generatore di numeri casuali con seme: stesso risultato a ogni richiesta.
function rng(seme: number) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quantile = (ordinati: Float64Array | number[], q: number) => {
  if (!ordinati.length) return 0;
  const i = Math.min(ordinati.length - 1, Math.max(0, Math.round(q * (ordinati.length - 1))));
  return ordinati[i];
};

/** Un valore dalla distribuzione descritta dai percentili 5%..95%. Sotto il
 *  5% si scende verso zero, sopra il 95% si allunga la coda (i cavalli che
 *  vanno molto meglio del previsto esistono, e pesano sulla media). */
function daPercentili(q: number[], u: number) {
  const n = q.length;               // 19: 5%, 10%, ..., 95%
  if (u <= 0.05) return q[0] * (u / 0.05);
  if (u >= 0.95) {
    const passo = Math.max(q[n - 1] - q[n - 2], 0.1 * q[n - 1]);
    return q[n - 1] + passo * 6 * ((u - 0.95) / 0.05) ** 2;
  }
  const pos = (u - 0.05) / 0.05;
  const i = Math.floor(pos), r = pos - i;
  return q[i] + (q[Math.min(i + 1, n - 1)] - q[i]) * r;
}

// ── Dati per i puledri: premi a 2 e 3 anni dei nati 2018-2022 ─────────────
let cachePuledri: {
  quando: number;
  tutti: { p2: number; p3: number }[];
  perPadre: Map<string, { p2: number; p3: number }[]>;
  quota2: number[];   // per ogni giorno dell'anno: quota dei premi dei 2 anni vinta entro quel giorno
  quota3: number[];
} | null = null;

function datiPuledri(db: Database.Database) {
  if (cachePuledri && Date.now() - cachePuledri.quando < 6 * 3600_000) return cachePuledri;
  const righe = db.prepare(`
    SELECT h.name, h.sire padre,
           COALESCE(SUM(CASE WHEN CAST(substr(r.race_date,1,4) AS INT) - h.birth_year = 2 THEN r.prize_net END), 0) p2,
           COALESCE(SUM(CASE WHEN CAST(substr(r.race_date,1,4) AS INT) - h.birth_year = 3 THEN r.prize_net END), 0) p3
      FROM horses h LEFT JOIN races r ON r.horse_name = h.name
     WHERE h.birth_year BETWEEN 2018 AND 2022 AND COALESCE(h.horse_class, 'athlete') = 'athlete'
     GROUP BY h.name, h.birth_year`).all() as { name: string; padre: string | null; p2: number; p3: number }[];
  const tutti = righe.map(r => ({ p2: r.p2, p3: r.p3 }));
  const perPadre = new Map<string, { p2: number; p3: number }[]>();
  for (const r of righe) {
    if (!r.padre) continue;
    const k = r.padre.toUpperCase();
    if (!perPadre.has(k)) perPadre.set(k, []);
    perPadre.get(k)!.push({ p2: r.p2, p3: r.p3 });
  }
  // Quando arrivano i premi dei giovani nella stagione: ultimo anno completo.
  const anno = new Date().getFullYear() - 1;
  const quota = (eta: number) => {
    const giorni = db.prepare(`
      SELECT CAST(strftime('%j', r.race_date) AS INT) g, SUM(r.prize_net) p
        FROM races r JOIN horses h ON h.name = r.horse_name
       WHERE substr(r.race_date,1,4) = ? AND h.birth_year = ?
       GROUP BY 1`).all(String(anno), anno - eta) as { g: number; p: number }[];
    const v = new Array(367).fill(0);
    for (const x of giorni) v[x.g] += x.p;
    const tot = v.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    return v.map(x => (acc += x) / tot);
  };
  cachePuledri = { quando: Date.now(), tutti, perPadre, quota2: quota(2), quota3: quota(3) };
  return cachePuledri;
}

function giornoAnno(d = new Date()) {
  const inizio = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - inizio.getTime()) / 86400000);
}

// ── Una voce della scuderia ────────────────────────────────────────────────
interface VoceValutata {
  id: string;
  tipo: "cavallo" | "puledro";
  nome: string;
  anno: number | null;
  eta: number | null;
  padre: string | null;
  madre: string | null;
  voto: string | null;
  prezzo: number | null;
  asta: boolean;
  mensile: number;
  costo_12: number;
  premi_attesi_12: number;
  saldo_atteso_12: number;
  prob_copre: number;
  premi_12_basso: number;
  premi_12_alto: number;
  fonte: string;
  carriera: { premi_futuri: number; allenamento_futuro: number; valore: number; anni_attesi: number | null } | null;
  guadagni_finora: number | null;
  nota: string | null;
  campioni: Float64Array;
}

function valutaVoce(db: Database.Database, v: VoceScuderia, i: number, mensileBase: number, casuale: () => number): VoceValutata | null {
  const mensile = v.mensile && v.mensile > 0 ? v.mensile : mensileBase;
  const costo = 12 * mensile;
  const annoOggi = new Date().getFullYear();
  const campioni = new Float64Array(SIMULAZIONI);
  let tipo = v.tipo;
  let nome = v.tipo === "cavallo" ? (v.nome ?? "").trim().toUpperCase() : (v.nome ?? "").trim();
  let padre = (v.padre ?? "").trim().toUpperCase() || null;
  let madre = (v.madre ?? "").trim().toUpperCase() || null;
  let anno = v.anno ?? null;
  let voto: string | null = null;
  let guadagni: number | null = null;
  let nota: string | null = null;
  let fonte = "";
  let carriera: VoceValutata["carriera"] = null;

  let stima: any = null;
  if (tipo === "cavallo") {
    const h = db.prepare(`SELECT name, birth_year, sire, dam, COALESCE(career_earnings,0) e, COALESCE(career_races,0) gare
                            FROM horses WHERE name = ? ${anno ? "AND birth_year = ?" : ""} ORDER BY birth_year DESC LIMIT 1`)
      .get(...(anno ? [nome, anno] : [nome])) as any;
    if (!h) return null;
    nome = h.name; anno = h.birth_year; padre = h.sire ? String(h.sire).toUpperCase() : null;
    madre = h.dam ? String(h.dam).toUpperCase() : null; guadagni = Math.round(h.e);
    voto = (db.prepare(`SELECT grade FROM horse_ratings WHERE name = ? AND birth_year = ? ORDER BY rating_mode = 'performance' DESC LIMIT 1`)
      .get(h.name, h.birth_year) as any)?.grade ?? null;
    stima = db.prepare(`SELECT premi_attesi FROM stima_premi WHERE horse_name = ?`).get(h.name) as any;
    // Non ha mai corso ed e' giovane: si tratta come un puledro, dal pedigree.
    if (!stima && h.gare === 0 && annoOggi - h.birth_year <= 3 && padre) tipo = "puledro";
  }
  const eta = anno ? annoOggi - anno : null;

  if (tipo === "cavallo") {
    if (stima) {
      const attesi = Number(stima.premi_attesi) || 0;
      const f = fasciaDi(attesi);
      if (f?.percentili?.length && attesi > 0) {
        for (let s = 0; s < SIMULAZIONI; s++) campioni[s] = daPercentili(f.percentili, casuale());
        const m = campioni.reduce((a, b) => a + b, 0) / SIMULAZIONI;
        if (m > 0) for (let s = 0; s < SIMULAZIONI; s++) campioni[s] *= attesi / m;
      }
      fonte = "stima del sito per i prossimi 12 mesi";
    } else {
      fonte = "nessuna stima";
      nota = "Non ha corso nell'ultimo anno: nei prossimi 12 mesi si conta solo il costo.";
    }
    const vr = db.prepare(`SELECT residuo, anni_attesi FROM valore_residuo WHERE horse_name = ?`).get(nome) as any;
    if (vr) {
      const allen = 12 * mensile * (Number(vr.anni_attesi) || 0);
      carriera = { premi_futuri: Math.round(vr.residuo), allenamento_futuro: Math.round(allen),
                   valore: Math.round(vr.residuo - allen), anni_attesi: vr.anni_attesi };
    }
  } else {
    if (!padre) return null;
    const d = datiPuledri(db);
    const figli = d.perPadre.get(padre) ?? [];
    const peso = figli.length / (figli.length + K_PADRE);
    const g = giornoAnno();
    const fatt = v.asta ? FATTORE_ASTA : 1;
    // Quale parte della stagione dei 2 e dei 3 anni cade nei prossimi 12 mesi.
    let w2 = 0, w3 = 0;
    if (eta === 1) w2 = d.quota2[g];
    else if (eta === 2) { w2 = 1 - d.quota2[g]; w3 = d.quota3[g]; }
    else if (eta != null && eta >= 3) w3 = 1;
    for (let s = 0; s < SIMULAZIONI; s++) {
      const pool = figli.length && casuale() < peso ? figli : d.tutti;
      const x = pool[Math.floor(casuale() * pool.length)];
      campioni[s] = fatt * (w2 * x.p2 + w3 * x.p3);
    }
    fonte = figli.length ? `figli di ${padre} (${figli.length}, peso ${Math.round(peso * 100)}%) e tutti i nati` : "tutti i nati (padre senza figli in archivio)";
    if (eta != null && eta <= 0) nota = "Non ancora nato o appena nato: nei prossimi 12 mesi solo costi.";
    else if (eta === 1) nota = `Nei prossimi 12 mesi arriva solo l'inizio della stagione dei 2 anni (circa il ${Math.round(100 * w2)}% dei premi dei 2 anni).`;
    const vp = valutaPuledro(db, padre, madre, mensile, { asta: !!v.asta });
    carriera = { premi_futuri: vp.premi_attesi, allenamento_futuro: vp.allenamento_atteso, valore: vp.valore_atteso, anni_attesi: null };
  }

  const ord = Float64Array.from(campioni).sort();
  const attesi = campioni.reduce((a, b) => a + b, 0) / SIMULAZIONI;
  const copre = campioni.filter(x => x >= costo).length / SIMULAZIONI;
  return {
    id: v.id ?? String(i), tipo, nome, anno, eta, padre, madre, voto,
    prezzo: v.prezzo != null && v.prezzo > 0 ? Math.round(v.prezzo) : null,
    asta: !!v.asta, mensile, costo_12: Math.round(costo),
    premi_attesi_12: Math.round(attesi), saldo_atteso_12: Math.round(attesi - costo),
    prob_copre: Math.round(1000 * copre) / 10,
    premi_12_basso: Math.round(quantile(ord, 0.1)), premi_12_alto: Math.round(quantile(ord, 0.9)),
    fonte, carriera, guadagni_finora: guadagni, nota, campioni,
  };
}

function riassunto(voci: VoceValutata[]) {
  const costo = voci.reduce((t, v) => t + v.costo_12, 0);
  const saldi = new Float64Array(SIMULAZIONI);
  for (const v of voci) for (let s = 0; s < SIMULAZIONI; s++) saldi[s] += v.campioni[s];
  for (let s = 0; s < SIMULAZIONI; s++) saldi[s] -= costo;
  const ord = Float64Array.from(saldi).sort();
  const premi = voci.reduce((t, v) => t + v.premi_attesi_12, 0);
  const inPari = saldi.filter(x => x >= 0).length / SIMULAZIONI;
  const perdeMeta = saldi.filter(x => x <= -0.5 * costo).length / SIMULAZIONI;
  return {
    cavalli: voci.length,
    costo_12: Math.round(costo),
    premi_attesi_12: Math.round(premi),
    saldo_atteso_12: Math.round(premi - costo),
    saldo_basso: Math.round(quantile(ord, 0.1)),
    saldo_mediano: Math.round(quantile(ord, 0.5)),
    saldo_alto: Math.round(quantile(ord, 0.9)),
    prob_in_pari: Math.round(1000 * inPari) / 10,
    prob_perde_meta: Math.round(1000 * perdeMeta) / 10,
    ord,
  };
}

export function valutaScuderia(db: Database.Database, vociIn: VoceScuderia[], mensile: number) {
  const casuale = rng(20261018);
  const voci: VoceValutata[] = [];
  const nonTrovati: string[] = [];
  vociIn.slice(0, 60).forEach((v, i) => {
    const r = valutaVoce(db, v, i, mensile, casuale);
    if (r) voci.push(r); else nonTrovati.push(v.nome || v.padre || `voce ${i + 1}`);
  });
  if (!voci.length) return { vuota: true, non_trovati: nonTrovati };

  const tot = riassunto(voci);
  // Istogramma del saldo dei prossimi 12 mesi, 24 colonne.
  const lo = quantile(tot.ord, 0.01), hi = quantile(tot.ord, 0.99);
  const passo = Math.max(1, (hi - lo) / 24);
  const colonne = Array.from({ length: 24 }, (_, k) => ({ da: Math.round(lo + k * passo), a: Math.round(lo + (k + 1) * passo), quota: 0 }));
  for (let j = 0; j < tot.ord.length; j++) {
    const x = tot.ord[j];
    const k = Math.min(23, Math.max(0, Math.floor((x - lo) / passo)));
    colonne[k].quota += 1 / SIMULAZIONI;
  }
  colonne.forEach(c => { c.quota = Math.round(1000 * c.quota) / 10; });

  // Concentrazione: quanta parte dei premi attesi viene dal cavallo migliore.
  const ordinati = [...voci].sort((a, b) => b.premi_attesi_12 - a.premi_attesi_12);
  const quotaMigliore = tot.premi_attesi_12 > 0 ? ordinati[0].premi_attesi_12 / tot.premi_attesi_12 : 0;
  // Senza il cavallo migliore: quanto e' fragile la scuderia.
  const senzaMigliore = voci.length > 1 ? riassunto(voci.filter(v => v !== ordinati[0])) : null;

  // Fermare: i cavalli in corsa che in media non coprono il loro costo e lo
  // coprono in meno di un caso su tre. I puledri no: fermare un puledro e'
  // un'altra decisione (si vende), la carriera non e' ancora iniziata.
  const daFermare = voci.filter(v => v.tipo === "cavallo" && v.saldo_atteso_12 < 0 && v.prob_copre < 33);
  const restano = voci.filter(v => !daFermare.includes(v));
  const dopo = daFermare.length && restano.length ? riassunto(restano) : null;

  // Probabilita' media che un singolo cavallo copra il suo costo: per
  // confrontarla con quella della scuderia intera.
  const probMediaSingolo = voci.reduce((t, v) => t + v.prob_copre, 0) / voci.length;

  const carriere = voci.filter(v => v.carriera);
  const valoreCarriera = carriere.reduce((t, v) => t + (v.carriera?.valore ?? 0), 0);
  const pagati = voci.filter(v => v.prezzo != null);
  const pulisci = (r: ReturnType<typeof riassunto>) => { const { ord, ...resto } = r; return resto; };

  return {
    vuota: false,
    mensile,
    simulazioni: SIMULAZIONI,
    voci: voci.map(({ campioni, ...resto }) => resto),
    non_trovati: nonTrovati,
    prossimi_12_mesi: { ...pulisci(tot), istogramma: colonne, prob_media_singolo: Math.round(probMediaSingolo * 10) / 10 },
    rischio: {
      quota_migliore: Math.round(1000 * quotaMigliore) / 10,
      migliore: ordinati[0].nome,
      senza_migliore: senzaMigliore ? pulisci(senzaMigliore) : null,
      da_fermare: daFermare.map(v => ({ id: v.id, nome: v.nome, saldo_atteso_12: v.saldo_atteso_12, prob_copre: v.prob_copre })),
      dopo_aver_fermato: dopo ? pulisci(dopo) : null,
    },
    carriera: {
      valore_atteso: Math.round(valoreCarriera),
      cavalli_con_stima: carriere.length,
      premi_futuri: Math.round(carriere.reduce((t, v) => t + (v.carriera?.premi_futuri ?? 0), 0)),
      allenamento_futuro: Math.round(carriere.reduce((t, v) => t + (v.carriera?.allenamento_futuro ?? 0), 0)),
      prezzi_pagati: pagati.length ? Math.round(pagati.reduce((t, v) => t + (v.prezzo ?? 0), 0)) : null,
      cavalli_con_prezzo: pagati.length,
    },
    ipotesi: {
      indipendenti: true,
      fattore_asta: FATTORE_ASTA,
      k_padre: K_PADRE,
    },
  };
}

/** Una scuderia di esempio, per provare la pagina senza inserire nulla:
 *  cinque cavalli in attivita' con stime diverse e un puledro d'asta. */
export function scuderiaEsempio(db: Database.Database): VoceScuderia[] {
  const scelti: VoceScuderia[] = [];
  const fasce: [number, number][] = [[25000, 60000], [9000, 16000], [5000, 9000], [2000, 4500], [300, 1500]];
  for (const [da, a] of fasce) {
    const r = db.prepare(`SELECT s.horse_name n, h.birth_year y FROM stima_premi s JOIN horses h ON h.name = s.horse_name
                           WHERE s.premi_attesi BETWEEN ? AND ? AND s.eta BETWEEN 3 AND 7
                           ORDER BY s.horse_name LIMIT 1 OFFSET 7`).get(da, a) as any;
    if (r) scelti.push({ tipo: "cavallo", nome: r.n, anno: r.y });
  }
  scelti.push({ tipo: "puledro", nome: "Puledro d'esempio", padre: "NAD AL SHEBA", anno: new Date().getFullYear() - 1, asta: true, prezzo: 30000 });
  return scelti;
}
