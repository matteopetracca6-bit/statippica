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
import { stimaPremiCavallo } from "./previsioni";

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
                              mensile: number, ingressoDato: number | null, montaData: number | null = null) {
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
  // Costo fino ai 2 anni: se non e' dato, allevamento + la monta del padre
  // dal catalogo; se il padre non c'e' nel catalogo serve che la monta la
  // indichi l'utente, altrimenti il bilancio di carriera non si fa.
  const feePadre = h.sire ? (db.prepare(`SELECT stud_fee_eur f FROM stallions WHERE name = ?`).get(h.sire) as any)?.f : null;
  const montaPadre = montaData ?? (feePadre > 0 ? feePadre : null);
  const ingresso = ingressoDato ?? (montaPadre != null ? IPOTESI.allevamento_fino_2_anni + montaPadre : null);
  const costoAnno = 12 * mensile;
  // Premi dei prossimi 12 mesi: se c'e' la stima del modello si usa quella
  // (sbaglia meno di "vincera' quanto l'anno scorso", vedi stima_premi.py),
  // altrimenti si ripiega sui premi degli ultimi 12 mesi.
  const stima = ultimi12.n > 0 ? stimaPremiCavallo(db, h.name, costoAnno) : null;
  const rendimento = stima ? stima.attesi : ultimi12.g;
  const speso = ingresso != null ? costoCarriera(ingresso, mensile, h.s) : null;
  const bilancio = speso != null ? h.e - speso : null;
  const tab = ingresso != null ? tabellaVoti(db, mensile, ingresso).voti.find(v => v.voto === h.grade) : undefined;
  return {
    nome: h.name, anno: h.birth_year, voto: h.grade, padre: h.sire ?? null,
    ingresso: ingresso != null ? Math.round(ingresso) : null,
    monta: ingressoDato != null ? null : (montaPadre != null ? Math.round(montaPadre) : null),
    monta_da_catalogo: ingressoDato == null && montaData == null && feePadre > 0,
    monta_sconosciuta: ingresso == null,
    voto_da_corsa: h.rating_mode === "performance",
    gare: h.gare, stagioni: h.s, guadagni_carriera: Math.round(h.e),
    ultimi_12_mesi: { guadagni: Math.round(ultimi12.g), gare: ultimi12.n, ultima_gara: ultimi12.ultima },
    // Decisione 1: le spese passate non contano piu'. Conviene tenerlo solo
    // se in un anno rende almeno quanto costa in un anno.
    gestione: {
      costo_annuo: Math.round(costoAnno),
      rendimento_annuo: Math.round(rendimento),
      fonte: stima ? "modello" : "ultimi_12_mesi",
      prob_copre: stima?.prob_copre ?? null,
      prob_estremo: stima?.prob_estremo ?? null,
      differenza: Math.round(rendimento - costoAnno),
      esito: ultimi12.n === 0 ? null : esito(rendimento - costoAnno, costoAnno),
    },
    // Decisione 2: il bilancio di tutta la carriera fin qui.
    carriera: speso == null || bilancio == null ? null : {
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
  // Se la monta non e' nel catalogo e non la indica l'utente, non la si
  // inventa: si calcola con monta zero cio' che non dipende dal prezzo
  // (guadagno atteso, monta massima) e il resto resta vuoto.
  const montaNota = montaOverride ?? (s?.f > 0 ? s.f : null);
  const monta = montaNota ?? 0;
  const montaDaCatalogo = montaOverride == null && s?.f > 0;
  const ingresso = IPOTESI.allevamento_fino_2_anni + monta;

  // Figli osservati, per voto. Si contano tutte le annate con un voto
  // (fino al 2021: dopo, troppo giovani per aver debuttato tutti), e chi non ha mai corso a parte.
  // La madre sta nella tabella dei cavalli, non in quella dei voti: si uniscono.
  const figli = (col: "sire" | "dam", nome: string) => db.prepare(col === "sire" ? `
    SELECT CASE WHEN rating_mode = 'performance' THEN grade ELSE 'NON_CORSO' END g, COUNT(*) n
      FROM horse_ratings
     WHERE sire = ? AND birth_year BETWEEN 2012 AND 2021
       AND COALESCE(horse_class, 'athlete') = 'athlete'
     GROUP BY 1` : `
    SELECT CASE WHEN r.rating_mode = 'performance' THEN r.grade ELSE 'NON_CORSO' END g, COUNT(*) n
      FROM horse_ratings r JOIN horses h ON h.name = r.name AND h.birth_year = r.birth_year
     WHERE h.dam = ? AND r.birth_year BETWEEN 2012 AND 2021
       AND COALESCE(r.horse_class, 'athlete') = 'athlete'
     GROUP BY 1`).all(nome) as { g: string; n: number }[];
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

  const ignoto = montaNota == null;
  return {
    padre, madre, monta: ignoto ? null : Math.round(monta), monta_da_catalogo: montaDaCatalogo,
    monta_sconosciuta: ignoto,
    ingresso: ignoto ? null : Math.round(ingresso),
    guadagno_atteso: Math.round(utileAtteso + costoAtteso),
    figli_osservati: { padre: nPadre, madre: nMadre },
    affidabilita: Math.round(100 * n / (n + k)) / 100,
    probabilita: [...esiti.map(x => ({ voto: x.voto, p: Math.round(1000 * x.p) / 10 })),
                  { voto: "Non corre", p: Math.round(1000 * prob.NON_CORSO) / 10 }],
    costo_atteso: ignoto ? null : Math.round(costoAtteso),
    utile_atteso: ignoto ? null : Math.round(utileAtteso),
    prob_profitto: ignoto ? null : Math.round(1000 * probProfitto) / 10,
    esito: ignoto ? null : esito(utileAtteso, costoAtteso),
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

// ── VENDERE O FAR CORRERE ──────────────────────────────────────────────────
// La decisione arriva all'asta yearling (circa 18 mesi). A quel punto
// allevamento e monta sono gia' spesi: non contano piu', valgono per tutte e
// due le scelte. Si confronta:
//   VENDERE  = il prezzo incassato oggi
//   TENERE   = premi netti attesi - allenamento da qui in avanti
//              (12 mesi prima del debutto + 12 mesi per ogni stagione,
//              fermandolo quando una stagione dai 3 anni in su non rende
//              meta' del suo costo: vedi valutaPuledro)
// Le probabilita' di ogni voto vengono dai figli dello stallone (e della
// fattrice), come per l'incrocio.

interface Vendita { puledro: string; padre: string; prezzo: number }
let cacheAste: { quando: number; righe: Vendita[] } | null = null;
function venditeAste(): Vendita[] {
  if (cacheAste && Date.now() - cacheAste.quando < 60 * 60_000) return cacheAste.righe;
  let righe: Vendita[] = [];
  try {
    const f = path.resolve(process.cwd(), "aste_yearling.csv");
    const testo = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    const campi = (r: string) => {
      const out: string[] = []; let cur = "", dentro = false;
      for (const ch of r) {
        if (ch === '"') dentro = !dentro;
        else if (ch === "," && !dentro) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur); return out;
    };
    const i = campi(testo[0]);
    const iP = i.indexOf("prezzo_eur"), iV = i.indexOf("venduto"), iPad = i.indexOf("padre"), iN = i.indexOf("puledro");
    righe = testo.slice(1).map(campi)
      .filter(c => c[iV] === "si" && Number(c[iP]) > 0)
      .map(c => ({ puledro: c[iN].trim().toUpperCase(), padre: c[iPad].trim().toUpperCase(), prezzo: Number(c[iP]) }));
  } catch { /* file assente: nessun riferimento d'asta */ }
  cacheAste = { quando: Date.now(), righe };
  return righe;
}

/** Probabilita' di ogni voto (e di "non corre") per un figlio di padre x madre. */
const memoProb = new Map<string, { quando: number; r: ReturnType<typeof calcolaProbabilitaFiglio> }>();
function probabilitaFiglio(db: Database.Database, padre: string, madre: string | null) {
  const k = `${padre}|${madre ?? ""}`;
  const m = memoProb.get(k);
  if (m && Date.now() - m.quando < 60 * 60_000) return m.r;
  const r = calcolaProbabilitaFiglio(db, padre, madre);
  if (memoProb.size > 5000) memoProb.clear();
  memoProb.set(k, { quando: Date.now(), r });
  return r;
}
function calcolaProbabilitaFiglio(db: Database.Database, padre: string, madre: string | null) {
  const b = datiBase(db);
  // La madre sta nella tabella dei cavalli, non in quella dei voti: si uniscono.
  const figli = (col: "sire" | "dam", nome: string) => db.prepare(col === "sire" ? `
    SELECT CASE WHEN rating_mode = 'performance' THEN grade ELSE 'NON_CORSO' END g, COUNT(*) n
      FROM horse_ratings
     WHERE sire = ? AND birth_year BETWEEN 2012 AND 2021
       AND COALESCE(horse_class, 'athlete') = 'athlete'
     GROUP BY 1` : `
    SELECT CASE WHEN r.rating_mode = 'performance' THEN r.grade ELSE 'NON_CORSO' END g, COUNT(*) n
      FROM horse_ratings r JOIN horses h ON h.name = r.name AND h.birth_year = r.birth_year
     WHERE h.dam = ? AND r.birth_year BETWEEN 2012 AND 2021
       AND COALESCE(r.horse_class, 'athlete') = 'athlete'
     GROUP BY 1`).all(nome) as { g: string; n: number }[];
  const conta: Record<string, number> = {};
  let nPadre = 0, nMadre = 0;
  for (const r of figli("sire", padre)) { conta[r.g] = (conta[r.g] ?? 0) + r.n; nPadre += r.n; }
  if (madre) for (const r of figli("dam", madre)) { conta[r.g] = (conta[r.g] ?? 0) + r.n; nMadre += r.n; }
  const n = nPadre + nMadre;
  const pop: Record<string, number> = {};
  const totPop = b.corsi + b.nonCorsi;
  for (const v of ORDINE_VOTI) pop[v] = (b.perVoto[v]?.length ?? 0) / totPop;
  pop.NON_CORSO = b.nonCorsi / totPop;
  const k = IPOTESI.k_prior;
  const prob: Record<string, number> = {};
  for (const g of [...ORDINE_VOTI, "NON_CORSO"]) prob[g] = ((conta[g] ?? 0) + k * pop[g]) / (n + k);
  return { prob, nPadre, nMadre, affidabilita: Math.round(100 * n / (n + k)) / 100 };
}

function riepilogoPrezzi(p: number[]) {
  if (!p.length) return null;
  const s = [...p].sort((a, b) => a - b);
  return { n: s.length, mediana: Math.round(mediana(s)), minimo: s[0], massimo: s[s.length - 1] };
}

export function valutaVendita(db: Database.Database, padre: string, madre: string | null,
                              mensile: number, prezzoDato: number | null, puledro: string | null = null) {
  const b = datiBase(db);
  const { prob, nPadre, nMadre, affidabilita } = probabilitaFiglio(db, padre, madre);
  const aste = venditeAste();
  const venditaVera = puledro ? aste.find(a => a.puledro === puledro) ?? null : null;
  const astePadre = riepilogoPrezzi(aste.filter(a => a.padre === padre).map(a => a.prezzo));
  const asteTutte = riepilogoPrezzi(aste.map(a => a.prezzo));
  // Il prezzo non si inventa: o lo scrive l'utente, o e' quello pagato davvero
  // per questo puledro all'asta. Le aste del padre restano solo un riferimento.
  const prezzo = prezzoDato ?? venditaVera?.prezzo ?? null;
  const prezzoDa = prezzoDato != null ? "tu" : venditaVera ? "asta" : null;

  // Tenere: lo stesso conto di "Quanto vale un puledro" (valutaPuledro), con
  // la regola "lo fermo quando una stagione non rende": cosi' il prezzo a cui
  // conviene vendere e il prezzo massimo per chi compra sono lo stesso numero.
  const { esiti: tutti } = esitiPuledro(db, padre, madre, mensile, false);
  let valore = 0, guadagno = 0, costo = 0, pSupera = 0, pPositivo = 0;
  for (const x of tutti) {
    const netto = x.premiRegola - x.costoRegola;
    valore += x.p * netto; guadagno += x.p * x.premiRegola; costo += x.p * x.costoRegola;
    if (prezzo != null && netto > prezzo) pSupera += x.p;
    if (netto > 0) pPositivo += x.p;
  }
  const esiti = ORDINE_VOTI.filter(v => tutti.some(x => x.voto === v)).map(v => {
    const sel = tutti.filter(x => x.voto === v);
    const P = sel.reduce((t, x) => t + x.p, 0);
    return { voto: v, p: Math.round(1000 * P) / 10,
             netto_medio: Math.round(sel.reduce((t, x) => t + x.p * (x.premiRegola - x.costoRegola), 0) / (P || 1)) };
  });
  void b;
  const differenza = prezzo != null ? prezzo - valore : null;
  // Entro il 10% del costo atteso da qui: le due scelte si equivalgono.
  const decisione = differenza == null ? null
    : Math.abs(differenza) <= IPOTESI.fascia_pareggio * costo ? "indifferente"
    : differenza > 0 ? "vendere" : "tenere";
  return {
    padre, madre, mensile,
    figli_osservati: { padre: nPadre, madre: nMadre }, affidabilita,
    prezzo: prezzo != null ? Math.round(prezzo) : null, prezzo_da: prezzoDa,
    aste_padre: astePadre, aste_tutte: asteTutte,
    tenere: {
      valore_atteso: Math.round(valore),
      guadagno_atteso: Math.round(guadagno),
      costo_da_qui: Math.round(costo),
      prob_non_corre: Math.round(1000 * prob.NON_CORSO) / 10,
      prob_ripaga_allenamento: Math.round(1000 * pPositivo) / 10,
      prob_batte_prezzo: prezzo != null ? Math.round(1000 * pSupera) / 10 : null,
    },
    // Sotto questo prezzo conviene tenerlo (se il valore atteso e' positivo).
    prezzo_minimo: Math.max(0, Math.round(valore)),
    differenza: differenza != null ? Math.round(differenza) : null,
    decisione,
    esiti,
  };
}

/** Per gli stalloni con almeno 3 figli venduti all'asta: quanto paga il
 *  mercato contro quanto rende, in media, tenerne uno. */
export function mercatoStalloni(db: Database.Database, mensile: number) {
  const aste = venditeAste();
  const perPadre = new Map<string, number[]>();
  for (const a of aste) perPadre.set(a.padre, [...(perPadre.get(a.padre) ?? []), a.prezzo]);
  return [...perPadre.entries()].filter(([, p]) => p.length >= 3).map(([padre, p]) => {
    const r = valutaVendita(db, padre, null, mensile, mediana(p));
    return {
      padre, venduti: p.length, prezzo_mediano: Math.round(mediana(p)),
      valore_tenere: r.tenere.valore_atteso, differenza: r.differenza,
      prob_batte_prezzo: r.tenere.prob_batte_prezzo, figli: r.figli_osservati.padre, affidabilita: r.affidabilita,
    };
  }).sort((a, b) => (a.differenza ?? 0) - (b.differenza ?? 0));
}

// ── QUANTO PESA OGNI COSTO (analisi di sensibilita') ───────────────────────
// Il conto e' quello del punto di pareggio, fatto sul cavallo "qualunque":
// tutti i nati 2014-19, compresi quelli che non hanno mai corso. Utile medio
//   = premi medi - (ingresso + 12 x mensile x (stagioni + 1))
// e per chi non corre: - (ingresso + 12 x mensile).
// Il conto e' lineare, quindi l'effetto di ogni voce e' esatto: si muove una
// voce del 20% e si guarda di quanto si sposta l'utile medio.
export function sensibilita(db: Database.Database, mensile: number,
                            ingresso: { allevamento: number; monta: number } | { prezzo: number }) {
  const b = datiBase(db);
  const tutti: Carriera[] = Object.values(b.perVoto).flat();
  const n = tutti.length + b.nonCorsi;
  const premi = tutti.reduce((t, x) => t + x.e, 0) / n;
  // Mesi di allenamento medi per cavallo: (stagioni + 1) anni per chi corre, 1 per chi non corre.
  const anni = (tutti.reduce((t, x) => t + x.s + 1, 0) + b.nonCorsi) / n;
  const allenamento = 12 * mensile * anni;
  const voci: { chiave: string; nome: string; valore: number; ricavo: boolean }[] = [
    { chiave: "premi", nome: "Premi vinti", valore: premi, ricavo: true },
    { chiave: "mensile", nome: "Allenamento e mantenimento", valore: allenamento, ricavo: false },
  ];
  if ("prezzo" in ingresso) voci.push({ chiave: "prezzo", nome: "Prezzo d'acquisto all'asta", valore: ingresso.prezzo, ricavo: false });
  else {
    voci.push({ chiave: "allevamento", nome: "Allevamento fino ai 2 anni", valore: ingresso.allevamento, ricavo: false });
    voci.push({ chiave: "monta", nome: "Monta", valore: ingresso.monta, ricavo: false });
  }
  const costo = voci.filter(v => !v.ricavo).reduce((t, v) => t + v.valore, 0);
  const utile = premi - costo;
  const PASSO = 0.2;
  return {
    mensile, cavalli: n, anni_medi_di_allenamento: Math.round(anni * 10) / 10,
    utile_medio: Math.round(utile), premi_medi: Math.round(premi), costo_medio: Math.round(costo),
    passo: PASSO,
    voci: voci.map(v => ({
      chiave: v.chiave, nome: v.nome, ricavo: v.ricavo,
      valore: Math.round(v.valore),
      quota_del_costo: v.ricavo ? null : Math.round(1000 * v.valore / costo) / 10,
      // Effetto sull'utile medio se la voce sale o scende del 20%.
      effetto: Math.round(PASSO * v.valore),
      // Di quanto dovrebbe cambiare da sola per arrivare in pari (in %):
      // i premi devono salire, i costi scendere. Oltre il 100% di calo non basta nemmeno azzerarla.
      per_il_pareggio: utile >= 0 ? 0 : Math.round(1000 * (-utile) / v.valore) / 10,
    })).sort((a, b) => b.effetto - a.effetto),
  };
}

// ── QUANTO VALE UN PULEDRO: prezzo massimo per chi compra ──────────────────
// E' lo stesso conto di "vendere o far correre", visto da chi compra: il
// prezzo massimo e' quello che, in media, lascia il compratore in pari.
//   premi attesi        = somma su ogni esito (voto) di p(voto) x premi
//                         netti in carriera dei cavalli veri di quel voto
//   allenamento atteso  = 12 x mensile x (stagioni + 1) per chi corre,
//                         12 x mensile per chi non corre mai
//   prezzo massimo      = premi attesi / (1 + margine) - allenamento atteso
// Il margine e' l'utile che si vuole in piu' su tutto quello che si spende.
// I premi netti dell'archivio sono gia' la parte del proprietario.
//
// "Scelto all'asta": i puledri passati in asta vincono piu' di quanto dica
// il loro pedigree (1,44 volte a 2 anni per l'asta 2024, 1,49 per l'asta
// 2025 a stagione in corso, 1,37 a 3 anni per l'asta 2024 a stagione quasi
// finita: scripts/simula_generazione.py). Si usa 1,4 sui premi, i costi non
// cambiano. Dopo i 3 anni e' un'ipotesi: non c'e' ancora un'asta da cui
// controllarlo.
export const FATTORE_ASTA = 1.4;

const SCENARI = [
  { chiave: "campione", nome: "Campione", voti: ["SSS", "SS", "S"], nota: "voto S o meglio" },
  { chiave: "buono", nome: "Buono", voti: ["A", "B"], nota: "voto A o B" },
  { chiave: "discreto", nome: "Discreto", voti: ["C", "D"], nota: "voto C o D" },
  { chiave: "poco", nome: "Corre poco", voti: ["E", "F"], nota: "voto E o F" },
];
const PREZZI_CURVA = [0, 5000, 10000, 15000, 20000, 30000, 40000, 60000, 80000, 100000, 150000, 200000];

export interface EsitoPuledro { p: number; premi: number; costo: number; voto: string; s: number;
                               premiRegola: number; costoRegola: number }

// Le carriere stagione per stagione (nati 2014-2019, solo stagioni con
// almeno una corsa), per la regola "lo fermo quando una stagione non rende".
let cacheStagioni: { quando: number; perVoto: Record<string, number[][]> } | null = null;
function stagioniPerVoto(db: Database.Database) {
  if (cacheStagioni && Date.now() - cacheStagioni.quando < 60 * 60_000) return cacheStagioni.perVoto;
  const [da, a] = IPOTESI.annate;
  const righe = db.prepare(`
    SELECT hr.name n, hr.birth_year y, hr.grade g, CAST(substr(r.race_date,1,4) AS INT) - hr.birth_year eta,
           SUM(r.prize_net) p
      FROM horse_ratings hr JOIN races r ON r.horse_name = hr.name
     WHERE hr.birth_year BETWEEN ? AND ? AND hr.rating_mode = 'performance'
       AND COALESCE(hr.horse_class, 'athlete') = 'athlete'
       AND CAST(substr(r.race_date,1,4) AS INT) >= hr.birth_year + 2
     GROUP BY hr.name, hr.birth_year, eta
     ORDER BY hr.name, hr.birth_year, eta`).all(da, a) as { n: string; y: number; g: string; eta: number; p: number }[];
  const perVoto: Record<string, number[][]> = {};
  let chiave = "", corrente: number[] = [];
  for (const r of righe) {
    const k = `${r.n}|${r.y}`;
    if (k !== chiave) {
      corrente = [];
      chiave = k;
      if (ORDINE_VOTI.includes(r.g)) (perVoto[r.g] ??= []).push(corrente);
    }
    // Ogni stagione: [eta, premi].
    corrente.push(r.eta * 1e9 + Math.max(0, r.p || 0));
  }
  cacheStagioni = { quando: Date.now(), perVoto };
  return perVoto;
}

/** La regola del proprietario attento: dai 3 anni in su, se una stagione
 *  rende meno della meta' di quanto costa, a fine stagione il cavallo si
 *  ferma. Si decide solo con la stagione appena finita, senza sapere le
 *  successive. */
export const SOGLIA_FERMO = 0.5;
function conRegola(stagioni: number[], mensile: number, f: number) {
  const anno = 12 * mensile;
  let premi = 0, costo = anno;           // un anno di doma e preparazione prima del debutto
  for (const x of stagioni) {
    const eta = Math.floor(x / 1e9), p = (x % 1e9) * f;
    premi += p; costo += anno;
    if (eta >= 3 && p < SOGLIA_FERMO * anno) break;
  }
  return { premi, costo };
}

/** Tutti gli esiti possibili di un figlio di padre x madre, cavallo per
 *  cavallo, con il loro peso. Serve anche al portafoglio della scuderia. */
export function esitiPuledro(db: Database.Database, padre: string, madre: string | null,
                             mensile: number, asta: boolean) {
  const { prob, nPadre, nMadre, affidabilita } = probabilitaFiglio(db, padre, madre);
  const f = asta ? FATTORE_ASTA : 1;
  const st = stagioniPerVoto(db);
  const esiti: EsitoPuledro[] = [];
  for (const v of ORDINE_VOTI) {
    const c = st[v];
    if (!c?.length) continue;
    const w = prob[v] / c.length;
    for (const x of c) {
      const premi = x.reduce((t, y) => t + (y % 1e9), 0) * f;
      const r = conRegola(x, mensile, f);
      esiti.push({ p: w, premi, costo: 12 * mensile * (x.length + 1), voto: v, s: x.length,
                   premiRegola: r.premi, costoRegola: r.costo });
    }
  }
  esiti.push({ p: prob.NON_CORSO, premi: 0, costo: 12 * mensile, voto: "NON_CORSO", s: 0,
               premiRegola: 0, costoRegola: 12 * mensile });
  const tot = esiti.reduce((t, x) => t + x.p, 0);
  for (const x of esiti) x.p /= tot;
  return { esiti, nPadre, nMadre, affidabilita };
}

export function valutaPuledro(db: Database.Database, padre: string, madre: string | null, mensile: number,
                              o: { margine?: number; asta?: boolean; prezzo?: number | null } = {}) {
  const margine = Math.max(0, o.margine ?? 0);
  const { esiti, nPadre, nMadre, affidabilita } = esitiPuledro(db, padre, madre, mensile, !!o.asta);
  const prezzo = o.prezzo ?? null;

  // Lo stesso conto in due modi: con la regola "lo fermo quando non rende"
  // (il modo in cui conviene gestirlo) e tenendolo quanto e' andato
  // davvero ogni cavallo dell'archivio.
  const conto = (regola: boolean) => {
    const premiDi = (x: EsitoPuledro) => regola ? x.premiRegola : x.premi;
    const costoDi = (x: EsitoPuledro) => regola ? x.costoRegola : x.costo;
    const G = esiti.reduce((t, x) => t + x.p * premiDi(x), 0);
    const C = esiti.reduce((t, x) => t + x.p * costoDi(x), 0);
    const valore = G - C;
    const gruppo = (sel: EsitoPuledro[], chiave: string, nome: string, nota: string) => {
      const P = sel.reduce((t, x) => t + x.p, 0);
      if (P <= 0) return { chiave, nome, nota, p: 0, premi_medi: 0, premi_tipici: 0, anni_medi: 0, allenamento: 0, netto: 0 };
      const premi = sel.reduce((t, x) => t + x.p * premiDi(x), 0) / P;
      const costo = sel.reduce((t, x) => t + x.p * costoDi(x), 0) / P;
      const ord = [...sel].sort((a, b) => premiDi(a) - premiDi(b));
      let acc = 0, tipico = 0;
      for (const x of ord) { acc += x.p; if (acc >= P / 2) { tipico = premiDi(x); break; } }
      return { chiave, nome, nota, p: Math.round(1000 * P) / 10, premi_medi: Math.round(premi), premi_tipici: Math.round(tipico),
               // anni pagati: quello prima del debutto piu' le stagioni
               anni_medi: Math.round(10 * costo / (12 * mensile)) / 10,
               allenamento: Math.round(costo), netto: Math.round(premi - costo) };
    };
    const scenari = [
      ...SCENARI.map(sc => gruppo(esiti.filter(x => sc.voti.includes(x.voto)), sc.chiave, sc.nome, sc.nota)),
      gruppo(esiti.filter(x => x.voto === "NON_CORSO"), "non_corre", "Non corre", "non arriva mai a correre"),
    ];
    const probRipaga = (pr: number) => esiti.filter(x => premiDi(x) >= pr + costoDi(x)).reduce((t, x) => t + x.p, 0);
    return {
      premi_attesi: Math.round(G),
      allenamento_atteso: Math.round(C),
      valore_atteso: Math.round(valore),
      prezzo_massimo: Math.max(0, Math.round(G / (1 + margine) - C)),
      prob_ripaga_gratis: Math.round(1000 * probRipaga(0)) / 10,
      scenari,
      curva: PREZZI_CURVA.map(pr => ({ prezzo: pr, prob_ripaga: Math.round(1000 * probRipaga(pr)) / 10, utile_atteso: Math.round(valore - pr) })),
      con_prezzo: prezzo == null ? null : {
        utile_atteso: Math.round(valore - prezzo),
        rendimento: Math.round(1000 * (valore - prezzo) / (prezzo + C)) / 10,
        prob_ripaga: Math.round(1000 * probRipaga(prezzo)) / 10,
      },
    };
  };
  const ferma = conto(true), tutta = conto(false);
  const mensilePari = prezzo != null ? mensileDiPareggio(db, padre, madre, prezzo, !!o.asta) : null;
  const aste = venditeAste();
  return {
    padre, madre, mensile, margine, scelto_asta: !!o.asta, fattore_asta: FATTORE_ASTA, soglia_fermo: SOGLIA_FERMO,
    figli_osservati: { padre: nPadre, madre: nMadre }, affidabilita,
    // I numeri principali sono quelli con la regola.
    premi_attesi: ferma.premi_attesi,
    allenamento_atteso: ferma.allenamento_atteso,
    valore_atteso: ferma.valore_atteso,
    prezzo_massimo: ferma.prezzo_massimo,
    con_regola: ferma,
    senza_regola: tutta,
    prezzo,
    mensile_di_pareggio: mensilePari,
    aste_padre: riepilogoPrezzi(aste.filter(a => a.padre === padre).map(a => a.prezzo)),
  };
}

/** Il costo mensile sotto il quale, pagato `prezzo`, il puledro va in pari
 *  in media (con la regola "lo fermo quando non rende"). null se non va in
 *  pari nemmeno a 100 euro al mese. */
export function mensileDiPareggio(db: Database.Database, padre: string, madre: string | null,
                                  prezzo: number, asta: boolean): number | null {
  const valore = (m: number) => {
    const { esiti } = esitiPuledro(db, padre, madre, m, asta);
    return esiti.reduce((t, x) => t + x.p * (x.premiRegola - x.costoRegola), 0) - prezzo;
  };
  let lo = 100, hi = 5000;
  if (valore(lo) < 0) return null;
  if (valore(hi) >= 0) return hi;
  for (let i = 0; i < 14; i++) {
    const m = (lo + hi) / 2;
    if (valore(m) >= 0) lo = m; else hi = m;
  }
  return Math.round(lo / 10) * 10;
}
