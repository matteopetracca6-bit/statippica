import type { Express } from "express";
import type { Server } from "http";
import Database from "better-sqlite3";
import path from "path";

// On Render, use persistent disk at /data/data.db; otherwise use local data.db
const DB_PATH = process.env.RENDER
  ? "/data/data.db"
  : path.resolve(process.cwd(), "data.db");

function getDb() {
  return new Database(DB_PATH, { readonly: true });
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

export function registerRoutes(httpServer: Server, app: Express) {
  // ──────────────────────────────────────────────
  // GET /api/search/horse?q=NAME
  // ──────────────────────────────────────────────
  app.get("/api/search/horse", (req, res) => {
    const q = (req.query.q as string || "").trim().toUpperCase();
    if (q.length < 2) return res.json([]);
    const db = getDb();
    try {
      const rows = db.prepare(`
        SELECT h.name, h.birth_year, h.sire, h.sex,
               hr.grade, hr.score, hr.rating_mode
        FROM horses h
        LEFT JOIN horse_ratings hr ON h.name = hr.name AND h.birth_year = hr.birth_year
        WHERE h.name LIKE ?
        ORDER BY h.birth_year DESC
        LIMIT 20
      `).all(`%${q}%`);
      res.json(rows);
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/horse/:name/:year
  // ──────────────────────────────────────────────
  app.get("/api/horse/:name/:year", (req, res) => {
    const name = decodeURIComponent(req.params.name).toUpperCase();
    const year = parseInt(req.params.year);
    const db = getDb();
    try {
      const horse = db.prepare(`
        SELECT h.name, h.birth_year, h.sex, h.country, h.sire, h.dam,
               h.career_races, h.career_wins, h.career_places, h.career_earnings, h.record_career,
               h.record_short, h.record_long,
               hr.grade, hr.score, hr.earn_percentile, hr.time_percentile,
               hr.sire_percentile, hr.rating_mode, hr.win_rate
        FROM horses h
        LEFT JOIN horse_ratings hr ON h.name = hr.name AND h.birth_year = hr.birth_year
        WHERE h.name = ? AND h.birth_year = ?
      `).get(name, year) as any;

      if (!horse) return res.status(404).json({ error: "Not found" });

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
        LEFT JOIN horses s ON UPPER(TRIM(s.name)) = UPPER(TRIM(h.sire)) AND h.sire IS NOT NULL AND h.sire != ''
        LEFT JOIN horses d ON UPPER(TRIM(d.name)) = UPPER(TRIM(h.dam))  AND h.dam  IS NOT NULL AND h.dam  != ''
        WHERE UPPER(TRIM(h.name)) = ? AND h.birth_year = ?
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

      const pedigree = {
        sire:      horse.sire || null,
        dam:       horse.dam  || null,
        sire_sire: pedigreeRow?.sire_sire || pedigreeRow?.sire_unire_sire || spSire?.sire || null,
        sire_dam:  pedigreeRow?.sire_dam  || pedigreeRow?.sire_unire_dam  || spSire?.dam  || null,
        dam_sire:  pedigreeRow?.dam_sire  || pedigreeRow?.dam_unire_sire  || spDam?.sire  || null,
        dam_dam:   pedigreeRow?.dam_dam   || pedigreeRow?.dam_unire_dam   || spDam?.dam   || null,
      };

      res.json({ ...horse, races, siblings, pedigree });
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/search/stallion?q=NAME
  // ──────────────────────────────────────────────
  app.get("/api/search/stallion", (req, res) => {
    const q = (req.query.q as string || "").trim().toUpperCase();
    if (q.length < 2) return res.json([]);
    const db = getDb();
    try {
      const rows = db.prepare(`
        SELECT DISTINCT sire as name,
               n_figli_totali, n_in_corsa, avg_score, n_SSS, n_SS, n_S, pct_top_S
        FROM stallion_rating_stats
        WHERE sire LIKE ?
        ORDER BY avg_score DESC
        LIMIT 20
      `).all(`%${q}%`);
      res.json(rows);
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/stallion/:name
  // ──────────────────────────────────────────────
  app.get("/api/stallion/:name", (req, res) => {
    const name = decodeURIComponent(req.params.name).toUpperCase();
    const db = getDb();
    try {
      // Stats aggregate
      const stats = db.prepare(`
        SELECT * FROM stallion_rating_stats WHERE sire = ?
      `).get(name) as any;

      if (!stats) return res.status(404).json({ error: "Not found" });

      // From stallions table (stud fee, etc.)
      const stud = db.prepare(`
        SELECT stud_fee_eur, stud_farm, stud_status, progeny_earnings_2024,
               media_in_corsa, tot_prod, tot_in_corsa, perc_in_corsa,
               tot_vitt, perc_vitt
        FROM stallions
        WHERE name = ?
        ORDER BY stud_fee_eur DESC
        LIMIT 1
      `).get(name) as any;

      // Top children (performance only)
      const children = db.prepare(`
        SELECT name, birth_year, grade, score, career_earnings, record_career, win_rate, sire_percentile
        FROM horse_ratings
        WHERE sire = ? AND rating_mode = 'performance'
        ORDER BY career_earnings DESC
        LIMIT 20
      `).all(name) as any[];

      // Grade distribution
      const gradeDist = db.prepare(`
        SELECT grade, COUNT(*) as cnt
        FROM horse_ratings
        WHERE sire = ? AND rating_mode = 'performance'
        GROUP BY grade
        ORDER BY cnt DESC
      `).all(name) as any[];

      // Genealogy: sire, dam, sire_sire, sire_dam, dam_sire, dam_dam
      // Try from horses table first (self-join), fallback to unire fields
      const horseSelf = db.prepare(`
        SELECT h.sire, h.dam, h.unire_sire, h.unire_dam,
               s.sire AS sire_sire, s.dam AS sire_dam,
               d.sire AS dam_sire, d.dam AS dam_dam,
               s.unire_sire AS sire_unire_sire, s.unire_dam AS sire_unire_dam,
               d.unire_sire AS dam_unire_sire, d.unire_dam AS dam_unire_dam
        FROM horses h
        LEFT JOIN horses s ON UPPER(TRIM(s.name)) = UPPER(TRIM(h.sire)) AND h.sire IS NOT NULL AND h.sire != ''
        LEFT JOIN horses d ON UPPER(TRIM(d.name)) = UPPER(TRIM(h.dam)) AND h.dam IS NOT NULL AND h.dam != ''
        WHERE UPPER(TRIM(h.name)) = ?
        LIMIT 1
      `).get(name) as any;

      // Fallback to curated international pedigree table if horse not found in horses table
      const spRow = (!horseSelf || (!horseSelf.sire && !horseSelf.unire_sire))
        ? db.prepare(`SELECT * FROM stallion_pedigree WHERE UPPER(TRIM(name)) = ?`).get(name) as any
        : null;

      const pedigree = (horseSelf && (horseSelf.sire || horseSelf.unire_sire)) ? {
        sire:     horseSelf.sire     || horseSelf.unire_sire    || null,
        dam:      horseSelf.dam      || horseSelf.unire_dam     || null,
        sire_sire: horseSelf.sire_sire || horseSelf.sire_unire_sire || null,
        sire_dam:  horseSelf.sire_dam  || horseSelf.sire_unire_dam  || null,
        dam_sire:  horseSelf.dam_sire  || horseSelf.dam_unire_sire  || null,
        dam_dam:   horseSelf.dam_dam   || horseSelf.dam_unire_dam   || null,
      } : spRow ? {
        sire:     spRow.sire     || null,
        dam:      spRow.dam      || null,
        sire_sire: spRow.sire_sire || null,
        sire_dam:  spRow.sire_dam  || null,
        dam_sire:  spRow.dam_sire  || null,
        dam_dam:   spRow.dam_dam   || null,
      } : null;

      // Nationality: from stallion_pedigree or horses table
      const natRow = db.prepare(`
        SELECT sp.nationality FROM stallion_pedigree sp WHERE UPPER(TRIM(sp.name)) = ? LIMIT 1
      `).get(name) as any;
      const natFromHorses = db.prepare(`
        SELECT h.country FROM horses h WHERE UPPER(TRIM(h.name)) = ? LIMIT 1
      `).get(name) as any;
      const nationality = natRow?.nationality || natFromHorses?.country || null;

      res.json({ ...stats, stud: stud || null, children, gradeDist, pedigree, nationality });
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
    const offset = (page - 1) * limit;
    const sortBy = req.query.sort as string || "score";

    const conditions: string[] = ["rating_mode = ?"];
    const params: any[] = [mode];

    if (year) { conditions.push("birth_year = ?"); params.push(year); }
    if (grade) { conditions.push("grade = ?"); params.push(grade); }
    if (sire) { conditions.push("sire LIKE ?"); params.push(`%${sire}%`); }

    const where = conditions.join(" AND ");
    const sortCol = sortBy === "earnings" ? "career_earnings" : "score";

    const db = getDb();
    try {
      const total = (db.prepare(`SELECT COUNT(*) as cnt FROM horse_ratings WHERE ${where}`)
        .get(...params) as any).cnt;

      const rows = db.prepare(`
        SELECT name, birth_year, sire, grade, score, earn_percentile, time_percentile,
               sire_percentile, career_races, career_wins, career_earnings, record_career, win_rate
        FROM horse_ratings
        WHERE ${where}
        ORDER BY ${sortCol} DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as any[];

      res.json({ total, page, limit, rows });
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // GET /api/leaderboard/years — available birth years
  // ──────────────────────────────────────────────
  app.get("/api/leaderboard/years", (_req, res) => {
    const db = getDb();
    try {
      const rows = db.prepare(`
        SELECT DISTINCT birth_year FROM horse_ratings
        WHERE birth_year IS NOT NULL
        ORDER BY birth_year DESC
      `).all() as any[];
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

    const getHorse = (name: string, year?: string) => {
      const row = year
        ? (db.prepare(`SELECT * FROM horse_ratings WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) AND birth_year = ? LIMIT 1`).get(name, parseInt(year)) as any)
        : (db.prepare(`SELECT * FROM horse_ratings WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) ORDER BY birth_year DESC LIMIT 1`).get(name) as any);
      if (!row) return null;
      const ped = db.prepare(`
        SELECT h.sire, h.dam,
          s.sire AS sire_sire, s.dam AS sire_dam,
          d.sire AS dam_sire, d.dam AS dam_dam
        FROM horses h
        LEFT JOIN horses s ON UPPER(TRIM(s.name)) = UPPER(TRIM(h.sire))
        LEFT JOIN horses d ON UPPER(TRIM(d.name)) = UPPER(TRIM(h.dam))
        LEFT JOIN stallion_pedigree sp ON UPPER(TRIM(sp.name)) = UPPER(TRIM(h.name))
        WHERE UPPER(TRIM(h.name)) = ? AND h.birth_year = ?
        LIMIT 1
      `).get(row.name, row.birth_year) as any;
      return { ...row, pedigree: ped || null };
    };

    const h1 = getHorse(name1, year1);
    const h2 = getHorse(name2, year2);
    res.json({ horse1: h1, horse2: h2 });
  });

  // ── Lista stalloni per dropdown ──────────────────────────────────────────
  app.get("/api/stallions", (_req, res) => {
    const rows = db.prepare(`
      SELECT s.name, s.breed, s.birth_year, s.country,
             sr.avg_score, sr.n_in_corsa, sr.pct_top_S
      FROM stallions s
      LEFT JOIN stallion_rating_stats sr ON UPPER(TRIM(sr.sire)) = UPPER(TRIM(s.name))
      ORDER BY COALESCE(sr.avg_score, 0) DESC
    `).all() as any[];
    res.json(rows);
  });

  app.get("/api/stats", (_req, res) => {
    const db = getDb();
    try {
      const totalHorses = (db.prepare("SELECT COUNT(*) as c FROM horses").get() as any).c;
      const totalRaces = (db.prepare("SELECT COUNT(*) as c FROM races").get() as any).c;
      const totalStallions = (db.prepare("SELECT COUNT(DISTINCT sire) as c FROM stallion_rating_stats").get() as any).c;
      const gradeDist = db.prepare(`
        SELECT grade, COUNT(*) as cnt FROM horse_ratings
        WHERE rating_mode = 'performance'
        GROUP BY grade ORDER BY cnt DESC
      `).all() as any[];
      const topByYear = db.prepare(`
        SELECT birth_year, name, grade, score, career_earnings
        FROM horse_ratings
        WHERE rating_mode = 'performance'
        GROUP BY birth_year
        HAVING score = MAX(score)
        ORDER BY birth_year DESC
        LIMIT 5
      `).all() as any[];
      res.json({ totalHorses, totalRaces, totalStallions, gradeDist, topByYear });
    } finally {
      db.close();
    }
  });

  // ──────────────────────────────────────────────
  // POST /api/advisor
  // Body: { fattrice: string, budget_max?: number }
  // ──────────────────────────────────────────────
  app.post("/api/advisor", (req, res) => {
    const { fattrice, budget_max } = req.body as { fattrice: string; budget_max?: number };
    if (!fattrice) return res.status(400).json({ error: "fattrice required" });

    const fattriceUpper = fattrice.trim().toUpperCase();
    const db = getDb();
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

      // Get all stallions with stats + stud fee
      const allStallions = db.prepare(`
        SELECT s.name, s.stud_fee_eur, s.stud_farm, s.stud_status,
               srs.avg_score, srs.n_in_corsa, srs.n_SSS, srs.n_SS, srs.n_S,
               srs.pct_top_S, srs.avg_earnings, s.media_in_corsa, s.progeny_earnings_2024
        FROM stallions s
        JOIN stallion_rating_stats srs ON s.name = srs.sire
        WHERE s.stud_fee_eur IS NOT NULL AND s.stud_status = 'active'
        GROUP BY s.name
        ORDER BY srs.avg_score DESC
      `).all() as any[];

      // Filter out inbreeding risk (ancestor in common) + budget
      const candidates = allStallions
        .filter((s: any) => {
          const nameUp = s.name.toUpperCase();
          if (ancestorNames.has(nameUp)) return false; // direct ancestor
          if (budget_max && s.stud_fee_eur > budget_max) return false;
          return true;
        })
        .map((s: any) => ({
          ...s,
          inbreeding_risk: false,
          score_rank: s.avg_score,
        }))
        .slice(0, 15);

      res.json({
        found: true,
        fattrice: horse,
        ancestors: Array.from(ancestorNames),
        budget_max: budget_max || null,
        candidates,
      });
    } finally {
      db.close();
    }
  });
}
