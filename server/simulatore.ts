/**
 * Simulatore della corsa (21/11/2026): i dati di ogni partente.
 *
 * La simulazione gira nel browser (client/src/lib/simulaCorsa.ts); qui si
 * prepara, per una corsa in programma o gia' corsa, quello che serve:
 *  - la pista (lunghezza indicativa, tempo al km tipico) e la partenza
 *    (autostart o nastri: dalle distanze dei partenti, quindi stimata);
 *  - per ogni cavallo: numero, metri di penalita', tempo al km atteso (la
 *    mediana delle ultime corse su distanze simili), lo spunto (il suo tempo
 *    migliore recente) e la tenuta (record sul corto e sul lungo), il rischio
 *    di galoppo (il modello del calendario, o in mancanza la sua quota di
 *    rotture), l'effetto del guidatore, il nostro pronostico e, per le corse
 *    gia' corse, la quota del totalizzatore e l'arrivo vero.
 */
import type { Express } from "express";

// Lunghezza della pista in metri, a un metro dalla corda: dalle schede degli
// ippodromi del MASAF/ASSI (unire.it, 21/11/2026) dove c'e'; per le altre
// piste e' indicativa (1000 le grandi, 800 le piccole). Serve a disegnare il
// giro e a mettere le curve al posto giusto.
export const PISTE_VERIFICATE: Record<string, number> = {
  MILANO: 999, BOLOGNA: 800, TREVISO: 1014, MONTECATINI: 805, CASTELLUCCIO: 1000, TORINO: 1004,
  FIRENZE: 800, PALERMO: 1000, MONTEGIORGIO: 806, CASARANO: 1000, MODENA: 1001, PADOVA: 805,
};
const LUNGHEZZA_PISTA: Record<string, number> = {
  NAPOLI: 1000, ROMA: 1000, SIRACUSA: 1000, CESENA: 800, TARANTO: 800, AVERSA: 800, GARIGLIANO: 800,
  FOLLONICA: 800, PONTECAGNANO: 800, CIVITANOVA: 800, FERRARA: 800, TRIESTE: 800, VILLANOVA: 800, PRATO: 800,
  ...PISTE_VERIFICATE,
};

// Effetti misurati sull'archivio (corse 2025-2026, 85.000 tempi): quanti
// secondi al km un cavallo va piu' piano (+) o piu' forte (-) del suo solito.
// Ferratura: F ferrato, A sferrato davanti, P sferrato dietro, AP scalzo.
const EFFETTO_FERRI: Record<string, number> = { F: 0.225, A: -0.071, P: -0.035, AP: -0.219 };
const FERRI_IGNOTI = 0.124;
const effettoFerri = (f: string | null | undefined) => EFFETTO_FERRI[String(f ?? "").trim().toUpperCase()] ?? FERRI_IGNOTI;
// Giorni dall'ultima corsa: chi torna dopo una lunga sosta va piu' piano.
function effettoRiposo(giorni: number | null): number {
  if (giorni == null) return 0.13;
  return giorni < 15 ? 0.02 : giorni <= 30 ? 0.07 : giorni <= 60 ? 0.13 : giorni <= 120 ? 0.22 : 0.38;
}

const NON_ARRIVATO = new Set(["r.p.", "r.a.", "dis.", "rit.", "am.", "amb.", "cad.", "n.c."]);
const GALOPPO = new Set(["r.p.", "r.a."]);

function kmSecondi(t: number | null | undefined): number | null {
  if (t == null || !isFinite(t) || t <= 0) return null;
  return t < 40 ? 60 + t : t;           // "16.2" = 1'16"2 = 76,2 secondi
}
function recordSecondi(r: string | null | undefined): number | null {
  const m = String(r ?? "").match(/(\d)[.'](\d{2})[."](\d)/);
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 10 : null;
}
function mediana(a: number[]): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

/** Il numero della corsa in SQL: dal codice ("..._R4" o "..._4"), altrimenti race_number. */
export const NUMERO_SQL = `CASE WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_R[0-9]*' THEN CAST(substr(race_code, 16) AS INTEGER)
  WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_[0-9]*' THEN CAST(substr(race_code, 15) AS INTEGER)
  ELSE race_number END`;

export function registraSimulatore(app: Express, getDb: () => any, nomiPiste: Record<string, string>,
                                   esiste: (db: any, t: string) => boolean) {
  const nomePista = (p: string) => nomiPiste[p] ?? p;

  // Elenco delle corse da simulare: in programma e gia' corse (ultimi 14 giorni).
  app.get("/api/simulatore/elenco", (_req, res) => {
    const db = getDb();
    try {
      const prossime = (db.prepare(`SELECT track, race_date, race_time, COUNT(*) AS n, MIN(distance) AS distanza
                                      FROM upcoming_races WHERE race_date >= date('now', '-1 day')
                                     GROUP BY track, race_date, race_time ORDER BY race_date, track, race_time`).all() as any[])
        .map(r => ({ tipo: "prossima", pista: nomePista(r.track), sigla: r.track, data: r.race_date, ora: r.race_time,
                     partenti: r.n, distanza: r.distanza }));
      // Una corsa e' data + pista + numero (23/11/2026): il numero sta nel
      // codice ("..._R4", "..._4") o, per le gare fino a giugno 2026 (codice =
      // sigla della pista), in race_number. Raggruppare per codice metteva
      // insieme tutte le corse di una giornata.
      const passate = (db.prepare(`SELECT race_date, track, ${NUMERO_SQL} AS numero, COUNT(*) AS n, MIN(distance) AS distanza
                                     FROM races WHERE race_date >= date('now', '-14 day') AND track <> 'ESTERO'
                                    GROUP BY race_date, track, numero HAVING numero IS NOT NULL
                                    ORDER BY race_date DESC, track, numero`).all() as any[])
        .map(r => ({ tipo: "passata", codice: `${r.race_date}|${r.track}|${r.numero}`, pista: r.track, data: r.race_date, numero: r.numero,
                     partenti: r.n, distanza: r.distanza }))
        .sort((a, b) => (b.data.localeCompare(a.data)) || a.pista.localeCompare(b.pista) || (a.numero ?? 0) - (b.numero ?? 0));
      res.json({ prossime, passate });
    } finally { db.close(); }
  });

  app.get("/api/simulatore/corsa", (req, res) => {
    const db = getDb();
    try {
      const tipo = String(req.query.tipo || "prossima");
      let partenti: any[] = [];
      let pista = "", data = "", ora: string | null = null, numero: number | null = null, sigla: string | null = null;
      if (tipo === "passata") {
        const codice = String(req.query.codice || "");
        const id = codice.split("|");
        partenti = id.length === 3
          ? db.prepare(`SELECT horse_name AS nome, start_pos AS numero, distance AS distanza, driver AS guidatore,
                               placement AS arrivo, placement_raw AS arrivo_testo, time_km, race_date, track, shoes
                          FROM races WHERE race_date = ? AND track = ? AND ${NUMERO_SQL} = ?`).all(id[0], id[1], Number(id[2])) as any[]
          : db.prepare(`SELECT horse_name AS nome, start_pos AS numero, distance AS distanza, driver AS guidatore,
                               placement AS arrivo, placement_raw AS arrivo_testo, time_km, race_date, track, shoes
                          FROM races WHERE race_code = ? AND race_code GLOB '*_*'`).all(codice) as any[];
        if (!partenti.length) return res.status(404).json({ error: "Corsa non trovata" });
        pista = partenti[0].track; data = partenti[0].race_date;
        const m = id.length === 3 ? [id[2], id[2]] : codice.match(/_R?(\d+)$/); numero = m ? Number(m[1]) : null;
        // L'ora della corsa dal pronostico salvato quel giorno (stessi cavalli).
        if (esiste(db, "pronostico_top3_storico")) {
          const segna = db.prepare(`SELECT corsa FROM pronostico_top3_storico WHERE race_date = ? AND pista = ? AND horse_name = ?`);
          const conta = new Map<string, number>();
          for (const p of partenti) { const r = segna.get(data, pista, p.nome) as any; if (r) conta.set(r.corsa, (conta.get(r.corsa) ?? 0) + 1); }
          ora = Array.from(conta.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        }
      } else {
        sigla = String(req.query.pista || ""); data = String(req.query.data || ""); ora = String(req.query.ora || "");
        // Il tipo di partenza scritto dalla fonte (24/11/2026), se la colonna c'e'.
        const conTipo = (db.prepare(`PRAGMA table_info(upcoming_races)`).all() as any[]).some(c => c.name === "start_type");
        partenti = db.prepare(`SELECT horse_name AS nome, start_pos AS numero, distance AS distanza, driver AS guidatore, shoes${conTipo ? ", start_type" : ""}
                                 FROM upcoming_races WHERE track = ? AND race_date = ? AND race_time = ?`).all(sigla, data, ora) as any[];
        if (!partenti.length) return res.status(404).json({ error: "Corsa non trovata" });
        pista = nomePista(sigla);
      }
      partenti.sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99));
      const distanze = partenti.map(p => p.distanza).filter((d: any) => d > 0);
      const base = distanze.length ? Math.min(...distanze) : 1600;
      // Nastri o autostart: dalla fonte quando lo scrive, altrimenti dalle
      // distanze (handicap = nastri; sopra i 1.700 metri di solito nastri).
      const tipoFonte = partenti.map(p => p.start_type).filter(Boolean);
      const nastri = tipoFonte.length ? tipoFonte.filter(t => t === "nastri").length >= tipoFonte.length / 2
        : new Set(distanze).size > 1 || base > 1700;
      const ts = esiste(db, "track_stats") ? db.prepare(`SELECT tempo_km_mediano FROM track_stats WHERE track = ?`).get(pista) as any : null;
      const kmPista = kmSecondi(ts?.tempo_km_mediano) ?? 76;

      const ultime = db.prepare(`SELECT time_km, distance, placement_raw, placement, shoes, race_date, track FROM races
                                  WHERE horse_name = ? AND race_date < ? ORDER BY race_date DESC LIMIT 20`);
      // Il numero di partenza: vittorie con quel numero su questa pista (o su
      // tutte, se la pista ne ha poche) rispetto alla media dei numeri in corsa.
      const vittNumero = new Map<number, number>();
      if (esiste(db, "start_pos_stats")) {
        const tutte = new Map<number, number>();
        for (const r of db.prepare(`SELECT start_pos, track, n_gare, pct_vittorie FROM start_pos_stats WHERE track IN (?, '*')`).all(pista) as any[]) {
          if (r.track === "*") tutte.set(r.start_pos, r.pct_vittorie);
          else if (r.n_gare >= 300) vittNumero.set(r.start_pos, r.pct_vittorie);
        }
        for (const [k, v] of Array.from(tutte.entries())) if (!vittNumero.has(k)) vittNumero.set(k, v);
      }
      const numeriInCorsa = partenti.map(p => vittNumero.get(p.numero)).filter((x): x is number => x != null && x > 0);
      const mediaNumeri = numeriInCorsa.length ? numeriInCorsa.reduce((a, b) => a + b, 0) / numeriInCorsa.length : null;
      const scheda = db.prepare(`SELECT birth_year, record_short, record_long FROM horses WHERE name = ?`);
      // Km su gara corta (fino a 1700 m) e lunga (da 2000 m) dalle gare prima
      // di quel giorno (21/11/2026). I record della fonte sono spesso vecchi:
      // provato sulle 461 corse dal 25/10 al 20/11, con questi l'errore sul
      // vincitore scende un poco (log-loss 2,036 -> 2,032). Riportare i tempi
      // alla pista di oggi (piste_velocita) invece non migliorava: non si fa.
      const recordGare = db.prepare(`SELECT MIN(CASE WHEN distance <= 1700 THEN time_km END) c,
                                            MIN(CASE WHEN distance >= 2000 THEN time_km END) l
                                     FROM races WHERE horse_name = ? AND race_date < ? AND time_km BETWEEN 7.5 AND 25`);
      const guid = esiste(db, "driver_stats") ? db.prepare(`SELECT effetto_corretto FROM driver_stats WHERE driver = ?`) : null;
      const rischioP = esiste(db, "rischio_galoppo") ? db.prepare(`SELECT prob FROM rischio_galoppo WHERE track = ? AND race_date = ? AND race_time = ? AND horse_name = ?`) : null;
      const rischioS = esiste(db, "rischio_galoppo_storico") ? db.prepare(`SELECT prob FROM rischio_galoppo_storico WHERE pista = ? AND race_date = ? AND corsa = ? AND horse_name = ?`) : null;
      // Dalla versione 5 anche la probabilita' di vincere (prob_vince), se la colonna c'e'.
      const colV = (t: string) => esiste(db, t) && (db.prepare(`PRAGMA table_info(${t})`).all() as any[]).some(c => c.name === "prob_vince") ? "prob_vince" : "NULL AS prob_vince";
      // Tempo al km previsto da XGBoost (tempo_previsto.py, dal 25/11/2026).
      const tempoP = esiste(db, "tempo_previsto") ? db.prepare(`SELECT km FROM tempo_previsto WHERE track = ? AND race_date = ? AND race_time = ? AND horse_name = ?`) : null;
      const tempoS = esiste(db, "tempo_previsto_storico") ? db.prepare(`SELECT km FROM tempo_previsto_storico WHERE pista = ? AND race_date = ? AND corsa = ? AND horse_name = ?`) : null;
      const pronP = esiste(db, "pronostico_top3") ? db.prepare(`SELECT prob, ${colV("pronostico_top3")} FROM pronostico_top3 WHERE track = ? AND race_date = ? AND race_time = ? AND horse_name = ?`) : null;
      const pronS = esiste(db, "pronostico_top3_storico") ? db.prepare(`SELECT prob, ${colV("pronostico_top3_storico")} FROM pronostico_top3_storico WHERE pista = ? AND race_date = ? AND corsa = ? AND horse_name = ?`) : null;
      // Quote finali per nome senza segni: Hippoweb scrive "-S-", l'archivio "(S)".
      const nq = (n: string) => String(n || "").toUpperCase().replace(/\s*[-(]\s*([A-Z]{1,3})\s*[-)]\s*$/, " $1").replace(/[^A-Z0-9]/g, "");
      const quoteCorsa = new Map<string, number>();
      if (esiste(db, "quote_totalizzatore") && numero != null)
        for (const r of db.prepare(`SELECT horse_name, quota FROM quote_totalizzatore WHERE race_date = ? AND pista = ? AND corsa = ?`).all(data, pista, numero) as any[])
          if (r.quota != null) quoteCorsa.set(nq(r.horse_name), r.quota);

      // Tempi riportati alla pista di oggi (24/11/2026, ?piste=1, in prova):
      // ogni tempo passato meno lo scarto della sua pista piu' quello della
      // pista di oggi (piste_velocita, secondi al km per corse corte e lunghe).
      const correggiPiste = String(req.query.piste ?? "") === "1" && esiste(db, "piste_velocita");
      const scarti = new Map<string, number>();
      if (correggiPiste) for (const r of db.prepare(`SELECT pista, classe, scarto FROM piste_velocita`).all() as any[]) scarti.set(`${r.pista}|${r.classe}`, r.scarto);
      const classe = (d: number | null) => (d ?? base) <= 1800 ? "corta" : "lunga";
      const correzione = (pistaGara: string, d: number | null) => correggiPiste
        ? (scarti.get(`${pista}|${classe(d)}`) ?? 0) - (scarti.get(`${pistaGara}|${classe(d)}`) ?? 0) : 0;
      const cavalli = partenti.map(p => {
        const storia = (ultime.all(p.nome, data) as any[]).map(r => correggiPiste && kmSecondi(r.time_km)
          ? { ...r, time_km: kmSecondi(r.time_km)! + correzione(r.track, r.distance) } : r);
        const vicine = storia.filter(r => kmSecondi(r.time_km) && Math.abs((r.distance ?? base) - (p.distanza ?? base)) <= 500);
        // Tempi "a ferri neutri": si toglie l'effetto della ferratura di quel giorno.
        const tempi = (vicine.length >= 3 ? vicine : storia.filter(r => kmSecondi(r.time_km))).slice(0, 8)
          .map(r => kmSecondi(r.time_km)! - effettoFerri(r.shoes));
        let kmBase = mediana(tempi);
        const ferriOggi = effettoFerri(p.shoes);
        // Forma: le ultime tre corse rispetto al solito (pesano un terzo).
        const forma = tempi.length >= 5 && kmBase != null ? mediana(tempi.slice(0, 3))! - kmBase : null;
        const giorni = storia[0]?.race_date ? Math.round((Date.parse(data) - Date.parse(storia[0].race_date)) / 86400000) : null;
        const riposo = effettoRiposo(giorni) - 0.07;
        if (kmBase != null) kmBase += ferriOggi + (forma != null ? 0.3 * forma : 0) + riposo;
        const migliore = tempi.length ? Math.min(...tempi) + ferriOggi : null;
        const vn = mediaNumeri && vittNumero.get(p.numero) ? vittNumero.get(p.numero)! / mediaNumeri : 1;
        const h = scheda.get(p.nome) as any;
        const rg = recordGare.get(p.nome, data) as any;
        const corto = kmSecondi(rg?.c) ?? recordSecondi(h?.record_short), lungo = kmSecondi(rg?.l) ?? recordSecondi(h?.record_long);
        // Rotture: quota delle corse finite al galoppo, con un minimo di prudenza.
        const corse = storia.filter(r => r.placement != null || NON_ARRIVATO.has(String(r.placement_raw ?? "").trim()));
        const rotture = corse.filter(r => GALOPPO.has(String(r.placement_raw ?? "").trim())).length;
        const galoppoStorico = (rotture + 0.19 * 4) / (corse.length + 4);
        const galoppoModello = tipo === "passata"
          ? (rischioS && ora ? (rischioS.get(pista, data, ora, p.nome) as any)?.prob : null)
          : (rischioP ? (rischioP.get(sigla, data, ora, p.nome) as any)?.prob : null);
        const pr = tipo === "passata"
          ? (pronS && ora ? (pronS.get(pista, data, ora, p.nome) as any) : null)
          : (pronP ? (pronP.get(sigla, data, ora, p.nome) as any) : null);
        const tp = tipo === "passata"
          ? (tempoS && ora ? (tempoS.get(pista, data, ora, p.nome) as any)?.km : null)
          : (tempoP ? (tempoP.get(sigla, data, ora, p.nome) as any)?.km : null);
        const kmPrevisto = kmSecondi(tp) != null ? kmSecondi(tp)! + ferriOggi : null;
        const top3 = pr?.prob ?? null;
        const vince = pr?.prob_vince ?? null;
        const q = quoteCorsa.get(nq(p.nome)) ?? null;
        const eff = guid && p.guidatore ? (guid.get(p.guidatore) as any)?.effetto_corretto : null;
        return {
          nome: p.nome, numero: p.numero, distanza: p.distanza ?? base, penalita: Math.max(0, (p.distanza ?? base) - base),
          guidatore: p.guidatore, ferri: p.shoes ?? null, anno: h?.birth_year ?? null,
          km_base: kmBase != null ? Math.round(kmBase * 10) / 10 : null,
          km_previsto: kmPrevisto != null ? Math.round(kmPrevisto * 10) / 10 : null,
          km_migliore: migliore != null ? Math.round(migliore * 10) / 10 : null, record_corto: corto, record_lungo: lungo,
          corse_note: tempi.length,
          ferri_effetto: Math.round(ferriOggi * 100) / 100,
          forma: forma != null ? Math.round(forma * 100) / 100 : null,
          giorni_riposo: giorni,
          vantaggio_numero: Math.round(vn * 1000) / 1000,
          galoppo: Math.round((galoppoModello ?? galoppoStorico) * 1000) / 1000,
          galoppo_fonte: galoppoModello != null ? "modello" : "storico",
          effetto_guidatore: eff ?? null,
          pronostico_top3: top3 != null ? Math.round(top3 * 1000) / 10 : null,
          pronostico_vince: vince != null ? Math.round(vince * 1000) / 10 : null,
          quota: q ?? null,
          arrivo: p.arrivo ?? null, arrivo_testo: p.arrivo_testo ?? null,
          km_reale: kmSecondi(p.time_km),
        };
      });
      res.json({
        tipo, pista, sigla, data, ora, numero, distanza: base,
        partenza: nastri ? "nastri" : "autostart",
        partenza_fonte: tipoFonte.length ? "fonte" : "stimata",
        lunghezza_pista: LUNGHEZZA_PISTA[pista] ?? 1000,
        pista_verificata: pista in PISTE_VERIFICATE,
        km_pista: Math.round(kmPista * 10) / 10,
        cavalli,
      });
    } finally { db.close(); }
  });
}
