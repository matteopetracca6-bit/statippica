/**
 * Cavalli seguiti (23/11/2026): l'elenco sta nel browser di chi guarda (niente
 * account); qui, per ognuno, la prossima corsa in programma e le ultime corse.
 * POST /api/seguiti { cavalli: [{ nome, anno }] }, al massimo 100.
 */
import type { Express } from "express";

export function registraSeguiti(app: Express, getDb: () => any, esiste: (db: any, t: string) => boolean) {
  app.post("/api/seguiti", (req, res) => {
    const lista = (Array.isArray(req.body?.cavalli) ? req.body.cavalli : []).slice(0, 100)
      .map((c: any) => ({ nome: String(c?.nome ?? "").trim().toUpperCase(), anno: Number(c?.anno) || null }))
      .filter((c: any) => c.nome);
    const db = getDb();
    try {
      const scheda = db.prepare(`
        SELECT h.name, h.birth_year, h.sex, h.sire, h.dam, h.country, h.career_races, h.career_wins, h.career_earnings,
               hr.grade, hr.score, hr.rating_mode
          FROM horses h
          LEFT JOIN horse_ratings hr ON hr.name = h.name AND hr.birth_year = h.birth_year
                                    AND hr.rating_mode IN ('performance', 'storico')
         WHERE h.name = ? AND (? IS NULL OR h.birth_year = ? OR h.birth_year IS NULL)
         ORDER BY h.birth_year = ? DESC LIMIT 1`);
      const ultime = db.prepare(`
        SELECT race_date, track, race_code, placement, placement_raw, time_km, distance, driver, prize_net, total_starters
          FROM races WHERE horse_name = ? ORDER BY race_date DESC, id DESC LIMIT 6`);
      const prossime = esiste(db, "upcoming_races") ? db.prepare(`
        SELECT race_date, race_time, track, start_pos, distance, driver
          FROM upcoming_races WHERE horse_name = ? AND race_date >= date('now', 'localtime')
         ORDER BY race_date, race_time LIMIT 3`) : null;
      const cavalli = lista.map((c: any) => {
        const h = scheda.get(c.nome, c.anno, c.anno, c.anno) as any;
        if (!h) return { nome: c.nome, anno: c.anno, trovato: false };
        const u = ultime.all(h.name) as any[];
        const p = prossime ? prossime.all(h.name) as any[] : [];
        const giorni = u[0] ? Math.round((Date.now() - Date.parse(u[0].race_date)) / 86400000) : null;
        return {
          nome: h.name, anno: h.birth_year, trovato: true, sesso: h.sex, padre: h.sire, madre: h.dam, paese: h.country,
          voto: h.grade ?? null, storico: h.rating_mode === "storico",
          corse: h.career_races, vittorie: h.career_wins, guadagni: h.career_earnings,
          giorni_dall_ultima: giorni,
          ultime: u.map(r => ({
            data: r.race_date, pista: r.track, codice: r.race_code, distanza: r.distance, guidatore: r.driver,
            km: r.time_km, premio: r.prize_net, partenti: r.total_starters,
            esito: r.placement != null ? String(r.placement) : String(r.placement_raw ?? "").trim() || "—",
          })),
          prossime: p.map(r => ({ data: r.race_date, ora: r.race_time, pista: r.track, numero: r.start_pos, distanza: r.distance, guidatore: r.driver })),
        };
      });
      res.json({ cavalli });
    } finally { db.close(); }
  });
}
