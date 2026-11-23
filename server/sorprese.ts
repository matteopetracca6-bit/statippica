/**
 * Sorprese e delusioni della settimana (22/11/2026), per la Home.
 *
 * Sorpresa: un cavallo che ha vinto pagando almeno 10 volte la posta al
 * totalizzatore (o, senza quota, che il pronostico dava sotto il 15% di
 * finire nei primi tre). Delusione: il favorito del pubblico (la quota piu'
 * bassa della corsa, al massimo 3) arrivato fuori dai primi tre o non
 * arrivato. Per ognuno il motivo probabile, letto confrontando la corsa con la
 * precedente del cavallo: galoppo, ferri cambiati, guidatore cambiato,
 * rientro dopo un lungo riposo. Sono indizi, non spiegazioni: la pagina lo dice.
 */
import type { Express } from "express";

const GALOPPO: Record<string, string> = { "r.p.": "rottura prolungata", "r.a.": "rottura in arrivo", "dis.": "distanziato", "rit.": "ritirato" };
const nomeQuota = (n: string) => String(n || "").toUpperCase().replace(/\s*[-(]\s*([A-Z]{1,3})\s*[-)]\s*$/, " $1").replace(/[^A-Z0-9]/g, "");
const FERRI: Record<string, string> = { F: "ferrato", A: "sferrato davanti", P: "sferrato dietro", AP: "sferrato ai quattro piedi" };
const ferri = (s: any) => FERRI[String(s ?? "").trim().toUpperCase()] ?? (s ? String(s) : "ferri non indicati");

export function registraSorprese(app: Express, getDb: () => any, esiste: (db: any, t: string) => boolean, pronta: (ms?: number) => any) {
  app.get("/api/home/sorprese", pronta(30 * 60_000), (req, res) => {
    const giorni = Math.max(3, Math.min(31, parseInt(String(req.query.giorni)) || 7));
    const db = getDb();
    try {
      if (!esiste(db, "quote_totalizzatore")) return res.json({ giorni, sorprese: [], delusioni: [] });
      const righe = db.prepare(`
        SELECT r.race_code, r.race_date, r.track, r.horse_name, r.placement, r.placement_raw, r.shoes, r.driver,
               r.distance, r.prize_net, h.birth_year,
               (SELECT grade FROM horse_ratings x WHERE x.name = r.horse_name AND x.rating_mode IN ('performance', 'storico') LIMIT 1) AS voto
          FROM races r LEFT JOIN horses h ON h.name = r.horse_name
         WHERE r.race_date >= date('now', ?) AND r.race_date < date('now') AND r.track <> 'ESTERO'
           AND r.race_code IS NOT NULL`).all(`-${giorni} day`) as any[];
      const corse = new Map<string, any[]>();
      for (const r of righe) { if (!corse.has(r.race_code)) corse.set(r.race_code, []); corse.get(r.race_code)!.push(r); }
      const quote = db.prepare(`SELECT horse_name, quota FROM quote_totalizzatore WHERE race_date = ? AND pista = ? AND corsa = ?`);
      const pron = esiste(db, "pronostico_top3_storico")
        ? db.prepare(`SELECT prob FROM pronostico_top3_storico WHERE pista = ? AND race_date = ? AND horse_name = ? LIMIT 1`) : null;
      const prima = db.prepare(`SELECT race_date, shoes, driver, placement, placement_raw FROM races
                                 WHERE horse_name = ? AND race_date < ? ORDER BY race_date DESC LIMIT 1`);
      const motivi = (r: any, delusione: boolean) => {
        const out: string[] = [];
        const raw = String(r.placement_raw ?? "").trim();
        if (delusione && GALOPPO[raw]) out.push(GALOPPO[raw]);
        const p = prima.get(r.horse_name, r.race_date) as any;
        if (!p) { out.push("prima corsa in archivio"); return out; }
        const g = Math.round((Date.parse(r.race_date) - Date.parse(p.race_date)) / 86400000);
        if (g > 60) out.push(`rientro dopo ${g} giorni`);
        if ((p.shoes ?? "") !== (r.shoes ?? "")) out.push(`ferri: da ${ferri(p.shoes)} a ${ferri(r.shoes)}`);
        if (p.driver && r.driver && p.driver !== r.driver) out.push(`guidatore nuovo (${r.driver})`);
        if (!delusione && GALOPPO[String(p.placement_raw ?? "").trim()]) out.push("la volta prima aveva rotto");
        return out;
      };
      const sorprese: any[] = [], delusioni: any[] = [];
      for (const [codice, g] of Array.from(corse.entries())) {
        if (g.length < 5) continue;
        const m = String(codice).match(/_R?(\d+)$/);
        if (!m) continue;
        const qq = new Map<string, number>();
        for (const q of quote.all(g[0].race_date, g[0].track, Number(m[1])) as any[]) if (q.quota > 0) qq.set(nomeQuota(q.horse_name), q.quota);
        const conQuota = g.filter(r => qq.has(nomeQuota(r.horse_name)));
        const base = (r: any) => ({
          nome: r.horse_name, anno: r.birth_year, voto: r.voto, data: r.race_date, pista: r.track, corsa: Number(m[1]),
          codice, distanza: r.distance, guidatore: r.driver, quota: qq.get(nomeQuota(r.horse_name)) ?? null,
          prob: pron ? Math.round(((pron.get(r.track, r.race_date, r.horse_name) as any)?.prob ?? NaN) * 1000) / 10 : null,
          partenti: g.length,
        });
        // Sorpresa: il vincitore pagato almeno 10 a 1 (o, senza quota, dato
        // sotto il 15% dal pronostico).
        const vinc = g.find(r => r.placement === 1);
        if (vinc) {
          const b = base(vinc);
          const pb = Number.isFinite(b.prob as number) ? b.prob : null;
          if ((b.quota != null && b.quota >= 10) || (b.quota == null && pb != null && pb < 15)) {
            sorprese.push({ ...b, prob: pb, premio: vinc.prize_net ?? null, motivi: motivi(vinc, false) });
          }
        }
        // Delusione: il favorito del pubblico (quota piu' bassa, al massimo 3)
        // fuori dai primi tre o non arrivato. Servono le quote di quasi tutti.
        if (conQuota.length >= Math.max(4, g.length - 1)) {
          const fav = [...conQuota].sort((a, b) => qq.get(nomeQuota(a.horse_name))! - qq.get(nomeQuota(b.horse_name))!)[0];
          const q = qq.get(nomeQuota(fav.horse_name))!;
          const fuori = fav.placement == null ? !/^n\.?\s?p\.?$/i.test(String(fav.placement_raw ?? "").trim()) : fav.placement > 3;
          if (q <= 3 && fuori) {
            const b = base(fav);
            delusioni.push({ ...b, prob: Number.isFinite(b.prob as number) ? b.prob : null,
                             arrivo: fav.placement != null ? `${fav.placement}°` : (GALOPPO[String(fav.placement_raw ?? "").trim()] ?? String(fav.placement_raw ?? "non arrivato")),
                             vincitore: vinc?.horse_name ?? null, motivi: motivi(fav, true) });
          }
        }
      }
      sorprese.sort((a, b) => (b.quota ?? 0) - (a.quota ?? 0) || (a.prob ?? 100) - (b.prob ?? 100));
      delusioni.sort((a, b) => (a.quota ?? 9) - (b.quota ?? 9));
      res.json({ giorni, corse: corse.size, sorprese: sorprese.slice(0, 8), delusioni: delusioni.slice(0, 8),
                 n_sorprese: sorprese.length, n_delusioni: delusioni.length });
    } finally { db.close(); }
  });
}
