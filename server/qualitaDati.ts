/**
 * Qualita' dei dati (23/11/2026), per la pagina Metodo: quanto e' completo
 * l'archivio, campo per campo, e dove sono i buchi noti. Si calcola una volta
 * per archivio (la risposta resta in memoria finche' l'archivio non cambia).
 * GET /api/qualita-dati
 */
import type { Express } from "express";

// Una corsa e' data + pista + numero: fino a giugno 2026 il codice e' solo la
// sigla della pista e il numero sta in race_number, da luglio e' nel codice.
const pct = (a: number, b: number) => (b ? Math.round(1000 * a / b) / 10 : null);

export function registraQualita(app: Express, getDb: () => any, esiste: (db: any, t: string) => boolean,
                                pronta: (ms?: number) => any, _mt?: () => number) {
  app.get("/api/qualita-dati", pronta(12 * 60 * 60_000), (_req, res) => {
    const db = getDb();
    try {
      const uno = (q: string, ...p: any[]) => { try { return db.prepare(q).get(...p) as any; } catch { return null; } };
      const tutti = (q: string, ...p: any[]) => { try { return db.prepare(q).all(...p) as any[]; } catch { return []; } };

      // ── Gare ──────────────────────────────────────────────────────────────
      const g = uno(`SELECT COUNT(*) n, MIN(race_date) dal, MAX(race_date) al,
                            SUM(placement IS NOT NULL) arrivo, SUM(time_km IS NOT NULL) km,
                            SUM(trainer IS NOT NULL AND trainer <> '') allenatore, SUM(owner IS NOT NULL AND owner <> '') proprietario,
                            COUNT(DISTINCT race_date || '|' || track || '|' || CASE WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_R[0-9]*' THEN CAST(substr(race_code, 16) AS INTEGER)   WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_[0-9]*' THEN CAST(substr(race_code, 15) AS INTEGER)   ELSE race_number END) corse
                       FROM races WHERE track <> 'ESTERO' AND race_date IS NOT NULL`) ?? {};
      const senzaData = uno(`SELECT COUNT(*) n, COUNT(DISTINCT horse_name) cavalli FROM races WHERE race_date IS NULL`) ?? {};
      const estero = uno(`SELECT COUNT(*) n FROM races WHERE track = 'ESTERO'`)?.n ?? 0;
      const perAnno = tutti(`SELECT CAST(substr(race_date, 1, 4) AS INTEGER) anno, COUNT(*) partenze, COUNT(DISTINCT race_date || '|' || track || '|' || CASE WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_R[0-9]*' THEN CAST(substr(race_code, 16) AS INTEGER)   WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_[0-9]*' THEN CAST(substr(race_code, 15) AS INTEGER)   ELSE race_number END) corse,
                                    SUM(trainer IS NOT NULL AND trainer <> '') allenatore
                               FROM races WHERE track <> 'ESTERO' AND race_date IS NOT NULL GROUP BY 1 ORDER BY 1`)
        .map(r => ({ anno: r.anno, partenze: r.partenze, corse: r.corse, pct_allenatore: pct(r.allenatore, r.partenze) }));
      const mediaPiena = (() => {
        const piene = perAnno.filter(r => r.anno >= 2016 && r.anno <= 2025);
        return piene.length ? Math.round(piene.reduce((a, r) => a + r.corse, 0) / piene.length) : null;
      })();

      // ── Quote del totalizzatore ───────────────────────────────────────────
      let quote: any = null;
      if (esiste(db, "quote_totalizzatore")) {
        const q = uno(`SELECT MIN(race_date) dal, COUNT(*) n FROM (SELECT DISTINCT race_date, pista, corsa FROM quote_totalizzatore)`);
        const c = uno(`SELECT COUNT(DISTINCT race_date || '|' || track || '|' || CASE WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_R[0-9]*' THEN CAST(substr(race_code, 16) AS INTEGER)   WHEN race_code GLOB '????-??-??_[A-Z][A-Z]_[0-9]*' THEN CAST(substr(race_code, 15) AS INTEGER)   ELSE race_number END) n FROM races WHERE race_date >= ? AND track <> 'ESTERO'`, q?.dal ?? "9999");
        quote = { dal: q?.dal ?? null, corse_con_quote: q?.n ?? 0, corse: c?.n ?? 0, pct: pct(Math.min(q?.n ?? 0, c?.n ?? 0), c?.n ?? 0) };
      }

      // ── Cavalli ───────────────────────────────────────────────────────────
      const h = uno(`SELECT COUNT(*) n, SUM(birth_year >= 2012) atleti, SUM(birth_year < 2012) storici, SUM(birth_year IS NULL) senza_anno,
                            SUM(sex IS NOT NULL AND sex <> '') sesso, SUM(sire IS NOT NULL AND sire <> '') padre, SUM(dam IS NOT NULL AND dam <> '') madre,
                            SUM(birth_year >= 2012 AND career_races > 0) atleti_corso
                       FROM horses`) ?? {};
      const voti = Object.fromEntries(tutti(`SELECT rating_mode m, COUNT(*) n FROM horse_ratings GROUP BY 1`).map(r => [r.m, r.n]));
      const senzaVoto = uno(`SELECT COUNT(*) n FROM horses x WHERE birth_year >= 2012 AND career_races > 0 AND NOT EXISTS
                               (SELECT 1 FROM horse_ratings r WHERE r.name = x.name AND r.birth_year = x.birth_year AND r.rating_mode = 'performance')`)?.n ?? null;
      // Albero di tre generazioni (genitori e quattro nonni) nell'archivio, per gli atleti.
      const alberi = uno(`SELECT COUNT(*) n,
            SUM(s.sire IS NOT NULL AND s.sire <> '' AND s.dam IS NOT NULL AND s.dam <> '' AND d.sire IS NOT NULL AND d.sire <> '' AND d.dam IS NOT NULL AND d.dam <> '') nonni
          FROM horses h
          LEFT JOIN horses s ON s.rowid = (SELECT rowid FROM horses WHERE name = h.sire LIMIT 1)
          LEFT JOIN horses d ON d.rowid = (SELECT rowid FROM horses WHERE name = h.dam LIMIT 1)
         WHERE h.birth_year >= 2012 AND h.career_races > 0`) ?? {};
      const stalloni = uno(`SELECT COUNT(*) n, SUM(x.sire IS NOT NULL AND x.sire <> '' AND x.dam IS NOT NULL AND x.dam <> '') genitori
          FROM (SELECT sire FROM horses WHERE sire IS NOT NULL AND sire <> '' GROUP BY sire HAVING COUNT(*) >= 5) s
          LEFT JOIN horses x ON x.rowid = (SELECT rowid FROM horses WHERE name = s.sire LIMIT 1)`) ?? {};

      const conta = (t: string, w = "") => (esiste(db, t) ? uno(`SELECT COUNT(*) n FROM ${t} ${w}`)?.n ?? 0 : null);

      res.json({
        gare: {
          partenze: g.n, corse: g.corse, dal: g.dal, al: g.al,
          pct_arrivo: pct(g.arrivo, g.n), pct_km: pct(g.km, g.n),
          pct_allenatore: pct(g.allenatore, g.n), pct_proprietario: pct(g.proprietario, g.n),
          senza_data: senzaData.n ?? 0, senza_data_cavalli: senzaData.cavalli ?? 0,
          estero, per_anno: perAnno, media_corse_anno_piena: mediaPiena,
        },
        quote,
        cavalli: {
          totale: h.n, atleti: h.atleti, storici: h.storici, senza_anno: h.senza_anno,
          pct_sesso: pct(h.sesso, h.n), pct_padre: pct(h.padre, h.n), pct_madre: pct(h.madre, h.n),
          atleti_che_hanno_corso: h.atleti_corso, atleti_senza_voto: senzaVoto,
          pct_nonni_atleti: pct(alberi.nonni ?? 0, alberi.n ?? 0),
          stalloni_5_figli: stalloni.n ?? 0, pct_stalloni_con_genitori: pct(stalloni.genitori ?? 0, stalloni.n ?? 0),
        },
        voti: { atleti: voti.performance ?? 0, storici: voti.storico ?? 0, pedigree: voti.pedigree ?? 0,
                carriere_parziali: conta("horse_ratings", "WHERE carriera_parziale = 1") },
        carriere: { complete_dall_estero: conta("carriere_complete"), ospiti_esteri: conta("ospiti_esteri"), omonimi: conta("omonimi") },
        aggiornamento: { ultima_gara: g.al, prossima_in_programma: esiste(db, "upcoming_races") ? uno(`SELECT MAX(race_date) d FROM upcoming_races`)?.d ?? null : null },
      });
    } finally { db.close(); }
  });
}
