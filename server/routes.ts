import type { Express } from "express";
import { calcolaWright, comparseAlbero } from "./consanguineita";
import { registraSimulatore } from "./simulatore";
import { registraElencoCavalli } from "./elencoCavalli";
import { incrociPerFattrice } from "./incroci";
import { registraSorprese } from "./sorprese";
import { registraSeguiti } from "./seguiti";
import { registraQualita } from "./qualitaDati";
import { formaPersona } from "./forma";
import { distanzaCavallo, distanzaStallone, profiliStalloni, velocitaPiste } from "./distanza";
import { potenzialeCavallo, verificaPotenziale, etichettaStadio, contestoMadre, potenzialeNascita } from "./potenziale";
import { forzaCavallo } from "./forza";

// ──────────────────────────────────────────────────────────────────────────
// Due popolazioni distinte (vedi ATHLETE_MIN_BIRTH_YEAR in nightly_update.py):
//  ATLETI       nati dal 2012: sono il fulcro del sito (classifiche, schede,
//               confronti, tendenze).
//  RIPRODUTTORI nati nel 2011 o prima e genitori recuperati da UNIRE: servono
//               solo a genealogia e rating della progenie, e NON devono
//               comparire nelle classifiche atleti ne' nei conteggi corse.
// Il filtro sta su horse_ratings.horse_class, denormalizzata dalla pipeline.
// ──────────────────────────────────────────────────────────────────────────
const ONLY_ATHLETES = "COALESCE(hr.horse_class, 'athlete') = 'athlete'";
import type { Server } from "http";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { ensureGenealogy } from "./vpFetch";
import {
  loadAdvisorModel, getAdvisorModel, getAdvisorBacktest,
  loadPuledriModel, getPuledriVerifica, predictPuledro,
  predictPair, inbreeding, explain, puntiFattrice,
} from "./advisorEngine";
import { checkEligibility, BASI_SCIENTIFICHE, FONTE_NORMATIVA, SOGLIE } from "./breedingRules";
import { simulateRoi, earningsByGrade, annoMaturita } from "./roiRange";
import { stimaRivendita } from "./resaleValue";
import { stimaValoreResiduo, stimaDaGradini, type RigaValoreResiduo } from "./careerValue";
import { valutaScuderia, scuderiaEsempio } from "./scuderia";
import { affidabilitaVoto } from "./gradeStability";
import { alberoStalloni, attivitaStallone, NOMI_GENERAZIONE, MIN_FIGLI_ALBERO, ANNO_INIZIO_VOTO } from "./alberoStalloni";
import { leadersEta, stalloniStagione, figliStalloneStagione, nipotiStalloni, nonnoStallone, allevatoriStagione, cavalliAllevatoreStagione } from "./classifiche";
import { lineaMaterna } from "./lineaMaterna";
const cacheNonni: { chiave: string; dati: ReturnType<typeof nipotiStalloni> | null } = { chiave: "", dati: null };
import { stimaPremiCavallo, pronosticoCavallo, leggiVerificaPremi, tenereElenco, tenereStalloni, controlloModelli } from "./previsioni";
import { valutaPuledro, mensileDiPareggio, FATTORE_ASTA, tabellaVoti, soglie, valutaCavallo, valutaIncrocio, ipotesiCorrenti, valutaVendita, mercatoStalloni, sensibilita } from "./pareggio";

// DB lives in project root (committed to repo, updated nightly via git push)
const DB_PATH = path.resolve(process.cwd(), "data.db");

/**
 * Novembre 2026: l'archivio ha un solo cavallo per nome, quindi due omonimi
 * si confondono. GENNY JET del 2022 risultava madre di NARCIS (2007) e
 * MAIELLA (2006), figlie di un'altra GENNY JET piu' anziana. Un genitore deve
 * essere nato almeno due anni prima del figlio; si tiene un margine largo
 * perche' alcuni stalloni hanno l'anno di nascita sbagliato di poco.
 * `g` e `f` sono gli alias SQL di genitore e figlio.
 */
const genitoreCompatibile = (g: string, f: string) =>
  `(${g}.birth_year IS NULL OR ${f}.birth_year IS NULL OR ${g}.birth_year <= ${f}.birth_year - 2)`;

// Lock applicativo per il trigger manuale della pipeline nightly:
// impedisce due esecuzioni concorrenti nello stesso processo Node.
let nightlyRunning = false;
let nightlyStartedAt: string | null = null;

// Codici delle piste usati dal calendario delle corse in programma, tradotti
// nei nomi dell'archivio (gli stessi mostrati dalla pagina Calendario).
const NOMI_CALENDARIO: Record<string, string> = {
  BO: "BOLOGNA", MI: "MILANO", RM: "ROMA", TO: "TORINO", NA: "NAPOLI",
  CE: "CESENA", SR: "SIRACUSA", TV: "TREVISO", MT: "MONTECATINI",
  CS: "CASARANO", PA: "PALERMO", MO: "MODENA", FI: "FIRENZE",
  GA: "GARIGLIANO", PD: "PADOVA", VI: "VILLANOVA", CT: "CASTELLUCCIO",
  TS: "TRIESTE", AV: "AVERSA", TA: "TARANTO", MG: "MONTEGIORGIO",
  FE: "FERRARA", FO: "FOLLONICA", CV: "CIVITANOVA", PC: "PONTECAGNANO",
  BA: "BARI", VA: "VARESE", AN: "ANCONA", FR: "FROSINONE", SS: "SAN SEVERO",
  MON: "MONTEGIORGIO", // vecchia sigla sbagliata (12/10/2026)
};

// Cache delle informazioni prese da GitHub per la pagina "Metodo e dati".
const REPO_PUBBLICO = "matteopetracca6-bit/statippica";
let cacheGitHub: { quando: number; dati: any } | null = null;

async function statoGitHub(): Promise<any> {
  if (cacheGitHub && Date.now() - cacheGitHub.quando < 15 * 60 * 1000) return cacheGitHub.dati;
  const chiedi = async (percorso: string) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO_PUBBLICO}${percorso}`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "statippica" },
        signal: AbortSignal.timeout(5000),
      });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };
  const [rilascio, risultati, manutenzione] = await Promise.all([
    chiedi("/releases/tags/archivio"),
    chiedi("/actions/workflows/nightly-results.yml/runs?per_page=5&status=completed"),
    chiedi("/actions/workflows/nightly-maintenance.yml/runs?per_page=5&status=completed"),
  ]);
  const asset = rilascio?.assets?.find((a: any) => a.name === "data.db.gz");
  // Se le domande a GitHub sono esaurite (succede dal servizio su Render, che
  // condivide l'indirizzo con molti altri siti), la data di pubblicazione si
  // legge comunque dall'intestazione del file stesso, che non ha limiti.
  let pubblicato: string | null = asset?.updated_at ?? null;
  if (!pubblicato) {
    try {
      const r = await fetch(`https://github.com/${REPO_PUBBLICO}/releases/download/archivio/data.db.gz`,
        { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
      const lm = r.headers.get("last-modified");
      if (lm) pubblicato = new Date(lm).toISOString();
    } catch { /* resta sconosciuta */ }
  }
  const ultimo = (x: any) => {
    const run = x?.workflow_runs?.[0];
    return run ? { esito: run.conclusion, quando: run.updated_at } : null;
  };
  // Quando GitHub non risponde al sito (Render condivide l'indirizzo con
  // molti altri), l'esito si legge dall'archivio: il notturno lo scrive alla
  // fine (tabella stato_notturni, 23/11/2026).
  const dallArchivio = (lavoro: string) => {
    try {
      const d = new Database(DB_PATH, { readonly: true });
      try {
        const t = d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='stato_notturni'").get();
        const r = t ? d.prepare("SELECT esito, quando FROM stato_notturni WHERE lavoro = ?").get(lavoro) as any : null;
        return r ? { esito: r.esito, quando: r.quando } : null;
      } finally { d.close(); }
    } catch { return null; }
  };
  const dati = {
    archivio_pubblicato: pubblicato,
    notturno_risultati: ultimo(risultati) ?? dallArchivio("results"),
    notturno_manutenzione: ultimo(manutenzione) ?? dallArchivio("maintenance"),
    github_raggiungibile: !!(rilascio || risultati),
  };
  // Anche la risposta mancata si tiene per quindici minuti: riprovare a ogni
  // visita consumerebbe le poche domande concesse e allungherebbe l'attesa.
  cacheGitHub = { quando: Date.now(), dati };
  return dati;
}

/** Nome per abbinare le quote: "FAEN TROOT -S-" e "FAEN TROOT (S)" sono lo stesso cavallo. */
function nomeQuota(n: string): string {
  return String(n || "").toUpperCase().replace(/\s*[-(]\s*([A-Z]{1,3})\s*[-)]\s*$/, " $1").replace(/[^A-Z0-9]/g, "");
}

function getDb() {
  return new Database(DB_PATH, { readonly: true });
}

// ── Risposte pronte ────────────────────────────────────────────────────────
// Molte pagine chiedono dati che cambiano solo quando arriva l'archivio nuovo
// (una volta a notte), ma il server li ricalcolava a ogni visita: la verifica
// dei pronostici impiegava 8 secondi, i trend quasi uno. La risposta si tiene
// in memoria finche' l'archivio non cambia (o per il tempo indicato) e chi
// arriva dopo la riceve subito.
const cacheRisposte = new Map<string, { mtime: number; quando: number; corpo: unknown }>();
// La "versione" dell'archivio. Fino al 21/11/2026 era l'ora di modifica del
// file, ma il sito stesso scrive nell'archivio (la genealogia chiesta al
// volo a vendopuledri, gli indici): ogni scrittura buttava via tutte le
// risposte pronte e le liste del radar, e la scheda successiva rifaceva il
// giro su tutte le gare (20 secondi misurati sul sito). L'archivio nuovo
// arriva sempre con un file nuovo messo al posto del vecchio (index.ts,
// scaricaArchivio), quindi cambia il numero del file (inode): e' quello che
// conta. Le scritture del sito non lo cambiano.
function mtimeDb(): number {
  try { const st = fs.statSync(DB_PATH); return st.ino || st.mtimeMs; } catch { return 0; }
}
function pronta(durataMs = 60 * 60_000) {
  return (req: any, res: any, next: any) => {
    const k = req.originalUrl as string;
    const mt = mtimeDb();
    const c = cacheRisposte.get(k);
    if (c && c.mtime === mt && Date.now() - c.quando < durataMs) return res.json(c.corpo);
    const invia = res.json.bind(res);
    res.json = (corpo: unknown) => {
      if (res.statusCode < 400) {
        if (cacheRisposte.size > 800) cacheRisposte.clear();
        cacheRisposte.set(k, { mtime: mt, quando: Date.now(), corpo });
      }
      return invia(corpo);
    };
    next();
  };
}
// Un indice che l'archivio non ha: senza, cercare i partenti di una corsa dal
// suo codice voleva dire leggere tutte le corse, centinaia di volte di fila.
let indiciPer = -1;
function assicuraIndici() {
  const mt = mtimeDb();
  if (mt === indiciPer) return;
  indiciPer = mt;
  try {
    const w = new Database(DB_PATH);
    w.exec("CREATE INDEX IF NOT EXISTS idx_races_code ON races(race_code)");
    // Il rendimento del guidatore, nel dettaglio del pronostico.
    w.exec("CREATE INDEX IF NOT EXISTS idx_races_driver ON races(driver)");
    // Figli di una fattrice: incroci dell'Advisor, scheda della fattrice.
    w.exec("CREATE INDEX IF NOT EXISTS idx_horses_dam ON horses(dam)");
    w.close();
    indiciPer = mtimeDb();
  } catch (e) { console.error("[indici]", e); }
}

const GRADE_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F", "N/A"];

function gradeColor(grade: string): string {
  const map: Record<string, string> = {
    SSS: "#FFD700",
    SS: "#C0C0C0",
    S: "#CD7F32",
    A: "#4F98A3",
    B: "#6DAA45",
    C: "#BB653B",
    D: "#797876",
    E: "#5A5957",
    F: "#3A3937",
    "N/A": "#444",
  };
  return map[grade] ?? "#444";
}

// ── Le sei punte del grafico in testata alla scheda del cavallo ─────────────
// Ogni punta e' un numero da 0 a 100 che dice quanti cavalli confrontabili
// questo cavallo lascia dietro di se'. Le liste di confronto si calcolano una
// volta e si tengono per mezz'ora: sono qualche decina di migliaia di numeri.
type MisureGare = { rendimento: number; classe: number | null; costanza: number; frequenza: number };
type ListeRadar = { perAnno: Map<number, { rendimento: number[]; classe: number[]; costanza: number[]; frequenza: number[] }>;
                    perCavallo: Map<string, MisureGare>; stalloni: number[]; fattrici: number[]; quando: number; mtime: number };
let listeRadar: ListeRadar | null = null;
function ordinati(v: number[]) { return v.filter(x => x != null && isFinite(x)).sort((a, b) => a - b); }
function percentileIn(lista: number[] | undefined, x: number | null | undefined): number | null {
  if (!lista || !lista.length || x == null || !isFinite(x)) return null;
  let sotto = 0, pari = 0;
  for (const v of lista) { if (v < x) sotto++; else if (v === x) pari++; }
  return Math.round(1000 * (sotto + pari / 2) / lista.length) / 10;
}
// Quota del montepremi che va a ciascun posto, misurata sulle corse italiane
// in archivio: il secondo prende circa il 47,5% del vincitore, il terzo il 26%,
// e cosi' via. Serve a stimare quanto valeva una corsa anche quando in
// archivio c'e' solo il piazzato (succede spesso per le corse all'estero).
const QUOTA_POSTO = `CASE placement WHEN 1 THEN 1.0 WHEN 2 THEN 0.475 WHEN 3 THEN 0.259 WHEN 4 THEN 0.13 WHEN 5 THEN 0.087 END`;
function prendiListeRadar(db: any): ListeRadar {
  // Novembre 2026: le liste dipendono solo dall'archivio, che cambia una volta
  // a notte. Prima scadevano ogni 30 minuti e il primo visitatore dopo la
  // scadenza aspettava circa 1,5 secondi (un giro su tutte le gare); ora si
  // rifanno solo quando arriva l'archivio nuovo, e si preparano all'avvio.
  const mt = mtimeDb();
  if (listeRadar && listeRadar.mtime === mt) return listeRadar;
  const perAnno = new Map<number, { rendimento: number[]; classe: number[]; costanza: number[]; frequenza: number[] }>();
  const perCavallo = new Map<string, MisureGare>();
  // Per ogni cavallo con almeno 5 corse: premio medio per corsa (rendimento),
  // valore medio delle corse disputate, stimato dal premio del vincitore
  // (classe), quota di arrivi nei primi tre (costanza) e corse medie per stagione corsa
  // (frequenza). Tutto dalle gare in
  // archivio, come la testata della scheda.
  // Dal 21/11/2026 le misure si calcolano di notte (scripts/radar_misure.py,
  // stesso conto): qui si legge la tabella. Senza tabella si fa il giro qui.
  const conTabella = (() => { try { return !!db.prepare(`SELECT 1 FROM radar_misure LIMIT 1`).get(); } catch { return false; } })();
  const righe = conTabella ? db.prepare(`SELECT h, c, p, cl, nl, t3, st, y FROM radar_misure`).all() as any[] : db.prepare(`
    WITH liv AS (SELECT race_date d, track t, race_number n, MAX(prize_net / ${QUOTA_POSTO}) l
                 FROM races WHERE placement BETWEEN 1 AND 5 AND prize_net > 0 AND race_number IS NOT NULL
                   AND track <> 'ESTERO'
                 GROUP BY 1, 2, 3),
         -- All'estero la pista e' sempre "ESTERO" e il codice "ES" vuol dire
         -- estero, non Spagna: corse di paesi diversi con lo stesso numero
         -- nello stesso giorno finivano nello stesso gruppo. APPARIZIONE MAIL,
         -- che corre alle Baleari per 200 euro a vittoria, prendeva il
         -- livello delle corse svedesi o francesi di quel giorno (classe 96,
         -- 19/11/2026). Per le corse estere si stima il livello solo dal suo
         -- premio e dal suo piazzamento.
         lv AS (SELECT r.*, CASE WHEN r.track = 'ESTERO'
                                 THEN CASE WHEN r.placement BETWEEN 1 AND 5 AND r.prize_net > 0
                                           THEN r.prize_net / ${QUOTA_POSTO.replace(/placement/g, "r.placement")} END
                                 ELSE liv.l END AS l
                FROM races r LEFT JOIN liv ON liv.d = r.race_date AND liv.t = r.track AND liv.n = r.race_number),
         g AS (SELECT r.horse_name h, COUNT(*) c, SUM(COALESCE(r.prize_net, 0)) p, AVG(r.l) cl, COUNT(r.l) nl,
                      SUM(CASE WHEN r.placement BETWEEN 1 AND 3 THEN 1 ELSE 0 END) t3,
                      COUNT(DISTINCT substr(r.race_date, 1, 4)) st
               FROM lv r
               GROUP BY r.horse_name HAVING COUNT(*) >= 5)
    SELECT g.*, hr.birth_year y FROM g JOIN horse_ratings hr ON hr.name = g.h AND hr.rating_mode = 'performance'`).all() as any[];
  for (const r of righe) {
    const m: MisureGare = { rendimento: r.p / r.c, classe: r.nl >= 3 ? r.cl : null, costanza: r.t3 / r.c, frequenza: r.c / Math.max(1, r.st) };
    perCavallo.set(r.h, m);
    if (!perAnno.has(r.y)) perAnno.set(r.y, { rendimento: [], classe: [], costanza: [], frequenza: [] });
    const a = perAnno.get(r.y)!;
    a.rendimento.push(m.rendimento); a.costanza.push(m.costanza); a.frequenza.push(m.frequenza);
    if (m.classe != null) a.classe.push(m.classe);
  }
  perAnno.forEach(a => { a.rendimento = ordinati(a.rendimento); a.classe = ordinati(a.classe); a.costanza = ordinati(a.costanza); a.frequenza = ordinati(a.frequenza); });
  const colonna = (sql: string) => { try { return ordinati((db.prepare(sql).all() as any[]).map(r => r.v)); } catch { return []; } };
  listeRadar = {
    perAnno, perCavallo,
    stalloni: colonna(`SELECT final_score v FROM stallion_rating_stats WHERE n_figli_corsi >= 5`),
    fattrici: colonna(`SELECT final_score v FROM dam_rating_stats WHERE n_valutati >= 2`),
    quando: Date.now(), mtime: mt,
  };
  return listeRadar;
}
function radarCavallo(db: any, horse: any) {
  if (horse.rating_mode !== "performance") return null;
  const L = prendiListeRadar(db);
  const uno = (sql: string, ...a: any[]) => { try { return (db.prepare(sql).get(...a) as any)?.v ?? null; } catch { return null; } };
  // Pedigree: il padre conta 60, la madre 40, ciascuno messo a confronto
  // con gli altri riproduttori che hanno figli in gara.
  const pPadre = percentileIn(L.stalloni, uno(`SELECT final_score v FROM stallion_rating_stats WHERE sire = ? AND n_figli_corsi >= 5`, horse.sire));
  const pMadre = percentileIn(L.fattrici, uno(`SELECT final_score v FROM dam_rating_stats WHERE dam = ? AND n_valutati >= 2`, horse.dam));
  const pedigree = pPadre != null && pMadre != null ? Math.round(6 * pPadre + 4 * pMadre) / 10 : (pPadre ?? pMadre);
  const m = L.perCavallo.get(horse.name);
  const a = L.perAnno.get(horse.birth_year);
  const poche = m ? undefined : "meno di 5 corse";
  return [
    { chiave: "velocita", etichetta: "Velocità", valore: horse.time_percentile ?? null },
    { chiave: "rendimento", etichetta: "Rendimento", valore: percentileIn(a?.rendimento, m?.rendimento), nota: poche },
    { chiave: "costanza", etichetta: "Costanza", valore: percentileIn(a?.costanza, m?.costanza), nota: poche },
    { chiave: "classe", etichetta: "Classe", valore: percentileIn(a?.classe, m?.classe ?? null), nota: poche },
    { chiave: "frequenza", etichetta: "Frequenza", valore: percentileIn(a?.frequenza, m?.frequenza), nota: poche },
    { chiave: "pedigree", etichetta: "Pedigree", valore: pedigree },
  ];
}

// Totali di carriera in tutto il mondo dei campioni storici, letti ogni notte
// dalle schede di Wikipedia (scripts/totali_mondiali.py). L'anagrafe italiana
// conta solo le corse in Italia: per chi ha corso molto all'estero, come
// VARENNE, quei totali sono molto piu' bassi del vero.
let totaliMondiali: { quando: number; mtime: number; cavalli: Record<string, any> } | null = null;
function totaleMondiale(nome: string, anno: number) {
  const f = path.join(process.cwd(), "totali_mondiali.json");
  try {
    const mtime = fs.statSync(f).mtimeMs;
    if (!totaliMondiali || totaliMondiali.mtime !== mtime) {
      totaliMondiali = { quando: Date.now(), mtime, cavalli: JSON.parse(fs.readFileSync(f, "utf8")).cavalli ?? {} };
    }
  } catch { return null; }
  const e = totaliMondiali.cavalli[`${nome}|${anno}`];
  return e && e.esito === "trovato" ? e : null;
}

export function registerRoutes(httpServer: Server, app: Express) {
  // Simulatore della corsa (simulatore.ts).
  registraSimulatore(app, getDb, NOMI_CALENDARIO, vpTableExists);
  // Schede Tutti e Novita' della pagina Cavalli (elencoCavalli.ts).
  registraElencoCavalli(app, getDb, vpTableExists);
  // Sorprese e delusioni della settimana, per la Home (sorprese.ts).
  registraSorprese(app, getDb, vpTableExists, pronta);
  registraSeguiti(app, getDb, vpTableExists);
  registraQualita(app, getDb, vpTableExists, pronta, mtimeDb);
  // Velocita' delle piste a parita' di cavallo (scripts/record_distanza.py).
  app.get("/api/piste/velocita", (_req, res) => {
    const db = getDb();
    try { res.json(velocitaPiste(db)); } finally { db.close(); }
  });

  // Dopo l'avvio il server si chiede da solo le pagine piu' lente, cosi' il
  // primo visitatore trova i conti gia' fatti.
  setTimeout(async () => {
    const porta = process.env.PORT || "5000";
    for (const u of ["/api/stats", "/api/trends", "/api/top-races", "/api/stallions", "/api/rating-voti",
                     "/api/calendar/verifica", "/api/pareggio/stalloni", "/api/pareggio/mercato", "/api/momento",
                     "/api/scuderia/esempio", "/api/controllo-a-posteriori"]) {
      try { await fetch(`http://127.0.0.1:${porta}${u}`); } catch { /* il sito funziona lo stesso */ }
      // Una pausa fra un conto e l'altro: il server fa una cosa alla volta,
      // e chi apre una scheda in quel minuto passa fra un conto e il prossimo.
      await new Promise(r => setTimeout(r, 300));
    }
    // Le liste del radar della scheda del cavallo (un giro su tutte le gare).
    try { const db = getDb(); try { prendiListeRadar(db); } finally { db.close(); } } catch { /* si rifanno alla prima scheda */ }
  }, 25_000).unref?.();

  // ──────────────────────────────────────────────
  // PUNTO DI PAREGGIO (vedi server/pareggio.ts)
  // Parametri comuni: mensile (costo al mese), ingresso (costo fino ai 2 anni).
  // ──────────────────────────────────────────────
  const numero = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : def;
  };
  // GENERAZIONE M (scripts/simula_generazione.py): simulazione sperimentale
  // dei nati 2025 e dei puledri passati nelle aste del settembre 2026.
  // E' un file fisso, rifatto a mano quando arrivano aste o stagioni nuove.
  // Ai lotti si aggiunge il prezzo massimo di "Quanto vale un puledro"
  // (carriera intera, puledro scelto d'asta), al costo mensile di base.
  let cacheGenerazione: { mtime: number; testo: string } | null = null;
  const fileGenerazione = () => [path.resolve(process.cwd(), "generazione_m.json"),
                                 path.resolve(process.cwd(), "..", "generazione_m.json")].find(f => fs.existsSync(f)) ?? null;
  // Il primo calcolo dei prezzi massimi richiede qualche secondo: lo si fa
  // subito dopo l'avvio, cosi' il primo visitatore non aspetta.
  setTimeout(() => {
    try { const f = fileGenerazione(); if (f) prepara(f); } catch (e) { console.error("[generazione-m] preparazione", e); }
  }, 15_000).unref?.();
  function prepara(f: string) {
        const mtime = fs.statSync(f).mtimeMs;
        if (!cacheGenerazione || cacheGenerazione.mtime !== mtime) {
          const dati = JSON.parse(fs.readFileSync(f, "utf8"));
          const db = getDb();
          try {
            const mensile = ipotesiCorrenti(db).costo_mensile;
            const memo = new Map<string, any>();
            for (const l of dati?.puledri_in_asta?.lotti_elenco ?? []) {
              if (!l.padre) continue;
              const k = `${l.padre}|${l.madre ?? ""}`;
              if (!memo.has(k)) {
                const v = valutaPuledro(db, String(l.padre).toUpperCase(), l.madre ? String(l.madre).toUpperCase() : null, mensile, { asta: true });
                memo.set(k, { prezzo_massimo: v.prezzo_massimo, valore_atteso: v.valore_atteso });
              }
              Object.assign(l, memo.get(k));
              l.mensile_di_pareggio = l.venduto && l.prezzo > 0
                ? mensileDiPareggio(db, String(l.padre).toUpperCase(), l.madre ? String(l.madre).toUpperCase() : null, l.prezzo, true)
                : null;
            }
            dati.prezzo_massimo_ipotesi = { mensile, fattore_asta: FATTORE_ASTA };
            // Potenziale dinamico allo stadio nascita (potenziale.py): i puledri
            // M delle aste entrano nel registro di notte con padre e madre.
            if (db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='potenziale_storico'`).get()) {
              const pot = db.prepare(`SELECT potenziale, basso, alto FROM potenziale_storico
                                      WHERE horse_name = ? AND birth_year = 2025 ORDER BY data DESC LIMIT 1`);
              for (const l of dati?.puledri_in_asta?.lotti_elenco ?? []) {
                const r = l.puledro ? pot.get(String(l.puledro).toUpperCase()) as any : null;
                l.potenziale = r ? { p50: r.potenziale, p10: r.basso, p90: r.alto, etichetta: etichettaStadio("nascita") } : null;
              }
            }
          } finally {
            db.close();
          }
          cacheGenerazione = { mtime, testo: JSON.stringify(dati) };
        }
        return cacheGenerazione.testo;
  }
  app.get("/api/generazione-m", (_req, res) => {
    const f = fileGenerazione();
    if (!f) return res.status(404).json({ message: "Simulazione non ancora calcolata" });
    res.set("Cache-Control", "public, max-age=3600");
    res.type("application/json").send(prepara(f));
  });

  // QUANTO VALE UN PULEDRO: prezzo massimo per chi compra, caso per caso.
  // ?padre=&madre=&mensile=&margine=(percentuale)&asta=1&prezzo=
  // oppure ?nome=&anno= per un cavallo dell'archivio.
  app.get("/api/puledro/valore", (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const mensile = numero(req.query.mensile, ip.costo_mensile, 100, 10000);
      const margine = numero(req.query.margine, 0, 0, 300) / 100;
      const prezzo = req.query.prezzo != null && req.query.prezzo !== "" ? numero(req.query.prezzo, NaN, 0, 5_000_000) : null;
      let padre = String(req.query.padre ?? "").trim().toUpperCase();
      let madre = String(req.query.madre ?? "").trim().toUpperCase() || null;
      const nome = String(req.query.nome ?? "").trim().toUpperCase();
      if (nome) {
        const anno = numero(req.query.anno, 0, 1990, 2100) || null;
        const h = db.prepare(`SELECT name, sire, dam FROM horses WHERE name = ? ${anno ? "AND birth_year = ?" : ""}
                              ORDER BY birth_year DESC LIMIT 1`).get(...(anno ? [nome, anno] : [nome])) as any;
        if (!h) return res.status(404).json({ message: "cavallo non trovato" });
        padre = String(h.sire ?? "").toUpperCase(); madre = h.dam ? String(h.dam).toUpperCase() : null;
      }
      if (!padre) return res.status(400).json({ message: "manca lo stallone" });
      const asta = req.query.asta === "1" || req.query.asta === "true";
      res.json({ nome: nome || null, ...valutaPuledro(db, padre, madre, mensile,
        { margine, asta, prezzo: Number.isFinite(prezzo as number) ? prezzo : null }) });
    } finally {
      db.close();
    }
  });

  // PORTAFOGLIO DELLA SCUDERIA: { voci: [...], mensile } -> cassa dei
  // prossimi 12 mesi simulata, rischio e valore di carriera.
  app.post("/api/scuderia", (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const mensile = numero(req.body?.mensile, ip.costo_mensile, 100, 10000);
      const voci = Array.isArray(req.body?.voci) ? req.body.voci : [];
      res.json(valutaScuderia(db, voci, mensile));
    } finally {
      db.close();
    }
  });
  // IMPORTA DA UN PROPRIETARIO: i cavalli che oggi corrono per lui, cioe'
  // quelli la cui ultima corsa (negli ultimi 12 mesi dell'archivio) ha questo
  // proprietario. Chi e' stato venduto e corre per un altro non c'e'.
  app.get("/api/scuderia/da-proprietario/:name", (req, res) => {
    const db = getDb();
    try {
      const chiave = decodeURIComponent(req.params.name).toUpperCase();
      if (!haProprietari(db)) return res.json({ disponibile: false, cavalli: [] });
      const o = db.prepare("SELECT proprietario, nome FROM owner_stats WHERE proprietario = ?").get(chiave) as any;
      const fine = (db.prepare("SELECT MAX(race_date) AS d FROM races").get() as any)?.d;
      const cavalli = db.prepare(`
        WITH ultime AS (
          SELECT horse_name, MAX(race_date) AS ultima FROM races
          WHERE owner IS NOT NULL AND race_date >= date(?, '-12 months')
          GROUP BY horse_name)
        SELECT u.horse_name AS nome, h.birth_year AS anno, u.ultima AS ultima_corsa,
               (SELECT COUNT(*) FROM races r2 WHERE r2.horse_name = u.horse_name AND r2.owner = ?) AS n_corse
        FROM ultime u
        JOIN races r ON r.horse_name = u.horse_name AND r.race_date = u.ultima
        LEFT JOIN horses h ON h.name = u.horse_name
        WHERE r.owner = ?
        GROUP BY u.horse_name
        ORDER BY u.ultima DESC`).all(fine, chiave, chiave) as any[];
      res.json({ disponibile: true, proprietario: chiave, nome: o?.nome ?? null, dal: fine, cavalli });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally {
      db.close();
    }
  });
  app.get("/api/scuderia/esempio", (_req, res) => {
    const db = getDb();
    try {
      res.json({ voci: scuderiaEsempio(db) });
    } finally {
      db.close();
    }
  });
  app.get("/api/pareggio", (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const mensile = numero(req.query.mensile, ip.costo_mensile, 100, 10000);
      const ingresso = numero(req.query.ingresso, ip.allevamento_fino_2_anni + ip.monta_mediana, 0, 2_000_000);
      res.json({ ipotesi: ip, mensile, ingresso, soglie: soglie(mensile, ingresso), ...tabellaVoti(db, mensile, ingresso) });
    } catch (e) {
      res.status(500).json({ message: (e as Error).message });
    } finally {
      db.close();
    }
  });
  app.get("/api/pareggio/cavallo", (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const nome = String(req.query.nome ?? "").trim().toUpperCase();
      if (!nome) return res.status(400).json({ message: "manca il nome" });
      const anno = numero(req.query.anno, 0, 1990, 2100) || null;
      const mensile = numero(req.query.mensile, ip.costo_mensile, 100, 10000);
      // L'ingresso arriva gia' fatto dalla scheda Punto di pareggio; dalla
      // scheda del cavallo arriva al massimo la monta, se l'utente la indica.
      const ingresso = req.query.ingresso != null && req.query.ingresso !== "" ? numero(req.query.ingresso, NaN, 0, 2_000_000) : null;
      const monta = req.query.monta != null && req.query.monta !== "" ? numero(req.query.monta, NaN, 0, 500_000) : null;
      const r = valutaCavallo(db, nome, anno, mensile,
        Number.isFinite(ingresso as number) ? ingresso : null, Number.isFinite(monta as number) ? monta : null);
      if (!r) return res.status(404).json({ message: "cavallo non trovato" });
      res.json({ mensile, ...r });
    } finally {
      db.close();
    }
  });
  // Tenere o fermare: tutti i cavalli in attivita' con premi attesi ed esito.
  app.get("/api/tenere", (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const mensile = numero(req.query.mensile, ip.costo_mensile, 100, 10000);
      const q = req.query as Record<string, string>;
      res.json({ mensile, ...tenereElenco(db, {
        costoAnno: 12 * mensile,
        etaMin: q.eta_min ? Number(q.eta_min) : undefined, etaMax: q.eta_max ? Number(q.eta_max) : undefined,
        padre: q.padre || undefined, sesso: q.sesso ? q.sesso.toUpperCase().slice(0, 1) : undefined,
        esito: ["perdita", "pareggio", "profitto"].includes(q.esito) ? q.esito : undefined,
        cerca: q.cerca?.trim() || undefined, ordina: q.ordina || undefined,
        pagina: q.pagina ? Number(q.pagina) : 1,
      }) });
    } finally {
      db.close();
    }
  });
  app.get("/api/tenere/stalloni", (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const mensile = numero(req.query.mensile, ip.costo_mensile, 100, 10000);
      const minimo = numero(req.query.minimo, 5, 2, 100);
      res.json({ mensile, ...tenereStalloni(db, 12 * mensile, minimo) });
    } finally {
      db.close();
    }
  });
  // Controllo a posteriori: le stime rifatte con i soli dati di una data
  // passata e confrontate con com'e' andata (scripts/controllo_a_posteriori.py).
  // File fisso, rifatto a mano.
  let cacheControllo: { mtime: number; dati: unknown } | null = null;
  app.get("/api/controllo-a-posteriori", (_req, res) => {
    const f = [path.resolve(process.cwd(), "controllo_a_posteriori.json"),
               path.resolve(process.cwd(), "..", "controllo_a_posteriori.json")].find(x => fs.existsSync(x));
    if (!f) return res.status(404).json({ error: "Controllo non ancora calcolato" });
    const mtime = fs.statSync(f).mtimeMs;
    if (!cacheControllo || cacheControllo.mtime !== mtime) cacheControllo = { mtime, dati: JSON.parse(fs.readFileSync(f, "utf8")) };
    res.json(cacheControllo.dati);
  });
  app.get("/api/controllo-modelli", (_req, res) => {
    const db = getDb();
    try { res.json(controlloModelli(db)); } finally { db.close(); }
  });

  // Previsioni sulla scheda del cavallo: prossima corsa (primi tre), stime
  // passate con l'arrivo, premi attesi nei prossimi 12 mesi.
  app.get("/api/horse/:name/:year/previsioni", (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const nome = decodeURIComponent(req.params.name).toUpperCase();
      const mensile = numero(req.query.mensile, ip.costo_mensile, 100, 10000);
      const v = leggiVerificaPremi();
      res.json({
        mensile,
        ...pronosticoCavallo(db, nome),
        premi: stimaPremiCavallo(db, nome, 12 * mensile),
        verifica_premi: v ? {
          periodo: v.periodo_prova, modello: v.modello_misure, anno_prima: v.come_l_anno_prima,
          per_eta: v.media_per_eta, supera: v.supera_i_metodi_semplici, soglia: v.costo_anno_riferimento,
          medi_reali: v.premi_medi_reali, medi_stimati: v.premi_medi_stimati,
          verificato_il: v.verificato_il ?? null, rifacimento: v.prova_rifacimento ?? null,
        } : null,
      });
    } finally {
      db.close();
    }
  });
  app.get("/api/pareggio/incrocio", (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const padre = String(req.query.padre ?? "").trim().toUpperCase();
      if (!padre) return res.status(400).json({ message: "manca lo stallone" });
      const madre = String(req.query.madre ?? "").trim().toUpperCase() || null;
      const mensile = numero(req.query.mensile, ip.costo_mensile, 100, 10000);
      const monta = req.query.monta != null && req.query.monta !== "" ? numero(req.query.monta, NaN, 0, 500_000) : null;
      res.json({ mensile, ...valutaIncrocio(db, padre, madre, mensile, Number.isFinite(monta as number) ? monta : null) });
    } finally {
      db.close();
    }
  });

  // Vendere all'asta yearling o tenerlo e farlo correre. Con ?nome=&anno= si
  // prendono padre e madre del cavallo; altrimenti ?padre=&madre=.
  app.get("/api/pareggio/vendita", (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const mensile = numero(req.query.mensile, ip.costo_mensile, 100, 10000);
      const prezzo = req.query.prezzo != null && req.query.prezzo !== "" ? numero(req.query.prezzo, NaN, 0, 5_000_000) : null;
      let padre = String(req.query.padre ?? "").trim().toUpperCase();
      let madre = String(req.query.madre ?? "").trim().toUpperCase() || null;
      let puledro: string | null = null;
      const nome = String(req.query.nome ?? "").trim().toUpperCase();
      if (nome) {
        const anno = numero(req.query.anno, 0, 1990, 2100) || null;
        const h = db.prepare(`SELECT name, sire, dam FROM horses WHERE name = ? ${anno ? "AND birth_year = ?" : ""}
                              ORDER BY birth_year DESC LIMIT 1`).get(...(anno ? [nome, anno] : [nome])) as any;
        if (!h) return res.status(404).json({ message: "cavallo non trovato" });
        padre = String(h.sire ?? "").toUpperCase(); madre = h.dam ? String(h.dam).toUpperCase() : null; puledro = h.name;
      }
      if (!padre) return res.status(400).json({ message: "manca lo stallone" });
      res.json({ nome: puledro, ...valutaVendita(db, padre, madre, mensile, Number.isFinite(prezzo as number) ? prezzo : null, puledro) });
    } finally {
      db.close();
    }
  });
  // Quanto pesa ogni costo: con ?monta= (lo allevo io) o ?prezzo= (lo compro).
  app.get("/api/pareggio/sensibilita", (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const mensile = numero(req.query.mensile, ip.costo_mensile, 100, 10000);
      const vuoto = (v: unknown) => v == null || v === "";
      if (!vuoto(req.query.prezzo)) {
        const prezzo = numero(req.query.prezzo, NaN, 0, 5_000_000);
        if (!Number.isFinite(prezzo)) return res.status(400).json({ message: "prezzo non valido" });
        return res.json(sensibilita(db, mensile, { prezzo }));
      }
      if (vuoto(req.query.monta)) return res.status(400).json({ message: "manca la monta" });
      const monta = numero(req.query.monta, NaN, 0, 500_000);
      if (!Number.isFinite(monta)) return res.status(400).json({ message: "monta non valida" });
      res.json(sensibilita(db, mensile, { allevamento: ip.allevamento_fino_2_anni, monta }));
    } finally {
      db.close();
    }
  });
  const cacheMercato = new Map<number, { quando: number; dati: any }>();
  app.get("/api/pareggio/mercato", pronta(), (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const mensile = numero(req.query.mensile, ip.costo_mensile, 100, 10000);
      const c = cacheMercato.get(mensile);
      if (c && Date.now() - c.quando < 60 * 60 * 1000) return res.json(c.dati);
      const dati = { mensile, stalloni: mercatoStalloni(db, mensile) };
      cacheMercato.set(mensile, { quando: Date.now(), dati });
      res.json(dati);
    } finally {
      db.close();
    }
  });

  // Confronto fra stalloni nel catalogo: per ogni stallone con prezzo di monta
  // e almeno 5 figli osservati, l'utile atteso di un suo figlio (fattrice
  // qualunque) e la monta massima che lo porterebbe in pari.
  const cacheStalloniPareggio = new Map<number, { quando: number; dati: any }>();
  app.get("/api/pareggio/stalloni", pronta(), (req, res) => {
    const db = getDb();
    try {
      const ip = ipotesiCorrenti(db);
      const mensile = numero(req.query.mensile, ip.costo_mensile, 100, 10000);
      const c = cacheStalloniPareggio.get(mensile);
      if (c && Date.now() - c.quando < 60 * 60 * 1000) return res.json(c.dati);
      const stalloni = db.prepare(`
        SELECT s.name, s.stud_fee_eur fee, srs.grade
        FROM stallions s
        LEFT JOIN stallion_rating_stats srs ON srs.sire = s.name
        WHERE s.stud_fee_eur > 0
      `).all() as any[];
      const righe = stalloni.map(s => {
        const r = valutaIncrocio(db, s.name, null, mensile, null) as any;
        return {
          nome: s.name, voto: s.grade ?? null, monta: Math.round(s.fee), figli: r.figli_osservati.padre,
          affidabilita: r.affidabilita, utile_atteso: r.utile_atteso, prob_profitto: r.prob_profitto,
          monta_massima: r.monta_massima_di_pareggio, esito: r.esito,
          // Quanto vale un figlio prima della monta: utile atteso + monta pagata.
          valore_prima_della_monta: r.utile_atteso + Math.round(s.fee),
          guadagno_atteso: r.utile_atteso + r.costo_atteso,
          costo_atteso: r.costo_atteso,
        };
      }).filter(r => r.figli >= 5)
        .sort((a, b) => b.utile_atteso - a.utile_atteso);
      const dati = { mensile, stalloni: righe };
      cacheStalloniPareggio.set(mensile, { quando: Date.now(), dati });
      res.json(dati);
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/notizie
  // Le voci della fascia che scorre in alto nella home: i vincitori dell'ultima
  // giornata corsa, le corse in programma nei prossimi giorni e lo stato
  // dell'archivio. Tutto viene dall'archivio (e dalla data di pubblicazione su
  // GitHub), quindi la fascia cambia da sola ogni notte.
  // ──────────────────────────────────────────────
  app.get("/api/notizie", async (_req, res) => {
    const db = getDb();
    const risultati: any[] = [];
    const programma: any[] = [];
    let gareTotali = 0;
    let ultimaGara: string | null = null;
    try {
      const piste = new Map<string, string>();
      if (vpTableExists(db, "track_stats")) {
        for (const r of db.prepare("SELECT track, nome FROM track_stats").all() as any[]) piste.set(r.track, r.nome);
      }
      const guidatori = new Set<string>();
      if (vpTableExists(db, "driver_stats")) {
        for (const r of db.prepare("SELECT driver FROM driver_stats").all() as any[]) guidatori.add(r.driver);
      }
      const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
      const tot = db.prepare("SELECT COUNT(*) n FROM races").get() as any;
      gareTotali = tot?.n ?? 0;
      // L'ultima giornata "completa": la piu' recente con almeno cinque
      // vincitori registrati. Il giorno appena passato puo' essere ancora
      // parziale (i risultati arrivano cavallo per cavallo) e mostrerebbe un
      // solo vincitore come se fosse l'intera giornata.
      const giornate = db.prepare(`SELECT race_date d, COUNT(*) n FROM races
                                    WHERE placement = 1 AND race_date <= ?
                                      AND race_date >= date(?, '-14 day')
                                    GROUP BY race_date ORDER BY race_date DESC`).all(oggi, oggi) as any[];
      ultimaGara = giornate.find(g => g.n >= 5)?.d ?? giornate[0]?.d ?? null;

      // 1. Vincitori dell'ultima giornata: le corse con il premio piu' alto,
      //    al massimo due per pista cosi' non ne occupa una sola tutta la fascia.
      if (ultimaGara) {
        const righe = db.prepare(`
          SELECT r.track, r.horse_name, r.driver, r.time_km, r.prize_net,
                 (SELECT MAX(h.birth_year) FROM horses h WHERE h.name = r.horse_name) AS anno
            FROM races r
           WHERE r.race_date = ? AND r.placement = 1
           ORDER BY r.prize_net DESC`).all(ultimaGara) as any[];
        const perPista = new Map<string, number>();
        for (const r of righe) {
          const k = r.track || "";
          if ((perPista.get(k) ?? 0) >= 3 || k === "ES" || k === "ESTERO") continue;
          perPista.set(k, (perPista.get(k) ?? 0) + 1);
          // Il tempo al km e' salvato come secondi oltre il minuto (13.1 = 1'13"1).
          // Valori fuori da 1'08"-1'30" sono errori della fonte e non si mostrano.
          const t = Number(r.time_km);
          const tempo = t >= 8 && t <= 30 ? `1.${Math.floor(t).toString().padStart(2, "0")}.${Math.round((t % 1) * 10) % 10}` : null;
          risultati.push({
            data: ultimaGara,
            pista: piste.get(k)?.split(" — ")[0] ?? k,
            pista_codice: piste.has(k) ? k : null,
            cavallo: r.horse_name,
            anno: r.anno ?? null,
            guidatore: r.driver || null,
            guidatore_scheda: !!(r.driver && guidatori.has(r.driver)),
            tempo,
          });
          if (risultati.length >= 8) break;
        }
      }

      // 2. Corse in programma da oggi in avanti, una voce per giornata e pista.
      //    I codici del calendario sono diversi da quelli dell'archivio: si
      //    traducono nel nome e si collega la pista solo se ha una scheda.
      if (vpTableExists(db, "upcoming_races")) {
        const righe = db.prepare(`
          SELECT race_date, track, COUNT(DISTINCT race_time) AS corse, COUNT(*) AS partenti
            FROM upcoming_races WHERE race_date >= ?
           GROUP BY race_date, track ORDER BY race_date, partenti DESC LIMIT 8`).all(oggi) as any[];
        for (const r of righe) {
          const nome = NOMI_CALENDARIO[r.track] ?? r.track;
          const codice = piste.has(nome) ? nome : null;
          programma.push({ data: r.race_date, pista: piste.get(nome)?.split(" — ")[0] ?? nome, pista_codice: codice, corse: r.corse, partenti: r.partenti });
        }
      }
    } finally {
      db.close();
    }
    const gh = await statoGitHub();
    res.json({
      risultati,
      programma,
      stato: { gare: gareTotali, ultima_gara: ultimaGara, archivio_pubblicato: gh.archivio_pubblicato ?? null },
    });
  });

  // GET /api/stato-dati
  // Lo stato dell'archivio, per la pagina "Metodo e dati": quanti dati ci sono,
  // fin dove arrivano, quando e' stato pubblicato l'archivio e com'e' andato
  // l'ultimo lavoro notturno. Serve a mostrare che il sito si aggiorna DAVVERO,
  // con date vere, invece di dirlo e basta.
  //
  // Le due informazioni che vengono da GitHub (data di pubblicazione e ultimo
  // notturno) si chiedono al massimo ogni quindici minuti: il repository e'
  // pubblico e non serve nessuna chiave, ma GitHub concede poche domande
  // all'ora a chi non si presenta. Se non risponde, la pagina lo dice invece
  // di inventare una data.
  // ──────────────────────────────────────────────
  app.get("/api/stato-dati", async (_req, res) => {
    const db = getDb();
    const uno = (sql: string, ...a: any[]) => { try { return db.prepare(sql).get(...a) as any; } catch { return null; } };
    let archivio: any;
    try {
      // Il totale conta tutte le gare, come la home; le date solo quelle che ce l'hanno.
      const gare = uno("SELECT COUNT(*) n, MIN(race_date) prima, MAX(race_date) ultima FROM races");
      archivio = {
        gare: gare?.n ?? 0,
        prima_gara: gare?.prima ?? null,
        ultima_gara: gare?.ultima ?? null,
        cavalli_valutati: uno("SELECT COUNT(*) n FROM horse_ratings WHERE rating_mode = 'performance'")?.n ?? 0,
        stalloni_valutati: uno("SELECT COUNT(*) n FROM stallion_rating_stats")?.n ?? 0,
        fattrici_valutate: uno("SELECT COUNT(*) n FROM dam_rating_stats")?.n ?? 0,
        guidatori: vpTableExists(db, "driver_stats") ? uno("SELECT COUNT(*) n FROM driver_stats")?.n ?? 0 : 0,
        ippodromi: vpTableExists(db, "track_stats") ? uno("SELECT COUNT(*) n FROM track_stats")?.n ?? 0 : 0,
        prossima_gara: uno("SELECT MAX(race_date) d FROM upcoming_races")?.d ?? null,
        // Cavalli di cui il lavoro notturno deve ancora controllare se mancano
        // gare vecchie: si svuota da solo, qualche centinaio a notte.
        da_controllare: uno(`SELECT COUNT(*) n FROM horses
                              WHERE birth_year >= 2012
                                AND COALESCE(horse_class, 'athlete') <> 'breeder'
                                AND (backfill_status IS NULL OR backfill_status = 'pending')`)?.n ?? null,
      };
    } finally {
      db.close();
    }
    res.json({ archivio, ...(await statoGitHub()) });
  });

  // GET /api/search/all?q=TESTO
  // Ricerca unica, usata dalla barra in alto su ogni pagina: cerca insieme
  // cavalli, stalloni, fattrici, guidatori e ippodromi, cosi' non serve
  // tornare alla home o alla pagina giusta per cercare una cosa diversa.
  // Poche righe per gruppo: e' fatta per saltare, non per sfogliare.
  // ──────────────────────────────────────────────
  app.get("/api/search/all", (req, res) => {
    const q = (req.query.q as string || "").trim();
    if (q.length < 2) return res.json({ cavalli: [], stalloni: [], fattrici: [], guidatori: [], ippodromi: [], allevatori: [] });
    const db = getDb();
    const Q = q.toUpperCase();
    // Chi comincia con il testo viene prima di chi lo contiene soltanto:
    // cercando "VAR" si vuole VARENNE, non un cavallo che ha VAR nel mezzo.
    const inizio = `${Q}%`, dentro = `%${Q}%`;
    const prova = <T,>(f: () => T, vuoto: T): T => { try { return f(); } catch { return vuoto; } };
    try {
      const cavalli = prova(() => db.prepare(`
        SELECT h.name, h.birth_year, h.sex, hr.grade
        FROM horses h
        LEFT JOIN horse_ratings hr ON hr.name = h.name AND hr.birth_year = h.birth_year
                                  AND hr.rating_mode IN ('performance', 'storico')  -- anche gli storici (TRIXTON SSS usciva senza voto)
        WHERE h.name LIKE ?
          ${vpTableExists(db, "cavalli_alias") ? "AND h.name NOT IN (SELECT alias FROM cavalli_alias)" : ""}
        ORDER BY h.name LIKE ? DESC, COALESCE(hr.score, -1) DESC
        LIMIT 6`).all(dentro, inizio), [] as any[]);
      const stalloni = prova(() => db.prepare(`
        SELECT sire AS name, grade, n_figli_totali
        FROM stallion_rating_stats WHERE sire LIKE ?
        ORDER BY sire LIKE ? DESC, n_figli_totali DESC LIMIT 4`).all(dentro, inizio), [] as any[]);
      const fattrici = prova(() => db.prepare(`
        SELECT dam AS name, grade, n_valutati
        FROM dam_rating_stats WHERE UPPER(dam) LIKE ?
        ORDER BY UPPER(dam) LIKE ? DESC, n_valutati DESC LIMIT 4`).all(dentro, inizio), [] as any[]);
      const guidatori = vpTableExists(db, "driver_stats") ? prova(() => db.prepare(`
        SELECT driver AS name, n_gare, affidabilita_txt
        FROM driver_stats WHERE UPPER(driver) LIKE ?
        ORDER BY UPPER(driver) LIKE ? DESC, n_gare DESC LIMIT 4`).all(dentro, inizio), [] as any[]) : [];
      const ippodromi = vpTableExists(db, "track_stats") ? prova(() => db.prepare(`
        SELECT track AS code, nome AS name, n_gare
        FROM track_stats WHERE UPPER(nome) LIKE ? OR track LIKE ?
        ORDER BY n_gare DESC LIMIT 3`).all(dentro, dentro), [] as any[]) : [];
      const allenatori = vpTableExists(db, "trainer_stats") ? prova(() => db.prepare(`
        SELECT allenatore AS name, nome, n_corse
        FROM trainer_stats WHERE allenatore LIKE ?
        ORDER BY allenatore LIKE ? DESC, n_corse DESC LIMIT 4`).all(dentro, inizio), [] as any[]) : [];
      // Allevatori: dalla seconda fonte, con quanti cavalli hanno allevato.
      const allevatori = vpTableExists(db, "vp_horse_breeder") ? prova(() => db.prepare(`
        SELECT breeder_name AS name, COUNT(DISTINCT horse_name) AS n_cavalli
        FROM vp_horse_breeder WHERE breeder_name != '' AND UPPER(breeder_name) LIKE ?
        GROUP BY breeder_name
        ORDER BY UPPER(breeder_name) LIKE ? DESC, n_cavalli DESC LIMIT 3`).all(dentro, inizio), [] as any[]) : [];
      res.json({ cavalli, stalloni, fattrici, guidatori, allenatori, ippodromi, allevatori });
    } finally {
      db.close();
    }
  });

  // GET /api/search/horse?q=NAME
  // ──────────────────────────────────────────────
  app.get("/api/search/horse", (req, res) => {
    const q = (req.query.q as string || "").trim().toUpperCase();
    const db = getDb();
    try {
      // Con ricerca vuota rispondiamo con i cavalli piu' quotati: serve alla
      // tendina di scelta, che deve mostrare qualcosa anche prima che
      // l'utente scriva.
      const rows = db.prepare(`
        SELECT h.name, h.birth_year, h.sire, h.sex, h.country,
               hr.grade, hr.score, hr.rating_mode,
               COALESCE(h.horse_class, 'athlete') AS horse_class
        FROM horses h
        LEFT JOIN horse_ratings hr ON h.name = hr.name AND h.birth_year = hr.birth_year
                                  AND hr.rating_mode IN ('performance', 'storico')
        WHERE (? = '' OR h.name LIKE ?)
          ${vpTableExists(db, "cavalli_alias") ? "AND h.name NOT IN (SELECT alias FROM cavalli_alias)" : ""}
        ORDER BY CASE WHEN ? = '' THEN -COALESCE(hr.score, -1) ELSE 0 END,
                 COALESCE(h.horse_class, 'athlete') = 'breeder', h.birth_year DESC
        LIMIT 20
      `).all(q, `%${q}%`, q);
      res.json(rows);
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/horse/:name/:year
  // ──────────────────────────────────────────────
  app.get("/api/horse/:name/:year", async (req, res) => {
    const name = decodeURIComponent(req.params.name).toUpperCase();
    const year = parseInt(req.params.year);
    const db = getDb();
    // Tempi delle parti della scheda nell'intestazione Server-Timing
    // (21/11/2026): per vedere da fuori quale parte rallenta.
    const tempi: string[] = [];
    let ultimo = performance.now();
    const segna = (k: string) => { const t = performance.now(); tempi.push(`${k};dur=${(t - ultimo).toFixed(1)}`); ultimo = t; };
    try {
      // Stesso cavallo con due schede: quella da stallone (nome senza sigla,
      // usata dai figli) e quella da corsa (con la sigla del paese). Chi apre
      // la prima viene mandato alla seconda. Vedi phase_collega_stalloni_atleti.
      if (vpTableExists(db, "cavalli_alias")) {
        const al = db.prepare(`SELECT nome, anno FROM cavalli_alias WHERE alias = ?`).get(name) as any;
        if (al) return res.json({ redirect: { name: al.nome, birth_year: al.anno } });
      }
      const horse = db.prepare(`
        SELECT h.name, h.birth_year, h.sex, h.coat_color, h.country, h.sire, h.dam,
               h.career_races, h.career_wins, h.career_places, h.career_earnings, h.record_career,
               h.record_short, h.record_long,
               hr.grade, hr.score, hr.earn_percentile, hr.time_percentile,
               hr.sire_percentile, hr.rating_mode, hr.win_rate,
               hr.stagioni_corse, hr.stagioni_possibili,
               hr.tenuta_percentile, hr.integrita_percentile,
               hr.gare_italia, hr.gare_estero, hr.vitt_italia, hr.vitt_estero,
               hr.guad_italia, hr.guad_estero,
               hr.grade_annata, hr.pos_annata, hr.tot_annata
        FROM horses h
        -- I cavalli storici non hanno un voto sulla scala atleti: il loro sta
        -- in rating_mode='storico'. Senza questo OR la loro scheda mostrerebbe
        -- la casella del voto vuota.
        LEFT JOIN horse_ratings hr ON h.name = hr.name AND h.birth_year = hr.birth_year
                                  AND hr.rating_mode IN ('performance', 'storico')
        WHERE h.name = ? AND h.birth_year = ?
      `).get(name, year) as any;

      if (!horse) return res.status(404).json({ error: "Not found" });

      // Piazzamenti = arrivi nei primi tre, vittorie comprese, contati dalle
      // gare in archivio: e' la stessa regola delle tabelle per anno e per
      // ippodromo piu' in basso nella scheda. Prima la testata mostrava il
      // totale salvato nella scheda, che per 922 cavalli non era aggiornato
      // (Don Fanucci Zet: 0 invece di 54). Solo per i cavalli senza gare in
      // archivio (gli storici) resta il totale preso dalla fonte.
      const tot = db.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN placement BETWEEN 1 AND 3 THEN 1 ELSE 0 END) p
                              FROM races WHERE horse_name = ?`).get(name) as any;
      horse.career_top3 = tot?.n ? (tot.p ?? 0) : ((horse.career_wins ?? 0) + (horse.career_places ?? 0));
      // Carriera completa di chi ha corso soprattutto all'estero
      // (scripts/carriere_complete.py): i totali vengono dalla fonte ufficiale
      // straniera, le gare una per una restano solo quelle italiane.
      horse.carriera_completa = vpTableExists(db, "carriere_complete")
        ? (db.prepare(`SELECT * FROM carriere_complete WHERE nome = ? AND (anno = ? OR anno IS NULL)`).get(name, year) as any) ?? null : null;
      if (horse.carriera_completa?.primi_tre != null) horse.career_top3 = horse.carriera_completa.primi_tre;
      // PIAZZATI DEI CAVALLI STORICI (23/11/2026). Il registro UNIRE conta come
      // "piazzati" gli arrivi dal 2° al 5° (i posti a premio), non dal 2° al
      // 3°: SAMBA BI 23 contro 16 secondi e terzi (26 dal 2° al 5°), NOODLES
      // BIEFFE 241 su 548 corse. Per gli storici si mostrano quindi i "primi
      // cinque" del registro; i primi tre solo se le gare in archivio coprono
      // tutta la carriera.
      horse.career_top5 = null;
      const registro = horse.horse_class === "breeder" && !horse.carriera_completa;
      if (registro && !(tot?.n && tot.n >= (horse.career_races ?? 0))) {
        horse.career_top5 = horse.career_races ? (horse.career_wins ?? 0) + (horse.career_places ?? 0) : null;
        horse.career_top3 = null;
      }
      // "Dove ha corso": l'Italia dalle gare in archivio, l'estero e' quello che
      // manca per arrivare ai totali della fonte straniera (prima diceva 0 euro
      // all'estero a FACE TIME BOURBON, che all'estero ha vinto 3,3 milioni).
      if (horse.carriera_completa) {
        const cc = horse.carriera_completa;
        const it = db.prepare(`SELECT COUNT(*) n, SUM(placement = 1) v, COALESCE(SUM(prize_net), 0) e
                               FROM races WHERE horse_name = ? AND track <> 'ESTERO'`).get(name) as any;
        horse.gare_italia = it?.n ?? 0; horse.vitt_italia = it?.v ?? 0; horse.guad_italia = it?.e ?? 0;
        horse.gare_estero = Math.max(0, cc.corse - horse.gare_italia);
        horse.vitt_estero = Math.max(0, cc.vittorie - horse.vitt_italia);
        horse.guad_estero = Math.max(0, cc.guadagni_eur - horse.guad_italia);
      }
      // Carriera parziale (novembre 2026): cavalli con gare in archivio ma senza
      // i totali di carriera. Sono quelli recuperati dai risultati ufficiali
      // MASAF (solo dal 2016) che le schede di TrottoWeb non trovano, e i
      // riproduttori nati prima del 2012. Invece di "0 corse, 0 euro" la
      // testata mostra i conti delle gare che abbiamo, e dice che sono parziali.
      // Le gare si contano da due anni dopo la nascita (omonimi piu' anziani).
      horse.carriera_parziale = null;
      if (!(horse.career_races > 0) && tot?.n > 0) {
        const conCalc = (db.prepare("PRAGMA table_info(races)").all() as any[]).some(c => c.name === "prize_calc");
        const s = db.prepare(`
          SELECT COUNT(*) n,
                 SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) w,
                 SUM(CASE WHEN placement BETWEEN 2 AND 3 THEN 1 ELSE 0 END) pl,
                 SUM(COALESCE(prize_net, 0)) e,
                 MIN(CASE WHEN time_km > 0 THEN time_km END) rec,
                 MIN(race_date) prima, MAX(race_date) ultima,
                 ${conCalc ? "SUM(CASE WHEN prize_calc = 1 THEN 1 ELSE 0 END)" : "0"} stimati
          FROM races WHERE horse_name = ? AND (? IS NULL OR race_date >= (? + 2) || '-01-01')`)
          .get(name, horse.birth_year ?? null, horse.birth_year ?? null) as any;
        if (s?.n > 0) {
          horse.career_races = s.n;
          horse.career_wins = s.w ?? 0;
          horse.career_places = s.pl ?? 0;
          horse.career_top3 = (s.w ?? 0) + (s.pl ?? 0);
          horse.career_earnings = Math.round((s.e ?? 0) * 100) / 100;
          if (!horse.record_career && s.rec) horse.record_career = s.rec;
          horse.carriera_parziale = { n: s.n, dal: s.prima, al: s.ultima, premi_stimati: s.stimati ?? 0 };
        }
      }
      // E' anche stallone da monta? Allora la scheda porta alla pagina stallone.
      horse.stallone_come = vpTableExists(db, "cavalli_alias")
        ? ((db.prepare(`SELECT alias FROM cavalli_alias WHERE nome = ?`).get(name) as any)?.alias ?? null)
        : null;
      // E' anche fattrice? Allora la scheda porta alla pagina fattrice, con i
      // figli e gli stessi punti della pagina Fattrici. I figli possono citare
      // la madre senza la sigla del paese (SIMPLY ROD invece di SIMPLY ROD (F)).
      horse.come_fattrice = null;
      if (horse.sex === "F") {
        const nomi = Array.from(new Set([name, name.replace(/\s*\([A-Z]{1,3}\)$/, "").trim()]));
        for (const n of nomi) {
          const k = (db.prepare(`SELECT COUNT(*) AS n FROM horses WHERE UPPER(TRIM(dam)) = ?
                                    AND (? IS NULL OR birth_year IS NULL OR birth_year >= ? + 2)`)
            .get(n, horse.birth_year ?? null, horse.birth_year ?? null) as any)?.n ?? 0;
          if (k > 0) {
            const pf = puntiFattrice(db, n);
            horse.come_fattrice = { nome: n, n_figli: k, punti: pf?.punti ?? null, grado: pf?.grado ?? null };
            break;
          }
        }
      }
      // Scheda vuota di un riproduttore (novembre 2026): nessuna gara in
      // archivio e nessun totale di carriera. Sono soprattutto stalloni che
      // hanno corso solo all'estero (MAHARAJAH, 641 figli; LOVE YOU, 618): su
      // UNIRE risultano con 0 corse in Italia e la scheda da cavallo
      // resterebbe vuota per sempre. Chi la apre va direttamente alla pagina
      // da stallone o da fattrice, che ha figli, voto e statistiche. Appena un
      // riproduttore riceve una carriera (la ricerca notturna su UNIRE), la
      // scheda torna a mostrarsi.
      segna("base");
      horse.potenziale = potenzialeCavallo(db, name, horse.birth_year ?? null);
      // Forza e curva di carriera (forza.py): nella scheda prendono il posto
      // del potenziale ai 4 anni.
      // Forza e curva della carriera si calcolano dalle gare una per una, che
      // per chi ha corso all'estero sono solo quelle italiane: con la carriera
      // completa sarebbero sbagliate (FACE TIME BOURBON: curva da B 63,9 contro
      // un voto SSS), quindi non si mostrano.
      horse.forza = horse.carriera_completa ? null : forzaCavallo(db, name);
      // E' uno stallone del sito (ha il voto da stallone)? Stemma verde e
      // collegamento alla pagina da stallone. Per gli stalloni nati o
      // cresciuti all'estero il voto da cavallo conta solo le corse in Italia:
      // non e' confrontabile con quello degli altri (19/11/2026).
      {
        const nomeStallone = horse.stallone_come ?? name;
        const st = db.prepare(`SELECT sire, n_figli_totali, grade FROM stallion_rating_stats
                               WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?))`).get(nomeStallone) as any;
        horse.stallone = st ? { nome: st.sire, n_figli: st.n_figli_totali, voto: st.grade } : null;
        const paese = String(horse.country ?? "").toUpperCase();
        horse.ospite_estero = vpTableExists(db, "ospiti_esteri")
          ? (db.prepare(`SELECT motivo, gare_italia, gare_totali FROM ospiti_esteri WHERE nome = ?`).get(name) as any) ?? null : null;
        // Il voto di un ospite estero conta tutta la carriera: e' confrontabile.
        horse.voto_non_comparabile = !!st && !!paese && paese !== "ITA" && paese !== "IT" && !horse.carriera_completa && !horse.ospite_estero;
      }
      horse.vai_a_pagina = null;
      if (!(horse.career_races > 0) && !(tot?.n > 0) && !horse.stallone) {
        const figliDa = (col: string) => (db.prepare(
          `SELECT COUNT(*) AS n FROM horses WHERE UPPER(TRIM(${col})) = UPPER(TRIM(?))`).get(name) as any)?.n ?? 0;
        const haStatsStallone = !!db.prepare(
          `SELECT 1 FROM stallion_rating_stats WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?))`).get(name);
        if (horse.sex !== "F" && (haStatsStallone || figliDa("sire") > 0)) {
          horse.vai_a_pagina = `/stallion/${encodeURIComponent(name)}`;
        } else if (horse.sex !== "M" && horse.sex !== "C" && (horse.come_fattrice || figliDa("dam") > 0)) {
          horse.vai_a_pagina = `/fattrice/${encodeURIComponent(horse.come_fattrice?.nome ?? name)}`;
        }
      }

      segna("potenziale_forza");
      // Last 20 races
      const races = db.prepare(`
        SELECT race_date, track, placement, placement_raw, time_km,
               distance, driver, prize_net, prize_gross, race_code
        FROM races
        WHERE horse_name = ?
        ORDER BY race_date DESC
        LIMIT 20
      `).all(name) as any[];

      // Siblings (same sire, top 5 by earnings)
      const siblings = db.prepare(`
        SELECT hr2.name, hr2.birth_year, hr2.grade, hr2.score, hr2.career_earnings
        FROM horse_ratings hr2
        WHERE hr2.sire = ? AND hr2.name != ? AND hr2.rating_mode = 'performance'
        ORDER BY hr2.career_earnings DESC
        LIMIT 6
      `).all(horse.sire, name) as any[];

      // Genealogy: grandparents via self-join on horses table
      const pedigreeRow = db.prepare(`
        SELECT
          s.sire  AS sire_sire,
          s.dam   AS sire_dam,
          d.sire  AS dam_sire,
          d.dam   AS dam_dam,
          s.unire_sire AS sire_unire_sire, s.unire_dam AS sire_unire_dam,
          d.unire_sire AS dam_unire_sire,  d.unire_dam AS dam_unire_dam
        FROM horses h
        -- Nomi gia' maiuscoli e senza spazi ai bordi: il confronto diretto usa
        -- l'indice (con UPPER/TRIM si leggevano tutti i cavalli, tre volte).
        LEFT JOIN horses s ON s.name = h.sire AND h.sire IS NOT NULL AND h.sire != '' AND ${genitoreCompatibile("s", "h")}
        LEFT JOIN horses d ON d.name = h.dam  AND h.dam  IS NOT NULL AND h.dam  != '' AND ${genitoreCompatibile("d", "h")}
        WHERE h.name = ? AND h.birth_year = ?
        LIMIT 1
      `).get(name, year) as any;

      // Fallback to stallion_pedigree for grandparents when sire/dam are international stallions
      const sireName = (horse.sire || '').trim().toUpperCase();
      const spSire = sireName
        ? db.prepare(`SELECT * FROM stallion_pedigree WHERE UPPER(TRIM(name)) = ?`).get(sireName) as any
        : null;
      const damName = (horse.dam || '').trim().toUpperCase();
      const spDam = damName
        ? db.prepare(`SELECT * FROM stallion_pedigree WHERE UPPER(TRIM(name)) = ?`).get(damName) as any
        : null;

      // Ultima rete di sicurezza: la genealogia della seconda fonte, che
      // arriva a cinque generazioni anche per i cavalli esteri. Senza questa
      // i nonni materni restavano quasi sempre vuoti, perche' le fattrici
      // anziane non compaiono nell'archivio corse.
      const vp = vpAncestorMap(db, name);

      // Stesso albero della pagina Pedigree (genealogia propria di padre e
      // madre compresa). Se la fonte non ha ancora la genealogia la si chiede,
      // ma senza far aspettare la scheda piu' di qualche secondo.
      segna("gare_nonni");
      await Promise.race([completaGenealogia(db, name), new Promise(r => setTimeout(r, 4000))]);
      segna("fonte_genealogia");
      const { tree: alberoIntero } = alberoGenealogico(db, name);
      segna("albero");
      const nome = (x: any) => (x && x.name) || null;
      // L'albero cerca il cavallo per nome: con un omonimo di un'altra annata
      // i genitori potrebbero essere diversi, e allora non lo si usa.
      const stesso = (a: any, b: any) => !b || !a || String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
      const albero = alberoIntero ? {
        sire: stesso(nome(alberoIntero.sire), horse.sire) ? alberoIntero.sire : null,
        dam:  stesso(nome(alberoIntero.dam),  horse.dam)  ? alberoIntero.dam  : null,
      } : null;
      const pedigree = {
        sire:      horse.sire || nome(albero?.sire) || vp.get("p") || null,
        dam:       horse.dam  || nome(albero?.dam)  || vp.get("m") || null,
        sire_sire: nome(albero?.sire?.sire) || pedigreeRow?.sire_sire || pedigreeRow?.sire_unire_sire || spSire?.sire || vp.get("pp") || null,
        sire_dam:  nome(albero?.sire?.dam)  || pedigreeRow?.sire_dam  || pedigreeRow?.sire_unire_dam  || spSire?.dam  || vp.get("mp") || null,
        dam_sire:  nome(albero?.dam?.sire)  || pedigreeRow?.dam_sire  || pedigreeRow?.dam_unire_sire  || spDam?.sire  || vp.get("pm") || null,
        dam_dam:   nome(albero?.dam?.dam)   || pedigreeRow?.dam_dam   || pedigreeRow?.dam_unire_dam   || spDam?.dam   || vp.get("mm") || null,
      };

      /* Valore residuo di carriera.
         Il cavallo si considera in attivita' se ha corso nell'anno in
         corso o in quello precedente: la stagione e' lunga e un cavallo
         che ha corso a novembre non e' ritirato a gennaio. */
      const annoOggi = new Date().getFullYear();
      segna("pedigree");
      /* Circa una gara su dieci nell'archivio non ha data. Per un cavallo
         con qualche gara datata non e' un problema, ma per uno che non ne
         ha nessuna non si puo' dire se sia fermo o se manchi il dato: sono
         due cose diverse e vanno distinte, altrimenti un campione in
         attivita' verrebbe dichiarato ritirato. */
      const gareInfo = db.prepare(`
        SELECT MAX(race_date) AS ultima,
               COUNT(*) AS n_tot,
               SUM(CASE WHEN race_date LIKE '____-%' THEN 1 ELSE 0 END) AS n_datate
        FROM races WHERE horse_name = ?
      `).get(name) as any;
      const annoUltimaGara = gareInfo?.ultima
        ? parseInt(String(gareInfo.ultima).slice(0, 4)) : null;
      const dateMancanti = (gareInfo?.n_tot || 0) > 0 && (gareInfo?.n_datate || 0) === 0;
      const inAttivita = annoUltimaGara != null && annoUltimaGara >= annoOggi - 1;

      let valoreCarriera = stimaValoreResiduo(
        horse.score,
        horse.birth_year,
        horse.career_earnings || 0,
        inAttivita,
        annoOggi,
      );
      // Stima nuova (eta' + premi dell'ultimo anno, calcolata di notte):
      // se c'e' sostituisce la vecchia tavola per fascia di voto.
      if (inAttivita) {
        let riga: RigaValoreResiduo | undefined;
        try {
          riga = db.prepare(`SELECT * FROM valore_residuo WHERE horse_name = ?`).get(name) as any;
        } catch { riga = undefined; /* tabella non ancora creata */ }
        if (riga) valoreCarriera = stimaDaGradini(riga, horse.career_earnings || 0);
      }
      if (valoreCarriera && dateMancanti) {
        const motivo =
          "Le gare di questo cavallo sono in archivio senza data, quindi " +
          "non si puo' stabilire se sia ancora in attivita'. La stima " +
          "richiede di sapere quando ha corso l'ultima volta.";
        valoreCarriera = { ...valoreCarriera, disponibile: false, motivo,
                           giudizio: "non_stimabile", titolo: "Non stimabile",
                           spiegazione: motivo };
      }

      // Quanto pesa la lettera che questo cavallo ha addosso. Un SSS a tre
      // anni resta SSS nel 39% dei casi, a otto nel 98%: senza dirlo, il
      // sito presenta come equivalenti due giudizi molto diversi.
      // Solo per i cavalli in gara: gli storici hanno la loro scala, e per
      // loro non esistono le date da cui ricostruire la stabilita'.
      const affidabilita =
        horse.rating_mode === "performance" && horse.birth_year
          ? affidabilitaVoto(annoOggi - horse.birth_year, horse.grade)
          : null;

      // Voto previsto a fine carriera (voto_previsto.py): solo per le eta'
      // in cui la prova sul passato ha battuto il voto attuale.
      let votoPrevisto: any = null;
      if (horse.rating_mode === "performance") {
        try {
          const vp: any = db.prepare(
            "SELECT eta, voto_coetanei, voto_previsto, voto_basso, voto_alto, calcolato_il FROM voto_previsto WHERE horse_name = ?"
          ).get(String(horse.name).trim().toUpperCase());
          const ver = leggiJsonModelli("voto_previsto_verifica.json");
          const m = vp && ver?.per_eta?.[String(vp.eta)];
          if (vp && m && horse.birth_year && Number(vp.eta) === annoOggi - horse.birth_year) {
            votoPrevisto = {
              ...vp,
              prova: {
                cavalli: ver.per_eta[String(vp.eta)].cavalli,
                giusta_modello: m.modello.lettera_giusta,
                giusta_attuale: m.voto_attuale.lettera_giusta,
                accanto_modello: m.modello.giusta_o_accanto,
                accanto_attuale: m.voto_attuale.giusta_o_accanto,
                copertura: m.copertura_intervallo,
                periodo: ver.periodo_prova,
              },
            };
          }
        } catch { /* tabella non ancora creata */ }
      }

      // La prova di qualifica: il primo tempo ufficiale, prima del debutto.
      // Viene dalla seconda fonte (vp_qualifiche). Il nome da solo non basta,
      // ci sono omonimi: si tiene la prova dell'annata giusta, oppure, se
      // l'annata non e' segnata, una prova fatta fra 1 e 6 anni dopo la nascita.
      segna("valore_voto");
      let qualifica: any = null;
      if (vpTableExists(db, "vp_qualifiche") && horse.birth_year) {
        try {
          const haAnnata = (db.prepare("PRAGMA table_info(vp_qualifiche)").all() as any[]).some(c => c.name === "annata");
          const filtroAnnata = haAnnata
            ? "(annata = @anno OR (annata IS NULL AND CAST(substr(qual_date,1,4) AS INTEGER) - @anno BETWEEN 1 AND 6))"
            : "CAST(substr(qual_date,1,4) AS INTEGER) - @anno BETWEEN 1 AND 6";
          const prove = db.prepare(`
            SELECT qual_date, track, time_raw, time_km, trainer
            FROM vp_qualifiche WHERE horse_name = @nome AND ${filtroAnnata}
            ORDER BY (track = 'ES'), (CAST(substr(qual_date,1,4) AS INTEGER) - @anno >= 5), qual_date ASC
          `).all({ nome: String(horse.name).trim().toUpperCase(), anno: horse.birth_year }) as any[];
          if (prove.length) {
            const q = prove[0];
            let posizione: number | null = null, suTotale: number | null = null;
            // Posizione fra le qualifiche principali italiane dell'annata
            // (una per cavallo): un tempo fatto all'estero non si confronta.
            const tardivaQ = Number(String(q.qual_date).slice(0, 4)) - horse.birth_year >= 5;
            if (haAnnata && q.time_km && q.track !== "ES" && !tardivaQ) {
              const tempi = tempiQualificaAnnata(db, horse.birth_year);
              let sotto = 0;
              while (sotto < tempi.length && tempi[sotto] < q.time_km) sotto++;
              if (tempi.length >= 50) { posizione = sotto + 1; suTotale = tempi.length; }
            }
            qualifica = {
              // Un tempo non credibile (es. "1.8.3") ha time_km vuoto: non si
              // mostra come tempo, ma si dice cosa scrive la fonte.
              data: q.qual_date, pista: q.track || null,
              tempo: q.time_km != null ? q.time_raw || null : null,
              tempo_scartato: q.time_km == null && q.time_raw ? q.time_raw : null,
              allenatore: q.trainer || null,
              eta: Number(String(q.qual_date).slice(0, 4)) - horse.birth_year,
              prove: prove.length,
              estero: q.track === "ES",
              tardiva: q.track !== "ES" && tardivaQ,
              altre: prove.length > 1 ? altreProve(db, String(horse.name).trim().toUpperCase(), haAnnata ? horse.birth_year : null, q) : [],
              posizione_annata: posizione, cavalli_annata: suTotale,
            };
          }
        } catch { /* fonte non ancora pronta */ }
      }

      segna("qualifica");
      const radar = radarCavallo(db, horse);
      segna("radar");
      res.setHeader("Server-Timing", tempi.join(", "));
      res.json({
        ...horse, races, siblings, pedigree,
        qualifica,
        voto_previsto: votoPrevisto,
        anno_ultima_gara: annoUltimaGara,
        in_attivita: inAttivita,
        valore_carriera: valoreCarriera,
        affidabilita_voto: affidabilita,
        radar,
        // Km su gara corta e lunga (server/distanza.ts, scripts/record_distanza.py).
        distanza: (() => { try { return distanzaCavallo(db, name, { corto: horse.record_short, lungo: horse.record_long }); } catch { return null; } })(),
        totali_mondiali: horse.rating_mode === "storico" ? totaleMondiale(horse.name, horse.birth_year) : null,
      });
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/search/stallion?q=NAME
  // ──────────────────────────────────────────────
  app.get("/api/search/stallion", (req, res) => {
    // Novembre 2026: la tendina (NameSelect) legge name, grade e birth_year e
    // si aspetta un elenco anche a ricerca vuota. Prima la rotta non dava il
    // voto e a tendina aperta restituiva un elenco vuoto ("Nessun cavallo
    // trovato"). Ordine per voto finale, non per media grezza dei figli, che
    // metteva in cima stalloni con due o tre figli.
    const q = (req.query.q as string || "").trim().toUpperCase();
    const db = getDb();
    try {
      const rows = db.prepare(`
        SELECT s.sire AS name, s.grade, s.final_score AS score,
               (SELECT MIN(h.birth_year) FROM horses h WHERE h.name = s.sire) AS birth_year,
               (SELECT h.sire FROM horses h WHERE h.name = s.sire LIMIT 1) AS sire,
               s.n_figli_totali, s.n_in_corsa, s.avg_score, s.n_SSS, s.n_SS, s.n_S, s.pct_top_S
        FROM stallion_rating_stats s
        WHERE (? = '' OR UPPER(s.sire) LIKE ?)
        GROUP BY s.sire
        ORDER BY (UPPER(s.sire) LIKE ?) DESC, COALESCE(s.final_score, -1) DESC
        LIMIT 25
      `).all(q, `%${q}%`, `${q}%`);
      res.json(rows);
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/stallion/:name
  // ──────────────────────────────────────────────
  app.get("/api/stallion/:name", (req, res) => {
    let name = decodeURIComponent(req.params.name).toUpperCase();
    const db = getDb();
    try {
      // Stats aggregate (may be null for stallions without offspring data yet)
      const statsDi = (n: string) => db.prepare(`
        SELECT * FROM stallion_rating_stats
        WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?))
      `).get(n) as any;
      let stats = statsDi(name);
      // Omonimi (omonimi.py): lo stallone puo' stare sotto il nome con l'anno
      // ("BRILLANTISSIME (2011)") mentre il nome semplice e' di un altro
      // cavallo. Chi arriva dal catalogo con il nome semplice va ai figli giusti.
      if (!stats && vpTableExists(db, "omonimi")) {
        for (const o of db.prepare(`SELECT nome_omonimo FROM omonimi WHERE nome = ?`).all(name) as any[]) {
          const st = statsDi(o.nome_omonimo);
          if (st) { name = String(o.nome_omonimo).toUpperCase(); stats = st; break; }
        }
      }
      const nomeCatalogo = name.replace(/ \(\d{4}\)$/, "");

      // From stallions table (stud fee, farm, status, etc.)
      const stud = db.prepare(`
        SELECT name, stud_fee_eur, stud_farm, stud_status, progeny_earnings_2024,
               media_in_corsa, tot_prod, tot_in_corsa, perc_in_corsa,
               tot_vitt, perc_vitt, country,
               stud_farm_address, record_1600, record_2000, catalog_earnings_eur,
               catalog_birth_year, catalog_sire, catalog_dam, catalog_dam_sire,
               catalog_notes, catalog_url, catalog_synced_at
        FROM stallions
        WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))
        ORDER BY stud_fee_eur DESC
        LIMIT 1
      `).get(nomeCatalogo) as any;

      // Top children (performance only) - empty if no offspring data
      const children = db.prepare(`
        SELECT name, birth_year, grade, score, career_earnings, record_career, win_rate, sire_percentile
        FROM horse_ratings
        WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?)) AND rating_mode = 'performance'
        ORDER BY career_earnings DESC
        LIMIT 20
      `).all(name) as any[];

      // Grade distribution - empty if no offspring data
      const gradeDist = db.prepare(`
        SELECT grade, COUNT(*) as cnt
        FROM horse_ratings
        WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?)) AND rating_mode = 'performance'
        GROUP BY grade
        ORDER BY cnt DESC
      `).all(name) as any[];

      // Genealogy: try horses table first, then fallback to stallion_pedigree
      const horseSelf = db.prepare(`
        SELECT h.sire, h.dam, h.unire_sire, h.unire_dam,
               s.sire AS sire_sire, s.dam AS sire_dam,
               d.sire AS dam_sire, d.dam AS dam_dam,
               s.unire_sire AS sire_unire_sire, s.unire_dam AS sire_unire_dam,
               d.unire_sire AS dam_unire_sire, d.unire_dam AS dam_unire_dam
        FROM horses h
        LEFT JOIN horses s ON UPPER(TRIM(s.name)) = UPPER(TRIM(h.sire)) AND h.sire IS NOT NULL AND h.sire != '' AND ${genitoreCompatibile("s", "h")}
        LEFT JOIN horses d ON UPPER(TRIM(d.name)) = UPPER(TRIM(h.dam)) AND h.dam IS NOT NULL AND h.dam != '' AND ${genitoreCompatibile("d", "h")}
        WHERE h.name = ?
        LIMIT 1
      `).get(name) as any;

      const spRow = db.prepare(`
        SELECT * FROM stallion_pedigree
        WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))
        LIMIT 1
      `).get(name) as any;

      // Le righe di stallion_pedigree prese un tempo dal web, non verificate,
      // erano a volte sbagliate (FILIPP ROC figlio di VARENNE invece che di
      // URONOMETRO): le corregge ogni notte scripts/correggi_genealogie_stalloni.py.
      // Una riga ancora non verificata non riempie le caselle dei nonni.
      const fonteSp = String(spRow?.source ?? "");
      const spVerificata = !!spRow && (fonteSp === "" || fonteSp === "UNIRE" || fonteSp === "ANACT"
        || fonteSp === "Trottoweb" || fonteSp.startsWith("Verificata:") || fonteSp === "Archivio corse");
      const ugualeN = (x: any, y: any) => !!x && !!y && String(x).trim().toUpperCase() === String(y).trim().toUpperCase();
      const padreArch = horseSelf ? (horseSelf.sire || horseSelf.unire_sire || null) : null;
      const madreArch = horseSelf ? (horseSelf.dam || horseSelf.unire_dam || null) : null;
      // I nonni dalla riga verificata solo se padre (o madre) coincidono.
      const spLatoPadre = spVerificata && ugualeN(spRow?.sire, padreArch) ? spRow : null;
      const spLatoMadre = spVerificata && ugualeN(spRow?.dam, madreArch) ? spRow : null;
      const pedigree = (horseSelf && (horseSelf.sire || horseSelf.unire_sire)) ? {
        sire: padreArch,
        dam: madreArch || (spLatoPadre?.dam ?? null),
        sire_sire: horseSelf.sire_sire || horseSelf.sire_unire_sire || spLatoPadre?.sire_sire || null,
        sire_dam: horseSelf.sire_dam || horseSelf.sire_unire_dam || spLatoPadre?.sire_dam || null,
        dam_sire: horseSelf.dam_sire || horseSelf.dam_unire_sire || spLatoMadre?.dam_sire || null,
        dam_dam: horseSelf.dam_dam || horseSelf.dam_unire_dam || spLatoMadre?.dam_dam || null,
      } : spRow ? {
        sire: spRow.sire || null,
        dam: spRow.dam || null,
        sire_sire: spRow.sire_sire || null,
        sire_dam: spRow.sire_dam || null,
        dam_sire: spRow.dam_sire || null,
        dam_dam: spRow.dam_dam || null,
      } : null;

      // Il catalogo monte indica padre, madre e nonno materno: usiamoli per
      // riempire le caselle vuote, senza mai sovrascrivere i dati ufficiali.
      const catalogPedigree = (stud && (stud.catalog_sire || stud.catalog_dam))
        ? {
            sire: stud.catalog_sire || null,
            dam: stud.catalog_dam || null,
            sire_sire: null,
            sire_dam: null,
            dam_sire: stud.catalog_dam_sire || null,
            dam_dam: null,
          }
        : null;
      const mergedPedigree = (pedigree || catalogPedigree)
        ? {
            sire: pedigree?.sire || catalogPedigree?.sire || null,
            dam: pedigree?.dam || catalogPedigree?.dam || null,
            sire_sire: pedigree?.sire_sire || null,
            sire_dam: pedigree?.sire_dam || null,
            dam_sire: pedigree?.dam_sire || catalogPedigree?.dam_sire || null,
            dam_dam: pedigree?.dam_dam || null,
          }
        : null;

      // Nationality: prefer stallion_pedigree, fallback to stallions.country, then horses.country
      const natFromHorses = db.prepare(`
        SELECT h.country
        FROM horses h
        WHERE h.name = ? AND COALESCE(TRIM(h.country), '') NOT IN ('', 'EST')
        LIMIT 1
      `).get(name) as any;

      const nationality =
        spRow?.nationality ||
        stud?.country ||
        natFromHorses?.country ||
        null;

      // Return 404 solo se il cavallo non esiste da nessuna parte
      if (!stats && !stud && !spRow && children.length === 0) {
        return res.status(404).json({ error: "Not found" });
      }

      // Struttura flat compatibile con StallionPage.tsx
      // + nuovi campi rating: grade, vp_boost, final_score
      const no_offspring_data = !stats && children.length === 0;

      const payload = {
        // Identificazione (flat, come si aspetta StallionPage)
        sire:            stats?.sire            ?? name,
        n_figli_totali:  stats?.n_figli_totali  ?? 0,
        n_in_corsa:      stats?.n_in_corsa      ?? 0,
        avg_score:       stats?.avg_score       ?? null,
        grade:           stats?.grade           ?? null,      // NUOVO — voto stallone (SSS…F)
        vp_boost:        stats?.vp_boost        ?? 0,         // NUOVO — boost VP (max +5)
        final_score:     stats?.final_score     ?? null,      // NUOVO — punteggio finale
        pct_top_S:       stats?.pct_top_S       ?? null,
        avg_earnings:    stats?.avg_earnings    ?? null,
        // L'affidabilita' viaggia sempre col voto: dice se si sta leggendo una
        // misura o un'impressione. Dipende da quanti figli hanno davvero corso,
        // non da quanti ne sono nati.
        affidabilita:     stats?.affidabilita     ?? null,
        affidabilita_txt: stats?.affidabilita_txt ?? null,
        n_figli_corsi:    stats?.n_figli_corsi    ?? null,
        max_earnings:    children.length > 0
                           ? Math.max(...children.map((c: any) => c.career_earnings ?? 0))
                           : null,
        avg_win_rate:    children.length > 0
                           ? (children.reduce((s: number, c: any) => s + (c.win_rate ?? 0), 0) / children.length)
                           : null,
        n_SSS:           stats?.n_SSS ?? 0,
        n_SS:            stats?.n_SS  ?? 0,
        n_S:             stats?.n_S   ?? 0,
        n_A:             (stats as any)?.n_A ?? 0,
        n_B:             (stats as any)?.n_B ?? 0,
        n_C:             (stats as any)?.n_C ?? 0,
        n_D:             (stats as any)?.n_D ?? 0,
        n_E:             (stats as any)?.n_E ?? 0,
        n_F:             (stats as any)?.n_F ?? 0,
        // Stud info
        stud: stud ? {
          stud_fee_eur:          stud.stud_fee_eur,
          stud_farm:             stud.stud_farm,
          stud_status:           stud.stud_status,
          progeny_earnings_2024: stud.progeny_earnings_2024,
          media_in_corsa:        stud.media_in_corsa,
          tot_prod:              stud.tot_prod,
          // Dati del catalogo monte 2026. I recapiti telefonici restano
          // volutamente nel database e non vengono mai esposti qui.
          stud_farm_address:     stud.stud_farm_address,
          record_1600:           stud.record_1600,
          record_2000:           stud.record_2000,
          catalog_earnings_eur:  stud.catalog_earnings_eur,
          catalog_birth_year:    stud.catalog_birth_year,
          catalog_sire:          stud.catalog_sire,
          catalog_dam:           stud.catalog_dam,
          catalog_dam_sire:      stud.catalog_dam_sire,
          catalog_url:           stud.catalog_url,
          catalog_synced_at:     stud.catalog_synced_at,
        } : null,
        // Figli piu' adatti al corto o al lungo (scripts/record_distanza.py).
        distanza_figli: (() => { try { return distanzaStallone(db, name); } catch { return null; } })(),
        // Anno di nascita, periodo in monta e generazione (server/alberoStalloni.ts).
        attivita: (() => { try { return attivitaStallone(db, String(mtimeDb()), name); } catch { return null; } })(),
        nonno: (() => { try { return nonnoStallone(db, name, cacheNonni, String(mtimeDb())); } catch { return null; } })(),
        // Children, distribution, pedigree
        children,
        gradeDist,
        pedigree: mergedPedigree,
        nationality,
        // Flag utili
        no_offspring_data,
        has_offspring_data: !!stats,
        // La sua scheda da cavallo (carriera), se c'e' con l'anno di nascita.
        scheda_cavallo: (() => {
          const al = vpTableExists(db, "cavalli_alias")
            ? (db.prepare(`SELECT nome, anno FROM cavalli_alias WHERE alias = ?`).get(name) as any) : null;
          if (al) return { name: al.nome, birth_year: al.anno };
          const h = db.prepare(`SELECT name, birth_year FROM horses WHERE name = ? AND birth_year IS NOT NULL`).get(name) as any;
          return h ? { name: h.name, birth_year: h.birth_year } : null;
        })(),
      };

      res.json(payload);
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/leaderboard?year=&grade=&sire=&page=&limit=
  // ──────────────────────────────────────────────
  app.get("/api/leaderboard", (req, res) => {
    const year = req.query.year ? parseInt(req.query.year as string) : null;
    const grade = req.query.grade as string || null;
    const sire = req.query.sire ? (req.query.sire as string).toUpperCase() : null;
    const mode = req.query.mode as string || "performance";
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 25);
    const haOspiti = (() => { const d = getDb(); try { return vpTableExists(d, "ospiti_esteri"); } finally { d.close(); } })();
    const offset = (page - 1) * limit;
    const sortBy = req.query.sort as string || "score";

    // hr.* qualificato: la query principale fa JOIN con horses, e un
    // horse_class nudo sarebbe ambiguo (errore SQLite visto in test).
    // La classifica storica ha una popolazione sua: i cavalli di cui
    // l'archivio conosce solo i totali di carriera, senza le singole gare.
    // Vanno confrontati fra loro, quindi il filtro sugli atleti non si applica.
    const storico = mode === "storico";
    // Classifica storica: "tutta la carriera" (predefinita) o "solo in Italia"
    // (23/11/2026). I totali italiani stanno in gare_italia/vitt_italia/guad_italia.
    const soloItalia = storico && req.query.ambito === "italia";
    const C = (campo: "career_races" | "career_wins" | "career_earnings") =>
      !soloItalia ? `hr.${campo}`
        : `COALESCE(hr.${campo === "career_races" ? "gare_italia" : campo === "career_wins" ? "vitt_italia" : "guad_italia"}, hr.${campo})`;
    const conditions: string[] = storico
      ? ["hr.rating_mode = ?"]
      : ["hr.rating_mode = ?", ONLY_ATHLETES];
    const params: any[] = [mode];
    // Il voto da pedigree vale solo per chi non ha mai corso: chi ha gia' un
    // voto dalle corse (o fra gli storici) non entra in questa classifica.
    // La fase notturna toglie queste righe; il filtro copre l'attesa.
    if (mode === "pedigree") {
      conditions.push("COALESCE(h.career_races, 0) = 0");
      conditions.push("NOT EXISTS (SELECT 1 FROM horse_ratings a WHERE a.name = hr.name AND a.birth_year = hr.birth_year AND a.rating_mode IN ('performance','storico'))");
    }

    if (year) { conditions.push("hr.birth_year = ?"); params.push(year); }
    // Il filtro sul voto puo' agire sulla lettera globale o su quella
    // d'annata: sono letture diverse dello stesso punteggio, e chi cerca "i
    // migliori del 2023" intende la seconda.
    const votoAnnata = req.query.voto === "annata";
    if (grade) {
      conditions.push(votoAnnata ? "hr.grade_annata = ?" : "hr.grade = ?");
      params.push(grade);
    }
    if (votoAnnata) { conditions.push("hr.grade_annata IS NOT NULL"); }
    if (sire) { conditions.push("hr.sire LIKE ?"); params.push(`%${sire}%`); }

    // Un voto costruito su una o due corse non e' confrontabile con uno
    // costruito su cinquanta: chi vuole una classifica solida filtra qui.
    const minRaces = parseInt(req.query.min_races as string) || 0;
    if (minRaces > 0) { conditions.push("COALESCE(hr.career_races,0) >= ?"); params.push(minRaces); }

    // Dove ha corso. Non tocca il voto, filtra soltanto: una gara all'estero
    // paga in media quasi quattro volte una italiana, e c'e' chi vuole vedere
    // solo chi ha fatto carriera in Italia - o solo chi e' andato fuori.
    const dove = req.query.dove as string || null;
    if (dove === "italia") {
      // Carriera fatta in Italia: nessuna gara all'estero.
      conditions.push("COALESCE(hr.gare_estero, 0) = 0");
    } else if (dove === "estero") {
      conditions.push("COALESCE(hr.gare_estero, 0) > 0");
    } else if (dove === "misto") {
      // Carriera divisa: almeno una gara in Italia e almeno una all'estero.
      conditions.push("COALESCE(hr.gare_estero, 0) > 0 AND COALESCE(hr.gare_italia, 0) > 0");
    } else if (dove === "ospiti" && haOspiti) {
      conditions.push("EXISTS (SELECT 1 FROM ospiti_esteri o WHERE o.nome = hr.name)");
    } else if (dove === "solo_estero") {
      conditions.push("COALESCE(hr.gare_estero, 0) > 0 AND COALESCE(hr.gare_italia, 0) = 0");
    } else if (dove === "senza_ospiti" && haOspiti) {
      // Chi corre davvero in Italia: fuori gli ospiti esteri.
      conditions.push("NOT EXISTS (SELECT 1 FROM ospiti_esteri o WHERE o.nome = hr.name)");
    }

    // ── Filtri arrivati dalla vecchia pagina Cavalli ──────────────────────
    // Leaderboard e Cavalli mostravano la stessa tabella con filtri diversi:
    // una aveva anno, voto e stallone, l'altra ricerca per nome, paese e
    // sesso. Unite in una pagina sola, questi devono funzionare qui.
    const cerca = (req.query.q as string || "").trim();
    if (cerca) { conditions.push("hr.name LIKE ?"); params.push(`%${cerca.toUpperCase()}%`); }

    const paese = req.query.country as string || null;
    if (paese) { conditions.push("h.country = ?"); params.push(paese); }

    const sesso = req.query.sex as string || null;
    if (sesso === "M" || sesso === "F") {
      conditions.push("h.sex = ?"); params.push(sesso);
    }

    const where = conditions.join(" AND ");
    // I filtri su paese e sesso stanno nella tabella dei cavalli, non in
    // quella dei voti: senza la JOIN anche nel conteggio, il totale delle
    // pagine non corrisponderebbe alle righe mostrate.
    // Ospiti esteri (nightly_update._ospiti_esteri, 22/11/2026): votati sulla
    // carriera intera ma fuori dalle soglie; si possono togliere dall'elenco.
    const conOspiti = haOspiti;
    const fromClause = `FROM horse_ratings hr
      LEFT JOIN horses h ON h.name = hr.name AND h.birth_year = hr.birth_year
      ${conOspiti ? "LEFT JOIN ospiti_esteri oe ON oe.nome = hr.name" : ""}`;
    const sortCol =
      sortBy === "earnings" ? C("career_earnings")
        : sortBy === "wins" ? C("career_wins")
          : sortBy === "races" ? C("career_races")
            : sortBy === "name" ? "hr.name"
              // Primi della loro annata: mette in cima il migliore di ogni
              // generazione invece dei soli cavalli maturi. Senza questo,
              // scegliere la lettura per annata non cambiava la cima della
              // lista, perche' l'ordine restava quello globale.
              : sortBy === "annata" ? "hr.pos_annata"
                : "hr.score";
    // Il nome si ordina in avanti, e la posizione in annata pure: il primo
    // della sua generazione va in cima, non in fondo. Tutto il resto dal piu'
    // grande al piu' piccolo.
    const sortDir = (sortBy === "name" || sortBy === "annata") ? "ASC" : "DESC";
    // Fra i primi di annate diverse vince chi ha il punteggio piu' alto:
    // senza questo l'ordine fra pari posizione sarebbe casuale.
    const sortExtra = sortBy === "annata" ? ", hr.score DESC" : "";

    const db = getDb();
    try {
      const total = (db.prepare(`SELECT COUNT(*) as cnt ${fromClause} WHERE ${where}`)
        .get(...params) as any).cnt;

      // Carriere parziali fra gli storici (novembre 2026): le colonne nascono
      // con il primo lavoro notturno che le calcola, quindi si chiedono solo
      // se ci sono gia'.
      const conParziale = (db.prepare("PRAGMA table_info(horse_ratings)").all() as any[])
        .some(c => c.name === "carriera_parziale");
      const rows = db.prepare(`
        SELECT hr.name, hr.birth_year, hr.sire, hr.grade, hr.score, hr.earn_percentile, hr.time_percentile,
               hr.sire_percentile, ${C("career_races")} AS career_races, ${C("career_wins")} AS career_wins,
               ${C("career_earnings")} AS career_earnings, hr.record_career, hr.win_rate,
               hr.career_races AS carriera_corse, hr.career_earnings AS carriera_guadagni,
               hr.gare_italia, hr.gare_estero, hr.vitt_italia, hr.vitt_estero,
               hr.guad_italia, hr.guad_estero,
               hr.grade_annata, hr.pos_annata, hr.tot_annata,
               ${conParziale ? "hr.carriera_parziale, hr.parziale_dal, hr.parziale_al," : ""}
               h.country, h.sex,
               ${conOspiti ? "oe.motivo AS ospite_estero, oe.gare_italia AS ospite_gare_italia, oe.gare_totali AS ospite_gare_totali," : ""}
               CASE WHEN h.name IS NULL THEN 1 ELSE 0 END AS fuori_archivio
        ${fromClause}
        WHERE ${where}
        ORDER BY ${sortCol} ${sortDir}${sortExtra}
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as any[];

      // Elenco dei paesi presenti, per riempire il filtro: arrivava dalla
      // vecchia pagina Cavalli e va servito anche qui.
      const countries = (db.prepare(`
        SELECT DISTINCT h.country FROM horses h
        WHERE h.country IS NOT NULL AND TRIM(h.country) <> ''
        ORDER BY h.country
      `).all() as any[]).map(r => r.country);

      res.json({ total, page, limit, rows, countries });
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/leaderboard/years — available birth years
  // ──────────────────────────────────────────────
  app.get("/api/leaderboard/years", pronta(), (req, res) => {
    const db = getDb();
    try {
      // Gli anni dipendono dalla classifica: quella storica copre il 1990-2015,
      // quella in gara il 2012 in avanti. Offrire gli anni sbagliati produce
      // un filtro che non trova nessun cavallo.
      const storico = (req.query.mode as string) === "storico";
      const rows = db.prepare(
        storico
          ? `SELECT DISTINCT birth_year FROM horse_ratings
             WHERE birth_year IS NOT NULL AND rating_mode = 'storico'
             ORDER BY birth_year DESC`
          // Ogni classifica offre solo i suoi anni: i puledri del 2025 hanno
          // solo il voto da pedigree e non vanno proposti fra quelli in gara.
          : `SELECT DISTINCT birth_year FROM horse_ratings
             WHERE birth_year IS NOT NULL AND COALESCE(horse_class, 'athlete') = 'athlete'
               AND rating_mode = ?
             ORDER BY birth_year DESC`,
      ).all(...(storico ? [] : [(req.query.mode as string) === "pedigree" ? "pedigree" : "performance"])) as any[];
      res.json(rows.map((r) => r.birth_year));
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/stats — global summary stats
  // ──────────────────────────────────────────────

  // ── Confronta due cavalli ────────────────────────────────────────────────
  app.get("/api/compare", (req, res) => {
    const { name1, year1, name2, year2 } = req.query as Record<string, string>;
    if (!name1 || !name2) return res.status(400).json({ error: "name1 e name2 obbligatori" });
    const db = getDb();
    try {
      const getHorse = (name: string, year?: string) => {
        const row = year
          ? (db.prepare(`SELECT hr.*, h.country FROM horse_ratings hr LEFT JOIN horses h ON h.name = hr.name AND h.birth_year = hr.birth_year WHERE hr.name = ? AND hr.birth_year = ? ORDER BY CASE hr.rating_mode WHEN 'performance' THEN 0 WHEN 'storico' THEN 1 ELSE 2 END LIMIT 1`).get(name, parseInt(year)) as any)
          : (db.prepare(`SELECT hr.*, h.country FROM horse_ratings hr LEFT JOIN horses h ON h.name = hr.name AND h.birth_year = hr.birth_year WHERE hr.name = ? ORDER BY hr.birth_year DESC, CASE hr.rating_mode WHEN 'performance' THEN 0 WHEN 'storico' THEN 1 ELSE 2 END LIMIT 1`).get(name) as any);
        if (!row) return null;
        const ped = db.prepare(`
          SELECT h.sire, h.dam,
            s.sire AS sire_sire, s.dam AS sire_dam,
            d.sire AS dam_sire, d.dam AS dam_dam
          FROM horses h
          LEFT JOIN horses s ON UPPER(TRIM(s.name)) = UPPER(TRIM(h.sire)) AND ${genitoreCompatibile("s", "h")}
          LEFT JOIN horses d ON UPPER(TRIM(d.name)) = UPPER(TRIM(h.dam)) AND ${genitoreCompatibile("d", "h")}
          LEFT JOIN stallion_pedigree sp ON sp.name = h.name
          WHERE UPPER(TRIM(h.name)) = ? AND h.birth_year = ?
          LIMIT 1
        `).get(row.name, row.birth_year) as any;
        // Il radar a sei punte della scheda cavallo, per sovrapporre i due profili.
        let radar = null;
        try { radar = radarCavallo(db, { ...row, dam: ped?.dam ?? null }); } catch { /* resta senza */ }
        return { ...row, pedigree: ped || null, radar };
      };
      const h1 = getHorse(name1, year1);
      const h2 = getHorse(name2, year2);
      res.json({ horse1: h1, horse2: h2 });
    } finally {
      db.close();
    }
  });

  // ── SEZIONE FATTRICI ────────────────────────────────────────────────────
  // Le fattrici sono valutate sulla PROGENIE (dam_rating_stats, FASE 3c della
  // pipeline), non sulla loro carriera: molte non corrono da vent'anni. Della
  // loro carriera teniamo i totali (own_*) come contesto di lettura.
  app.get("/api/mares", pronta(), (req, res) => {
    const db = getDb();
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(10, parseInt(req.query.limit as string) || 30));
      const offset = (page - 1) * limit;
      const search = (req.query.search as string || "").trim();
      const grade = (req.query.grade as string) || "";
      const sortBy = (req.query.sort as string) || "final_score";
      const sortDir = (req.query.dir as string) === "asc" ? "ASC" : "DESC";
      const minKids = parseInt(req.query.min_kids as string) || 0;

      const allowedSort: Record<string, string> = {
        final_score: "final_score",
        n_figli: "n_valutati",
        n_in_corsa: "n_in_corsa",
        pct_top_S: "pct_top_S",
        avg_earnings: "avg_earnings",
        dam: "dam",
      };
      const sortCol = allowedSort[sortBy] || "final_score";

      const conditions: string[] = [];
      const params: any[] = [];
      if (search) {
        conditions.push("UPPER(dam) LIKE UPPER(?)");
        params.push("%" + search.toUpperCase() + "%");
      }
      if (grade && grade !== "all") {
        conditions.push("grade = ?");
        params.push(grade);
      }
      if (minKids > 0) {
        conditions.push("n_valutati >= ?");
        params.push(minKids);
      }
      const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

      const total = (db.prepare(`SELECT COUNT(*) as c FROM dam_rating_stats ${where}`)
        .get(...params) as any).c;
      const rows = db.prepare(`
        SELECT dam, n_figli_totali, n_valutati, n_in_corsa, final_score, grade,
               n_SSS, n_SS, n_S, pct_top_S, avg_earnings,
               own_races, own_wins, own_earnings, own_record, own_grade
        FROM dam_rating_stats
        ${where}
        ORDER BY ${sortCol} ${sortDir}
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as any[];

      const grades = db.prepare(
        "SELECT grade, COUNT(*) as cnt FROM dam_rating_stats GROUP BY grade"
      ).all() as any[];

      res.json({ total, page, limit, rows, grades });
    } finally {
      db.close();
    }
  });

  app.get("/api/mare/:name", (req, res) => {
    const name = decodeURIComponent(req.params.name).trim().toUpperCase();
    const db = getDb();
    try {
      const stats = db.prepare(`
        SELECT * FROM dam_rating_stats WHERE UPPER(TRIM(dam)) = ?
      `).get(name) as any;

      const own = db.prepare(`
        SELECT name, birth_year, sire, dam, country,
               career_races, career_wins, career_earnings, record_career,
               COALESCE(horse_class, 'athlete') AS horse_class
        FROM horses WHERE UPPER(TRIM(name)) = ? LIMIT 1
      `).get(name) as any;

      // I figli si leggono comunque, anche senza riga di rating: una fattrice
      // appena citata deve avere una scheda, non un 404.
      const tutti = db.prepare(`
        SELECT h.name, h.birth_year, h.sex, h.sire,
               hr.grade, hr.score, hr.career_races, hr.career_wins,
               hr.career_earnings, hr.record_career
        FROM horses h
        LEFT JOIN horse_ratings hr ON hr.name = h.name AND hr.birth_year = h.birth_year
                                   AND hr.rating_mode IN ('performance', 'storico')
        WHERE UPPER(TRIM(h.dam)) = ?
          -- Stesso cavallo registrato due volte, con e senza sigla del paese
          -- (GO ON BOY e GO ON BOY (F)): la copia senza corse non si mostra.
          AND NOT (COALESCE(h.career_races, 0) = 0 AND EXISTS (
                SELECT 1 FROM horses t
                WHERE t.birth_year = h.birth_year AND t.dam = h.dam AND t.name <> h.name
                  AND substr(t.name, 1, length(h.name) + 2) = h.name || ' ('))
        ORDER BY hr.score IS NULL, hr.score DESC, h.birth_year DESC
      `).all(name) as any[];
      // Figli nati prima che questa cavalla avesse due anni: sono di
      // un'omonima piu' anziana che non e' in archivio, non suoi.
      const annoMadre = own?.birth_year ?? null;
      const diOmonima = (f: any) => annoMadre != null && f.birth_year != null && f.birth_year < annoMadre + 2;
      const offspring = tutti.filter(f => !diOmonima(f));
      const figli_omonima = tutti.filter(diOmonima).map(f => ({ name: f.name, birth_year: f.birth_year }));

      if (!stats && offspring.length === 0 && figli_omonima.length === 0) {
        return res.status(404).json({ message: "Fattrice non trovata" });
      }
      // Gare della fattrice presenti nell'archivio, per il collegamento alla
      // sua scheda da atleta (la carriera la recupera il lavoro notturno).
      if (own) {
        own.n_gare = (db.prepare("SELECT COUNT(*) AS n FROM races WHERE horse_name = ?")
          .get(own.name) as any)?.n ?? 0;
      }

      // Se tutti i figli sono dell'omonima, anche i suoi punti da fattrice non
      // sono di questa cavalla.
      const statsMostrati = offspring.length === 0 && figli_omonima.length > 0 ? null : stats;
      res.json({ dam: stats?.dam || name, stats: statsMostrati || null, own: own || null, offspring, figli_omonima });
    } finally {
      db.close();
    }
  });

  app.get("/api/search/mare", (req, res) => {
    // Novembre 2026: la tendina legge "name", mentre qui usciva "dam", quindi
    // le righe comparivano senza nome e la scelta non passava nessuna
    // fattrice alla pagina. Si tiene anche "dam" per chi lo usava.
    const q = (req.query.q as string || "").trim().toUpperCase();
    const db = getDb();
    try {
      const rows = db.prepare(`
        SELECT d.dam AS name, d.dam, d.grade, d.final_score AS score, d.final_score, d.n_valutati,
               (SELECT MIN(h.birth_year) FROM horses h WHERE h.name = d.dam) AS birth_year,
               (SELECT h.sire FROM horses h WHERE h.name = d.dam LIMIT 1) AS sire
        FROM dam_rating_stats d
        WHERE (? = '' OR UPPER(d.dam) LIKE ?)
        ORDER BY (UPPER(d.dam) LIKE ?) DESC, COALESCE(d.final_score, -1) DESC
        LIMIT 25
      `).all(q, `%${q}%`, `${q}%`);
      res.json(rows);
    } finally {
      db.close();
    }
  });

  /**
   * Elenco fattrici per la tendina dell'Advisor.
   *
   * L'Advisor cerca la fattrice nell'archivio cavalli fra i soggetti di sesso
   * femminile, quindi la tendina deve pescare dalla stessa lista: proporre
   * nomi presi altrove significherebbe far scegliere una fattrice che poi
   * la simulazione non trova.
   */
  app.get("/api/search/fattrice", (req, res) => {
    const q = (req.query.q as string || "").trim().toUpperCase();
    const db = getDb();
    try {
      const like = `%${q}%`;
      const rows = db.prepare(`
        SELECT h.name, h.birth_year, h.sire, h.dam,
               -- Voto e grado DA FATTRICE (progenie), gli stessi della pagina
               -- Fattrici: prima qui c'era il voto da atleta, e la stessa
               -- cavalla aveva due voti diversi fra Advisor e pagina Fattrici.
               ds.grade AS grade, ds.final_score AS score
        FROM horses h
        LEFT JOIN dam_rating_stats ds ON ds.dam = UPPER(TRIM(h.name))
                                     AND COALESCE(ds.n_valutati, 0) > 0
        WHERE h.sex = 'F' AND (? = '' OR h.name LIKE ?)
        ORDER BY (h.dam IS NULL), COALESCE(ds.final_score, -1) DESC, h.birth_year DESC
        LIMIT 25
      `).all(q, like);
      res.json(rows);
    } finally { db.close(); }
  });

  // ── Lista stalloni per dropdown ──────────────────────────────────────────
  // L'albero degli stalloni per generazione (server/alberoStalloni.ts).
  // Classifiche per eta' e degli stalloni (server/classifiche.ts).
  const classifica = (fn: (db: any, q: any) => unknown, nome: string) => (req: any, res: any) => {
    const db = getDb();
    try { res.json(fn(db, req.query)); }
    catch (e: any) { console.error(`[${nome}]`, e); res.status(500).json({ error: "Classifica non disponibile" }); }
    finally { db.close(); }
  };
  app.get("/api/classifiche/eta", pronta(), classifica(leadersEta, "classifiche-eta"));
  app.get("/api/classifiche/stalloni/figli", pronta(), classifica(figliStalloneStagione, "classifiche-stalloni-figli"));
  app.get("/api/classifiche/stalloni", pronta(), classifica(stalloniStagione, "classifiche-stalloni"));
  app.get("/api/classifiche/allevatori/cavalli", pronta(), classifica(cavalliAllevatoreStagione, "classifiche-allevatori-cavalli"));
  app.get("/api/classifiche/allevatori", pronta(), classifica((db, q) => {
    if (!vpTableExists(db, "vp_horse_breeder")) return { righe: [], anni: [], allevatori: 0, totale_vincite: 0, copertura: { cavalli: 0, cavalli_noti: 0, pct_premi: 0 } };
    return allevatoriStagione(db, q);
  }, "classifiche-allevatori"));
  // Linea materna di un cavallo: madre, nonna e bisnonna con i loro figli.
  app.get("/api/linea-materna/:name", pronta(), (req, res) => {
    const db = getDb();
    try { res.json(lineaMaterna(db, decodeURIComponent(req.params.name))); }
    catch (e: any) { console.error("[linea-materna]", e); res.status(500).json({ error: "Linea materna non disponibile" }); }
    finally { db.close(); }
  });
  app.get("/api/classifiche/nipoti", pronta(), classifica((db, q) => {
    const d = nipotiStalloni(db, q);
    return { ...d, righe: d.righe.slice(0, 150) };
  }, "classifiche-nipoti"));

  app.get("/api/stalloni/albero", pronta(), (_req, res) => {
    const db = getDb();
    try {
      const a = alberoStalloni(db, String(mtimeDb()));
      res.json({
        ...a, nomi: NOMI_GENERAZIONE, min_figli: MIN_FIGLI_ALBERO, anno_inizio_voto: ANNO_INIZIO_VOTO,
        stalloni: a.stalloni.filter(s => s.nell_albero),
      });
    } catch (e: any) { console.error("[albero]", e); res.status(500).json({ error: "Albero non disponibile" }); }
    finally { db.close(); }
  });

  app.get("/api/stallions", pronta(), (_req, res) => {
    const db = getDb();
    try {
      // Partiamo dagli stalloni VALUTATI (stallion_rating_stats), non dal
      // catalogo commerciale: il catalogo contiene solo chi e' in monta nella
      // stagione corrente, mentre il sito deve poter mostrare ogni stallone di
      // cui conosciamo la produzione. Prima la pagina ne vedeva 153 su 545.
      // Il catalogo resta agganciato per tassa di monta, allevamento e stato.
      const rows = db.prepare(`
        SELECT * FROM (
        SELECT
          COALESCE(s.name, sr.sire)                         AS name,
          s.stud_fee_eur, s.stud_farm, s.stud_status,
          s.country, s.season, s.fee_source,
          sr.avg_score, sr.final_score, sr.grade,
          sr.n_figli_totali, sr.n_in_corsa, sr.pct_top_S, sr.vp_boost,
          -- L'affidabilita' viaggia SEMPRE accanto al voto. Un giudizio su 2
          -- figli e uno su 400 avevano lo stesso aspetto: due lettere, nessuna
          -- avvertenza. Chi sceglie uno stallone deve poter distinguere una
          -- misura da un'impressione.
          sr.affidabilita, sr.affidabilita_txt, sr.n_figli_corsi,
          COALESCE(NULLIF(TRIM(s.country), ''), NULLIF(TRIM(sp.nationality), ''),
                   (SELECT NULLIF(TRIM(hx.country), '') FROM horses hx
                     WHERE hx.name = COALESCE(s.name, sr.sire)
                       AND COALESCE(TRIM(hx.country), '') NOT IN ('', 'EST') LIMIT 1)) AS nationality,
          CASE WHEN s.name IS NOT NULL THEN 1 ELSE 0 END    AS in_catalog
        FROM stallion_rating_stats sr
        LEFT JOIN stallions s          ON UPPER(TRIM(s.name))  = UPPER(TRIM(sr.sire))
        LEFT JOIN stallion_pedigree sp ON UPPER(TRIM(sp.name)) = UPPER(TRIM(sr.sire))

        UNION ALL

        -- Stalloni presenti a catalogo ma senza figli ancora valutati:
        -- vanno mostrati lo stesso, con la tassa di monta e senza voto.
        SELECT
          s.name, s.stud_fee_eur, s.stud_farm, s.stud_status,
          s.country, s.season, s.fee_source,
          NULL, NULL, NULL, NULL, NULL, NULL, NULL,
          NULL, NULL, NULL,
          COALESCE(NULLIF(TRIM(s.country), ''), NULLIF(TRIM(sp.nationality), ''),
                   (SELECT NULLIF(TRIM(hx.country), '') FROM horses hx
                     WHERE hx.name = s.name
                       AND COALESCE(TRIM(hx.country), '') NOT IN ('', 'EST') LIMIT 1)), 1
        FROM stallions s
        LEFT JOIN stallion_pedigree sp ON UPPER(TRIM(sp.name)) = UPPER(TRIM(s.name))
        WHERE UPPER(TRIM(s.name)) NOT IN (
          SELECT UPPER(TRIM(sire)) FROM stallion_rating_stats
        )

        )
        ORDER BY COALESCE(final_score, avg_score, -1) DESC, name ASC
      `).all() as any[];
      res.json(rows);
    } finally {
      db.close();
    }
  });

  // GET /api/momento — "Cavalli del momento" della home.
  // Non esiste uno storico dei voti, quindi il momento si legge dalle corse:
  //  - in forma: chi ha fatto meglio negli ultimi 30 giorni (dalla data
  //    dell'ultima corsa in archivio, non da oggi, cosi' un buco nei dati non
  //    svuota il riquadro), almeno 2 corse;
  //  - record personale: chi nel periodo ha corso piu' veloce di quanto avesse
  //    mai fatto prima, con almeno 5 corse cronometrate alle spalle.
  // Con giovani=1 si guardano solo i cavalli di 2 e 3 anni.
  const cacheMomento = new Map<string, { quando: number; dati: any }>();
  app.get("/api/momento", pronta(15 * 60_000), (req, res) => {
    try {
      const giovani = req.query.giovani === "1";
      const chiave = giovani ? "g" : "t";
      const c = cacheMomento.get(chiave);
      if (c && Date.now() - c.quando < 30 * 60 * 1000) return res.json(c.dati);
      const db = getDb();
      const ultima = (db.prepare("SELECT MAX(race_date) d FROM races").get() as any)?.d;
      if (!ultima) return res.json({ dal: null, al: null, in_forma: [], record: [] });
      const dal = (db.prepare("SELECT date(?, '-30 days') d").get(ultima) as any).d;
      const annoUltima = parseInt(String(ultima).slice(0, 4));
      // Il cavallo si riconosce dal nome; l'annata e il voto si prendono dalla
      // scheda con piu' corse, per non confondere gli omonimi vecchi.
      const scheda = db.prepare(`
        SELECT h.birth_year, h.sex, hr.grade
        FROM horses h
        LEFT JOIN horse_ratings hr ON hr.name = h.name AND hr.birth_year = h.birth_year AND hr.rating_mode = 'performance'
        WHERE h.name = ? ORDER BY h.career_races DESC, h.birth_year DESC LIMIT 1
      `);
      const recenti = db.prepare(`
        SELECT horse_name, COUNT(*) corse,
               SUM(placement = 1) vittorie,
               SUM(placement BETWEEN 1 AND 3) piazzati,
               SUM(COALESCE(prize_net, 0)) premi,
               MIN(CASE WHEN time_km BETWEEN 8 AND 25 THEN time_km END) miglior_tempo,
               MAX(race_date) ultima_corsa
        FROM races
        WHERE race_date > ? AND race_date <= ?
        GROUP BY horse_name
        HAVING corse >= 2
      `).all(dal, ultima) as any[];
      const prima = db.prepare(`
        SELECT MIN(time_km) t, COUNT(*) n FROM races
        WHERE horse_name = ? AND race_date <= ? AND time_km BETWEEN 8 AND 25
      `);
      const righe = recenti.map(r => {
        const sc = scheda.get(r.horse_name) as any;
        return { ...r, anno: sc?.birth_year ?? null, sesso: sc?.sex ?? null, voto: sc?.grade ?? null };
      }).filter(r => !giovani || (r.anno && annoUltima - r.anno <= 3 && annoUltima - r.anno >= 2));
      const in_forma = [...righe]
        .sort((a, b) => b.vittorie - a.vittorie || b.piazzati - a.piazzati || a.corse - b.corse || b.premi - a.premi)
        .slice(0, 10)
        .map(r => ({ nome: r.horse_name, anno: r.anno, voto: r.voto, corse: r.corse, vittorie: r.vittorie,
                     piazzati: r.piazzati, premi: Math.round(r.premi), ultima_corsa: r.ultima_corsa }));
      const record = righe
        .filter(r => r.miglior_tempo != null)
        .map(r => {
          const p = prima.get(r.horse_name, dal) as any;
          return { r, prima: p?.t ?? null, n: p?.n ?? 0 };
        })
        .filter(x => x.prima != null && x.n >= 5 && x.r.miglior_tempo < x.prima)
        .sort((a, b) => (b.prima - b.r.miglior_tempo) - (a.prima - a.r.miglior_tempo))
        .slice(0, 10)
        .map(x => ({ nome: x.r.horse_name, anno: x.r.anno, voto: x.r.voto, tempo: x.r.miglior_tempo,
                     tempo_prima: x.prima, miglioramento: Math.round((x.prima - x.r.miglior_tempo) * 10) / 10 }));
      const dati = { dal, al: ultima, cavalli_in_corsa: righe.length, in_forma, record };
      cacheMomento.set(chiave, { quando: Date.now(), dati });
      res.json(dati);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/rating-voti — per ogni lettera, i numeri tipici dei cavalli che
  // l'hanno presa. Serve al riquadro "Rating" della home: aperto, spiega come
  // si fa il voto e mostra cosa vuol dire in pratica ogni lettera.
  let cacheVoti: { quando: number; dati: any } | null = null;
  app.get("/api/rating-voti", pronta(), (_req, res) => {
    try {
      if (cacheVoti && Date.now() - cacheVoti.quando < 60 * 60 * 1000) return res.json(cacheVoti.dati);
      const db = getDb();
      const righe = db.prepare(`
        SELECT name, birth_year, grade, score, career_earnings, career_races, career_wins,
               win_rate, stagioni_corse, record_career
        FROM horse_ratings
        WHERE rating_mode = 'performance' AND COALESCE(horse_class, 'athlete') = 'athlete'
      `).all() as any[];
      const mediana = (v: number[]) => {
        const a = v.filter(x => x != null && !isNaN(x)).sort((x, y) => x - y);
        if (!a.length) return null;
        const m = Math.floor(a.length / 2);
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
      };
      const ORDINE = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
      const QUOTA: Record<string, string> = {
        SSS: "l'1% migliore", SS: "dall'1% al 5%", S: "dal 5% al 10%", A: "dal 10% al 25%",
        B: "dal 25% al 40%", C: "dal 40% al 60%", D: "dal 60% al 75%", E: "dal 75% al 90%", F: "l'ultimo 10%",
      };
      const tot = righe.length;
      const voti = ORDINE.map(g => {
        const r = righe.filter(x => x.grade === g);
        if (!r.length) return null;
        const punteggi = r.map(x => x.score).sort((a, b) => a - b);
        // Record al km: solo valori plausibili (secondi oltre il minuto).
        const rec = mediana(r.map(x => parseFloat(x.record_career)).filter(x => x >= 8 && x <= 25));
        const sm = mediana(punteggi);
        const esempio = [...r].sort((a, b) => Math.abs(a.score - sm!) - Math.abs(b.score - sm!))[0];
        const migliore = [...r].sort((a, b) => b.score - a.score)[0];
        return {
          voto: g, quota: QUOTA[g], n: r.length, pct: Math.round(r.length / tot * 1000) / 10,
          punteggio_min: Math.round(punteggi[0] * 10) / 10,
          punteggio_max: Math.round(punteggi[punteggi.length - 1] * 10) / 10,
          guadagno_mediano: Math.round(mediana(r.map(x => x.career_earnings || 0)) ?? 0),
          gare_mediane: Math.round(mediana(r.map(x => x.career_races || 0)) ?? 0),
          vittorie_mediane: Math.round(mediana(r.map(x => x.career_wins || 0)) ?? 0),
          vittorie_pct: Math.round((r.reduce((a, x) => a + (x.career_wins || 0), 0) /
                         Math.max(1, r.reduce((a, x) => a + (x.career_races || 0), 0))) * 1000) / 10,
          stagioni_mediane: Math.round(mediana(r.map(x => x.stagioni_corse || 0)) ?? 0),
          record_mediano: rec != null ? Math.round(rec * 10) / 10 : null,
          esempio: esempio ? { nome: esempio.name, anno: esempio.birth_year } : null,
          migliore: migliore ? { nome: migliore.name, anno: migliore.birth_year } : null,
        };
      }).filter(Boolean);
      const dati = { totale: tot, voti };
      cacheVoti = { quando: Date.now(), dati };
      res.json(dati);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/stats", pronta(), (_req, res) => {
    const db = getDb();
    try {
      // Conta solo gli atleti: i riproduttori non sono soggetti del sito.
      const totalHorses = (db.prepare(
        "SELECT COUNT(*) as c FROM horses WHERE COALESCE(horse_class, 'athlete') = 'athlete'"
      ).get() as any).c;
      const totalBreeders = (db.prepare(
        "SELECT COUNT(*) as c FROM horses WHERE horse_class = 'breeder'"
      ).get() as any).c;
      // 20/11/2026: in home tutti i cavalli del database, anche quelli che
      // compaiono solo nei pedigree (riproduttori, antenati esteri della
      // seconda fonte che non sono nella tabella dei cavalli).
      const soloPedigree = (db.prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='vp_names'`).get() as any).c
        ? (db.prepare(`SELECT COUNT(*) as c FROM vp_names v WHERE NOT EXISTS (SELECT 1 FROM horses h WHERE h.name = v.name)`).get() as any).c
        : 0;
      const totalNelDatabase = totalHorses + totalBreeders + soloPedigree;
      const totalRaces = (db.prepare("SELECT COUNT(*) as c FROM races").get() as any).c;
      const totalStallions = (db.prepare("SELECT COUNT(DISTINCT sire) as c FROM stallion_rating_stats").get() as any).c;
      const gradeDist = db.prepare(`
        SELECT grade, COUNT(*) as cnt FROM horse_ratings
        WHERE rating_mode = 'performance' AND COALESCE(horse_class, 'athlete') = 'athlete'
        GROUP BY grade ORDER BY cnt DESC
      `).all() as any[];
      // Campione per generazione: solo cavalli nati in Italia. Gli esteri
      // hanno la sigla del paese nel nome (GO ON BOY (F), FRAGOLINO ROSSO (D))
      // e un paese diverso da ITA; qui si confrontano gli allevamenti italiani.
      const topByYear = db.prepare(`
        SELECT hr.birth_year, hr.name, hr.grade, MAX(hr.score) AS score, hr.career_earnings,
               COALESCE(NULLIF(TRIM(h.country), ''), 'ITA') AS country
        FROM horse_ratings hr
        LEFT JOIN horses h ON h.name = hr.name AND h.birth_year = hr.birth_year
        WHERE hr.rating_mode = 'performance' AND COALESCE(hr.horse_class, 'athlete') = 'athlete'
          AND hr.name NOT GLOB '* ([A-Z]*)'
          AND COALESCE(NULLIF(TRIM(h.country), ''), 'ITA') = 'ITA'
        GROUP BY hr.birth_year
        ORDER BY hr.birth_year DESC
        LIMIT 10
      `).all() as any[];
      res.json({ totalHorses, totalNelDatabase, totalRaces, totalStallions, totalBreeders, gradeDist, topByYear });
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/horse/:name/:year/neighbors — prev/next horse by score rank
  // ──────────────────────────────────────────────
  app.get("/api/horse/:name/:year/neighbors", (req, res) => {
    const name = decodeURIComponent(req.params.name).toUpperCase();
    const year = parseInt(req.params.year);
    const db = getDb();
    try {
      const current = db.prepare(`
        SELECT score, grade FROM horse_ratings
        WHERE name = ? AND birth_year = ? AND rating_mode = 'performance'
      `).get(name, year) as any;
      if (!current) return res.json({ prev: null, next: null });
      const score = current.score ?? 0;
      // Next: higher score, same or nearby birth year
      const next = db.prepare(`
        SELECT name, birth_year, grade, score FROM horse_ratings
        WHERE rating_mode = 'performance' AND score > ?
          AND name != ?
        ORDER BY score ASC, birth_year DESC
        LIMIT 1
      `).get(score, name) as any;
      // Prev: lower score
      const prev = db.prepare(`
        SELECT name, birth_year, grade, score FROM horse_ratings
        WHERE rating_mode = 'performance' AND score < ?
          AND name != ?
        ORDER BY score DESC, birth_year DESC
        LIMIT 1
      `).get(score, name) as any;
      res.json({ prev, next });
    } finally { db.close(); }
  });

  // ──────────────────────────────────────────────
  // GET /api/stallion/:name/neighbors — prev/next stallion by final_score
  // ──────────────────────────────────────────────
  app.get("/api/stallion/:name/neighbors", (req, res) => {
    const name = decodeURIComponent(req.params.name).toUpperCase();
    const db = getDb();
    try {
      const current = db.prepare(`
        SELECT final_score FROM stallion_rating_stats
        WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?))
      `).get(name) as any;
      if (!current || current.final_score == null) return res.json({ prev: null, next: null });
      const score = current.final_score;
      const next = db.prepare(`
        SELECT sire AS name, grade, final_score FROM stallion_rating_stats
        WHERE final_score > ? AND UPPER(TRIM(sire)) != UPPER(TRIM(?))
        ORDER BY final_score ASC LIMIT 1
      `).get(score, name) as any;
      const prev = db.prepare(`
        SELECT sire AS name, grade, final_score FROM stallion_rating_stats
        WHERE final_score < ? AND UPPER(TRIM(sire)) != UPPER(TRIM(?))
        ORDER BY final_score DESC LIMIT 1
      `).get(score, name) as any;
      res.json({ prev, next });
    } finally { db.close(); }
  });

  // ──────────────────────────────────────────────
  // GET /api/horse/:name/:year/stats — year-by-year career breakdown
  // ──────────────────────────────────────────────
  app.get("/api/horse/:name/:year/stats", (req, res) => {
    const name = decodeURIComponent(req.params.name).toUpperCase();
    const year = parseInt(req.params.year);
    const db = getDb();
    try {
      // Year-by-year stats from races
      const yearlyStats = db.prepare(`
        SELECT strftime('%Y', race_date) AS year,
               COUNT(*) AS races,
               SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS wins,
               SUM(CASE WHEN placement <= 3 THEN 1 ELSE 0 END) AS places,
               SUM(prize_net) AS earnings,
               MIN(time_km) AS best_time,
               AVG(time_km) AS avg_time
        FROM races
        WHERE horse_name = ? AND race_date IS NOT NULL
        GROUP BY strftime('%Y', race_date)
        ORDER BY year ASC
      `).all(name) as any[];

      // Best races (top 5 by prize)
      const bestRaces = db.prepare(`
        SELECT race_date, track, placement, placement_raw, time_km,
               distance, driver, prize_net, prize_gross, race_code
        FROM races
        WHERE horse_name = ? AND prize_net > 0
        ORDER BY prize_net DESC
        LIMIT 5
      `).all(name) as any[];

      // Track stats (performance by venue)
      const trackStats = db.prepare(`
        SELECT track,
               COUNT(*) AS races,
               SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS wins,
               SUM(CASE WHEN placement <= 3 THEN 1 ELSE 0 END) AS places,
               SUM(prize_net) AS earnings
        FROM races
        WHERE horse_name = ? AND track IS NOT NULL AND track != ''
        GROUP BY track
        ORDER BY races DESC
        LIMIT 10
      `).all(name) as any[];

      res.json({ yearlyStats, bestRaces, trackStats });
    } finally { db.close(); }
  });

  // ──────────────────────────────────────────────
  // GET /api/stallion/:name/stats — offspring yearly trend + ROI data
  // ──────────────────────────────────────────────
  app.get("/api/stallion/:name/stats", (req, res) => {
    const name = decodeURIComponent(req.params.name).toUpperCase();
    const db = getDb();
    try {
      // Offspring by birth year
      const offspringByYear = db.prepare(`
        SELECT birth_year,
               COUNT(*) AS total,
               SUM(CASE WHEN grade IN ('SSS','SS','S') THEN 1 ELSE 0 END) AS top_count,
               AVG(score) AS avg_score,
               AVG(career_earnings) AS avg_earn
        FROM horse_ratings
        WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?)) AND rating_mode = 'performance'
          AND birth_year IS NOT NULL
        GROUP BY birth_year
        ORDER BY birth_year ASC
      `).all(name) as any[];

      // Top offspring by earnings (top 10)
      const topOffspring = db.prepare(`
        SELECT name, birth_year, grade, score, career_earnings,
               record_career, win_rate, sire_percentile
        FROM horse_ratings
        WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?)) AND rating_mode = 'performance'
        ORDER BY career_earnings DESC
        LIMIT 10
      `).all(name) as any[];

      // Grade earnings map (for ROI context)
      const gradeEarnings = db.prepare(`
        SELECT grade, AVG(career_earnings) AS avg_earn, COUNT(*) AS cnt
        FROM horse_ratings
        WHERE rating_mode = 'performance' AND career_earnings > 0
        GROUP BY grade
      `).all() as any[];

      res.json({ offspringByYear, topOffspring, gradeEarnings });
    } finally { db.close(); }
  });

  // ──────────────────────────────────────────────
  // GET /api/stud-farms — ranking allevamenti per qualita' produzione
  // ──────────────────────────────────────────────
  app.get("/api/stud-farms", pronta(), (_req, res) => {
    const db = getDb();
    try {
      const farms = db.prepare(`
        SELECT
          s.stud_farm,
          COUNT(DISTINCT s.name) AS n_stallions,
          COALESCE(SUM(sr.n_figli_totali), 0) AS n_figli_totali,
          COALESCE(SUM(sr.n_in_corsa), 0) AS n_in_corsa,
          COALESCE(ROUND(AVG(sr.avg_score), 1), 0) AS avg_score,
          COALESCE(ROUND(AVG(sr.final_score), 1), 0) AS avg_final_score,
          COALESCE(ROUND(AVG(sr.pct_top_S), 1), 0) AS pct_top_S,
          COALESCE(SUM(sr.n_SSS), 0) AS n_SSS,
          COALESCE(SUM(sr.n_SS), 0) AS n_SS,
          COALESCE(SUM(sr.n_S), 0) AS n_S,
          COALESCE(SUM(sr.avg_earnings), 0) AS total_earnings
        FROM stallions s
        LEFT JOIN stallion_rating_stats sr ON UPPER(TRIM(sr.sire)) = UPPER(TRIM(s.name))
        WHERE s.stud_farm IS NOT NULL AND s.stud_farm != ''
        GROUP BY s.stud_farm
        HAVING COUNT(DISTINCT s.name) >= 1
        ORDER BY avg_final_score DESC
      `).all() as any[];

      // For each farm, get the best stallion
      const result = farms.map(f => {
        const bestStallion = db.prepare(`
          SELECT s.name, sr.final_score, sr.grade, sr.n_figli_totali, sr.pct_top_S,
                 s.stud_fee_eur,
                 COALESCE(NULLIF(TRIM(s.country), ''), NULLIF(TRIM(sp.nationality), ''),
                          (SELECT NULLIF(TRIM(hx.country), '') FROM horses hx
                            WHERE hx.name = s.name
                              AND COALESCE(TRIM(hx.country), '') NOT IN ('', 'EST') LIMIT 1)) AS nationality
          FROM stallions s
          LEFT JOIN stallion_rating_stats sr ON UPPER(TRIM(sr.sire)) = UPPER(TRIM(s.name))
          LEFT JOIN stallion_pedigree sp ON UPPER(TRIM(sp.name)) = UPPER(TRIM(s.name))
          WHERE s.stud_farm = ? AND sr.final_score IS NOT NULL
          ORDER BY sr.final_score DESC LIMIT 1
        `).get(f.stud_farm) as any;
        return { ...f, best_stallion: bestStallion || null };
      });

      res.json(result);
    } finally { db.close(); }
  });

  // ──────────────────────────────────────────────
  // GET /api/trends — andamenti temporali rating e guadagni
  // ──────────────────────────────────────────────
  app.get("/api/trends", pronta(), (_req, res) => {
    const db = getDb();
    try {
      // Distribuzione dei voti per anno di nascita.
      //
      // Il filtro sul numero di cavalli non e' un dettaglio estetico. Le annate
      // ai bordi dell'archivio hanno pochissimi soggetti — il 2010 ne aveva
      // otto, sopravvissuti per caso — e producono medie prive di significato:
      // il guadagno medio di quegli otto era 238.000 euro contro i 29.000 del
      // 2012, e il grafico mostrava una prima colonna otto volte piu' alta di
      // tutte le altre. Non era un andamento, era un artefatto.
      const ANNATA_MINIMA = 200;
      const gradeByYear = db.prepare(`
        SELECT birth_year, grade, COUNT(*) as cnt
        FROM horse_ratings
        WHERE rating_mode = 'performance'
          AND grade IS NOT NULL
          AND birth_year >= 2010
          AND birth_year IN (
            SELECT birth_year FROM horse_ratings
            WHERE rating_mode = 'performance' AND birth_year IS NOT NULL
            GROUP BY birth_year HAVING COUNT(*) >= ?
          )
        GROUP BY birth_year, grade
        ORDER BY birth_year ASC
      `).all(ANNATA_MINIMA) as any[];

      // Guadagno medio per annata di nascita.
      //
      // Letto senza avvertenze questo grafico mente. Passa da 38.000 euro nel
      // 2014 a 65 euro nel 2024 e sembra il crollo del trotto italiano; in
      // realta' i nati nel 2024 hanno due anni e devono ancora correre. Non e'
      // un andamento del settore, e' l'eta' dei cavalli. Marchiamo quindi le
      // annate che hanno finito la carriera, cosi' la pagina puo' dire quali
      // colonne sono confrontabili fra loro e quali no.
      const annoCorrente = new Date().getFullYear();
      const ETA_CARRIERA_CONCLUSA = 10;
      const earningsByYear = db.prepare(`
        SELECT birth_year,
               COUNT(*) as n_horses,
               ROUND(AVG(career_earnings), 0) as avg_earnings,
               ROUND(AVG(career_races), 0) as avg_races,
               ROUND(AVG(career_wins), 0) as avg_wins,
               ROUND(AVG(win_rate), 1) as avg_win_rate
        FROM horse_ratings
        WHERE rating_mode = 'performance'
          AND birth_year >= 2010
          AND career_races > 0
        GROUP BY birth_year
        HAVING COUNT(*) >= ?
        ORDER BY birth_year ASC
      `).all(ANNATA_MINIMA) as any[];

      // Total races and horses per year (from races table)
      const racesPerYear = db.prepare(`
        SELECT strftime('%Y', race_date) as year,
               COUNT(*) as n_races,
               COUNT(DISTINCT horse_name) as n_horses,
               ROUND(AVG(prize_net), 0) as avg_prize,
               SUM(prize_net) as total_prize
        FROM races
        WHERE race_date IS NOT NULL
          AND strftime('%Y', race_date) >= '2012'
        GROUP BY year
        ORDER BY year ASC
      `).all() as any[];

      // Top tracks by race count — esclude codici brevi (NA, BO, ecc.)
      const topTracks = db.prepare(`
        SELECT track,
               COUNT(*) as n_races,
               ROUND(AVG(prize_net), 0) as avg_prize,
               SUM(prize_net) as total_prize
        FROM races
        WHERE track IS NOT NULL AND track != ''
          AND length(track) > 3
          AND race_date IS NOT NULL
        GROUP BY track
        ORDER BY n_races DESC
        LIMIT 15
      `).all() as any[];

      const guadagniPerAnnata = earningsByYear.map((r: any) => ({
        ...r,
        eta: annoCorrente - r.birth_year,
        carriera_conclusa: annoCorrente - r.birth_year >= ETA_CARRIERA_CONCLUSA,
      }));

      res.json({
        gradeByYear,
        earningsByYear: guadagniPerAnnata,
        racesPerYear,
        topTracks,
        nota_annate: {
          annata_minima: ANNATA_MINIMA,
          eta_carriera_conclusa: ETA_CARRIERA_CONCLUSA,
          avvertenza:
            "Le annate recenti guadagnano meno perche' i cavalli sono giovani e " +
            "devono ancora correre, non perche' il settore stia calando. Sono " +
            "confrontabili fra loro solo le annate con la carriera conclusa.",
        },
      });
    } finally { db.close(); }
  });

  // ──────────────────────────────────────────────
  // GET /api/top-races — migliori gare di sempre
  // ──────────────────────────────────────────────
  app.get("/api/top-races", pronta(), (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const db = getDb();
    try {
      // Top races by prize
      const topPrize = db.prepare(`
        SELECT r.horse_name, r.race_date, r.track, r.race_code, r.race_number,
               r.placement, r.placement_raw, r.time_km, r.distance, r.driver,
               r.prize_net, r.prize_gross, r.total_starters, r.start_pos,
               h.country
        FROM races r
        LEFT JOIN horses h ON h.name = r.horse_name
        WHERE r.prize_net > 0
        ORDER BY r.prize_net DESC
        LIMIT ?
      `).all(limit) as any[];

      // Fastest times (filter by distance to compare fairly — 1600m and 2100m most common)
      const fastestTimes = db.prepare(`
        SELECT r.horse_name, r.race_date, r.track, r.time_km, r.distance, r.placement,
               r.prize_net, r.driver, h.country
        FROM races r
        LEFT JOIN horses h ON h.name = r.horse_name
        WHERE r.time_km IS NOT NULL AND r.time_km > 0
          AND r.distance IN (1600, 2100)
          AND r.placement = 1
        ORDER BY r.time_km ASC
        LIMIT 20
      `).all() as any[];

      // Biggest upsets (high start_pos with win + good prize)
      const upsets = db.prepare(`
        SELECT r.horse_name, r.race_date, r.track, r.placement, r.start_pos,
               r.total_starters, r.prize_net, r.driver, r.time_km, h.country
        FROM races r
        LEFT JOIN horses h ON h.name = r.horse_name
        WHERE r.placement = 1
          AND r.start_pos >= 10
          AND r.total_starters >= 12
          AND r.prize_net >= 5000
        ORDER BY r.prize_net DESC
        LIMIT 15
      `).all() as any[];

      // Most dominant horses (by total prize won)
      const dominantHorses = db.prepare(`
        SELECT r.horse_name,
               COUNT(*) as n_races,
               SUM(CASE WHEN r.placement = 1 THEN 1 ELSE 0 END) as n_wins,
               ROUND(100.0 * SUM(CASE WHEN r.placement = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as win_rate,
               SUM(r.prize_net) as total_earnings,
               MAX(r.prize_net) as biggest_prize,
               h.country
        FROM races r
        LEFT JOIN horses h ON h.name = r.horse_name
        WHERE r.prize_net > 0
        GROUP BY r.horse_name
        ORDER BY total_earnings DESC
        LIMIT 20
      `).all() as any[];

      res.json({ topPrize, fastestTimes, upsets, dominantHorses });
    } finally { db.close(); }
  });

  /**
   * Albero genealogico di un cavallo, lo stesso per la pagina Pedigree e per
   * la scheda del singolo cavallo. Prima la scheda ricostruiva i nonni per
   * conto suo, senza guardare la genealogia propria del padre e della madre:
   * per circa un cavallo su dieci mostrava caselle vuote che nella pagina
   * Pedigree erano piene.
   */
  // Genealogie lette dalla banca dati UNIRE (scripts/genealogie_unire.py):
  // il file arriva con il codice, si rilegge se cambia.
  let UNIRE: { mt: number; visto: number; m: Map<string, { padre: string; madre: string }> } = { mt: -1, visto: 0, m: new Map() };
  function genealogiaUnire(n: string): { padre: string; madre: string } | null {
    const f = path.join(process.cwd(), "dati", "genealogie_unire.csv");
    let mt = UNIRE.mt;
    if (Date.now() - UNIRE.visto > 60_000) {
      try { mt = fs.statSync(f).mtimeMs; } catch { mt = 0; }
      UNIRE.visto = Date.now();
      if (!mt) { UNIRE = { mt: 0, visto: Date.now(), m: new Map() }; return null; }
    }
    if (mt !== UNIRE.mt) {
      const m = new Map<string, { padre: string; madre: string }>();
      try {
        const righe = fs.readFileSync(f, "utf8").split(/\r?\n/);
        const t = righe[0].split(";");
        const ip = t.indexOf("padre"), im = t.indexOf("madre"), inn = t.indexOf("nome");
        for (const r of righe.slice(1)) {
          if (!r) continue;
          const c = r.split(";");
          if (c[inn]) m.set(c[inn].trim().toUpperCase(), { padre: (c[ip] || "").trim().toUpperCase(), madre: (c[im] || "").trim().toUpperCase() });
        }
      } catch (e) { console.error("[genealogie unire]", e); }
      UNIRE = { mt, visto: Date.now(), m };
    }
    const g = UNIRE.m.get(String(n).trim().toUpperCase());
    return g && (g.padre || g.madre) ? g : null;
  }

  function sessoDaFigli(db: any, n: string): string | null {
    const padre = !!db.prepare(`SELECT 1 FROM horses WHERE sire = ? LIMIT 1`).get(n);
    const madre = !!db.prepare(`SELECT 1 FROM horses WHERE dam = ? LIMIT 1`).get(n);
    return padre && !madre ? "M" : madre && !padre ? "F" : null;
  }

  function alberoGenealogico(db: any, name: string): { tree: any; vp: Map<string, string>; MAX_GEN: number } {
    // Build pedigree tree recursively (4 generations)
    // I nomi nell'archivio sono gia' maiuscoli e senza spazi ai bordi, quindi
    // il confronto diretto usa l'indice: ripulirli con UPPER/TRIM obbligava
    // a leggere tutti i 23.000 cavalli per ogni casella dell'albero.
    const horseStmt = db.prepare(`
      SELECT name, birth_year, sire, dam, sex, country, career_earnings, career_wins, career_races
      FROM horses WHERE name = ? ORDER BY birth_year DESC LIMIT 1
    `);
    const horseCache = new Map<string, any>();

    function getHorse(n: string): any {
      if (!n) return null;
      const key = n.trim().toUpperCase();
      if (horseCache.has(key)) return horseCache.get(key);
      const h = (horseStmt.get(key) as any)
        || { name: key, birth_year: null, sire: null, dam: null, missing: true };
      horseCache.set(key, h);
      return h;
    }

    // La seconda fonte conosce cinque generazioni per ogni cavallo, anche
    // estero: la usiamo per riempire i rami che l'archivio corse non ha.
    // Il percorso si legge da destra a sinistra (vedi vpAncestorMap), quindi
    // la catena di passi va rovesciata prima di cercarla.
    const vp = vpAncestorMap(db, name);
    const MAX_GEN = 5;

    // Se del soggetto non abbiamo l'albero della fonte, spesso ce l'abbiamo
    // di un suo antenato: in quel caso da li' in poi il ramo si ricostruisce
    // lo stesso, chiedendo a ogni casella chi sono i suoi genitori.
    const mapCache = new Map<string, Map<string, string>>();
    function mapOf(n: string): Map<string, string> {
      const key = n.trim().toUpperCase();
      let m = mapCache.get(key);
      if (!m) { m = vpAncestorMap(db, key); mapCache.set(key, m); }
      return m;
    }
    mapCache.set(name, vp);

    /**
     * `srcName` e' il cavallo la cui genealogia stiamo usando per riempire
     * i buchi, `srcChain` il percorso da lui fino a questa casella. Se per
     * la casella corrente la fonte ha una sua genealogia, da li' in poi si
     * usa quella: cosi' l'albero si completa anche quando del soggetto di
     * partenza non sappiamo nulla ma di suo nonno si'.
     */
    function buildTree(n: string, depth: number, chain: string, srcName: string, srcChain: string, annoFiglio: number | null = null, annoMaxFiglio: number | null = null): any {
      if (depth > MAX_GEN || !n) return null;
      let h = getHorse(n);
      if (!h) return null;
      // Omonimo troppo giovane per essere il genitore: in archivio c'e' un
      // altro cavallo con lo stesso nome, quindi di lui si tiene solo il nome
      // e i suoi antenati si leggono dalla fonte del figlio.
      // 20/11/2026: se l'anno del figlio non si sa si usa il limite che
      // scende dalla generazione sotto (ogni genitore almeno 2 anni piu'
      // vecchio del figlio). CHICCA ROSS: ROSEMARY del 2010 risultava fra i
      // suoi antenati dalla parte di GARLAND LOBELL (1981), LEMON DRA (1986)
      // padre di un antenato di DANEA (1974). Sono omonimi: resta il nome,
      // senza anno ne' voti.
      const annoMax = annoFiglio ? annoFiglio - 2 : (annoMaxFiglio ? annoMaxFiglio - 2 : null);
      let omonimo = !!(annoMax && h.birth_year && h.birth_year > annoMax);
      // L'anno del cavallo dell'archivio che porta lo stesso nome, per dire
      // nella pagina perche' questo e' un altro cavallo (CHICCA ROSS, 23/11).
      let annoOmonimo = omonimo ? h.birth_year : null;
      if (omonimo) {
        // Se il cavallo vero c'e' nell'archivio con l'anno nel nome
        // ("GIADA WINNER (2005)", omonimi.py), si usa lui (23/11/2026).
        const vero = vpTableExists(db, "omonimi")
          ? db.prepare(`SELECT nome_omonimo FROM omonimi WHERE nome = ? AND anno_omonimo <= ? ORDER BY anno_omonimo DESC LIMIT 1`).get(h.name, annoMax) as any
          : null;
        if (vero?.nome_omonimo) { h = getHorse(vero.nome_omonimo); omonimo = false; annoOmonimo = null; }
        else h = { name: h.name, birth_year: null, sire: null, dam: null, missing: true };
      }

      const own = omonimo ? new Map<string, string>() : mapOf(h.name || n);
      let useName = srcName, useChain = srcChain;
      if (own.size > 0) { useName = (h.name || n); useChain = ""; }
      const srcMap = useName === name ? vp : mapOf(useName);

      // Dopo l'archivio, la banca dati UNIRE (dati/genealogie_unire.csv,
      // letta per id lungo il ramo), poi la seconda fonte.
      const un = omonimo ? null : genealogiaUnire(h.name || n);
      const sireName = h.sire || un?.padre || srcMap.get(vpPath(useChain + "p")) || null;
      const damName  = h.dam  || un?.madre || srcMap.get(vpPath(useChain + "m")) || null;
      return {
        name: h.name,
        birth_year: h.birth_year,
        // Il sesso: quello dell'archivio, se no la posizione nell'albero; per
        // il cavallo della pagina, se e' padre di qualcuno e' un maschio
        // (GIMPANZEE, SOUTHWIND FRANK erano senza sesso e uscivano in rosa).
        sex: h.sex ?? (depth > 0 ? (chain.slice(-1) === "p" ? "M" : "F") : sessoDaFigli(db, h.name || n)),
        country: h.country,
        career_earnings: h.career_earnings,
        career_wins: h.career_wins,
        career_races: h.career_races,
        sire: sireName ? buildTree(sireName, depth + 1, chain + "p", useName, useChain + "p", h.birth_year ?? null, annoMax) : null,
        dam:  damName  ? buildTree(damName,  depth + 1, chain + "m", useName, useChain + "m", h.birth_year ?? null, annoMax) : null,
        anno_max: h.birth_year ? null : annoMax,
        omonimo,
        omonimo_anno: annoOmonimo,
        missing: h.missing || false,
        from_source: !!h.missing,
      };
    }

    const tree = buildTree(name, 0, "", name, "");
    if (!tree) return { tree: null, vp, MAX_GEN };
    if (!tree.sire && vp.get("p")) tree.sire = buildTree(vp.get("p")!, 1, "p", name, "p", tree.birth_year ?? null);
    if (!tree.dam && vp.get("m")) tree.dam = buildTree(vp.get("m")!, 1, "m", name, "m", tree.birth_year ?? null);
    return { tree, vp, MAX_GEN };
  }

  /**
   * Voti di ogni casella dell'albero (20/11/2026): voto da atleta (dalle sue
   * corse) e voto da stallone o da fattrice (dai figli). Si leggono a ogni
   * richiesta dalle tabelle che la notte ricalcola, quindi quando un
   * antenato riceve nuovi figli con voto (LEMON DRA, dai recuperi degli
   * storici) il suo voto da stallone nell'albero cambia da solo.
   */
  function aggiungiVotiAlbero(db: any, tree: any) {
    const nodi: any[] = [];
    (function giro(n: any) { if (!n) return; nodi.push(n); giro(n.sire); giro(n.dam); })(tree);
    const nomi = Array.from(new Set(nodi.map(n => String(n.name || "").trim().toUpperCase()).filter(Boolean)));
    if (!nomi.length) return;
    const atleti = new Map<string, any[]>();
    const stalloni = new Map<string, string>();
    const fattrici = new Map<string, string>();
    for (let i = 0; i < nomi.length; i += 400) {
      const pezzo = nomi.slice(i, i + 400);
      const q = pezzo.map(() => "?").join(",");
      for (const r of db.prepare(`SELECT name, birth_year, grade, rating_mode FROM horse_ratings
                                  WHERE name IN (${q}) AND grade IS NOT NULL AND grade != 'N/A'`).all(...pezzo) as any[]) {
        const k = String(r.name).toUpperCase();
        if (!atleti.has(k)) atleti.set(k, []);
        atleti.get(k)!.push(r);
      }
      for (const r of db.prepare(`SELECT sire, grade FROM stallion_rating_stats
                                  WHERE sire IN (${q}) AND grade IS NOT NULL AND grade != 'N/A'`).all(...pezzo) as any[])
        stalloni.set(String(r.sire).toUpperCase(), r.grade);
      for (const r of db.prepare(`SELECT dam, grade FROM dam_rating_stats
                                  WHERE dam IN (${q}) AND grade IS NOT NULL AND grade != 'N/A'`).all(...pezzo) as any[])
        fattrici.set(String(r.dam).toUpperCase(), r.grade);
    }
    for (const n of nodi) {
      const k = String(n.name || "").trim().toUpperCase();
      // Omonimo riconosciuto dall'eta' (vedi buildTree): solo il riquadro.
      if (n.omonimo) { n.voti = { atleta: null, stallone: null, fattrice: null }; continue; }
      const righe = (atleti.get(k) || []).filter((r: any) => n.birth_year
        ? (!r.birth_year || r.birth_year === n.birth_year)
        : (!n.anno_max || !r.birth_year || r.birth_year <= n.anno_max));
      const atl = righe.find((r: any) => r.rating_mode === "performance") || righe[0];
      n.voti = {
        atleta: atl?.grade ?? null,
        stallone: n.sex === "F" ? null : (stalloni.get(k) ?? null),
        fattrice: n.sex === "M" ? null : (fattrici.get(k) ?? null),
      };
    }
  }

  /** Chiede alla fonte la genealogia del cavallo e dei genitori, se manca. */
  async function completaGenealogia(db: any, name: string) {
    try {
      await ensureGenealogy(DB_PATH, name);
      const parents = db.prepare(
        "SELECT sire, dam FROM horses WHERE name = ? ORDER BY birth_year DESC LIMIT 1"
      ).get(name) as any;
      for (const parent of [parents?.sire, parents?.dam]) {
        if (parent) { try { await ensureGenealogy(DB_PATH, parent); } catch { /* si prosegue */ } }
      }
    } catch { /* si prosegue lo stesso */ }
  }

  // ──────────────────────────────────────────────
  // GET /api/pedigree/:name — albero genealogico 4 generazioni + inbreeding
  // ──────────────────────────────────────────────
  app.get("/api/pedigree/:name", async (req, res) => {
    const name = decodeURIComponent(req.params.name).toUpperCase().trim();
    const db = getDb();
    try {
      // Se di questo cavallo (o dei genitori) manca l'albero della seconda
      // fonte, proviamo a chiederlo adesso.
      await completaGenealogia(db, name);

      const { tree, vp, MAX_GEN } = alberoGenealogico(db, name);
      if (!tree) {
        return res.status(404).json({ error: "Cavallo non trovato" });
      }
      aggiungiVotiAlbero(db, tree);

      // Consanguineita' (consanguineita.ts): Wright su tutte le coppie di
      // comparse, senza contare due volte i tratti in comune.
      const inb = calcolaWright(
        comparseAlbero(tree.sire, MAX_GEN - 1),
        comparseAlbero(tree.dam, MAX_GEN - 1),
        1,
      );
      const commonAncestors = inb.comuni;
      const inbreedingCoeff = inb.coefficiente;

      // Get rating if available
      const rating = db.prepare(`
        SELECT grade, score, career_earnings, career_races, career_wins, win_rate
        FROM horse_ratings WHERE name = ? AND rating_mode IN ('performance', 'storico') LIMIT 1
      `).get(name) as any;

      // Il voto mostrato qui viene dalle corse del cavallo, non dal pedigree:
      // diciamo quanto e' affidabile e se il cavallo ha gia' figli in archivio
      // (solo allora lo chiamiamo stallone o fattrice).
      const figli = (db.prepare(
        "SELECT COUNT(*) AS n FROM horses WHERE UPPER(TRIM(sire)) = ? OR UPPER(TRIM(dam)) = ?"
      ).get(name, name) as any)?.n ?? 0;
      const annoOggi = new Date().getFullYear();
      const aff = rating && tree.birth_year ? affidabilitaVoto(annoOggi - tree.birth_year, rating.grade) : null;

      res.json({
        horse: tree,
        figli,
        affidabilita: aff && (aff as any).disponibile ? { livello: (aff as any).livello } : null,
        rating: rating || null,
        inbreeding_coefficient: Math.round(inbreedingCoeff * 1000) / 10,
        common_ancestors: commonAncestors.slice(0, 10),
        ripetuti_un_lato: inb.ripetuti.slice(0, 12),
        max_generations: MAX_GEN,
        has_source_pedigree: vp.size > 0,
      });
    } finally { db.close(); }
  });

  // ──────────────────────────────────────────────
  // GET /api/advisor/simulate?stallion=NOME&mare=NOME
  // Simulazione breeding: distribuzione probabilita' voti figli,
  // guadagni attesi, costo allevamento, ROI
  // ──────────────────────────────────────────────
  app.get("/api/advisor/simulate", (req, res) => {
    const stallion = ((req.query.stallion as string) || "").trim().toUpperCase();
    const mare = ((req.query.mare as string) || "").trim().toUpperCase();
    if (!stallion || !mare) {
      return res.status(400).json({ error: "Parametri richiesti: stallion, mare" });
    }
    const db = getDb();
    try {
      // Grade distribution for stallion's existing offspring
      const offspringGrades = db.prepare(`
        SELECT grade, COUNT(*) as cnt
        FROM horse_ratings
        WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?)) AND rating_mode = 'performance'
          AND grade IS NOT NULL
        GROUP BY grade
      `).all(stallion) as any[];

      // Also check if mare has a sire (for inbreeding check)
      const mareData = db.prepare(`
        SELECT name, birth_year, sire, dam FROM horses WHERE name = ? LIMIT 1
      `).get(mare) as any;

      // Grade earnings map (population averages)
      const gradeEarningsRows = db.prepare(`
        SELECT grade, AVG(career_earnings) as avg_earn, COUNT(*) as cnt
        FROM horse_ratings
        WHERE rating_mode = 'performance' AND career_earnings > 0
        GROUP BY grade
      `).all() as any[];

      // Stud fee
      const studRow = db.prepare(`
        SELECT stud_fee_eur FROM stallions WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) LIMIT 1
      `).get(stallion) as any;

      // Build probability distribution
      const GRADE_LIST = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F"];
      const totalOffspring = offspringGrades.reduce((s: number, g: any) => s + g.cnt, 0);

      // If stallion has offspring data, use it; otherwise fall back to population distribution
      const popRows = db.prepare(`
        SELECT grade, COUNT(*) as cnt FROM horse_ratings
        WHERE rating_mode = 'performance' AND grade IS NOT NULL GROUP BY grade
      `).all() as any[];
      const popTotal = popRows.reduce((s: number, g: any) => s + g.cnt, 0);

      const gradeEarnings = new Map<string, number>();
      for (const r of gradeEarningsRows) gradeEarnings.set(r.grade, r.avg_earn || 0);

      const distribution = GRADE_LIST.map(g => {
        const stallionCnt = offspringGrades.find((r: any) => r.grade === g)?.cnt ?? 0;
        const popCnt = popRows.find((r: any) => r.grade === g)?.cnt ?? 0;
        const prob = totalOffspring >= 10
          ? stallionCnt / totalOffspring
          : popCnt / popTotal;
        const avgEarn = gradeEarnings.get(g) ?? 0;
        const expectedEarn = prob * avgEarn;
        return {
          grade: g,
          probability: Math.round(prob * 1000) / 10,
          stallion_count: stallionCnt,
          population_count: popCnt,
          avg_earnings: Math.round(avgEarn),
          expected_earnings: Math.round(expectedEarn),
        };
      });

      // Cost model (matching roi_model.py)
      // La monta puo' essere scritta a mano da chi usa l'Advisor (?monta=):
      // vale piu' del catalogo. Se non c'e' ne' l'una ne' l'altro la monta
      // resta fuori dai costi e la risposta lo dice (monta_nota = false):
      // un prezzo non si inventa.
      const montaScritta = Number(req.query.monta);
      const montaManuale = Number.isFinite(montaScritta) && montaScritta > 0 ? Math.round(montaScritta) : null;
      const studFee = montaManuale ?? studRow?.stud_fee_eur ?? 0;
      const montaNota = montaManuale != null || (studRow?.stud_fee_eur ?? 0) > 0;
      const COSTI = {
        riproduzione: 430 + 80 + 400 + 15 * 340,
        puledro_anno1: 9 * 180 + 96 + 500,
        yearling: 15 * 365 + 500 + 600,
        training: 350 * 18 + 15 * 30 * 18 + 500 * 1.5 + 600 * 1.5,
        agone: 500 * 4 + 600 * 4 + 1500,
      };
      const costoBase = studFee + COSTI.riproduzione + COSTI.puledro_anno1 + COSTI.yearling + COSTI.training + COSTI.agone;
      const costoSeMorte = studFee + 430 + 80 + 400 + 15 * 340;
      const costoAtteso = Math.round(0.95 * costoBase + 0.05 * costoSeMorte);

      const ricavoAtteso = distribution.reduce((s: number, d: any) => s + d.expected_earnings, 0);
      const roi = costoAtteso > 0 ? (ricavoAtteso - costoAtteso) / costoAtteso : 0;
      const probRecupero = distribution.filter((d: any) => d.avg_earnings >= costoAtteso).reduce((s: number, d: any) => s + d.probability / 100, 0);

      // ── Ritorno economico come FASCIA ────────────────────────────────
      // Il ROI singolo sopra e' calcolato sulle medie dei guadagni, e le
      // medie sono gonfiate da pochi campioni (nel grado SSS media
      // 371.747 contro mediana 230.061). Qui si simulano 20.000 puledri
      // pescando guadagni realmente osservati, e si attenua il profilo
      // dello stallone verso la media generale quando i figli valutati
      // sono pochi: cosi' uno stallone con pochi figli fortunati non
      // scala la classifica per effetto del caso.
      // Anche i gradi vanno presi sulle sole generazioni mature: i figli
      // nati di recente hanno voti bassi solo perche' non hanno corso, e
      // includerli penalizzerebbe gli stalloni giovani.
      const annoMax = annoMaturita();
      const offspringGradesMaturi = db.prepare(`
        SELECT grade, COUNT(*) as cnt FROM horse_ratings
        WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?)) AND rating_mode = 'performance'
          AND grade IS NOT NULL AND birth_year IS NOT NULL AND birth_year <= ?
        GROUP BY grade
      `).all(stallion, annoMax) as any[];
      const popRowsMaturi = db.prepare(`
        SELECT grade, COUNT(*) as cnt FROM horse_ratings
        WHERE rating_mode = 'performance' AND grade IS NOT NULL
          AND birth_year IS NOT NULL AND birth_year <= ?
        GROUP BY grade
      `).all(annoMax) as any[];
      // Gli stalloni giovani non hanno ancora nessun figlio maturo: il
      // filtro da solo li ridurrebbe alla media generale, buttando via
      // un segnale reale. In quel caso si ripiega sui figli ancora in
      // attivita', dichiarandolo.
      const nMaturi = offspringGradesMaturi.reduce((a: number, r: any) => a + r.cnt, 0);
      const usaMaturi = nMaturi >= 10;
      const baseFigli: "maturi" | "tutti" | "nessuna" =
        usaMaturi ? "maturi" : totalOffspring > 0 ? "tutti" : "nessuna";
      const stallionCounts = new Map<string, number>();
      for (const r of (usaMaturi ? offspringGradesMaturi : offspringGrades)) stallionCounts.set(r.grade, r.cnt);
      const popCounts = new Map<string, number>();
      for (const r of (usaMaturi ? popRowsMaturi : popRows)) popCounts.set(r.grade, r.cnt);
      const roiRange = simulateRoi(
        stallionCounts, popCounts, earningsByGrade(db, annoMax),
        costoBase, costoSeMorte, baseFigli,
      );

      // Inbreeding check
      let inbreedingRisk = false;
      let inbreedingAncestor: string | null = null;
      if (mareData) {
        const mareAncestors = new Set<string>();
        if (mareData.sire) mareAncestors.add(mareData.sire.toUpperCase());
        if (mareData.dam) mareAncestors.add(mareData.dam.toUpperCase());
        // Check stallion's parents
        const stallionParents = db.prepare(`
          SELECT sire, dam FROM horses WHERE name = ? LIMIT 1
        `).get(stallion) as any;
        if (stallionParents) {
          if (stallionParents.sire && mareAncestors.has(stallionParents.sire.toUpperCase())) {
            inbreedingRisk = true;
            inbreedingAncestor = stallionParents.sire;
          }
          if (!inbreedingRisk && stallionParents.dam && mareAncestors.has(stallionParents.dam.toUpperCase())) {
            inbreedingRisk = true;
            inbreedingAncestor = stallionParents.dam;
          }
        }
        // Also check grandparents
        if (!inbreedingRisk && mareData.sire) {
          const mareSireParents = db.prepare(`
            SELECT sire, dam FROM horses WHERE name = ? LIMIT 1
          `).get(mareData.sire.toUpperCase()) as any;
          if (mareSireParents) {
            if (mareSireParents.sire) mareAncestors.add(mareSireParents.sire.toUpperCase());
            if (mareSireParents.dam) mareAncestors.add(mareSireParents.dam.toUpperCase());
          }
        }
      }

      // ── Previsione della COPPIA (non del solo padre) ──────────────
      // Prima questa risposta dipendeva soltanto dallo stallone: con
      // qualsiasi fattrice il risultato era identico. Ora entra anche la
      // produzione della fattrice, con fascia di incertezza.
      const prediction = predictPair(db, stallion, mare);
      const inb = inbreeding(db, stallion, mare);
      const reasons = explain(prediction, inb, studFee || null);
      // Controllo rispetto al disciplinare del Libro genealogico (UNIRE/ANACT)
      const eligibility = checkEligibility(db, stallion, mare);

      // ── Strada alternativa: vendere il puledro come yearling ────────
      // Chi vende a un anno non paga addestramento ne' attivita'
      // agonistica, quindi il costo di confronto e' molto piu' basso.
      const costoYearling = studFee + COSTI.riproduzione + COSTI.puledro_anno1 + COSTI.yearling;
      // Si passa il NOME dello stallone, non il voto atteso del puledro: la
      // fascia di prezzo viene dai suoi figli realmente venduti in asta quando
      // ce ne sono abbastanza, e solo in mancanza di quelli si stima dalla
      // tassa di monta. Prima si passava il voto atteso, che e' compresso fra
      // 43 e 51 e rendeva il prezzo praticamente uguale per tutti.
      const rivendita = stimaRivendita(stallion, studFee, costoYearling);

      let potenziale: any = null;
      try { potenziale = potenzialeNascita(db, stallion, contestoMadre(db, mare)); } catch { /* resta senza */ }
      res.json({
        stallion,
        mare,
        potenziale,
        mareData: mareData || null,
        stud_fee: studFee,
        monta_manuale: montaManuale != null,
        monta_nota: montaNota,
        prediction,
        inbreeding_detail: inb,
        reasons,
        eligibility,
        distribution,
        total_offspring: totalOffspring,
        source: totalOffspring >= 10 ? "stallion_offspring" : "population_fallback",
        costs: {
          stud_fee: studFee,
          riproduzione: Math.round(COSTI.riproduzione),
          puledro_anno1: Math.round(COSTI.puledro_anno1),
          yearling: Math.round(COSTI.yearling),
          training: Math.round(COSTI.training),
          agone: Math.round(COSTI.agone),
          costo_base: Math.round(costoBase),
          costo_se_morte: Math.round(costoSeMorte),
          costo_atteso: costoAtteso,
        },
        roi: {
          costo_atteso: costoAtteso,
          ricavo_atteso: Math.round(ricavoAtteso),
          utile_atteso: Math.round(ricavoAtteso - costoAtteso),
          roi_pct: Math.round(roi * 1000) / 10,
          prob_recupero_costi: Math.round(probRecupero * 1000) / 10,
        },
        roi_range: roiRange,
        rivendita,
        inbreeding: {
          // Campi storici mantenuti per compatibilita'; il calcolo completo
          // su piu' generazioni sta in inbreeding_detail.
          risk: inb.available ? inb.level !== "nessuna" : inbreedingRisk,
          ancestor: inb.common_ancestors[0]?.name ?? inbreedingAncestor,
        },
      });
    } finally { db.close(); }
  });

  // ──────────────────────────────────────────────
  // GET /api/advisor/validation
  // La prova del nove: quanto ci prende il modello su cavalli
  // che non ha mai visto in addestramento.
  // ──────────────────────────────────────────────
  // Potenziale dinamico: esito della verifica per stadio (potenziale.py).
  app.get("/api/potenziale/verifica", (_req, res) => {
    const v = verificaPotenziale();
    if (!v) return res.status(404).json({ error: "verifica non ancora calcolata" });
    res.json(v);
  });

  app.get("/api/advisor/validation", (_req, res) => {
    const bt = getAdvisorBacktest();
    if (!bt) {
      return res.status(503).json({
        error: "Verifica non disponibile: advisor_backtest.json non generato",
      });
    }
    res.json({ ...bt, model: getAdvisorModel(), science: BASI_SCIENTIFICHE, puledri: getPuledriVerifica() });
  });

  // ──────────────────────────────────────────────
  // GET /api/advisor/rules — testo della normativa e basi scientifiche
  // ──────────────────────────────────────────────
  app.get("/api/advisor/rules", pronta(), (req, res) => {
    const stallion = ((req.query.stallion as string) || "").trim();
    const mare = ((req.query.mare as string) || "").trim();
    if (!stallion || !mare) {
      return res.json({ fonte: FONTE_NORMATIVA, soglie: SOGLIE, science: BASI_SCIENTIFICHE });
    }
    const db = getDb();
    try {
      res.json({
        fonte: FONTE_NORMATIVA, soglie: SOGLIE, science: BASI_SCIENTIFICHE,
        eligibility: checkEligibility(db, stallion.toUpperCase(), mare.toUpperCase()),
      });
    } finally { db.close(); }
  });

  // ──────────────────────────────────────────────
  // GET /api/advisor/compare?mare=NOME&stallions=A,B,C
  // Piu' stalloni messi in fila sulla STESSA fattrice.
  // ──────────────────────────────────────────────
  app.get("/api/advisor/compare", (req, res) => {
    const mare = ((req.query.mare as string) || "").trim().toUpperCase();
    const list = ((req.query.stallions as string) || "")
      .split(",").map(x => x.trim().toUpperCase()).filter(Boolean).slice(0, 8);
    if (!mare || list.length === 0) {
      return res.status(400).json({ error: "Parametri richiesti: mare, stallions" });
    }
    const db = getDb();
    try {
      const feeStmt = db.prepare(
        "SELECT stud_fee_eur, stud_farm FROM stallions WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) LIMIT 1");
      const rows = list.map(name => {
        const info = feeStmt.get(name) as any;
        const p = predictPair(db, name, mare);
        const inb = inbreeding(db, name, mare);
        const fee = info?.stud_fee_eur ?? null;
        return {
          stallion: name,
          stud_fee: fee,
          stud_farm: info?.stud_farm ?? null,
          expected_score: p.expected_score,
          expected_grade: p.expected_grade,
          typical_low: p.typical_low,
          typical_high: p.typical_high,
          prob_top: p.prob_top,
          prob_poor: p.prob_poor,
          prob_buono: p.puledro.prob_buono,
          prob_corre: p.puledro.prob_corre,
          confidence: p.confidence,
          confidence_label: p.confidence_label,
          n_offspring_sire: p.sire.n_offspring,
          inbreeding_pct: inb.coefficient_pct,
          inbreeding_level: inb.level,
          // punti di voto atteso sopra la media per ogni mille euro di monta
          value_index: fee && fee > 0
            ? Math.round(((p.expected_score - p.population_mean) / (fee / 1000)) * 100) / 100
            : null,
          reasons: explain(p, inb, fee),
        };
      });
      res.json({ mare, n: rows.length, candidates: rows });
    } finally { db.close(); }
  });

  // ──────────────────────────────────────────────
  // POST /api/advisor
  // Body: { fattrice: string, budget_max?: number }
  // ──────────────────────────────────────────────
  app.post("/api/advisor", (req, res) => {
    const { fattrice, budget_max, stallone, monta } = req.body as { fattrice: string; budget_max?: number; stallone?: string; monta?: number };
    if (!fattrice) return res.status(400).json({ error: "fattrice required" });

    const fattriceUpper = fattrice.trim().toUpperCase();
    assicuraIndici();
    const db = getDb();
    const tempi: string[] = [];
    let ultimo = performance.now();
    const segna = (k: string) => { const t = performance.now(); tempi.push(`${k};dur=${(t - ultimo).toFixed(1)}`); ultimo = t; };
    try {
      // Get fattrice data
      const horse = db.prepare(`
        SELECT name, birth_year, sire, dam FROM horses WHERE name = ? LIMIT 1
      `).get(fattriceUpper) as any;

      // Search by partial name if not found
      const suggestions = horse ? [] : db.prepare(`
        SELECT name, birth_year, sire, dam FROM horses
        WHERE name LIKE ? AND (sex = 'F' OR sex IS NULL)
        ORDER BY birth_year DESC LIMIT 5
      `).all(`%${fattriceUpper}%`) as any[];

      if (!horse && suggestions.length === 0) {
        return res.json({ found: false, suggestions: [] });
      }
      if (!horse) {
        return res.json({ found: false, suggestions });
      }

      // Build set of ancestors (sire + dam of fattrice, grandparents)
      const ancestorNames = new Set<string>();
      if (horse.sire) ancestorNames.add(horse.sire.toUpperCase());
      if (horse.dam) ancestorNames.add(horse.dam.toUpperCase());

      // Get parents of sire/dam (grandparents)
      for (const parent of [horse.sire, horse.dam]) {
        if (!parent) continue;
        const p = db.prepare("SELECT sire, dam FROM horses WHERE name = ? LIMIT 1").get(parent.toUpperCase()) as any;
        if (p) {
          if (p.sire) ancestorNames.add(p.sire.toUpperCase());
          if (p.dam) ancestorNames.add(p.dam.toUpperCase());
        }
      }

      // Uno stallone scritto a mano: anche fuori catalogo o senza tassa di
      // monta nota. La monta si prende da chi scrive, se la scrive; se no dal
      // catalogo; se no resta "non nota" (mai stimata).
      const stalloneUp = (stallone || "").trim().toUpperCase();
      let singolo: any[] | null = null;
      let stalloneNonTrovato = false;
      if (stalloneUp) {
        const info = db.prepare(`
          SELECT s.name, s.stud_fee_eur, s.stud_farm, s.stud_status,
                 srs.avg_score, srs.n_in_corsa, srs.n_figli_totali, srs.n_SSS, srs.n_SS, srs.n_S,
                 srs.pct_top_S, srs.avg_earnings, s.media_in_corsa, s.progeny_earnings_2024
            FROM stallions s LEFT JOIN stallion_rating_stats srs ON s.name = srs.sire
           WHERE UPPER(TRIM(s.name)) = ? LIMIT 1`).get(stalloneUp) as any
          ?? db.prepare(`
          SELECT srs.sire AS name, NULL AS stud_fee_eur, NULL AS stud_farm, NULL AS stud_status,
                 srs.avg_score, srs.n_in_corsa, srs.n_figli_totali, srs.n_SSS, srs.n_SS, srs.n_S,
                 srs.pct_top_S, srs.avg_earnings, NULL AS media_in_corsa, NULL AS progeny_earnings_2024
            FROM stallion_rating_stats srs WHERE UPPER(TRIM(srs.sire)) = ? LIMIT 1`).get(stalloneUp) as any
          ?? ((db.prepare("SELECT COUNT(*) n FROM horses WHERE UPPER(TRIM(name)) = ? OR UPPER(TRIM(sire)) = ?").get(stalloneUp, stalloneUp) as any).n > 0
              ? { name: stalloneUp, stud_fee_eur: null, n_figli_totali: 0 } : null);
        if (!info) stalloneNonTrovato = true;
        else {
          const m = Number(monta);
          const manuale = Number.isFinite(m) && m > 0 ? Math.round(m) : null;
          singolo = [{ ...info, stud_fee_eur: manuale ?? (info.stud_fee_eur > 0 ? info.stud_fee_eur : null),
                       monta_manuale: manuale != null, antenato: ancestorNames.has(stalloneUp) }];
        }
      }
      if (stalloneNonTrovato) {
        return res.json({ found: true, fattrice: { ...horse, come_fattrice: puntiFattrice(db, horse.name) },
          ancestors: Array.from(ancestorNames), budget_max: null, candidates: [], stallone: stalloneUp,
          stallone_non_trovato: true, validazione: null });
      }

      // Tutti gli stalloni in monta nella stagione piu' recente del catalogo
      // (21/11/2026: anche quelli con monta "da concordare" e quelli senza
      // figli ancora valutati, che prima restavano fuori), ognuno valutato per
      // intero su QUESTA fattrice. Le letture lente dei padri ora sono in
      // memoria (advisorEngine, potenziale), quindi si valutano tutti.
      const finoA = (x: any) => { const m = String(x ?? "").match(/(\d{4})\s*$/); return m ? Number(m[1]) : 0; };
      const catalogo = singolo ?? (() => {
        const righe = db.prepare(`
          SELECT s.name, s.stud_fee_eur, s.stud_farm, s.stud_status, s.season, s.country, s.catalog_sire,
                 srs.avg_score, srs.n_in_corsa, srs.n_figli_totali, srs.n_SSS, srs.n_SS, srs.n_S,
                 srs.pct_top_S, srs.avg_earnings, s.media_in_corsa, s.progeny_earnings_2024, srs.grade AS grado_stallone
            FROM stallions s
            LEFT JOIN stallion_rating_stats srs ON s.name = srs.sire
           WHERE s.stud_status IN ('active', 'da_concordare', 'free')
           GROUP BY s.name`).all() as any[];
        const ultima = Math.max(0, ...righe.map(r => finoA(r.season)));
        return righe.filter(r => !ultima || finoA(r.season) === ultima);
      })();

      const maxConsang = Number((req.body as any).max_consanguineita);
      const paese = String((req.body as any).paese ?? "").trim().toUpperCase();
      const soloMontaNota = !!(req.body as any).solo_monta_nota;
      const inc = incrociPerFattrice(db, fattriceUpper, horse.sire);
      const padreDi = db.prepare("SELECT sire FROM horses WHERE name = ? AND sire IS NOT NULL LIMIT 1");
      const profili = (() => { try { return profiliStalloni(db); } catch { return new Map(); } })();

      const ctxMadre = contestoMadre(db, fattriceUpper);
      segna("catalogo_incroci");
      let esclusiParenti = 0, esclusiMonta = 0, esclusiConsang = 0, esclusiPaese = 0;
      const candidates = catalogo
        .filter((s: any) => {
          if (singolo) return true;
          const nameUp = s.name.toUpperCase();
          if (ancestorNames.has(nameUp)) { esclusiParenti++; return false; } // antenato diretto
          const fee = s.stud_fee_eur > 0 ? s.stud_fee_eur : null;
          if (soloMontaNota && fee == null) { esclusiMonta++; return false; }
          if (budget_max && fee != null && fee > budget_max) { esclusiMonta++; return false; }
          if (paese && String(s.country ?? "").toUpperCase() !== paese) { esclusiPaese++; return false; }
          return true;
        })
        .map((s: any) => {
          // Ogni candidato viene valutato SULLA FATTRICE scelta:
          // stesso stallone + fattrice diversa = risultato diverso.
          const p = predictPair(db, s.name, fattriceUpper);
          const inb = inbreeding(db, s.name, fattriceUpper);
          const fee = s.stud_fee_eur > 0 ? s.stud_fee_eur : null;
          const padreStallone = s.catalog_sire || (padreDi.get(s.name) as any)?.sire || null;
          return {
            ...s,
            stud_fee_eur: fee,
            inbreeding_risk: inb.level === "alta",
            inbreeding_pct: inb.coefficient_pct,
            inbreeding_level: inb.level,
            inbreeding_noto: inb.available,
            expected_score: p.expected_score,
            expected_grade: p.expected_grade,
            typical_low: p.typical_low,
            typical_high: p.typical_high,
            prob_top: p.prob_top,
            prob_buono: p.puledro.prob_buono,
            prob_corre: p.puledro.prob_corre,
            confidence: p.confidence,
            confidence_label: p.confidence_label,
            value_index: fee
              ? Math.round(((p.expected_score - p.population_mean) / (fee / 1000)) * 100) / 100
              : null,
            score_rank: p.expected_score,
            padre_stallone: padreStallone ? String(padreStallone).toUpperCase().trim() : null,
            incrocio: inc.stretto(s.name),
            linea: inc.linea(padreStallone),
            fratelli: inc.fratelli(s.name),
            distanza_figli: profili.get(String(s.name).toUpperCase()) ?? null,
          };
        })
        .filter((c: any) => {
          if (singolo || !Number.isFinite(maxConsang) || maxConsang <= 0) return true;
          if (c.inbreeding_pct > maxConsang) { esclusiConsang++; return false; }
          return true;
        })
        // Ordine: probabilita' di un buon cavallo, la previsione verificata su
        // tutti i nati (anche chi non corre). A pari probabilita', voto atteso.
        .sort((a: any, b: any) => ((b.prob_buono ?? -1) - (a.prob_buono ?? -1))
                                  || (b.expected_score - a.expected_score));
      // Il potenziale a 4 anni (potenziale.py) percorre centinaia di alberi:
      // per tutti gli stalloni costava piu' del resto della classifica. Si
      // calcola per i primi 25; per gli altri lo da' il dettaglio della coppia
      // (/api/advisor/simulate), quando lo si apre.
      segna("valutazione");
      candidates.forEach((c: any, i: number) => { c.potenziale = i < 25 || singolo ? potenzialeNascita(db, c.name, ctxMadre) : null; });
      segna("potenziale");

      const paesi = singolo ? [] : Array.from(new Set(catalogo.map((s: any) => String(s.country ?? "").toUpperCase()).filter(Boolean))).sort();

      // Lo stato del modello viaggia con i consigli, non solo nella pagina che
      // spiega il metodo: chi apre l'Advisor deve leggere accanto ai numeri
      // quanto sono affidabili, non altrove.
      const ver = getPuledriVerifica();
      const validazione = ver ? {
        stato: ver.stato,
        sperimentale: ver.sperimentale,
        riserva: ver.riserva,
        auc_buono: ver.buono?.auc_modello ?? null,
        auc_solo_padre: ver.buono?.auc_solo_padre ?? null,
        n_prova: ver.n_prova,
        anni_prova: ver.anni_prova,
        annata_di_conferma: ver.annata_di_conferma,
        // Dal novembre 2026 l'etichetta che conta e' quella del potenziale
        // dinamico allo stadio nascita: si accende o si spegne da sola con la
        // verifica continua (potenziale.py).
        potenziale_nascita: etichettaStadio("nascita"),
      } : null;

      res.setHeader("Server-Timing", tempi.join(", "));
      res.json({
        found: true,
        // punti e grado della pagina Fattrici, per mostrarli uguali qui
        fattrice: { ...horse, come_fattrice: puntiFattrice(db, horse.name) },
        ancestors: Array.from(ancestorNames),
        budget_max: singolo ? null : (budget_max || null),
        stallone: singolo ? stalloneUp : null,
        candidates,
        incroci: { padre_fattrice: inc.padre_fattrice, base: inc.base },
        esclusi: singolo ? null : { parenti: esclusiParenti, monta: esclusiMonta, consanguineita: esclusiConsang, paese: esclusiPaese },
        in_catalogo: singolo ? null : catalogo.length,
        paesi,
        validazione,
      });
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────
  // POST /api/run-nightly — trigger manuale nightly_update.py
  // Protetto da secret header per evitare abusi
  // ──────────────────────────────────────────
  app.post("/api/run-nightly", (req, res) => {
    // Fail-closed: senza NIGHTLY_SECRET configurato l'endpoint e' disabilitato.
    // Nessun segreto di default hardcoded.
    const expected = process.env.NIGHTLY_SECRET;
    if (!expected) {
      return res.status(503).json({
        error: "Endpoint disabilitato: NIGHTLY_SECRET non configurato",
      });
    }
    const secret = req.headers["x-nightly-secret"];
    if (typeof secret !== "string" || secret !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Lock in memoria: evita esecuzioni concorrenti sullo stesso database
    if (nightlyRunning) {
      return res.status(409).json({
        error: "nightly_update.py e' gia' in esecuzione",
        started_at: nightlyStartedAt,
      });
    }
    nightlyRunning = true;
    nightlyStartedAt = new Date().toISOString();

    // Avvia in background senza bloccare la risposta
    const { spawn } = require("child_process");
    const scriptPath = require("path").join(__dirname, "..", "nightly_update.py");
    const child = spawn("python3", [scriptPath], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code: number) => {
      nightlyRunning = false;
      console.log(`[NIGHTLY] exit ${code}\n${stderr.slice(-2000)}`);
    });
    child.on("error", (err: Error) => {
      nightlyRunning = false;
      console.error("[NIGHTLY] spawn error:", err?.message);
    });

    res.json({
      started: true,
      pid: child.pid,
      message: "nightly_update.py avviato in background",
    });
  });

  // ──────────────────────────────────────────────
  // CONSIGLIERE DI ALLEVAMENTO — pesi letti all'avvio. Il vecchio modello
  // sperimentale (breeding_model.json) e' stato tolto: non superava la prova.
  // ──────────────────────────────────────────────
  const advisorModelLoaded = loadAdvisorModel(process.cwd());
  if (!advisorModelLoaded) {
    console.warn("[ADVISOR] advisor_model.json non trovato: l'Advisor usera' pesi prudenti " +
                 "finche' non viene generato da scripts/advisor_model.py");
  }

  if (!loadPuledriModel(process.cwd())) {
    console.warn("[PULEDRI] puledri_model.json non trovato: niente probabilita' sui puledri " +
                 "finche' non viene generato da scripts/puledri_model.py");
  }

  // ──────────────────────────────────────────────
  // GET /api/horses — paginated, filterable horse database
  // ──────────────────────────────────────────────
  app.get("/api/horses", (req, res) => {
    const db = getDb();
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(10, parseInt(req.query.limit as string) || 30));
      const offset = (page - 1) * limit;
      const search = (req.query.search as string || "").trim();
      const year = req.query.year as string || "";
      const grade = req.query.grade as string || "";
      const sex = req.query.sex as string || "";
      const country = req.query.country as string || "";
      const sortBy = (req.query.sort as string) || "score";
      const sortDir = (req.query.dir as string) === "asc" ? "ASC" : "DESC";

      const conditions: string[] = ["hr.rating_mode = 'performance'", ONLY_ATHLETES];
      const params: any[] = [];

      if (search) {
        conditions.push("UPPER(hr.name) LIKE UPPER(?)");
        params.push("%" + search.toUpperCase() + "%");
      }
      if (year && year !== "all") {
        conditions.push("hr.birth_year = ?");
        params.push(parseInt(year));
      }
      if (grade && grade !== "all") {
        conditions.push("hr.grade = ?");
        params.push(grade);
      }
      if (sex && sex !== "all") {
        conditions.push("h.sex = ?");
        params.push(sex);
      }
      if (country && country !== "all") {
        conditions.push("h.country = ?");
        params.push(country);
      }

      const where = conditions.join(" AND ");
      const sortCol = sortBy === "earnings" ? "hr.career_earnings"
        : sortBy === "wins" ? "hr.career_wins"
        : sortBy === "races" ? "hr.career_races"
        : sortBy === "name" ? "hr.name"
        : "hr.score";
      const sortExpr = sortBy === "name" ? `UPPER(${sortCol}) ${sortDir}` : `${sortCol} ${sortDir}`;

      const total = (db.prepare(`SELECT COUNT(*) as c FROM horse_ratings hr LEFT JOIN horses h ON h.name = hr.name AND h.birth_year = hr.birth_year WHERE ${where}`).get(...params) as any).c;

      const rows = db.prepare(`
        SELECT hr.name, hr.birth_year, hr.sire, hr.grade, hr.score, hr.career_races, hr.career_wins,
               hr.career_earnings, hr.win_rate, hr.record_career, h.country, h.sex, h.dam
        FROM horse_ratings hr
        LEFT JOIN horses h ON h.name = hr.name AND h.birth_year = hr.birth_year
        WHERE ${where}
        ORDER BY ${sortExpr}
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as any[];

      // Get distinct years and countries for filters
      const years = db.prepare("SELECT DISTINCT birth_year FROM horse_ratings WHERE rating_mode = 'performance' AND COALESCE(horse_class, 'athlete') = 'athlete' ORDER BY birth_year DESC").all() as any[];
      const countries = db.prepare("SELECT DISTINCT h.country FROM horses h WHERE h.country IS NOT NULL AND COALESCE(h.horse_class, 'athlete') = 'athlete' ORDER BY h.country").all() as any[];

      res.json({ total, page, limit, rows, years: years.map(y => y.birth_year), countries: countries.map(c => c.country) });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally {
      db.close();
    }
  });

  // Verifica gara per gara: la stima confrontata con l'arrivo vero, per le
  // corse gia' disputate. Le stime "del_giorno" sono quelle mostrate davvero
  // nel calendario prima della gara; le "ricostruito" sono calcolate dopo, ma
  // con i soli dati di prima della gara, per le corse precedenti all'arrivo
  // del pronostico.
  // Esiti dei non classificati in parole semplici.
  const esitoInParole = (t: any): string | null => {
    const k = String(t ?? "").trim().toLowerCase();
    if (!k) return null;
    const m: Record<string, string> = {
      "r.p.": "squalificato (galoppo)", "r.a.": "squalificato (galoppo in arrivo)",
      "r.c.": "squalificato (galoppo)", "rit.": "ritirato", "rit..": "ritirato",
      "dis.": "distanziato", "n.p.": "non partito", "np": "non partito",
      "nr": "non classificato", "n.c.": "non classificato", "am.": "squalificato",
      "amb.": "squalificato", "cad.": "caduto", "disq.": "squalificato",
    };
    return m[k] ?? String(t);
  };

  app.get("/api/calendar/verifica", pronta(10 * 60_000), (req, res) => {
    assicuraIndici();
    const db = getDb();
    try {
      const giorni = Math.max(1, Math.min(62, parseInt(req.query.giorni as string) || 14));
      const c = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pronostico_top3_storico'").get();
      if (!c) return res.json({ corse: [], sintesi: null });
      const righe = db.prepare(`
        SELECT s.pista, s.race_date, s.corsa, s.horse_name, s.prob, s.affidabile, s.tipo,
               r.placement AS arrivo,
               COALESCE(r.placement_raw, ${vpTableExists(db, "partenti_ritirati") ? "(SELECT 'n.p.' FROM partenti_ritirati p WHERE p.horse_name = s.horse_name AND p.race_date = s.race_date LIMIT 1)" : "NULL"}) AS arrivo_testo,
               r.race_code AS codice, r.race_number AS numero_corsa, h.birth_year
          FROM pronostico_top3_storico s
          LEFT JOIN races r ON r.horse_name = s.horse_name AND r.race_date = s.race_date AND r.track = s.pista
          LEFT JOIN horses h ON h.name = s.horse_name
         WHERE s.race_date < date('now') AND s.race_date >= date('now', ?)
      `).all(`-${giorni} day`) as any[];

      // Quote finali del totalizzatore (se gia' raccolte): per confrontare i
      // nostri tre favoriti con i tre favoriti del pubblico.
      const haQuote = vpTableExists(db, "quote_totalizzatore");
      const leggiQuote = haQuote ? db.prepare(`SELECT horse_name, quota FROM quote_totalizzatore
                                                 WHERE race_date = ? AND pista = ? AND corsa = ?`) : null;
      const mercato = { corse: 0, noi: 0, loro: 0, comuni: 0 };
      let inAttesa = 0;
      // Ricontrolli del giro notturno sulle corse con l'arrivo mancante o a meta'
      // (nightly_update.py, phase_ricontrolla_arrivi): tentativi e motivo.
      const controlli = new Map<string, any>();
      if (vpTableExists(db, "arrivi_ricontrolli")) {
        for (const c of db.prepare(`SELECT race_date, pista, corsa, tentativi, ultimo, esito, dettaglio FROM arrivi_ricontrolli
                                     WHERE race_date >= date('now', ?)`).all(`-${giorni + 1} day`) as any[]) {
          controlli.set(`${c.race_date}|${c.pista}|${c.corsa}`, { tentativi: c.tentativi, ultimo: c.ultimo, esito: c.esito, dettaglio: c.dettaglio });
        }
      }
      const inAttesaElenco: any[] = [];
      const gruppi = new Map<string, any[]>();
      for (const r of righe) {
        const k = `${r.race_date}|${r.pista}|${r.corsa}`;
        if (!gruppi.has(k)) gruppi.set(k, []);
        gruppi.get(k)!.push(r);
      }
      const corse: any[] = [];
      const tot: Record<string, any> = {};
      const perPista: Record<string, { corse: number; fav_noti: number; segno: number }> = {};
      const perGiorno: Record<string, { corse: number; fav_noti: number; segno: number; tutti_noti: number; tutti_segno: number }> = {};
      for (const [, g] of Array.from(gruppi.entries())) {
        g.sort((a, b) => b.prob - a.prob);
        const tipo = g[0].tipo;
        const noti = g.filter(e => e.arrivo != null || e.arrivo_testo != null);
        if (!noti.length) continue; // risultati non ancora arrivati
        // Con tre cavalli stimati o meno "i tre favoriti" sono tutti: non e' una prova.
        if (g.length < 4) continue;
        // Arrivo ancora a meta': l'archivio ha solo i cavalli presi dalle loro
        // schede (succede quando la fonte pubblica i risultati in ritardo).
        // Non si mostra e non conta finche' l'arrivo non e' completo.
        if (noti.length < Math.max(3, 0.7 * g.length)) {
          inAttesa++;
          inAttesaElenco.push({ race_date: g[0].race_date, pista: g[0].pista, corsa: g[0].corsa, cavalli_con_arrivo: noti.length, partenti: g.length,
                                controllo: controlli.get(`${g[0].race_date}|${g[0].pista}|${g[0].corsa}`) ?? null });
          continue;
        }
        // Le stime ricostruite valgono solo se l'archivio conosce abbastanza
        // partenti: con tre o quattro cavalli "i tre favoriti" sono quasi tutti.
        if (tipo === "ricostruito" && g.length < 6) continue;
        // Non partito: non ha corso, quindi non conta. I favoriti sono i
        // primi tre fra chi e' partito davvero (come per le scommesse).
        const nonPartito = (e: any) => /^n\.?\s?p\.?$/i.test(String(e.arrivo_testo ?? "").trim());
        let posFav = 0;
        const voci = g.map((e) => {
          const noto = e.arrivo != null || e.arrivo_testo != null;
          const np = nonPartito(e);
          const favorito = !np && posFav++ < 3;
          return {
            horse_name: e.horse_name, birth_year: e.birth_year, prob: Math.round(e.prob * 1000) / 10,
            favorito, affidabile: !!e.affidabile,
            arrivo: e.arrivo ?? null,
            arrivo_testo: noto ? (e.arrivo != null ? `${e.arrivo}°` : esitoInParole(e.arrivo_testo)) : null,
            top3: noto && !np ? (e.arrivo != null && e.arrivo >= 1 && e.arrivo <= 3) : null,
          };
        });
        // Partenti dell'arrivo che il pronostico non aveva: fino all'11/10 i
        // cavalli accoppiati (stessa scuderia) non venivano letti dal
        // calendario, e una corsa poteva essere vinta da un cavallo mai
        // stimato. Si mostrano e la corsa non entra nella media.
        // Il numero della corsa: dal codice ("..._R4", "..._4") o, per le gare
        // fino a giugno 2026 (codice = sigla della pista), da race_number.
        // Cercare per il solo codice "RO" prendeva tutte le corse di Roma (23/11/2026).
        const numeri = g.map(e => { const m = String(e.codice ?? "").match(/_R?(\d+)$/); return m ? Number(m[1]) : (e.numero_corsa ?? null); })
          .filter((x: any) => x != null) as number[];
        const nCorsaNum = numeri.sort((a, b) => numeri.filter(x => x === b).length - numeri.filter(x => x === a).length)[0] ?? null;
        const codice = nCorsaNum != null ? `${g[0].race_date}|${g[0].pista}|${nCorsaNum}` : null;
        const stimati = new Set(g.map(e => e.horse_name));
        const mancanti = nCorsaNum != null ? (db.prepare(`
            SELECT r.horse_name, r.placement AS arrivo, r.placement_raw AS arrivo_testo, h.birth_year
              FROM races r LEFT JOIN horses h ON h.name = r.horse_name
             WHERE r.race_date = ? AND r.track = ?
               AND (r.race_number = ? OR r.race_code GLOB ('*_' || ?) OR r.race_code GLOB ('*_R' || ?))
             ORDER BY COALESCE(r.placement, 99)`).all(g[0].race_date, g[0].pista, nCorsaNum, String(nCorsaNum), String(nCorsaNum)) as any[])
            .filter(r => !stimati.has(r.horse_name) && !nonPartito(r))
            .map(r => ({ horse_name: r.horse_name, birth_year: r.birth_year,
                         arrivo_testo: r.arrivo != null ? `${r.arrivo}°` : esitoInParole(r.arrivo_testo),
                         top3: r.arrivo != null && r.arrivo >= 1 && r.arrivo <= 3 }))
          : [];
        const fav = voci.filter(v => v.favorito);
        const favNoti = fav.filter(v => v.top3 != null);
        const segno = favNoti.filter(v => v.top3).length;
        const m = String(g[0].corsa).match(/R?(\d+)$/);
        // I tre favoriti del pubblico: le tre quote piu' basse fra chi e' partito.
        let favMercato: string[] | null = null;
        let segnoMercato: number | null = null;
        const nCorsa = nCorsaNum != null ? [String(nCorsaNum), String(nCorsaNum)] : null;
        // Quote finali del totalizzatore per nome; Hippoweb scrive "-S-" dove
        // l'archivio scrive "(S)": si confrontano i nomi senza segni.
        const qq = new Map<string, number>();
        if (leggiQuote && nCorsa) {
          for (const x of leggiQuote.all(g[0].race_date, g[0].pista, Number(nCorsa[1])) as any[])
            if (x.quota != null) qq.set(nomeQuota(x.horse_name), x.quota);
        }
        for (const v of voci as any[]) v.quota = qq.get(nomeQuota(v.horse_name)) ?? null;
        for (const m of mancanti as any[]) m.quota = qq.get(nomeQuota(m.horse_name)) ?? null;
        if (leggiQuote && nCorsa && mancanti.length === 0) {
          const partitiQ = voci.filter(v => v.top3 != null);
          if (partitiQ.length >= 4 && partitiQ.every(v => qq.has(nomeQuota(v.horse_name)))) {
            const ord = [...partitiQ].sort((a, b) => qq.get(nomeQuota(a.horse_name))! - qq.get(nomeQuota(b.horse_name))!).slice(0, 3);
            favMercato = ord.map(v => v.horse_name);
            segnoMercato = ord.filter(v => v.top3).length;
            if (tipo === "del_giorno" && favNoti.length === 3) {
              mercato.corse++; mercato.noi += segno; mercato.loro += segnoMercato;
              mercato.comuni += favNoti.filter(v => favMercato!.includes(v.horse_name)).length;
            }
          }
        }
        // Chi ha vinto, e a che posto lo metteva il pronostico (fra chi è partito).
        const partiti = voci.filter(v => !/^non partito$/.test(String(v.arrivo_testo ?? "")));
        const iv = partiti.findIndex(v => v.arrivo === 1);
        const vMancante = mancanti.find((x: any) => x.arrivo_testo === "1°");
        const vincitore = iv >= 0
          ? { nome: partiti[iv].horse_name, prob: partiti[iv].prob, posto: iv + 1, su: partiti.length }
          : vMancante ? { nome: vMancante.horse_name, prob: null, posto: null, su: partiti.length } : null;
        const primo = partiti[0];
        const attesi = Math.round(favNoti.reduce((a, v) => a + v.prob / 100, 0) * 10) / 10;
        // Sorprese: nei primi tre con meno del 20%.
        const sorprese = voci.filter(v => v.top3 && v.prob < 20).map(v => ({ nome: v.horse_name, prob: v.prob, arrivo: v.arrivo_testo }));
        corse.push({
          race_date: g[0].race_date, pista: g[0].pista, tipo, codice: codice ?? null,
          corsa: /^\d{1,2}:\d{2}/.test(g[0].corsa) ? g[0].corsa.slice(0, 5) : null,
          numero: m && !/^\d{1,2}:\d{2}/.test(g[0].corsa) ? Number(m[1]) : null,
          partenti: g.length, favoriti_noti: favNoti.length, favoriti_a_segno: segno, voci,
          mancanti, incompleto: mancanti.length > 0,
          vincitore, attesi, sorprese,
          mercato: favMercato ? { favoriti: favMercato, a_segno: segnoMercato } : null,
          controllo: controlli.get(`${g[0].race_date}|${g[0].pista}|${g[0].corsa}`) ?? null,
          primo_favorito: primo ? { nome: primo.horse_name, prob: primo.prob, arrivo: primo.arrivo_testo, top3: primo.top3 } : null,
        });
        if (mancanti.length > 0) continue; // pronostico fatto senza tutti i partenti: fuori dalla media
        const nuovo = () => ({ corse: 0, fav: 0, fav_noti: 0, segno: 0, tutti_noti: 0, tutti_segno: 0, attesi: 0,
                               corse3: 0, attesi3: 0, segno3: 0, primo_noti: 0, primo_top3: 0, primo_vince: 0, vinc_noti: 0, vinc_tra_fav: 0,
                               distribuzione: [0, 0, 0, 0], fasce: new Map<number, { n: number; stimato: number; reale: number }>(),
                               a_caso: 0 });
        for (const chiave of [tipo, "tutte"]) {
          const t = (tot[chiave] ??= nuovo() as any) as any;
          t.corse++; t.fav += fav.length; t.fav_noti += favNoti.length; t.segno += segno; t.attesi += attesi;
          const tn = voci.filter(v => v.top3 != null);
          t.tutti_noti += tn.length; t.tutti_segno += tn.filter(v => v.top3).length;
          if (favNoti.length === 3) { t.distribuzione[segno]++; t.corse3++; t.attesi3 += attesi; t.segno3 += segno; }
          if (primo && primo.top3 != null) { t.primo_noti++; if (primo.top3) t.primo_top3++; if (primo.arrivo === 1) t.primo_vince++; }
          if (vincitore) { t.vinc_noti++; if (vincitore.posto != null && vincitore.posto <= 3) t.vinc_tra_fav++; }
          for (const v of tn) {
            const b = v.prob < 10 ? 0 : v.prob < 20 ? 10 : v.prob < 30 ? 20 : v.prob < 40 ? 30 : v.prob < 50 ? 40 : v.prob < 60 ? 50 : 60;
            const f = t.fasce.get(b) ?? { n: 0, stimato: 0, reale: 0 };
            f.n++; f.stimato += v.prob; f.reale += v.top3 ? 100 : 0; t.fasce.set(b, f);
          }
        }
        // Per pista e per giorno: solo le stime del giorno, quelle mostrate davvero.
        if (tipo === "del_giorno" && favNoti.length > 0) {
          const kp = String(g[0].pista);
          const pp = (perPista[kp] ??= { corse: 0, fav_noti: 0, segno: 0 });
          pp.corse++; pp.fav_noti += favNoti.length; pp.segno += segno;
          const gg = (perGiorno[g[0].race_date] ??= { corse: 0, fav_noti: 0, segno: 0, tutti_noti: 0, tutti_segno: 0 });
          gg.corse++; gg.fav_noti += favNoti.length; gg.segno += segno;
          const tn = voci.filter(v => v.top3 != null);
          gg.tutti_noti += tn.length; gg.tutti_segno += tn.filter(v => v.top3).length;
        }
      }
      corse.sort((a, b) => (b.race_date.localeCompare(a.race_date)) || String(a.pista).localeCompare(String(b.pista)) || ((a.numero ?? 0) - (b.numero ?? 0)) || String(a.corsa ?? "").localeCompare(String(b.corsa ?? "")));
      const q = (a: number, b: number) => b ? Math.round((a / b) * 1000) / 10 : null;
      const sintesi = Object.fromEntries(Object.entries(tot).map(([k, t]: [string, any]) => [k, {
        corse: t.corse,
        favoriti_controllati: t.fav_noti,
        quota_favoriti: q(t.segno, t.fav_noti),
        quota_tutti: q(t.tutti_segno, t.tutti_noti),
        // Quanti dei tre favoriti il pronostico si aspettava nei primi tre, per corsa, e quanti ne sono arrivati.
        attesi_per_corsa: t.corse3 ? Math.round((t.attesi3 / t.corse3) * 100) / 100 : null,
        arrivati_per_corsa: t.corse3 ? Math.round((t.segno3 / t.corse3) * 100) / 100 : null,
        primo_favorito_top3: q(t.primo_top3, t.primo_noti),
        primo_favorito_vince: q(t.primo_vince, t.primo_noti),
        vincitore_tra_favoriti: q(t.vinc_tra_fav, t.vinc_noti),
        distribuzione: t.distribuzione,
        fasce: Array.from(t.fasce.entries() as Iterable<[number, any]>).sort((a, b) => a[0] - b[0]).map(([da, f]) => ({
          da, a: da === 60 ? 100 : da + 10, n: f.n,
          stimato: Math.round(f.stimato / f.n * 10) / 10, reale: Math.round(f.reale / f.n * 10) / 10,
        })),
      }]));
      const piste = Object.entries(perPista).map(([pista, p]) => ({ pista, corse: p.corse, quota_favoriti: q(p.segno, p.fav_noti) }))
        .sort((a, b) => b.corse - a.corse);
      const andamento = Object.entries(perGiorno).map(([data, p]) => ({ data, corse: p.corse,
        quota_favoriti: q(p.segno, p.fav_noti), quota_tutti: q(p.tutti_segno, p.tutti_noti) })).sort((a, b) => a.data.localeCompare(b.data));
      const confronto_mercato = mercato.corse ? {
        corse: mercato.corse,
        noi: q(mercato.noi, mercato.corse * 3),
        mercato: q(mercato.loro, mercato.corse * 3),
        in_comune: q(mercato.comuni, mercato.corse * 3),
      } : null;
      res.json({ giorni, corse, sintesi, piste, andamento, confronto_mercato, in_attesa: inAttesa,
                 in_attesa_elenco: inAttesaElenco.sort((a, b) => b.race_date.localeCompare(a.race_date)), tentativi_max: 8 });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally {
      db.close();
    }
  });

  // Il pronostico confrontato con le quote finali del totalizzatore, sulle
  // corse del periodo di prova (scripts/confronto_quote.py). Analisi, non
  // consiglio di gioco.
  app.get("/api/pronostico/confronto-quote", pronta(10 * 60_000), (_req, res) => {
    const v = leggiJsonModelli("confronto_quote.json");
    if (!v) return res.status(404).json({ message: "confronto non disponibile" });
    res.json(v);
  });

  // Come e' stato provato il pronostico dei primi tre (scritto dall'allenamento).
  app.get("/api/pronostico/verifica", pronta(10 * 60_000), (_req, res) => {
    const v = leggiVerificaTop3();
    if (!v) return res.status(404).json({ message: "verifica non disponibile" });
    res.json(v);
  });

  // Dettaglio del pronostico di una corsa in programma: i dati che il modello
  // ha letto per ogni cavallo, in numeri veri, e dove ciascuno si colloca fra
  // gli avversari della stessa corsa. Il modello non si ricalcola qui: i numeri
  // sono gli stessi da cui parte (forma, premi, tempi, guidatore, pista,
  // numero di partenza), riletti dall'archivio con i soli dati di prima della gara.
  app.get("/api/calendar/dettaglio", pronta(10 * 60_000), (req, res) => {
    assicuraIndici();
    const db = getDb();
    try {
      const track = String(req.query.track ?? ""), data = String(req.query.date ?? ""), ora = String(req.query.time ?? "");
      if (!track || !data || !ora) return res.status(400).json({ message: "servono pista, data e ora" });
      const pista = NOMI_CALENDARIO[track.toUpperCase()] ?? track.toUpperCase();
      const partenti = db.prepare(`SELECT u.horse_name, u.start_pos, NULLIF(u.driver, '') AS driver, u.distance, h.birth_year FROM upcoming_races u
                                    LEFT JOIN horses h ON h.name = u.horse_name
                                    WHERE u.track = ? AND u.race_date = ? AND u.race_time = ? ORDER BY u.start_pos`).all(track, data, ora) as any[];
      if (!partenti.length) return res.status(404).json({ message: "corsa non trovata" });
      const haP = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pronostico_top3'").get();
      const stime = new Map<string, any>(haP ? (db.prepare(`SELECT horse_name, prob, prob_grezza, n_corse FROM pronostico_top3
                                    WHERE track = ? AND race_date = ? AND race_time = ?`).all(track, data, ora) as any[]).map(r => [r.horse_name, r]) : []);
      const haG = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rischio_galoppo'").get();
      const galoppi = new Map<string, any>(haG ? (db.prepare(`SELECT horse_name, prob, fascia FROM rischio_galoppo
                                    WHERE track = ? AND race_date = ? AND race_time = ?`).all(track, data, ora) as any[]).map(r => [r.horse_name, r]) : []);
      const np = "COALESCE(LOWER(placement_raw), '') NOT IN ('nr', 'n.p.', 'np')";
      const qStoria = db.prepare(`SELECT race_date, track, placement, placement_raw, time_km, prize_net, driver, total_starters, distance
                                    FROM races WHERE horse_name = ? AND race_date < ? AND ${np}
                                   ORDER BY race_date DESC`);
      const qGuid = db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN placement BETWEEN 1 AND 3 THEN 1 ELSE 0 END) AS t
                                  FROM races WHERE driver = ? AND race_date < ? AND ${np}`);
      const unAnnoPrima = new Date(new Date(data + "T12:00:00").getTime() - 365 * 864e5).toISOString().slice(0, 10);
      const giorniFra = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 864e5);
      // Distanza: chi parte dietro (handicap) ha piu' metri da fare; la fascia
      // e' quella usata dal modello (miglio fino a 1.799 m, media, lunga da 2.200 m).
      const distMin = Math.min(...partenti.map(p => p.distance).filter((x: any) => x >= 1000 && x <= 3700));
      const fascia = (m: number | null) => m == null || m < 1000 ? null : m < 1800 ? 0 : m < 2200 ? 1 : 2;
      const cavalli = partenti.map(p => {
        const st = qStoria.all(p.horse_name, data) as any[];
        const top3 = (r: any) => r.placement != null && r.placement >= 1 && r.placement <= 3;
        const ult5 = st.slice(0, 5);
        const tempi = st.map(r => r.time_km).filter((t: any) => t != null && t >= 9 && t <= 40);
        const sullaPista = st.filter(r => r.track === pista);
        // Il guidatore dichiarato per QUESTA corsa; se la fonte non lo dice
        // ancora resta vuoto (non si usa quello dell'ultima corsa).
        const guidatore = p.driver ?? null;
        const g = guidatore ? (qGuid.get(guidatore, data) as any) : null;
        const s = stime.get(p.horse_name);
        const gr = galoppi.get(p.horse_name);
        const rotte = st.filter(r => ["r.p.", "r.a."].includes(String(r.placement_raw || "").toLowerCase()));
        return {
          nome: p.horse_name, anno: p.birth_year ?? null, partenza: p.start_pos,
          galoppo: gr ? { prob: Math.round(gr.prob * 1000) / 10, fascia: gr.fascia } : null,
          rotture: rotte.length, rotture_ult5: ult5.filter(r => ["r.p.", "r.a."].includes(String(r.placement_raw || "").toLowerCase())).length,
          prob: s ? Math.round(s.prob * 1000) / 10 : null,
          prob_grezza: s?.prob_grezza != null ? Math.round(s.prob_grezza * 1000) / 10 : null,
          corse: st.length,
          ultime: ult5.map(r => ({ data: r.race_date, pista: r.track,
            arrivo: r.placement != null ? `${r.placement}°` : (esitoInParole(r.placement_raw) ?? "—"), top3: top3(r) })),
          forma: ult5.length ? ult5.filter(top3).length : null,
          forma_su: ult5.length,
          ultima_top3: st.length ? top3(st[0]) : null,
          giorni: st.length ? giorniFra(st[0].race_date, data) : null,
          premi_anno: st.length ? Math.round(st.filter(r => r.race_date >= unAnnoPrima).reduce((a, r) => a + (r.prize_net || 0), 0)) : null,
          record: tempi.length ? Math.min(...tempi) : null,
          carriera_top3: st.length ? Math.round(st.filter(top3).length / st.length * 1000) / 10 : null,
          pista_corse: sullaPista.length, pista_top3: sullaPista.filter(top3).length,
          guidatore, guidatore_corse: g?.n ?? null,
          guidatore_top3: g && g.n ? Math.round((g.t || 0) / g.n * 1000) / 10 : null,
          distanza: p.distance ?? null,
          metri_in_piu: p.distance != null && Number.isFinite(distMin) ? p.distance - distMin : null,
          ...(() => {
            const f = fascia(p.distance ?? null);
            const stessa = f == null ? [] : st.filter(r => fascia(r.distance) === f);
            return { distanza_corse: f == null ? null : stessa.length, distanza_top3: stessa.filter(top3).length };
          })(),
        };
      });
      // Posto nella corsa per ogni voce: 1 = il migliore. Chi non ha il dato non entra.
      const posto = (chiave: string, alto: boolean) => {
        const v = cavalli.filter((c: any) => c[chiave] != null && (chiave !== "forma" || c.forma_su >= 3));
        v.sort((a: any, b: any) => alto ? b[chiave] - a[chiave] : a[chiave] - b[chiave]);
        v.forEach((c: any) => { (c.posti ??= {})[chiave] = { posto: 1 + v.filter((x: any) => alto ? x[chiave] > c[chiave] : x[chiave] < c[chiave]).length, su: v.length }; });
      };
      posto("forma", true); posto("premi_anno", true); posto("record", false); posto("carriera_top3", true); posto("guidatore_top3", true);
      cavalli.sort((a: any, b: any) => (b.prob ?? -1) - (a.prob ?? -1));
      const sommaGrezza = cavalli.reduce((a: number, c: any) => a + (c.prob_grezza ?? 0), 0);
      res.json({ pista, data, ora, partenti: cavalli.length, galoppo_verifica: haG ? leggiVerificaGaloppo() : null, a_caso: Math.round(Math.min(3, cavalli.length) / cavalli.length * 1000) / 10,
                 somma_grezza: Math.round(sommaGrezza) , cavalli });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/calendar — upcoming races with ratings and win estimates
  // ──────────────────────────────────────────────
  app.get("/api/calendar", (req, res) => {
    const db = getDb();
    try {
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);

      // Check if upcoming_races table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='upcoming_races'").get();
      if (!tableExists) {
        return res.json({ races: [], note: "Nessuna gara in calendario. Lo script di aggiornamento non ha ancora girato." });
      }

      const haPronostico = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pronostico_top3'").get();
      const haGaloppo = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rischio_galoppo'").get();
      const verifica = leggiVerificaTop3();

      // Fetch upcoming race events (grouped by track + date)
      const events = db.prepare(`
        SELECT DISTINCT track, race_date, race_time
        FROM upcoming_races
        WHERE race_date >= date('now', '-1 day')
        ORDER BY race_date ASC, race_time ASC
        LIMIT ?
      `).all(limit) as any[];

      // For each event, fetch the horses with their ratings and win estimate
      const result = events.map(ev => {
        const entries = db.prepare(`
          SELECT ur.horse_name, ur.driver, ur.start_pos, ur.distance,
                 hr.grade, hr.score, hr.career_earnings, hr.win_rate, hr.career_races, hr.career_wins,
                 h.country, h.birth_year, h.sire, h.dam
          FROM upcoming_races ur
          LEFT JOIN horse_ratings hr ON hr.name = ur.horse_name AND hr.rating_mode = 'performance'
          LEFT JOIN horses h ON h.name = ur.horse_name
          WHERE ur.track = ? AND ur.race_date = ? AND ur.race_time = ?
          ORDER BY ur.start_pos ASC
        `).all(ev.track, ev.race_date, ev.race_time) as any[];

        // Simple win probability estimate based on score (softmax-like)
        const scored = entries.filter(e => e.score != null);
        const totalScore = scored.reduce((s, e) => s + Math.exp(e.score / 20), 0);
        scored.forEach(e => {
          e.win_estimate = totalScore > 0 ? Math.round((Math.exp(e.score / 20) / totalScore) * 1000) / 10 : 0;
        });
        // Horses without score get 0 estimate
        entries.forEach(e => {
          if (e.score == null) e.win_estimate = 0;
        });

        // Probabilita' dei primi tre (modello XGBoost, calcolata ogni notte
        // dalla fase 3g). Se la tabella non c'e' ancora resta la stima vecchia.
        // Con tre partenti o meno arrivano tutti nei primi tre: niente stima.
        if (haPronostico && entries.length > 3) {
          const righe = db.prepare(`SELECT horse_name, prob, affidabile, n_corse, motivi
                                      FROM pronostico_top3 WHERE track = ? AND race_date = ? AND race_time = ?`)
            .all(ev.track, ev.race_date, ev.race_time) as any[];
          const perNome = new Map(righe.map(r => [r.horse_name, r]));
          entries.forEach(e => {
            const r = perNome.get(e.horse_name);
            if (!r) return;
            let motivi: any[] = [];
            try { motivi = JSON.parse(r.motivi || "[]"); } catch { motivi = []; }
            e.top3 = { prob: Math.round(r.prob * 1000) / 10, affidabile: !!r.affidabile, n_corse: r.n_corse, motivi };
          });
        }

        // Rischio di squalifica per galoppo (rischio_galoppo.py, ogni notte):
        // c'e' solo se il modello ha superato la prova.
        if (haGaloppo) {
          const rg = db.prepare(`SELECT horse_name, prob, fascia, n_corse, rotture FROM rischio_galoppo
                                  WHERE track = ? AND race_date = ? AND race_time = ?`).all(ev.track, ev.race_date, ev.race_time) as any[];
          const perNomeG = new Map(rg.map(r => [r.horse_name, r]));
          entries.forEach(e => {
            const r = perNomeG.get(e.horse_name);
            if (r) e.galoppo = { prob: Math.round(r.prob * 1000) / 10, fascia: r.fascia, n_corse: r.n_corse, rotture: r.rotture };
          });
        }

        // In cima chi ha piu' probabilita' di arrivare nei primi tre; senza
        // pronostico, l'ordine della stima vecchia.
        entries.sort((a, b) => (b.top3?.prob ?? -1) - (a.top3?.prob ?? -1) || (b.win_estimate || 0) - (a.win_estimate || 0));

        return {
          track: ev.track,
          race_date: ev.race_date,
          race_time: ev.race_time,
          n_runners: entries.length,
          entries,
        };
      }).filter(ev => ev.n_runners > 0);

      res.json({
        races: result, total: result.length,
        pronostico: haPronostico && verifica ? {
          verificato: !!verifica.supera_i_metodi_semplici,
          nome: verifica.nome,
        } : null,
        galoppo: haGaloppo ? leggiVerificaGaloppo() : null,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // SECONDA FONTE — VendoPuledri
  // Qualifiche dei giovani, consanguineita' e allevatori. Le tabelle vp_*
  // sono popolate dalle fasi 2f/2g della pipeline notturna; se la pipeline
  // non e' ancora girata le rotte rispondono vuote invece di rompersi.
  // ──────────────────────────────────────────────

  function vpTableExists(db: any, name: string): boolean {
    return !!db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
    ).get(name);
  }

  /**
   * Genealogia estesa di un cavallo secondo la seconda fonte (VendoPuledri):
   * restituisce una mappa percorso -> nome dell'antenato.
   *
   * ATTENZIONE al verso del percorso: si legge da destra a sinistra, cioe'
   * l'ultima lettera e' il primo passo a partire dal cavallo. Quindi "pm" e'
   * il padre della madre (nonno materno) e "mp" e' la madre del padre
   * (nonna paterna). Verificato sui dati: per AKELA PAL FERM "pm" da'
   * S J'S PHOTO, che la fonte indica come nonno materno.
   *
   * Serve a completare l'albero dove l'archivio corse si ferma: quello copre
   * solo i cavalli che hanno corso in Italia in anni recenti, quindi i nonni
   * materni e gli antenati esteri mancano quasi sempre.
   */
  // "TRIXTON -USA-": qualche antenato nella fonte ha la sigla del paese e
  // diventava un cavallo a parte, senza carriera (23/11/2026).
  const senzaSigla = (n: string) => String(n).replace(/\s*-\s*[A-Z]{1,3}\s*-\s*$/, "").trim() || String(n);
  function vpAncestorMap(db: any, horseName: string): Map<string, string> {
    const out = new Map<string, string>();
    if (!vpTableExists(db, "vp_pedigree")) return out;
    const rows = db.prepare(`
      SELECT p.path AS path, n.name AS name
      FROM vp_names hn
      JOIN vp_pedigree p ON p.horse_id = hn.id
      JOIN vp_names n ON n.id = p.ancestor_id
      WHERE hn.name = ?
    `).all(horseName.trim().toUpperCase()) as any[];
    for (const r of rows) {
      const path = String(r.path || "").trim().toLowerCase();
      if (path && r.name) out.set(path, senzaSigla(r.name));
    }
    if (out.size === 0) return alberoDaDiscendente(db, horseName) ?? alberoDaStallionPedigree(db, horseName) ?? out;
    return out;
  }

  /**
   * GENEALOGIA DEGLI STALLONI ESTERI (23/11/2026). La seconda fonte ha
   * l'albero solo dei cavalli nati in Italia: di GIMPANZEE, SOUTHWIND FRANK,
   * TRIXTON, PINE CHIP, MAHARAJAH... non c'era nulla, e la pagina pedigree
   * restava vuota. Ma ognuno di loro compare come padre nell'albero di un suo
   * figlio italiano, che arriva a cinque generazioni: da li' si leggono quattro
   * generazioni dello stallone. Per ogni antenato si prende la comparsa piu'
   * vicina al cavallo della fonte (il percorso piu' corto), cosi' le
   * generazioni sono il piu' possibile. Il percorso si legge da destra a
   * sinistra: gli antenati dell'antenato che sta in P sono quelli il cui
   * percorso finisce con P, e quel che resta davanti e' il percorso da lui.
   */
  // Memoria fra una richiesta e l'altra, finche' l'archivio e' lo stesso.
  let DERIVATI: { versione: number; m: Map<string, Map<string, string> | null> } = { versione: -1, m: new Map() };
  function alberoDaDiscendente(db: any, horseName: string): Map<string, string> | null {
    if (!vpTableExists(db, "vp_names")) return null;
    const nome = horseName.trim().toUpperCase();
    const v = mtimeDb();
    if (DERIVATI.versione !== v || DERIVATI.m.size > 20000) DERIVATI = { versione: v, m: new Map() };
    if (DERIVATI.m.has(nome)) return DERIVATI.m.get(nome)!;
    // Le comparse piu' vicine al cavallo della fonte (al massimo 12): alcune
    // fonti hanno solo il lato materno, quindi si mettono insieme, e a parita'
    // di casella vince la comparsa piu' vicina.
    const occ = db.prepare(`SELECT p.horse_id AS h, p.path AS path FROM vp_names n JOIN vp_pedigree p ON p.ancestor_id = n.id
                             WHERE n.name = ? AND length(p.path) < 5 ORDER BY length(p.path) LIMIT 12`).all(nome) as any[];
    const sotto = db.prepare(`SELECT p.path AS path, n.name AS name FROM vp_pedigree p JOIN vp_names n ON n.id = p.ancestor_id
                               WHERE p.horse_id = ? AND length(p.path) > ? AND substr(p.path, -?) = ?`);
    let out = new Map<string, string>();
    for (const o of occ) {
      const P = String(o.path).toLowerCase();
      const qui = new Map<string, string>();
      for (const r of sotto.all(o.h, P.length, P.length, o.path) as any[]) {
        const rel = String(r.path).toLowerCase().slice(0, -P.length);
        if (rel && r.name) qui.set(rel, senzaSigla(r.name));
      }
      // Un omonimo con un altro padre non si mescola.
      if (out.get("p") && qui.get("p") && out.get("p") !== qui.get("p")) continue;
      qui.forEach((v, k) => { if (!out.has(k)) out.set(k, v); });
    }
    const fine = controllaDerivato(db, nome, out);
    DERIVATI.m.set(nome, fine);
    return fine;
  }
  function controllaDerivato(db: any, horseName: string, out: Map<string, string>): Map<string, string> | null {
    if (!out.size) return null;
    // Contro gli omonimi: se l'archivio ha un cavallo con questo nome, lo si
    // completa cosi' solo se e' genitore di qualcuno e se il padre combacia
    // (un puledro di oggi che si chiama come un antenato non e' lui).
    const righe = db.prepare(`SELECT sire, dam FROM horses WHERE name = ?`).all(horseName.trim().toUpperCase()) as any[];
    if (righe.length) {
      if (!db.prepare(`SELECT 1 FROM horses WHERE sire = ? OR dam = ? LIMIT 1`).get(horseName.trim().toUpperCase(), horseName.trim().toUpperCase())) return null;
      const conPadre = righe.filter(r => r.sire);
      if (conPadre.length && out.get("p") && !conPadre.some(r => String(r.sire).toUpperCase() === out.get("p"))) return null;
    }
    return out;
  }
  /** Ultima risorsa: padre, madre e nonni dalla tabella degli stalloni. */
  function alberoDaStallionPedigree(db: any, horseName: string): Map<string, string> | null {
    if (!vpTableExists(db, "stallion_pedigree")) return null;
    const r = db.prepare(`SELECT * FROM stallion_pedigree WHERE name = ?`).get(horseName.trim().toUpperCase()) as any;
    if (!r) return null;
    const out = new Map<string, string>();
    const metti = (k: string, v: any) => { if (v && String(v).trim()) out.set(k, String(v).trim().toUpperCase()); };
    metti("p", r.sire); metti("m", r.dam); metti("pp", r.sire_sire); metti("mp", r.sire_dam); metti("pm", r.dam_sire); metti("mm", r.dam_dam);
    const h = db.prepare(`SELECT sire FROM horses WHERE name = ? AND sire IS NOT NULL AND sire <> '' LIMIT 1`).get(horseName.trim().toUpperCase()) as any;
    if (h && out.get("p") && String(h.sire).toUpperCase() !== out.get("p")) return null;
    return out.size ? out : null;
  }

  /** Percorso della fonte per una catena di passi a partire dal cavallo. */
  function vpPath(chain: string): string {
    return chain.split("").reverse().join("");
  }

  // QUALIFICHE: UNA SOLA PER CAVALLO (novembre 2026).
  // Per i cavalli piu' vecchi la fonte elenca piu' righe sotto "qualifiche":
  //  - i tempi fatti all'estero (pista "ES"): spesso sono corse vere, per
  //    esempio NAPOLEON BAR 1.10.1 in Svezia a cinque anni, e non si possono
  //    confrontare con una qualifica italiana;
  //  - le riqualifiche: chi resta fermo a lungo deve rifare la prova, anche
  //    anni dopo il debutto (NAPOLEON BAR a Roma nel 2017, a dieci anni);
  //  - a volte due prove a poche settimane di distanza prima del debutto.
  // La qualifica del cavallo e' la PRIMA FATTA IN ITALIA; se ce ne sono solo
  // all'estero, la prima all'estero, segnata come tale e tenuta fuori dalle
  // classifiche dei tempi. Le altre righe non spariscono: la scheda le mostra
  // come "altre prove", ciascuna con il motivo.
  function qualHaAnnata(db: any): boolean {
    return (db.prepare("PRAGMA table_info(vp_qualifiche)").all() as any[]).some(c => c.name === "annata");
  }
  // Tempi di qualifica di un'annata (una prova per cavallo, solo italiane e
  // non tardive), in ordine: la posizione nella scheda si conta qui invece di
  // rifare la classifica di tutte le 20.000 prove a ogni scheda (21/11/2026).
  // Si rifanno quando arriva l'archivio nuovo.
  let tempiQualifica: { mtime: number; perAnno: Map<number, number[]> } | null = null;
  function tempiQualificaAnnata(db: any, anno: number): number[] {
    const mt = mtimeDb();
    if (!tempiQualifica || tempiQualifica.mtime !== mt) tempiQualifica = { mtime: mt, perAnno: new Map() };
    let v = tempiQualifica.perAnno.get(anno);
    if (!v) {
      v = (db.prepare(`WITH ${cteQualifiche(db)}
        SELECT time_km t FROM qu WHERE annata = ? AND rn = 1 AND fuori = 0 AND time_km IS NOT NULL ORDER BY time_km`)
        .all(anno) as any[]).map(r => r.t);
      tempiQualifica.perAnno.set(anno, v);
    }
    return v;
  }
  function cteQualifiche(db: any): string {
    const haAnnata = qualHaAnnata(db);
    const gruppo = haAnnata ? "q.horse_name, COALESCE(q.annata, -1)" : "q.horse_name";
    // "tardiva": prova fatta a cinque anni o piu'. Da giovani ci si qualifica
    // a 2-3 anni (qualche volta a 4); dopo e' una riqualifica, e i tempi
    // sono quelli di un cavallo adulto (NESTA EFFE 1.11.9 a otto anni).
    const tardiva = haAnnata
      ? "CASE WHEN q.annata IS NOT NULL AND CAST(substr(q.qual_date,1,4) AS INTEGER) - q.annata >= 5 THEN 1 ELSE 0 END"
      : "0";
    return `qu0 AS (
      SELECT q.*, CASE WHEN q.track = 'ES' THEN 1 ELSE 0 END AS estero, ${tardiva} AS tardiva
      FROM vp_qualifiche q),
    qu AS (
      SELECT q.*,
             ROW_NUMBER() OVER (PARTITION BY ${gruppo} ORDER BY q.estero, q.tardiva, q.qual_date) AS rn,
             COUNT(*) OVER (PARTITION BY ${gruppo}) AS n_prove,
             CASE WHEN q.estero = 1 OR q.tardiva = 1 THEN 1 ELSE 0 END AS fuori
      FROM qu0 q)`;
  }
  /** Le altre prove di un cavallo, oltre a quella principale, con il motivo. */
  function altreProve(db: any, nome: string, annata: number | null, principale: { qual_date: string }): any[] {
    const haAnnata = qualHaAnnata(db);
    const righe = db.prepare(`
      SELECT qual_date, track, time_raw, time_km FROM vp_qualifiche
      WHERE horse_name = ? ${haAnnata && annata != null ? "AND annata = ?" : ""}
      ORDER BY qual_date`).all(...(haAnnata && annata != null ? [nome, annata] : [nome])) as any[];
    let debutto: string | null = null;
    try {
      debutto = (db.prepare("SELECT MIN(race_date) AS d FROM races WHERE horse_name = ? AND track != 'ESTERO'").get(nome) as any)?.d ?? null;
    } catch { /* archivio corse non pronto */ }
    const t0 = Date.parse(principale.qual_date);
    return righe
      .filter(r => !(r.qual_date === principale.qual_date))
      .map(r => {
        let motivo: string;
        if (r.track === "ES") motivo = "estero";
        else if (annata != null && Number(String(r.qual_date).slice(0, 4)) - annata >= 5) motivo = "adulto";
        else if (debutto && r.qual_date > debutto) motivo = "dopo_debutto";
        else if (Date.parse(r.qual_date) - t0 > 365 * 86400000) motivo = "riqualifica";
        else if (r.qual_date < principale.qual_date) motivo = "prima";
        else motivo = "ripetuta";
        return { ...r, motivo };
      });
  }

  // GET /api/qualifiche — prove di qualifica, il primo tempo ufficiale di un
  // cavallo giovane, prima ancora che debutti in corsa. Una riga per cavallo.
  app.get("/api/qualifiche", (req, res) => {
    const db = getDb();
    try {
      if (!vpTableExists(db, "vp_qualifiche")) {
        return res.json({ rows: [], total: 0, years: [], tracks: [] });
      }
      const q = ((req.query.q as string) || "").trim().toUpperCase();
      const year = ((req.query.year as string) || "").trim();
      const track = ((req.query.track as string) || "").trim().toUpperCase();
      const sire = ((req.query.sire as string) || "").trim().toUpperCase();
      const onlyNew = req.query.only_new === "1";
      const sort = (req.query.sort as string) === "date" ? "date" : "time";
      const limit = Math.min(500, parseInt(req.query.limit as string) || 100);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const haAnnata = qualHaAnnata(db);

      const where: string[] = ["q.rn = 1"];
      const params: any[] = [];
      if (q) { where.push("q.horse_name LIKE ?"); params.push(`%${q}%`); }
      if (year) { where.push("substr(q.qual_date,1,4) = ?"); params.push(year); }
      if (track) { where.push("q.track = ?"); params.push(track); }
      if (sire) { where.push("q.sire = ?"); params.push(sire); }
      // "solo nuovi" = cavalli che nel nostro archivio corse non esistono
      if (onlyNew) where.push("h.name IS NULL");

      const cte = `WITH ${cteQualifiche(db)}`;
      const base = `
        FROM qu q
        LEFT JOIN horses h ON h.name = q.horse_name
        LEFT JOIN horse_ratings hr ON hr.name = q.horse_name
                                   AND hr.rating_mode = 'performance'
        WHERE ${where.join(" AND ")}
      `;
      const total = (db.prepare(`${cte} SELECT COUNT(*) AS n ${base}`).get(...params) as any).n;

      // I tempi fatti all'estero non entrano nella classifica dei tempi:
      // finiscono in fondo, dopo tutte le qualifiche italiane.
      const order = sort === "date"
        ? "q.qual_date DESC, q.time_km ASC"
        : "(q.fuori = 1 OR q.time_km IS NULL), q.time_km ASC, q.qual_date DESC";

      const rows = db.prepare(`
        ${cte}
        SELECT q.horse_name, q.qual_date, q.track, q.time_raw, q.time_km,
               q.sire, q.dam, q.maternal_gsire, q.trainer, q.owner, q.breeder,
               ${haAnnata ? "q.annata" : "NULL AS annata"}, q.n_prove, q.estero, q.tardiva,
               h.name AS known_name, h.birth_year,
               hr.score, hr.grade
        ${base}
        ORDER BY ${order}
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as any[];

      const years = db.prepare(
        `${cte} SELECT DISTINCT substr(qual_date,1,4) AS y FROM qu WHERE rn = 1 ORDER BY y DESC`
      ).all().map((r: any) => r.y);
      const tracks = db.prepare(
        `${cte} SELECT track, COUNT(*) AS n FROM qu WHERE rn = 1 AND track != '' GROUP BY track ORDER BY n DESC`
      ).all();

      res.json({
        rows: rows.map(r => ({
          ...r,
          estero: !!r.estero,
          tardiva: !!r.tardiva,
          altre: r.n_prove > 1 ? altreProve(db, r.horse_name, r.annata ?? null, r) : [],
          grade_color: r.grade ? gradeColor(r.grade) : null,
        })),
        total, limit, offset, years, tracks,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  // GET /api/qualifiche/stats — riepilogo per l'intestazione della pagina.
  // Contano solo le qualifiche principali fatte in Italia, una per cavallo.
  app.get("/api/qualifiche/stats", pronta(), (_req, res) => {
    const db = getDb();
    try {
      if (!vpTableExists(db, "vp_qualifiche")) return res.json(null);
      const cte = `WITH ${cteQualifiche(db)}, it AS (SELECT * FROM qu WHERE rn = 1 AND fuori = 0)`;
      const s = db.prepare(`
        ${cte}
        SELECT (SELECT COUNT(*) FROM vp_qualifiche) AS n_righe,
               (SELECT COUNT(*) FROM qu WHERE rn = 1) AS n_prove,
               (SELECT COUNT(*) FROM qu WHERE rn = 1 AND estero = 1) AS n_solo_estero,
               (SELECT COUNT(*) FROM qu WHERE rn = 1 AND estero = 0 AND tardiva = 1) AS n_solo_adulti,
               (SELECT COUNT(DISTINCT horse_name) FROM qu WHERE rn = 1) AS n_cavalli,
               (SELECT COUNT(DISTINCT sire) FROM qu WHERE rn = 1) AS n_stalloni,
               (SELECT MIN(qual_date) FROM qu WHERE rn = 1) AS dal,
               (SELECT MAX(qual_date) FROM qu WHERE rn = 1) AS al,
               (SELECT ROUND(AVG(time_km), 1) FROM it) AS tempo_medio,
               (SELECT MIN(time_km) FROM it) AS tempo_migliore
      `).get() as any;
      const nuovi = (db.prepare(`
        ${cte}
        SELECT COUNT(DISTINCT q.horse_name) AS n FROM qu q
        LEFT JOIN horses h ON h.name = q.horse_name
        WHERE q.rn = 1 AND h.name IS NULL
      `).get() as any).n;
      const topSires = db.prepare(`
        ${cte}
        SELECT sire, COUNT(*) AS n_figli, ROUND(AVG(time_km), 1) AS tempo_medio,
               MIN(time_km) AS migliore
        FROM it
        WHERE sire IS NOT NULL AND time_km IS NOT NULL
        GROUP BY sire HAVING COUNT(*) >= 5
        ORDER BY tempo_medio ASC LIMIT 40
      `).all();
      // Quante qualifiche per ogni tempo (al decimo di secondo): serve alla
      // pagina per dire a ogni cavallo "piu' veloce di quante su cento".
      const distribuzione = db.prepare(`
        ${cte}
        SELECT time_km AS t, COUNT(*) AS n FROM it
        WHERE time_km IS NOT NULL GROUP BY time_km ORDER BY time_km
      `).all();
      res.json({ ...s, n_nuovi: nuovi, top_sires: topSires, distribuzione });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  // GET /api/consanguineita/:name — genealogia a cinque generazioni e incroci.
  // "Incrocio" = un antenato che ricorre sia dalla parte del padre sia da
  // quella della madre; le sigle tipo "4+5" dicono a quali generazioni.
  app.get("/api/consanguineita/:name", async (req, res) => {
    const db = getDb();
    try {
      if (!vpTableExists(db, "vp_horse_profile")) return res.json(null);
      const name = decodeURIComponent(req.params.name).trim().toUpperCase();
      let profile = db.prepare(
        "SELECT * FROM vp_horse_profile WHERE horse_name = ?"
      ).get(name) as any;
      if (!profile) {
        // Scheda mai scaricata: la chiediamo alla fonte adesso.
        try {
          if (await ensureGenealogy(DB_PATH, name)) {
            profile = db.prepare("SELECT * FROM vp_horse_profile WHERE horse_name = ?").get(name) as any;
          }
        } catch { /* si prosegue senza */ }
      }
      if (!profile) return res.json(null);
      // I nomi stanno nel dizionario vp_names: nelle tabelle grandi sono
      // memorizzati come numero, altrimenti il file supera i 100 MB ammessi.
      const crossings = db.prepare(`
        SELECT n.name AS ancestor_name, i.sire_line, i.dam_line, i.closest_gen
        FROM vp_inbreeding i
        JOIN vp_names n ON n.id = i.ancestor_id
        WHERE i.horse_id = ?
        ORDER BY i.closest_gen ASC, n.name
      `).all(profile.horse_id);
      const ancestors = db.prepare(`
        SELECT p.path, LENGTH(p.path) AS generation, n.name AS ancestor_name
        FROM vp_pedigree p
        JOIN vp_names n ON n.id = p.ancestor_id
        WHERE p.horse_id = ?
        ORDER BY LENGTH(p.path), p.path
      `).all(profile.horse_id);
      const breeders = db.prepare(
        "SELECT breeder_name FROM vp_horse_breeder WHERE horse_name = ?"
      ).all(name).map((r: any) => r.breeder_name);
      res.json({ profile, crossings, ancestors, breeders });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  // GET /api/allevatori — chi ha allevato i cavalli, con la qualita' media
  // dei soggetti prodotti. Diverso da /api/stud-farms, che elenca le stazioni
  // di monta dove stanno gli stalloni.
  app.get("/api/allevatori", pronta(), (req, res) => {
    const db = getDb();
    try {
      if (!vpTableExists(db, "vp_horse_breeder")) return res.json({ rows: [], total: 0 });
      const q = ((req.query.q as string) || "").trim().toUpperCase();
      const minHorses = Math.max(1, parseInt(req.query.min_horses as string) || 1);
      const limit = Math.min(500, parseInt(req.query.limit as string) || 100);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

      const where: string[] = ["b.breeder_name != ''"];
      const params: any[] = [];
      if (q) { where.push("UPPER(b.breeder_name) LIKE ?"); params.push(`%${q}%`); }

      const base = `
        FROM vp_horse_breeder b
        LEFT JOIN horse_ratings hr ON hr.name = b.horse_name
                                   AND hr.rating_mode = 'performance'
        WHERE ${where.join(" AND ")}
        GROUP BY b.breeder_name
        HAVING COUNT(DISTINCT b.horse_name) >= ?
      `;
      const total = (db.prepare(
        `SELECT COUNT(*) AS n FROM (SELECT b.breeder_name ${base})`
      ).get(...params, minHorses) as any).n;

      const rows = db.prepare(`
        SELECT b.breeder_name,
               COUNT(DISTINCT b.horse_name) AS n_cavalli,
               COUNT(DISTINCT hr.name) AS n_valutati,
               ROUND(AVG(hr.score), 1) AS score_medio,
               MAX(hr.score) AS score_migliore,
               SUM(CASE WHEN hr.grade IN ('SSS','SS','S') THEN 1 ELSE 0 END) AS n_top
        ${base}
        ORDER BY (score_medio IS NULL), score_medio DESC, n_cavalli DESC
        LIMIT ? OFFSET ?
      `).all(...params, minHorses, limit, offset) as any[];

      res.json({ rows, total, limit, offset });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  // GET /api/allevatore/:name — scheda di un allevatore
  app.get("/api/allevatore/:name", (req, res) => {
    const db = getDb();
    try {
      if (!vpTableExists(db, "vp_horse_breeder")) return res.json(null);
      const name = decodeURIComponent(req.params.name).trim();
      const horses = db.prepare(`
        SELECT b.horse_name, h.birth_year, h.sex, hr.score, hr.grade,
               h.career_races, h.career_earnings
        FROM vp_horse_breeder b
        LEFT JOIN horses h ON h.name = b.horse_name
        LEFT JOIN horse_ratings hr ON hr.name = b.horse_name
                                   AND hr.rating_mode IN ('performance', 'storico')
        WHERE b.breeder_name = ?
        ORDER BY (hr.score IS NULL), hr.score DESC
        LIMIT 300
      `).all(name) as any[];
      if (!horses.length) return res.json(null);
      const contact = vpTableExists(db, "vp_breeders")
        // Telefono ed email NON vengono selezionati: i recapiti restano
        // nell'archivio e non devono comparire sul sito.
        ? db.prepare(
            "SELECT vp_id, name, suffix, city, province, last_seen FROM vp_breeders WHERE UPPER(name) = UPPER(?)"
          ).get(name)
        : null;
      res.json({
        name,
        contact: contact || null,
        n_cavalli: horses.length,
        horses: horses.map(h => ({ ...h, grade_color: h.grade ? gradeColor(h.grade) : null })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  // ══════════════════════════════════════════════════════════════
  // GUIDATORI
  //
  // Il rendimento di un guidatore non e' la sua percentuale di vittorie:
  // quella misura i cavalli che gli affidano. Il numero che conta e'
  // "effetto_corretto", cioe' quanto i cavalli arrivano meglio o peggio della
  // LORO media quando li guida lui, corretto per il numero di partenza. Piu'
  // e' negativo, meglio e': il cavallo arriva davanti rispetto al suo solito.
  // ══════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────
  // ROTTURE AL GALOPPO (novembre 2026) — solo dati, nessuna previsione.
  // Quante corse di un cavallo, di un guidatore o di un allenatore sono
  // finite con una squalifica per galoppo: "r.p." (rottura prolungata) o
  // "r.a." (galoppo in arrivo). Non partiti esclusi. Il confronto e' con la
  // media dell'archivio nello stesso periodo.
  // ──────────────────────────────────────────────
  const GAL = "LOWER(placement_raw) IN ('r.p.', 'r.a.')";
  const PARTITO = "COALESCE(LOWER(placement_raw), '') NOT IN ('nr', 'n.p.', 'np')";
  let mediaGalCache: { mt: number; tutto: number; anno: number } | null = null;
  app.get("/api/rotture", (req, res) => {
    assicuraIndici();
    const db = getDb();
    try {
      const tipo = String(req.query.tipo ?? "");
      let nome = String(req.query.nome ?? "").trim();
      const col = tipo === "cavallo" ? "horse_name" : tipo === "guidatore" ? "driver" : tipo === "allenatore" ? "trainer" : null;
      if (!col || !nome) return res.status(400).json({ message: "servono tipo (cavallo, guidatore, allenatore) e nome" });
      if (tipo !== "guidatore") nome = nome.toUpperCase();
      const unAnno = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
      const mt = mtimeDb();
      if (!mediaGalCache || mediaGalCache.mt !== mt) {
        const t = db.prepare(`SELECT AVG(CASE WHEN ${GAL} THEN 1.0 ELSE 0 END) AS q FROM races WHERE ${PARTITO}`).get() as any;
        const a = db.prepare(`SELECT AVG(CASE WHEN ${GAL} THEN 1.0 ELSE 0 END) AS q FROM races WHERE ${PARTITO} AND race_date >= ?`).get(unAnno) as any;
        mediaGalCache = { mt, tutto: t?.q ?? 0, anno: a?.q ?? 0 };
      }
      const tot = db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN ${GAL} THEN 1 ELSE 0 END) AS g,
                                     SUM(CASE WHEN LOWER(placement_raw) = 'r.a.' THEN 1 ELSE 0 END) AS ga
                                FROM races WHERE ${col} = ? AND ${PARTITO}`).get(nome) as any;
      const anno = db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN ${GAL} THEN 1 ELSE 0 END) AS g
                                 FROM races WHERE ${col} = ? AND ${PARTITO} AND race_date >= ?`).get(nome, unAnno) as any;
      const pct = (g: number, n: number) => n ? Math.round(g / n * 1000) / 10 : null;
      const out: any = {
        tipo, nome,
        corse: tot?.n ?? 0, rotture: tot?.g ?? 0, in_arrivo: tot?.ga ?? 0, quota: pct(tot?.g ?? 0, tot?.n ?? 0),
        anno_corse: anno?.n ?? 0, anno_rotture: anno?.g ?? 0, anno_quota: pct(anno?.g ?? 0, anno?.n ?? 0),
        media_archivio: Math.round(mediaGalCache.tutto * 1000) / 10,
        media_anno: Math.round(mediaGalCache.anno * 1000) / 10,
      };
      if (tipo === "cavallo") {
        const ult = db.prepare(`SELECT race_date, track, placement, placement_raw, driver, shoes FROM races
                                 WHERE horse_name = ? AND ${PARTITO} ORDER BY race_date DESC LIMIT 10`).all(nome) as any[];
        out.ultime = ult.map(r => ({ data: r.race_date, pista: r.track, galoppo: ["r.p.", "r.a."].includes(String(r.placement_raw || "").toLowerCase()),
                                     esito: r.placement != null ? `${r.placement}°` : (esitoInParole(r.placement_raw) ?? r.placement_raw ?? "—") }));
        // Ferrato o scalzo: quanto rompe in un modo e nell'altro (solo dove la fonte lo dice).
        const f = db.prepare(`SELECT CASE WHEN UPPER(shoes) IN ('A','AP') THEN 'scalzo davanti' WHEN UPPER(shoes) IN ('F','P') THEN 'ferrato davanti' END AS k,
                                     COUNT(*) AS n, SUM(CASE WHEN ${GAL} THEN 1 ELSE 0 END) AS g
                                FROM races WHERE horse_name = ? AND ${PARTITO} AND UPPER(COALESCE(shoes,'')) IN ('A','AP','F','P') GROUP BY k`).all(nome) as any[];
        out.ferri = f.map(r => ({ come: r.k, corse: r.n, rotture: r.g, quota: pct(r.g, r.n) }));
      } else {
        const anni = db.prepare(`SELECT substr(race_date,1,4) AS anno, COUNT(*) AS n, SUM(CASE WHEN ${GAL} THEN 1 ELSE 0 END) AS g
                                   FROM races WHERE ${col} = ? AND ${PARTITO} GROUP BY anno ORDER BY anno DESC LIMIT 6`).all(nome) as any[];
        out.per_anno = anni.map(r => ({ anno: r.anno, corse: r.n, rotture: r.g, quota: pct(r.g, r.n) }));
      }
      res.json(out);
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally {
      db.close();
    }
  });

  app.get("/api/drivers", pronta(), (req, res) => {
    const db = getDb();
    try {
      if (!vpTableExists(db, "driver_stats")) {
        return res.json({ disponibile: false, drivers: [] });
      }

      const soloAttivi = req.query.attivi === "1";
      const minAffidabilita = parseFloat((req.query.min_affidabilita as string) || "0");

      const rows = db.prepare(`
        SELECT driver, n_gare, n_gare_recenti, n_cavalli, n_vittorie,
               pct_vittorie, pct_primi_tre, effetto, effetto_corretto,
               affidabilita, affidabilita_txt, partenza_media, premi_totali,
               prima_gara, ultima_gara, ippodromo_top, attivo
        FROM driver_stats
        WHERE affidabilita >= ?
          AND (? = 0 OR attivo = 1)
        ORDER BY effetto_corretto ASC
      `).all(minAffidabilita, soloAttivi ? 1 : 0) as any[];

      res.json({
        disponibile: true,
        n: rows.length,
        drivers: rows,
        spiegazione:
          "L'effetto e' quanto i cavalli arrivano meglio della loro media quando "
          + "li guida questa persona, corretto per il numero di partenza. Un valore "
          + "di -0,08 vuol dire che il cavallo arriva mediamente l'8% del gruppo "
          + "piu' avanti del suo solito: in una gara da dieci partenti, quasi una "
          + "posizione. La percentuale di vittorie invece dipende soprattutto da "
          + "quali cavalli vengono affidati, quindi non misura il guidatore.",
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  app.get("/api/driver/:name", (req, res) => {
    assicuraIndici();
    const db = getDb();
    try {
      const nome = decodeURIComponent(req.params.name);
      if (!vpTableExists(db, "driver_stats")) {
        return res.status(503).json({ error: "dati guidatori non ancora calcolati" });
      }

      const d = db.prepare("SELECT * FROM driver_stats WHERE driver = ?").get(nome) as any;
      if (!d) return res.status(404).json({ error: "guidatore non trovato" });

      // Su quali piste gira, e come rende su ciascuna.
      const piste = db.prepare(`
        SELECT track,
               COUNT(*) AS n_gare,
               ROUND(AVG(CASE WHEN placement = 1 THEN 100.0 ELSE 0 END), 1) AS pct_vittorie,
               ROUND(AVG(CASE WHEN placement <= 3 THEN 100.0 ELSE 0 END), 1) AS pct_primi_tre
        FROM races
        WHERE driver = ? AND placement IS NOT NULL
        GROUP BY track
        HAVING COUNT(*) >= 20
        ORDER BY n_gare DESC
      `).all(nome) as any[];

      // I cavalli che guida piu' spesso.
      const cavalli = db.prepare(`
        SELECT r.horse_name AS nome,
               -- Serve per rendere il cavallo cliccabile: la sua scheda si
               -- apre con nome E anno di nascita.
               (SELECT h.birth_year FROM horses h WHERE h.name = r.horse_name
                 LIMIT 1) AS anno,
               COUNT(*) AS n_gare,
               SUM(CASE WHEN r.placement = 1 THEN 1 ELSE 0 END) AS vittorie,
               SUM(COALESCE(r.prize_net, 0)) AS premi,
               (SELECT grade FROM horse_ratings hr
                 WHERE hr.name = r.horse_name AND hr.rating_mode = 'performance'
                 LIMIT 1) AS grade
        FROM races r
        WHERE r.driver = ? AND r.placement IS NOT NULL
        GROUP BY r.horse_name
        ORDER BY n_gare DESC
        LIMIT 25
      `).all(nome) as any[];

      // Andamento per anno: serve a vedere se sta migliorando o calando.
      const anni = db.prepare(`
        SELECT substr(race_date, 1, 4) AS anno,
               COUNT(*) AS n_gare,
               ROUND(AVG(CASE WHEN placement = 1 THEN 100.0 ELSE 0 END), 1) AS pct_vittorie,
               ROUND(AVG(CASE WHEN placement <= 3 THEN 100.0 ELSE 0 END), 1) AS pct_primi_tre
        FROM races
        WHERE driver = ? AND placement IS NOT NULL AND race_date IS NOT NULL
        GROUP BY anno
        HAVING COUNT(*) >= 10
        ORDER BY anno
      `).all(nome) as any[];

      // Forma, piste migliori e rendimento con i favoriti (forma.ts).
      const forma = (() => { try { return formaPersona(db, "driver", nome, mtimeDb()); } catch { return null; } })();
      res.json({ ...d, piste, cavalli, anni, forma });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  // ══════════════════════════════════════════════════════════════
  // ALLENATORI
  //
  // L'allenatore arriva dai risultati ufficiali (dal 2016) e sta sulla
  // colonna races.trainer; le schede sono in trainer_stats. Tutto lo prepara
  // scripts/allenatori.py, ogni notte.
  // ══════════════════════════════════════════════════════════════

  function haAllenatori(db: any): boolean {
    if (!vpTableExists(db, "trainer_stats")) return false;
    const col = db.prepare("PRAGMA table_info(races)").all() as any[];
    return col.some((c: any) => c.name === "trainer");
  }

  app.get("/api/allenatori", pronta(), (_req, res) => {
    const db = getDb();
    try {
      if (!haAllenatori(db)) return res.json({ disponibile: false, allenatori: [] });
      const allenatori = db.prepare(`
        SELECT allenatore, nome, n_corse, n_corse_recenti, n_cavalli, n_cavalli_recenti,
               n_vittorie, n_primi_tre, pct_vittorie, pct_primi_tre, premi_totali,
               premi_per_corsa, premi_12_mesi, vittorie_12_mesi, prima_corsa, ultima_corsa,
               ippodromo_top, attivo, effetto, n_confronti, affidabilita, affidabilita_txt
        FROM trainer_stats ORDER BY n_vittorie DESC`).all();
      const cop = db.prepare(`SELECT COUNT(*) AS n, COUNT(trainer) AS con, MAX(CASE WHEN trainer IS NOT NULL THEN race_date END) AS ultima
                              FROM races WHERE race_date >= '2016-01-01' AND track != 'ESTERO'`).get() as any;
      res.json({ disponibile: true, n: allenatori.length, allenatori,
                 copertura: cop.n ? Math.round(1000 * cop.con / cop.n) / 10 : 0, aggiornato_al: cop.ultima });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  app.get("/api/allenatore/:name", (req, res) => {
    const db = getDb();
    try {
      const nome = decodeURIComponent(req.params.name).toUpperCase();
      if (!haAllenatori(db)) return res.status(503).json({ error: "dati allenatori non ancora raccolti" });
      const t = db.prepare("SELECT * FROM trainer_stats WHERE allenatore = ?").get(nome) as any;
      if (!t) return res.status(404).json({ error: "allenatore non trovato" });

      const anni = db.prepare(`
        SELECT substr(race_date, 1, 4) AS anno, COUNT(*) AS n_corse,
               COUNT(DISTINCT horse_name) AS n_cavalli,
               SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS vittorie,
               ROUND(AVG(CASE WHEN placement = 1 THEN 100.0 ELSE 0 END), 1) AS pct_vittorie,
               ROUND(AVG(CASE WHEN placement <= 3 THEN 100.0 ELSE 0 END), 1) AS pct_primi_tre,
               ROUND(SUM(COALESCE(prize_net, 0))) AS premi
        FROM races WHERE trainer = ? GROUP BY anno ORDER BY anno`).all(nome);

      const piste = db.prepare(`
        SELECT track, COUNT(*) AS n_corse,
               SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS vittorie,
               ROUND(AVG(CASE WHEN placement = 1 THEN 100.0 ELSE 0 END), 1) AS pct_vittorie
        FROM races WHERE trainer = ? GROUP BY track HAVING COUNT(*) >= 5
        ORDER BY n_corse DESC LIMIT 12`).all(nome);

      // I cavalli: prima quelli allenati negli ultimi 18 mesi, poi gli altri.
      const cavalli = db.prepare(`
        SELECT r.horse_name AS nome,
               (SELECT h.birth_year FROM horses h WHERE h.name = r.horse_name LIMIT 1) AS anno,
               COUNT(*) AS n_corse,
               SUM(CASE WHEN r.placement = 1 THEN 1 ELSE 0 END) AS vittorie,
               ROUND(SUM(COALESCE(r.prize_net, 0))) AS premi,
               MIN(r.race_date) AS dal, MAX(r.race_date) AS al,
               (SELECT grade FROM horse_ratings hr WHERE hr.name = r.horse_name
                  AND hr.rating_mode = 'performance' LIMIT 1) AS grade
        FROM races r WHERE r.trainer = ?
        GROUP BY r.horse_name
        ORDER BY (MAX(r.race_date) >= date('now', '-18 months')) DESC, premi DESC
        LIMIT 60`).all(nome);

      const guidatori = db.prepare(`
        SELECT driver, COUNT(*) AS n_corse,
               SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS vittorie,
               ROUND(AVG(CASE WHEN placement = 1 THEN 100.0 ELSE 0 END), 1) AS pct_vittorie,
               ROUND(AVG(CASE WHEN placement <= 3 THEN 100.0 ELSE 0 END), 1) AS pct_primi_tre
        FROM races WHERE trainer = ? AND driver IS NOT NULL AND TRIM(driver) != ''
        GROUP BY driver HAVING COUNT(*) >= 5 ORDER BY n_corse DESC LIMIT 10`).all(nome);

      const ultime = db.prepare(`
        SELECT r.race_date, r.track, r.horse_name, r.placement, r.driver, r.time_km, r.distance,
               r.prize_net, (SELECT h.birth_year FROM horses h WHERE h.name = r.horse_name LIMIT 1) AS anno
        FROM races r WHERE r.trainer = ? ORDER BY r.race_date DESC, r.race_number DESC LIMIT 20`).all(nome);

      // Vittorie con il loro giorno: il sito le confronta con i Gran Premi.
      const vittorie = db.prepare(`
        SELECT race_date AS data, horse_name AS cavallo FROM races
        WHERE trainer = ? AND placement = 1 AND COALESCE(prize_gross, prize_net, 0) >= 10000`).all(nome);

      const forma = (() => { try { return formaPersona(db, "trainer", nome, mtimeDb()); } catch { return null; } })();
      res.json({ ...t, anni, piste, cavalli, guidatori, ultime, vittorie, forma });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  // Gli allenatori di un cavallo nel tempo, con il rendimento con ciascuno.
  app.get("/api/horse-trainers/:name", (req, res) => {
    const db = getDb();
    try {
      const nome = decodeURIComponent(req.params.name);
      if (!haAllenatori(db)) return res.json({ disponibile: false, periodi: [] });
      const righe = db.prepare(`
        SELECT race_date, trainer, placement, COALESCE(prize_net, 0) AS premio
        FROM races WHERE horse_name = ? AND trainer IS NOT NULL ORDER BY race_date`).all(nome) as any[];
      // Periodi consecutivi con lo stesso allenatore.
      const periodi: any[] = [];
      for (const r of righe) {
        const ult = periodi[periodi.length - 1];
        if (ult && ult.allenatore === r.trainer) {
          ult.al = r.race_date; ult.n_corse++; ult.premi += r.premio;
          if (r.placement === 1) ult.vittorie++;
          if (r.placement != null && r.placement <= 3) ult.primi_tre++;
        } else {
          periodi.push({ allenatore: r.trainer, dal: r.race_date, al: r.race_date, n_corse: 1,
                         vittorie: r.placement === 1 ? 1 : 0,
                         primi_tre: r.placement != null && r.placement <= 3 ? 1 : 0, premi: r.premio });
        }
      }
      const nomi = new Map<string, any>();
      for (const p of periodi) {
        if (!nomi.has(p.allenatore)) {
          nomi.set(p.allenatore, db.prepare("SELECT nome FROM trainer_stats WHERE allenatore = ?").get(p.allenatore));
        }
        const s = nomi.get(p.allenatore);
        p.nome = s?.nome ?? null;          // null: troppo poche corse per una scheda
        p.premi = Math.round(p.premi);
      }
      res.json({ disponibile: true, periodi });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  // ══════════════════════════════════════════════════════════════
  // PROPRIETARI (novembre 2026)
  // Dai risultati ufficiali MASAF, come gli allenatori, dal 2016: li
  // raccoglie scripts/allenatori.py e li conta scripts/proprietari.py.
  // ══════════════════════════════════════════════════════════════

  function haProprietari(db: any): boolean {
    if (!vpTableExists(db, "owner_stats")) return false;
    const col = db.prepare("PRAGMA table_info(races)").all() as any[];
    if (!col.some((c: any) => c.name === "owner")) return false;
    return ((db.prepare("SELECT COUNT(*) AS n FROM owner_stats").get() as any)?.n ?? 0) > 0;
  }

  app.get("/api/proprietari", pronta(), (_req, res) => {
    const db = getDb();
    try {
      if (!haProprietari(db)) return res.json({ disponibile: false, proprietari: [] });
      const proprietari = db.prepare(`
        SELECT proprietario, nome, n_corse, n_corse_recenti, n_cavalli, n_cavalli_recenti,
               n_vittorie, n_primi_tre, pct_vittorie, pct_primi_tre, premi_totali,
               premi_per_corsa, premi_12_mesi, vittorie_12_mesi, prima_corsa, ultima_corsa,
               ippodromo_top, allenatore_top, guidatore_top, attivo, premi_cavallo_anno, n_allenatori
        FROM owner_stats ORDER BY n_vittorie DESC`).all();
      const cop = db.prepare(`SELECT COUNT(*) AS n, COUNT(owner) AS con,
                                     MAX(CASE WHEN owner IS NOT NULL THEN race_date END) AS ultima,
                                     MIN(CASE WHEN owner IS NOT NULL THEN race_date END) AS prima
                              FROM races WHERE race_date >= '2016-01-01' AND track != 'ESTERO'`).get() as any;
      res.json({ disponibile: true, n: proprietari.length, proprietari,
                 copertura: cop.n ? Math.round(1000 * cop.con / cop.n) / 10 : 0,
                 aggiornato_al: cop.ultima, dal: cop.prima });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  app.get("/api/proprietario/:name", (req, res) => {
    const db = getDb();
    try {
      const nome = decodeURIComponent(req.params.name).toUpperCase();
      if (!haProprietari(db)) return res.status(503).json({ error: "dati proprietari non ancora raccolti" });
      const o = db.prepare("SELECT * FROM owner_stats WHERE proprietario = ?").get(nome) as any;
      if (!o) return res.status(404).json({ error: "proprietario non trovato" });

      const anni = db.prepare(`
        SELECT substr(race_date, 1, 4) AS anno, COUNT(*) AS n_corse,
               COUNT(DISTINCT horse_name) AS n_cavalli,
               SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS vittorie,
               ROUND(AVG(CASE WHEN placement <= 3 THEN 100.0 ELSE 0 END), 1) AS pct_primi_tre,
               ROUND(SUM(COALESCE(prize_net, 0))) AS premi
        FROM races WHERE owner = ? GROUP BY anno ORDER BY anno`).all(nome);

      const piste = db.prepare(`
        SELECT track, COUNT(*) AS n_corse,
               SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS vittorie,
               ROUND(AVG(CASE WHEN placement = 1 THEN 100.0 ELSE 0 END), 1) AS pct_vittorie
        FROM races WHERE owner = ? GROUP BY track HAVING COUNT(*) >= 5
        ORDER BY n_corse DESC LIMIT 12`).all(nome);

      // I cavalli: prima quelli degli ultimi 18 mesi, poi gli altri.
      const cavalli = db.prepare(`
        SELECT r.horse_name AS nome,
               (SELECT h.birth_year FROM horses h WHERE h.name = r.horse_name LIMIT 1) AS anno,
               COUNT(*) AS n_corse,
               SUM(CASE WHEN r.placement = 1 THEN 1 ELSE 0 END) AS vittorie,
               ROUND(SUM(COALESCE(r.prize_net, 0))) AS premi,
               MIN(r.race_date) AS dal, MAX(r.race_date) AS al,
               (SELECT grade FROM horse_ratings hr WHERE hr.name = r.horse_name
                  AND hr.rating_mode = 'performance' LIMIT 1) AS grade
        FROM races r WHERE r.owner = ?
        GROUP BY r.horse_name
        ORDER BY (MAX(r.race_date) >= date('now', '-18 months')) DESC, premi DESC
        LIMIT 60`).all(nome);

      // Allenatori a cui affida i cavalli, con il nome della scheda se c'e'.
      const allenatori = db.prepare(`
        SELECT r.trainer AS allenatore, ts.nome AS nome, COUNT(*) AS n_corse,
               COUNT(DISTINCT r.horse_name) AS n_cavalli,
               SUM(CASE WHEN r.placement = 1 THEN 1 ELSE 0 END) AS vittorie
        FROM races r LEFT JOIN trainer_stats ts ON ts.allenatore = r.trainer
        WHERE r.owner = ? AND r.trainer IS NOT NULL
        GROUP BY r.trainer HAVING COUNT(*) >= 3 ORDER BY n_corse DESC LIMIT 10`).all(nome);

      const guidatori = db.prepare(`
        SELECT driver, COUNT(*) AS n_corse,
               SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS vittorie
        FROM races WHERE owner = ? AND driver IS NOT NULL AND TRIM(driver) != ''
        GROUP BY driver HAVING COUNT(*) >= 3 ORDER BY n_corse DESC LIMIT 10`).all(nome);

      const ultime = db.prepare(`
        SELECT r.race_date, r.track, r.horse_name, r.placement, r.driver, r.trainer, r.time_km,
               r.prize_net, (SELECT h.birth_year FROM horses h WHERE h.name = r.horse_name LIMIT 1) AS anno
        FROM races r WHERE r.owner = ? ORDER BY r.race_date DESC, r.race_number DESC LIMIT 20`).all(nome);

      const vittorie = db.prepare(`
        SELECT race_date AS data, horse_name AS cavallo FROM races
        WHERE owner = ? AND placement = 1 AND COALESCE(prize_gross, prize_net, 0) >= 10000`).all(nome);

      res.json({ ...o, anni, piste, cavalli, allenatori, guidatori, ultime, vittorie });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  // I proprietari di un cavallo nel tempo, con il rendimento con ciascuno.
  app.get("/api/horse-owners/:name", (req, res) => {
    const db = getDb();
    try {
      const nome = decodeURIComponent(req.params.name);
      if (!haProprietari(db)) return res.json({ disponibile: false, periodi: [] });
      const righe = db.prepare(`
        SELECT race_date, owner, placement, COALESCE(prize_net, 0) AS premio
        FROM races WHERE horse_name = ? AND owner IS NOT NULL ORDER BY race_date`).all(nome) as any[];
      const periodi: any[] = [];
      for (const r of righe) {
        const ult = periodi[periodi.length - 1];
        if (ult && ult.proprietario === r.owner) {
          ult.al = r.race_date; ult.n_corse++; ult.premi += r.premio;
          if (r.placement === 1) ult.vittorie++;
        } else {
          periodi.push({ proprietario: r.owner, dal: r.race_date, al: r.race_date, n_corse: 1,
                         vittorie: r.placement === 1 ? 1 : 0, premi: r.premio });
        }
      }
      const st = db.prepare("SELECT nome FROM owner_stats WHERE proprietario = ?");
      for (const p of periodi) {
        p.nome = (st.get(p.proprietario) as any)?.nome ?? null;   // null: niente scheda
        p.premi = Math.round(p.premi);
      }
      res.json({ disponibile: true, periodi });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  // ══════════════════════════════════════════════════════════════
  // IPPODROMI
  // ══════════════════════════════════════════════════════════════

  // Nomi delle piste corretti a valle dell'archivio: l'archivio pubblicato li
  // ricalcola ogni notte dal file fasi_guidatori_ippodromi.py, ma fino al primo
  // giro dopo una correzione puo' avere ancora il nome vecchio.
  // Villanova e' Villanova d'Albenga (Savona), non Villanova d'Arda.
  const NOMI_PISTA_CORRETTI: Record<string, string> = { VILLANOVA: "Villanova d'Albenga" };
  const correggiNomePista = (t: any) => { if (t && NOMI_PISTA_CORRETTI[t.track]) t.nome = NOMI_PISTA_CORRETTI[t.track]; return t; };

  app.get("/api/tracks", pronta(), (_req, res) => {
    const db = getDb();
    try {
      if (!vpTableExists(db, "track_stats")) {
        return res.json({ disponibile: false, tracks: [] });
      }

      const tracks = db.prepare(`
        SELECT * FROM track_stats ORDER BY n_gare DESC
      `).all().map(correggiNomePista) as any[];

      // La tabella dei numeri di partenza complessiva: e' il dato piu' netto
      // che questo archivio contiene, e vale la pena mostrarlo subito.
      const partenze = db.prepare(`
        SELECT start_pos, n_gare, pct_vittorie, pct_primi_tre
        FROM start_pos_stats WHERE track = '*' ORDER BY start_pos
      `).all() as any[];

      res.json({ disponibile: true, n: tracks.length, tracks, partenze });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

  app.get("/api/track/:code", (req, res) => {
    const db = getDb();
    try {
      const codice = decodeURIComponent(req.params.code).toUpperCase();
      if (!vpTableExists(db, "track_stats")) {
        return res.status(503).json({ error: "dati ippodromi non ancora calcolati" });
      }

      const t = correggiNomePista(db.prepare("SELECT * FROM track_stats WHERE track = ?").get(codice)) as any;
      if (!t) return res.status(404).json({ error: "ippodromo non trovato" });

      const partenze = db.prepare(`
        SELECT start_pos, n_gare, pct_vittorie, pct_primi_tre
        FROM start_pos_stats WHERE track = ? ORDER BY start_pos
      `).all(codice) as any[];

      // Le distanze su cui si corre qui, non la loro media: una pista che corre
      // sul 1600 e sul 2600 non corre "sul 2100".
      const distanze = db.prepare(`
        SELECT distance AS distanza, COUNT(*) AS n_gare,
               ROUND(AVG(NULLIF(time_km, 0)), 2) AS tempo_km
        FROM races
        WHERE track = ? AND distance IS NOT NULL AND distance > 0
        GROUP BY distance
        HAVING COUNT(*) >= 100
        ORDER BY n_gare DESC
        LIMIT 8
      `).all(codice) as any[];

      const guidatori = db.prepare(`
        SELECT driver, COUNT(*) AS n_gare,
               SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) AS vittorie,
               ROUND(AVG(CASE WHEN placement = 1 THEN 100.0 ELSE 0 END), 1) AS pct_vittorie
        FROM races
        WHERE track = ? AND placement IS NOT NULL AND driver != ''
        GROUP BY driver
        HAVING COUNT(*) >= 50
        ORDER BY vittorie DESC
        LIMIT 15
      `).all(codice) as any[];

      const anni = db.prepare(`
        SELECT substr(race_date, 1, 4) AS anno, COUNT(*) AS n_gare,
               ROUND(AVG(NULLIF(prize_gross, 0))) AS premio_medio
        FROM races
        WHERE track = ? AND race_date IS NOT NULL
        GROUP BY anno ORDER BY anno
      `).all(codice) as any[];

      res.json({ ...t, partenze, distanze, guidatori, anni });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally { db.close(); }
  });

}


// Risultati della prova del pronostico dei primi tre (modelli/top3_verifica.json).
let _verificaTop3: any | undefined;
const _jsonModelli = new Map<string, any>();
function leggiJsonModelli(nome: string): any | null {
  if (_jsonModelli.has(nome)) return _jsonModelli.get(nome);
  let v: any = null;
  for (const p of [path.resolve(process.cwd(), "modelli", nome), path.resolve(process.cwd(), "..", "modelli", nome)]) {
    try { v = JSON.parse(fs.readFileSync(p, "utf-8")); break; } catch { /* prossimo */ }
  }
  _jsonModelli.set(nome, v);
  return v;
}

function leggiVerificaTop3(): any | null {
  if (_verificaTop3 !== undefined) return _verificaTop3;
  _verificaTop3 = null;
  for (const p of [path.resolve(process.cwd(), "modelli", "top3_verifica.json"), path.resolve(process.cwd(), "..", "modelli", "top3_verifica.json")]) {
    try { _verificaTop3 = JSON.parse(fs.readFileSync(p, "utf-8")); break; } catch { /* prossimo */ }
  }
  return _verificaTop3;
}

// Prova del rischio di galoppo (modelli/galoppo_verifica.json): solo i numeri
// che servono al sito per dire come e' stata fatta e com'e' andata.
let _verificaGaloppo: any | null | undefined;
function leggiVerificaGaloppo(): any | null {
  if (_verificaGaloppo !== undefined) return _verificaGaloppo;
  _verificaGaloppo = null;
  for (const p of [path.resolve(process.cwd(), "modelli", "galoppo_verifica.json"), path.resolve(process.cwd(), "..", "modelli", "galoppo_verifica.json")]) {
    try {
      const v = JSON.parse(fs.readFileSync(p, "utf-8"));
      _verificaGaloppo = {
        supera: !!v.supera, partenze: v.partenze_prova, quota: v.quota_galoppo_prova,
        auc: v.auc_modello, auc_cavallo: v.auc_storia_cavallo, fasce: v.fasce_sito, soglie: v.soglie_fasce,
        decimi: v.decimi, periodi: v.periodi,
      };
      break;
    } catch { /* prossimo */ }
  }
  return _verificaGaloppo;
}
