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

// Lunghezza della pista in metri: indicativa (l'archivio non la ha). Serve
// solo a disegnare il giro e a mettere le curve al posto giusto.
const LUNGHEZZA_PISTA: Record<string, number> = {
  NAPOLI: 1000, MILANO: 1000, ROMA: 1000, TORINO: 1000, PALERMO: 1000, SIRACUSA: 1000, TREVISO: 1000,
  BOLOGNA: 800, FIRENZE: 800, PADOVA: 800, CESENA: 800, MODENA: 800, MONTECATINI: 800, MONTEGIORGIO: 800,
  CASTELLUCCIO: 800, CASARANO: 800, TARANTO: 800, AVERSA: 800, GARIGLIANO: 800, FOLLONICA: 800,
  PONTECAGNANO: 800, CIVITANOVA: 800, FERRARA: 800, TRIESTE: 800, VILLANOVA: 800, PRATO: 800,
};

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
      const passate = (db.prepare(`SELECT race_code, race_date, track, COUNT(*) AS n, MIN(distance) AS distanza
                                     FROM races WHERE race_date >= date('now', '-14 day') AND race_code IS NOT NULL
                                    GROUP BY race_code ORDER BY race_date DESC, track, race_code`).all() as any[])
        .map(r => {
          const m = String(r.race_code).match(/_R?(\d+)$/);
          return { tipo: "passata", codice: r.race_code, pista: r.track, data: r.race_date, numero: m ? Number(m[1]) : null,
                   partenti: r.n, distanza: r.distanza };
        })
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
        partenti = db.prepare(`SELECT horse_name AS nome, start_pos AS numero, distance AS distanza, driver AS guidatore,
                                      placement AS arrivo, placement_raw AS arrivo_testo, time_km, race_date, track, shoes
                                 FROM races WHERE race_code = ?`).all(codice) as any[];
        if (!partenti.length) return res.status(404).json({ error: "Corsa non trovata" });
        pista = partenti[0].track; data = partenti[0].race_date;
        const m = codice.match(/_R?(\d+)$/); numero = m ? Number(m[1]) : null;
        // L'ora della corsa dal pronostico salvato quel giorno (stessi cavalli).
        if (esiste(db, "pronostico_top3_storico")) {
          const segna = db.prepare(`SELECT corsa FROM pronostico_top3_storico WHERE race_date = ? AND pista = ? AND horse_name = ?`);
          const conta = new Map<string, number>();
          for (const p of partenti) { const r = segna.get(data, pista, p.nome) as any; if (r) conta.set(r.corsa, (conta.get(r.corsa) ?? 0) + 1); }
          ora = Array.from(conta.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        }
      } else {
        sigla = String(req.query.pista || ""); data = String(req.query.data || ""); ora = String(req.query.ora || "");
        partenti = db.prepare(`SELECT horse_name AS nome, start_pos AS numero, distance AS distanza, driver AS guidatore, shoes
                                 FROM upcoming_races WHERE track = ? AND race_date = ? AND race_time = ?`).all(sigla, data, ora) as any[];
        if (!partenti.length) return res.status(404).json({ error: "Corsa non trovata" });
        pista = nomePista(sigla);
      }
      partenti.sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99));
      const distanze = partenti.map(p => p.distanza).filter((d: any) => d > 0);
      const base = distanze.length ? Math.min(...distanze) : 1600;
      const nastri = new Set(distanze).size > 1 || base > 1700;
      const ts = esiste(db, "track_stats") ? db.prepare(`SELECT tempo_km_mediano FROM track_stats WHERE track = ?`).get(pista) as any : null;
      const kmPista = kmSecondi(ts?.tempo_km_mediano) ?? 76;

      const ultime = db.prepare(`SELECT time_km, distance, placement_raw, placement FROM races
                                  WHERE horse_name = ? AND race_date < ? ORDER BY race_date DESC LIMIT 20`);
      const scheda = db.prepare(`SELECT birth_year, record_short, record_long FROM horses WHERE name = ?`);
      const guid = esiste(db, "driver_stats") ? db.prepare(`SELECT effetto_corretto FROM driver_stats WHERE driver = ?`) : null;
      const rischioP = esiste(db, "rischio_galoppo") ? db.prepare(`SELECT prob FROM rischio_galoppo WHERE track = ? AND race_date = ? AND race_time = ? AND horse_name = ?`) : null;
      const rischioS = esiste(db, "rischio_galoppo_storico") ? db.prepare(`SELECT prob FROM rischio_galoppo_storico WHERE pista = ? AND race_date = ? AND corsa = ? AND horse_name = ?`) : null;
      const pronP = esiste(db, "pronostico_top3") ? db.prepare(`SELECT prob FROM pronostico_top3 WHERE track = ? AND race_date = ? AND race_time = ? AND horse_name = ?`) : null;
      const pronS = esiste(db, "pronostico_top3_storico") ? db.prepare(`SELECT prob FROM pronostico_top3_storico WHERE pista = ? AND race_date = ? AND corsa = ? AND horse_name = ?`) : null;
      const quota = esiste(db, "quote_totalizzatore") ? db.prepare(`SELECT quota FROM quote_totalizzatore WHERE race_date = ? AND pista = ? AND corsa = ? AND horse_name = ?`) : null;

      const cavalli = partenti.map(p => {
        const storia = ultime.all(p.nome, data) as any[];
        const vicine = storia.filter(r => kmSecondi(r.time_km) && Math.abs((r.distance ?? base) - (p.distanza ?? base)) <= 500);
        const tempi = (vicine.length >= 3 ? vicine : storia.filter(r => kmSecondi(r.time_km))).slice(0, 8).map(r => kmSecondi(r.time_km)!);
        const kmBase = mediana(tempi);
        const migliore = tempi.length ? Math.min(...tempi) : null;
        const h = scheda.get(p.nome) as any;
        const corto = recordSecondi(h?.record_short), lungo = recordSecondi(h?.record_long);
        // Rotture: quota delle corse finite al galoppo, con un minimo di prudenza.
        const corse = storia.filter(r => r.placement != null || NON_ARRIVATO.has(String(r.placement_raw ?? "").trim()));
        const rotture = corse.filter(r => GALOPPO.has(String(r.placement_raw ?? "").trim())).length;
        const galoppoStorico = (rotture + 0.19 * 4) / (corse.length + 4);
        const galoppoModello = tipo === "passata"
          ? (rischioS && ora ? (rischioS.get(pista, data, ora, p.nome) as any)?.prob : null)
          : (rischioP ? (rischioP.get(sigla, data, ora, p.nome) as any)?.prob : null);
        const top3 = tipo === "passata"
          ? (pronS && ora ? (pronS.get(pista, data, ora, p.nome) as any)?.prob : null)
          : (pronP ? (pronP.get(sigla, data, ora, p.nome) as any)?.prob : null);
        const q = quota && numero != null ? (quota.get(data, pista, numero, p.nome) as any)?.quota : null;
        const eff = guid && p.guidatore ? (guid.get(p.guidatore) as any)?.effetto_corretto : null;
        return {
          nome: p.nome, numero: p.numero, distanza: p.distanza ?? base, penalita: Math.max(0, (p.distanza ?? base) - base),
          guidatore: p.guidatore, ferri: p.shoes ?? null, anno: h?.birth_year ?? null,
          km_base: kmBase != null ? Math.round(kmBase * 10) / 10 : null,
          km_migliore: migliore, record_corto: corto, record_lungo: lungo,
          corse_note: tempi.length,
          galoppo: Math.round((galoppoModello ?? galoppoStorico) * 1000) / 1000,
          galoppo_fonte: galoppoModello != null ? "modello" : "storico",
          effetto_guidatore: eff ?? null,
          pronostico_top3: top3 != null ? Math.round(top3 * 1000) / 10 : null,
          quota: q ?? null,
          arrivo: p.arrivo ?? null, arrivo_testo: p.arrivo_testo ?? null,
          km_reale: kmSecondi(p.time_km),
        };
      });
      res.json({
        tipo, pista, sigla, data, ora, numero, distanza: base,
        partenza: nastri ? "nastri" : "autostart",
        lunghezza_pista: LUNGHEZZA_PISTA[pista] ?? 1000,
        km_pista: Math.round(kmPista * 10) / 10,
        cavalli,
      });
    } finally { db.close(); }
  });
}
