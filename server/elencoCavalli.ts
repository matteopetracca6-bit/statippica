/**
 * Schede "Tutti" e "Novità" della pagina Cavalli (21/11/2026).
 *
 * Tutti: ogni cavallo dell'archivio, con o senza voto, piu' i nomi che
 * esistono solo nei pedigree (vendopuledri). I voti delle tre classifiche
 * (in gara, pedigree, storici) non si confrontano fra loro, quindi qui si
 * ordina per nome, vincite o anno e ogni cavallo ha l'etichetta del suo tipo.
 *
 * Novità: dal registro cavalli_novita (scripts/novita_cavalli.py): i cavalli
 * entrati nell'archivio e quelli che hanno appena ricevuto la carriera.
 */
import type { Express } from "express";

const PER_PAGINA = 50;

export function registraElencoCavalli(app: Express, getDb: () => any, esiste: (db: any, t: string) => boolean) {
  const cache = new Map<string, { quando: number; corpo: any }>();
  const daCache = (k: string, ms: number, fai: () => any) => {
    const c = cache.get(k);
    if (c && Date.now() - c.quando < ms) return c.corpo;
    const corpo = fai();
    if (cache.size > 300) cache.clear();
    cache.set(k, { quando: Date.now(), corpo });
    return corpo;
  };

  // Una riga per cavallo, con il voto della sua classifica (se ne ha due,
  // vale quella delle corse, poi gli storici, poi il pedigree).
  const BASE = (db: any) => `
    WITH r AS (
      SELECT name, grade, rating_mode,
             ROW_NUMBER() OVER (PARTITION BY name ORDER BY CASE rating_mode WHEN 'performance' THEN 0 WHEN 'storico' THEN 1 ELSE 2 END) AS rn
        FROM horse_ratings WHERE grade IS NOT NULL AND grade <> 'N/A'
    ),
    tutti AS (
      SELECT h.name AS nome, h.birth_year AS anno, h.sex AS sesso, h.country AS paese, h.sire AS padre, h.dam AS madre,
             COALESCE(h.career_races, 0) AS corse, COALESCE(h.career_earnings, 0) AS vincite,
             r.grade AS voto, COALESCE(r.rating_mode, 'senza_voto') AS tipo
        FROM horses h LEFT JOIN r ON r.name = h.name AND r.rn = 1
      ${esiste(db, "cavalli_alias") ? "WHERE h.name NOT IN (SELECT alias FROM cavalli_alias)" : ""}
      ${esiste(db, "vp_names") ? `UNION ALL
      SELECT DISTINCT v.name, NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, 'solo_pedigree'
        FROM vp_names v WHERE v.name IS NOT NULL AND NOT EXISTS (SELECT 1 FROM horses h WHERE h.name = v.name)` : ""}
    )`;

  app.get("/api/cavalli/tutti", (req, res) => {
    const q = req.query as Record<string, string>;
    const pagina = Math.max(0, parseInt(q.pagina) || 0);
    const k = JSON.stringify(q);
    const db = getDb();
    try {
      const corpo = daCache(k, 10 * 60_000, () => {
        const dove: string[] = [], par: any[] = [];
        if (q.cerca) { dove.push("nome LIKE ?"); par.push(`%${String(q.cerca).toUpperCase()}%`); }
        if (q.anno) { dove.push("anno = ?"); par.push(Number(q.anno)); }
        if (q.sesso) { dove.push("UPPER(sesso) = ?"); par.push(String(q.sesso).toUpperCase()); }
        if (q.paese) { dove.push("paese = ?"); par.push(q.paese); }
        if (q.tipo) { dove.push("tipo = ?"); par.push(q.tipo); }
        const filtro = dove.length ? `WHERE ${dove.join(" AND ")}` : "";
        const ordine = q.ordine === "vincite" ? "vincite DESC, nome" : q.ordine === "anno" ? "anno IS NULL, anno DESC, nome" : "nome";
        const totale = (db.prepare(`${BASE(db)} SELECT COUNT(*) AS n FROM tutti ${filtro}`).get(...par) as any).n;
        const righe = db.prepare(`${BASE(db)} SELECT * FROM tutti ${filtro} ORDER BY ${ordine} LIMIT ${PER_PAGINA} OFFSET ${pagina * PER_PAGINA}`).all(...par);
        const perTipo = q.cerca || q.anno || q.sesso || q.paese || q.tipo ? null
          : Object.fromEntries((db.prepare(`${BASE(db)} SELECT tipo, COUNT(*) AS n FROM tutti GROUP BY tipo`).all() as any[]).map(r => [r.tipo, r.n]));
        return { totale, pagina, per_pagina: PER_PAGINA, righe, per_tipo: perTipo };
      });
      res.json(corpo);
    } finally { db.close(); }
  });

  app.get("/api/cavalli/novita", (req, res) => {
    const periodo = String(req.query.periodo || "ultima");
    const db = getDb();
    try {
      if (!esiste(db, "cavalli_novita")) return res.json({ righe: [], dal: null, al: null, per_fonte: {}, totale: 0 });
      const ultimo = (db.prepare(`SELECT MAX(quando) AS q FROM cavalli_novita`).get() as any)?.q as string | null;
      if (!ultimo) return res.json({ righe: [], dal: null, al: null, per_fonte: {}, totale: 0 });
      // "Ultima notte": tutto quello entrato nelle 18 ore prima dell'ultima novita'.
      const dal = periodo === "7" ? "datetime('now', '-7 day')" : periodo === "30" ? "datetime('now', '-30 day')" : "datetime(?, '-18 hours')";
      const par = periodo === "7" || periodo === "30" ? [] : [ultimo];
      const righe = db.prepare(`
        SELECT n.nome, n.anno, n.tipo, n.fonte, n.classe, n.quando, h.sex AS sesso, h.country AS paese, h.sire AS padre, h.dam AS madre,
               COALESCE(h.career_races, 0) AS corse, COALESCE(h.career_earnings, 0) AS vincite,
               (SELECT grade FROM horse_ratings r WHERE r.name = n.nome AND r.grade IS NOT NULL AND r.grade <> 'N/A'
                 ORDER BY CASE r.rating_mode WHEN 'performance' THEN 0 WHEN 'storico' THEN 1 ELSE 2 END LIMIT 1) AS voto
          FROM cavalli_novita n LEFT JOIN horses h ON h.name = n.nome
         WHERE REPLACE(n.quando, 'T', ' ') >= ${dal}
         ORDER BY n.quando DESC, n.tipo, COALESCE(h.career_earnings, 0) DESC, n.nome
         LIMIT 3000`).all(...par) as any[];
      const perFonte: Record<string, number> = {};
      for (const r of righe) { const k = `${r.tipo}|${r.fonte}`; perFonte[k] = (perFonte[k] ?? 0) + 1; }
      res.json({ righe, totale: righe.length, dal: righe.length ? righe[righe.length - 1].quando : null, al: ultimo, per_fonte: perFonte });
    } finally { db.close(); }
  });
}
