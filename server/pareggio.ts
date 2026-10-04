/**
 * PUNTO DI PAREGGIO (break-even).
 *
 * Domanda del relatore: con una decisione manageriale, come capisco se un
 * cavallo o un incrocio mi fa andare in perdita, in pareggio o in profitto?
 *
 * IL CONTO. Un cavallo costa:
 *   ingresso                fino ai 2 anni: allevamento + monta, oppure il
 *                           prezzo pagato all'asta
 *   + 12 x costo mensile    un anno di allenamento prima del debutto
 *   + 12 x costo mensile x stagioni di corsa
 * e rende i premi netti vinti in carriera (la quota del proprietario: nella
 * circolare MASAF 2025-26 al proprietario vanno 42,5 parti su 50, il resto ad
 * allenatore e guidatore, ed e' proprio il rapporto netto/lordo dell'archivio).
 *
 * DA DOVE VENGONO I NUMERI. Dai cavalli nati fra il 2014 e il 2019, con
 * almeno una corsa (voto "da corsa"): l'archivio parte dal 2014 e a fine 2025
 * hanno almeno sei anni, quindi la carriera e' in gran parte conclusa. Per
 * ogni voto si guarda la distribuzione VERA di guadagni e stagioni, cavallo
 * per cavallo, non solo la media: cosi' si sa anche quanti, in quel voto, si
 * sono ripagati davvero.
 *
 * Il costo mensile e' la variabile che pesa di piu' e cambia molto da
 * scuderia a scuderia: per questo e' un parametro, non un numero fisso.
 *
 * Cosa NON c'e': rivendita del cavallo, valore di una femmina come fattrice,
 * premi all'allevatore. Sono tutti a favore, quindi il conto e' prudente.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export const IPOTESI = {
  /** Allevamento dalla monta ai 2 anni, monta esclusa: gestazione, parto,
   *  puledro con la madre, anno da yearling (listini CTS Moruzzo 2026 e
   *  UNIRE 2026, gia' usati nel capitolo economico). */
  allevamento_fino_2_anni: 14800,
  /** Allenamento e mantenimento al mese: circa 1.200 secondo il
   *  Coordinamento ippodromi (circa 15.000 l'anno). */
  costo_mensile: 1200,
  costo_mensile_basso: 800,
  /** Fascia attorno allo zero chiamata "pareggio": +-10% del costo. */
  fascia_pareggio: 0.10,
  annate: [2014, 2019] as [number, number],
  /** Peso del dato di popolazione quando i figli di uno stallone sono pochi:
   *  lo stesso usato per l'affidabilita' degli stalloni nel sito. */
  k_prior: 12.3,
};

export const FONTI = [
  { nome: "Coordinamento ippodromi (Gioconews): allenamento e cura circa 1.200 euro al mese, pensione circa 15.000 euro l'anno",
    url: "https://www.gioconews.it/news/ippica/riforma-e-rilancio-dell-ippica-le-proposte-di-d-alesio-coordinamento-ippodromi.aspx" },
  { nome: "Millionaire: mantenimento e allenamento di un trottatore circa 800 euro al mese (2010)",
    url: "https://www.millionaire.it/corri-cavallo-corri-ti-prego/" },
  { nome: "MASAF, circolare di programmazione corse al trotto 2025-2026: ripartizione dei premi fra proprietari, allenatori e guidatori",
    url: "https://www.masaf.gov.it/flex/cm/pages/ServeAttachment.php/L/IT/D/1%252F4%252Fc%252FD.139f4f4166e55d876476/P/BLOB:ID=22715/E/pdf?mode=download" },
  { nome: "Equestrian Insights: un puledro costa 15.000-20.000 euro prima di sapere se varra' qualcosa",
    url: "https://www.equestrianinsights.it/allevare-costi-e-considerazioni/" },
];

export const ORDINE_VOTI = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];

type Esito = "profitto" | "pareggio" | "perdita";

interface Carriera { e: number; s: number }

// ── Dati di base, letti una volta e tenuti in memoria ──────────────────────
let cache: {
  quando: number;
  perVoto: Record<string, Carriera[]>;
  nonCorsi: number;      // nati 2014-19 valutati solo su genealogia: mai corso
  corsi: number;
  montaMediana: number;
  astaMediana: number | null;
  astaN: number;
} | null = null;

function mediana(a: number[]): number {
  if (!a.length) return 0;
  const b = [...a].sort((x, y) => x - y);
  const m = Math.floor(b.length / 2);
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
}
const media = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function leggiAste(): { mediana: number | null; n: number } {
  // I prezzi delle aste ITS raccolti nel progetto (puledri venduti).
  try {
    const f = path.resolve(process.cwd(), "aste_yearling.csv");
    const righe = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    // Alcuni campi contengono virgole fra virgolette: si separano a mano.
    const campi = (r: string) => {
      const out: string[] = []; let cur = "", dentro = false;
      for (const ch of r) {
        if (ch === '"') dentro = !dentro;
        else if (ch === "," && !dentro) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur); return out;
    };
    const intest = campi(righe[0]);
    const iP = intest.indexOf("prezzo_eur"), iV = intest.indexOf("venduto");
    const prezzi = righe.slice(1).map(campi)
      .filter(c => c[iV] === "si" && Number(c[iP]) > 0).map(c => Number(c[iP]));
    return { mediana: prezzi.length ? mediana(prezzi) : null, n: prezzi.length };
  } catch {
    return { mediana: null, n: 0 };
  }
}

export function datiBase(db: Database.Database) {
  if (cache && Date.now() - cache.quando < 60 * 60_000) return cache;
  const [da, a] = IPOTESI.annate;
  const righe = db.prepare(`
    SELECT grade, COALESCE(career_earnings, 0) e, COALESCE(stagioni_corse, 0) s
      FROM horse_ratings
     WHERE birth_year BETWEEN ? AND ? AND rating_mode = 'performance'
       AND COALESCE(horse_class, 'athlete') = 'athlete'
  `).all(da, a) as { grade: string; e: number; s: number }[];
  const perVoto: Record<string, Carriera[]> = {};
  for (const r of righe) {
    if (!ORDINE_VOTI.includes(r.grade)) continue;
    (perVoto[r.grade] ??= []).push({ e: r.e, s: r.s });
  }
  const nonCorsi = (db.prepare(`
    SELECT COUNT(*) n FROM horse_ratings
     WHERE birth_year BETWEEN ? AND ? AND rating_mode = 'pedigree'
       AND COALESCE(horse_class, 'athlete') = 'athlete'
  `).get(da, a) as any).n as number;
  const monte = (db.prepare(`SELECT stud_fee_eur f FROM stallions WHERE stud_fee_eur > 0`).all() as any[]).map(r => r.f);
  const aste = leggiAste();
  cache = {
    quando: Date.now(), perVoto, nonCorsi, corsi: righe.length,
    montaMediana: mediana(monte), astaMediana: aste.mediana, astaN: aste.n,
  };
  return cache;
}

function esito(utile: number, costo: number): Esito {
  if (Math.abs(utile) <= IPOTESI.fascia_pareggio * costo) return "pareggio";
  return utile > 0 ? "profitto" : "perdita";
}

const costoCarriera = (ingresso: number, mensile: number, stagioni: number) =>
  ingresso + 12 * mensile * (stagioni + 1);

/** Per ogni voto: quanto guadagna, quanto costa, quanti si ripagano. */
export function tabellaVoti(db: Database.Database, mensile: number, ingresso: number) {
  const b = datiBase(db);
  const voti = ORDINE_VOTI.filter(v => b.perVoto[v]?.length).map(v => {
    const c = b.perVoto[v];
    const costi = c.map(x => costoCarriera(ingresso, mensile, x.s));
    const utili = c.map((x, i) => x.e - costi[i]);
    const costoMed = mediana(costi), utileMed = mediana(utili);
    return {
      voto: v,
      n: c.length,
      guadagno_mediano: Math.round(mediana(c.map(x => x.e))),
      stagioni_mediane: mediana(c.map(x => x.s)),
      guadagno_per_stagione: Math.round(mediana(c.filter(x => x.s > 0).map(x => x.e / x.s))),
      costo_mediano: Math.round(costoMed),
      utile_mediano: Math.round(utileMed),
      utile_medio: Math.round(media(utili)),
      pct_in_utile: Math.round(1000 * utili.filter(u => u > 0).length / c.length) / 10,
      esito: esito(utileMed, costoMed),
    };
  });
  // Il primo voto, dall'alto, in cui il cavallo tipico non e' piu' in perdita.
  const ultimoNonInPerdita = [...voti].reverse().find(v => v.esito !== "perdita")?.voto ?? null;
  return { voti, voto_di_pareggio: ultimoNonInPerdita };
}

export function soglie(mensile: number, ingresso: number, stagioni = 5) {
  return {
    carriera: Math.round(costoCarriera(ingresso, mensile, stagioni)),
    stagioni_ipotizzate: stagioni,
    annuale: Math.round(12 * mensile),
  };
}

/** Un cavallo preciso: tenerlo o fermarlo, e com'e' messo il suo bilancio. */
export function valutaCavallo(db: Database.Database, nome: string, anno: number | null,
                              mensile: number, ingresso: number) {
  const h = db.prepare(`
    SELECT name, birth_year, grade, rating_mode, COALESCE(career_earnings, 0) e,
           COALESCE(stagioni_corse, 0) s, COALESCE(career_races, 0) gare, sire
      FROM horse_ratings
     WHERE name = ? ${anno ? "AND birth_year = ?" : ""}
     ORDER BY rating_mode = 'performance' DESC, birth_year DESC LIMIT 1
  `).get(...(anno ? [nome, anno] : [nome])) as any;
  if (!h) return null;
  const ultimi12 = (db.prepare(`
    SELECT COALESCE(SUM(prize_net), 0) g, COUNT(*) n, MAX(race_date) ultima
      FROM races WHERE horse_name = ? AND race_date >= date('now', '-365 day')
  `).get(h.name) as any);
  const costoAnno = 12 * mensile;
  const speso = costoCarriera(ingresso, mensile, h.s);
  const bilancio = h.e - speso;
  const tab = tabellaVoti(db, mensile, ingresso).voti.find(v => v.voto === h.grade);
  return {
    nome: h.name, anno: h.birth_year, voto: h.grade,
    voto_da_corsa: h.rating_mode === "performance",
    gare: h.gare, stagioni: h.s, guadagni_carriera: Math.round(h.e),
    ultimi_12_mesi: { guadagni: Math.round(ultimi12.g), gare: ultimi12.n, ultima_gara: ultimi12.ultima },
    // Decisione 1: le spese passate non contano piu'. Conviene tenerlo solo
    // se in un anno rende almeno quanto costa in un anno.
    gestione: {
      costo_annuo: Math.round(costoAnno),
      rendimento_annuo: Math.round(ultimi12.g),
      differenza: Math.round(ultimi12.g - costoAnno),
      esito: ultimi12.n === 0 ? null : esito(ultimi12.g - costoAnno, costoAnno),
    },
    // Decisione 2: il bilancio di tutta la carriera fin qui.
    carriera: {
      speso_stimato: Math.round(speso),
      bilancio: Math.round(bilancio),
      esito: esito(bilancio, speso),
      mancano_per_pareggio: Math.max(0, Math.round(-bilancio)),
    },
    tipico_del_voto: tab ?? null,
  };
}

/** Un incrocio: la probabilita' di ogni esito, pesata sui figli dello
 *  stallone (e della fattrice, se indicata). */
export function valutaIncrocio(db: Database.Database, padre: string, madre: string | null,
                               mensile: number, montaOverride: number | null) {
  const b = datiBase(db);
  const s = db.prepare(`SELECT name, stud_fee_eur f FROM stallions WHERE name = ?`).get(padre) as any;
  const monta = montaOverride ?? (s?.f > 0 ? s.f : null) ?? b.montaMediana;
  const montaDaCatalogo = montaOverride == null && s?.f > 0;
  const ingresso = IPOTESI.allevamento_fino_2_anni + monta;

  // Figli osservati, per voto. Si contano tutte le annate con un voto
  // (fino al 2021: dopo, troppo giovani per aver debuttato tutti), e chi non ha mai corso a parte.
  const figli = (col: "sire" | "dam", nome: string) => db.prepare(`
    SELECT CASE WHEN rating_mode = 'performance' THEN grade ELSE 'NON_CORSO' END g, COUNT(*) n
      FROM horse_ratings
     WHERE ${col} = ? AND birth_year BETWEEN 2012 AND 2021
       AND COALESCE(horse_class, 'athlete') = 'athlete'
     GROUP BY 1
  `).all(nome) as { g: string; n: number }[];
  const conta: Record<string, number> = {};
  let nPadre = 0, nMadre = 0;
  for (const r of figli("sire", padre)) { conta[r.g] = (conta[r.g] ?? 0) + r.n; nPadre += r.n; }
  if (madre) for (const r of figli("dam", madre)) { conta[r.g] = (conta[r.g] ?? 0) + r.n; nMadre += r.n; }
  const n = nPadre + nMadre;

  // Popolazione: nati 2014-19, gli stessi da cui vengono i conti.
  const pop: Record<string, number> = {};
  const totPop = b.corsi + b.nonCorsi;
  for (const v of ORDINE_VOTI) pop[v] = (b.perVoto[v]?.length ?? 0) / totPop;
  pop.NON_CORSO = b.nonCorsi / totPop;

  // Pochi figli = poco affidabile: ci si appoggia alla popolazione.
  const k = IPOTESI.k_prior;
  const prob: Record<string, number> = {};
  for (const g of [...ORDINE_VOTI, "NON_CORSO"]) prob[g] = ((conta[g] ?? 0) + k * pop[g]) / (n + k);

  // Per ogni voto: utile medio e quota in utile, con l'ingresso di questo incrocio.
  const esiti = ORDINE_VOTI.filter(v => b.perVoto[v]?.length).map(v => {
    const c = b.perVoto[v];
    const utili = c.map(x => x.e - costoCarriera(ingresso, mensile, x.s));
    return { voto: v, p: prob[v], utile_medio: media(utili), utile_mediano: mediana(utili),
             quota_utile: utili.filter(u => u > 0).length / c.length };
  });
  // Chi non corre mai: allevato fino ai 2 anni e un anno di allenamento, poi si ferma.
  const costoNonCorso = ingresso + 12 * mensile;
  const utileAtteso = esiti.reduce((t, x) => t + x.p * x.utile_medio, 0) + prob.NON_CORSO * -costoNonCorso;
  const probProfitto = esiti.reduce((t, x) => t + x.p * x.quota_utile, 0);
  const costoAtteso = esiti.reduce((t, x) => {
    const c = b.perVoto[x.voto];
    return t + x.p * media(c.map(y => costoCarriera(ingresso, mensile, y.s)));
  }, 0) + prob.NON_CORSO * costoNonCorso;

  return {
    padre, madre, monta: Math.round(monta), monta_da_catalogo: montaDaCatalogo,
    ingresso: Math.round(ingresso),
    figli_osservati: { padre: nPadre, madre: nMadre },
    affidabilita: Math.round(100 * n / (n + k)) / 100,
    probabilita: [...esiti.map(x => ({ voto: x.voto, p: Math.round(1000 * x.p) / 10 })),
                  { voto: "Non corre", p: Math.round(1000 * prob.NON_CORSO) / 10 }],
    costo_atteso: Math.round(costoAtteso),
    utile_atteso: Math.round(utileAtteso),
    prob_profitto: Math.round(1000 * probProfitto) / 10,
    esito: esito(utileAtteso, costoAtteso),
    // La monta pesa euro per euro su ogni esito: il prezzo che azzera
    // l'utile atteso e' quello attuale piu' l'utile atteso.
    monta_massima_di_pareggio: Math.round(monta + utileAtteso),
  };
}

export function ipotesiCorrenti(db: Database.Database) {
  const b = datiBase(db);
  return {
    ...IPOTESI,
    monta_mediana: b.montaMediana,
    asta_mediana: b.astaMediana,
    asta_n: b.astaN,
    cavalli_osservati: b.corsi,
    cavalli_mai_corsi: b.nonCorsi,
    fonti: FONTI,
  };
}
