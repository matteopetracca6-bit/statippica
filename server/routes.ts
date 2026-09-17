import type { Express } from "express";

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
import { predictBreeding, loadBreedingModel, getValidationInfo } from "./breeding";

// DB lives in project root (committed to repo, updated nightly via git push)
const DB_PATH = path.resolve(process.cwd(), "data.db");

// Lock applicativo per il trigger manuale della pipeline nightly:
// impedisce due esecuzioni concorrenti nello stesso processo Node.
let nightlyRunning = false;
let nightlyStartedAt: string | null = null;

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
        SELECT h.name, h.birth_year, h.sire, h.sex, h.country,
               hr.grade, hr.score, hr.rating_mode,
               COALESCE(h.horse_class, 'athlete') AS horse_class
        FROM horses h
        LEFT JOIN horse_ratings hr ON h.name = hr.name AND h.birth_year = hr.birth_year
                                  AND hr.rating_mode = 'performance'
        WHERE h.name LIKE ?
        ORDER BY COALESCE(h.horse_class, 'athlete') = 'breeder', h.birth_year DESC
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
                                  AND hr.rating_mode = 'performance'
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
   // ──────────────────────────────────────────────
  // GET /api/stallion/:name
  // ──────────────────────────────────────────────
  app.get("/api/stallion/:name", (req, res) => {
    const name = decodeURIComponent(req.params.name).toUpperCase();
    const db = getDb();
    try {
      // Stats aggregate (may be null for stallions without offspring data yet)
      const stats = db.prepare(`
        SELECT * FROM stallion_rating_stats
        WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?))
      `).get(name) as any;

      // From stallions table (stud fee, farm, status, etc.)
      const stud = db.prepare(`
        SELECT name, stud_fee_eur, stud_farm, stud_status, progeny_earnings_2024,
               media_in_corsa, tot_prod, tot_in_corsa, perc_in_corsa,
               tot_vitt, perc_vitt, country
        FROM stallions
        WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))
        ORDER BY stud_fee_eur DESC
        LIMIT 1
      `).get(name) as any;

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
        LEFT JOIN horses s ON UPPER(TRIM(s.name)) = UPPER(TRIM(h.sire)) AND h.sire IS NOT NULL AND h.sire != ''
        LEFT JOIN horses d ON UPPER(TRIM(d.name)) = UPPER(TRIM(h.dam)) AND h.dam IS NOT NULL AND h.dam != ''
        WHERE h.name = ?
        LIMIT 1
      `).get(name) as any;

      const spRow = db.prepare(`
        SELECT * FROM stallion_pedigree
        WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))
        LIMIT 1
      `).get(name) as any;

      const pedigree = (horseSelf && (horseSelf.sire || horseSelf.unire_sire)) ? {
        sire: horseSelf.sire || horseSelf.unire_sire || null,
        dam: horseSelf.dam || horseSelf.unire_dam || null,
        sire_sire: horseSelf.sire_sire || horseSelf.sire_unire_sire || null,
        sire_dam: horseSelf.sire_dam || horseSelf.sire_unire_dam || null,
        dam_sire: horseSelf.dam_sire || horseSelf.dam_unire_sire || null,
        dam_dam: horseSelf.dam_dam || horseSelf.dam_unire_dam || null,
      } : spRow ? {
        sire: spRow.sire || null,
        dam: spRow.dam || null,
        sire_sire: spRow.sire_sire || null,
        sire_dam: spRow.sire_dam || null,
        dam_sire: spRow.dam_sire || null,
        dam_dam: spRow.dam_dam || null,
      } : null;

      // Nationality: prefer stallion_pedigree, fallback to stallions.country, then horses.country
      const natFromHorses = db.prepare(`
        SELECT h.country
        FROM horses h
        WHERE h.name = ?
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
        } : null,
        // Children, distribution, pedigree
        children,
        gradeDist,
        pedigree,
        nationality,
        // Flag utili
        no_offspring_data,
        has_offspring_data: !!stats,
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
    const offset = (page - 1) * limit;
    const sortBy = req.query.sort as string || "score";

    // hr.* qualificato: la query principale fa JOIN con horses, e un
    // horse_class nudo sarebbe ambiguo (errore SQLite visto in test).
    const conditions: string[] = ["hr.rating_mode = ?", ONLY_ATHLETES];
    const params: any[] = [mode];

    if (year) { conditions.push("hr.birth_year = ?"); params.push(year); }
    if (grade) { conditions.push("hr.grade = ?"); params.push(grade); }
    if (sire) { conditions.push("hr.sire LIKE ?"); params.push(`%${sire}%`); }

    const where = conditions.join(" AND ");
    const sortCol = sortBy === "earnings" ? "career_earnings" : "score";

    const db = getDb();
    try {
      const total = (db.prepare(`SELECT COUNT(*) as cnt FROM horse_ratings hr WHERE ${where}`)
        .get(...params) as any).cnt;

      const rows = db.prepare(`
        SELECT hr.name, hr.birth_year, hr.sire, hr.grade, hr.score, hr.earn_percentile, hr.time_percentile,
               hr.sire_percentile, hr.career_races, hr.career_wins, hr.career_earnings, hr.record_career, hr.win_rate,
               h.country
        FROM horse_ratings hr
        LEFT JOIN horses h ON h.name = hr.name AND h.birth_year = hr.birth_year
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
        WHERE birth_year IS NOT NULL AND COALESCE(horse_class, 'athlete') = 'athlete'
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
    const db = getDb();
    try {
      const getHorse = (name: string, year?: string) => {
        const row = year
          ? (db.prepare(`SELECT hr.*, h.country FROM horse_ratings hr LEFT JOIN horses h ON h.name = hr.name AND h.birth_year = hr.birth_year WHERE hr.name = ? AND hr.birth_year = ? LIMIT 1`).get(name, parseInt(year)) as any)
          : (db.prepare(`SELECT hr.*, h.country FROM horse_ratings hr LEFT JOIN horses h ON h.name = hr.name AND h.birth_year = hr.birth_year WHERE hr.name = ? ORDER BY hr.birth_year DESC LIMIT 1`).get(name) as any);
        if (!row) return null;
        const ped = db.prepare(`
          SELECT h.sire, h.dam,
            s.sire AS sire_sire, s.dam AS sire_dam,
            d.sire AS dam_sire, d.dam AS dam_dam
          FROM horses h
          LEFT JOIN horses s ON UPPER(TRIM(s.name)) = UPPER(TRIM(h.sire))
          LEFT JOIN horses d ON UPPER(TRIM(d.name)) = UPPER(TRIM(h.dam))
          LEFT JOIN stallion_pedigree sp ON sp.name = h.name
          WHERE UPPER(TRIM(h.name)) = ? AND h.birth_year = ?
          LIMIT 1
        `).get(row.name, row.birth_year) as any;
        return { ...row, pedigree: ped || null };
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
  app.get("/api/mares", (req, res) => {
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

      // I figli si leggono comunque, anche senza riga di rating: una fattrice
      // appena citata deve avere una scheda, non un 404.
      const offspring = db.prepare(`
        SELECT h.name, h.birth_year, h.sex, h.sire,
               hr.grade, hr.score, hr.career_races, hr.career_wins,
               hr.career_earnings, hr.record_career
        FROM horses h
        LEFT JOIN horse_ratings hr ON hr.name = h.name AND hr.birth_year = h.birth_year
                                   AND hr.rating_mode = 'performance'
        WHERE UPPER(TRIM(h.dam)) = ?
        ORDER BY hr.score IS NULL, hr.score DESC, h.birth_year DESC
      `).all(name) as any[];

      if (!stats && offspring.length === 0) {
        return res.status(404).json({ message: "Fattrice non trovata" });
      }

      const own = db.prepare(`
        SELECT name, birth_year, sire, dam, country,
               career_races, career_wins, career_earnings, record_career,
               COALESCE(horse_class, 'athlete') AS horse_class
        FROM horses WHERE UPPER(TRIM(name)) = ? LIMIT 1
      `).get(name) as any;

      res.json({ dam: stats?.dam || name, stats: stats || null, own: own || null, offspring });
    } finally {
      db.close();
    }
  });

  app.get("/api/search/mare", (req, res) => {
    const q = (req.query.q as string || "").trim().toUpperCase();
    if (q.length < 2) return res.json([]);
    const db = getDb();
    try {
      const rows = db.prepare(`
        SELECT dam, grade, final_score, n_valutati
        FROM dam_rating_stats WHERE UPPER(dam) LIKE ?
        ORDER BY final_score DESC LIMIT 20
      `).all(`%${q}%`);
      res.json(rows);
    } finally {
      db.close();
    }
  });

  // ── Lista stalloni per dropdown ──────────────────────────────────────────
  app.get("/api/stallions", (_req, res) => {
    const db = getDb();
    try {
      const rows = db.prepare(`
        SELECT s.name, s.stud_fee_eur, s.stud_farm, s.stud_status,
               s.country, s.season, s.fee_source,
               sr.avg_score, sr.final_score, sr.grade,
               sr.n_figli_totali, sr.n_in_corsa, sr.pct_top_S, sr.vp_boost,
               COALESCE(s.country, sp.nationality) AS nationality
        FROM stallions s
        LEFT JOIN stallion_rating_stats sr ON UPPER(TRIM(sr.sire)) = UPPER(TRIM(s.name))
        LEFT JOIN stallion_pedigree sp ON UPPER(TRIM(sp.name)) = UPPER(TRIM(s.name))
        ORDER BY COALESCE(sr.final_score, sr.avg_score, 0) DESC
      `).all() as any[];
      res.json(rows);
    } finally {
      db.close();
    }
  });

  app.get("/api/stats", (_req, res) => {
    const db = getDb();
    try {
      // Conta solo gli atleti: i riproduttori non sono soggetti del sito.
      const totalHorses = (db.prepare(
        "SELECT COUNT(*) as c FROM horses WHERE COALESCE(horse_class, 'athlete') = 'athlete'"
      ).get() as any).c;
      const totalBreeders = (db.prepare(
        "SELECT COUNT(*) as c FROM horses WHERE horse_class = 'breeder'"
      ).get() as any).c;
      const totalRaces = (db.prepare("SELECT COUNT(*) as c FROM races").get() as any).c;
      const totalStallions = (db.prepare("SELECT COUNT(DISTINCT sire) as c FROM stallion_rating_stats").get() as any).c;
      const gradeDist = db.prepare(`
        SELECT grade, COUNT(*) as cnt FROM horse_ratings
        WHERE rating_mode = 'performance' AND COALESCE(horse_class, 'athlete') = 'athlete'
        GROUP BY grade ORDER BY cnt DESC
      `).all() as any[];
      const topByYear = db.prepare(`
        SELECT birth_year, name, grade, score, career_earnings
        FROM horse_ratings
        WHERE rating_mode = 'performance' AND COALESCE(horse_class, 'athlete') = 'athlete'
        GROUP BY birth_year
        HAVING score = MAX(score)
        ORDER BY birth_year DESC
        LIMIT 5
      `).all() as any[];
      res.json({ totalHorses, totalRaces, totalStallions, totalBreeders, gradeDist, topByYear });
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
  app.get("/api/stud-farms", (_req, res) => {
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
                 s.stud_fee_eur, COALESCE(s.country, sp.nationality) AS nationality
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
  app.get("/api/trends", (_req, res) => {
    const db = getDb();
    try {
      // Grade distribution by birth year (last 15 years)
      const gradeByYear = db.prepare(`
        SELECT birth_year, grade, COUNT(*) as cnt
        FROM horse_ratings
        WHERE rating_mode = 'performance'
          AND grade IS NOT NULL
          AND birth_year >= 2010
        GROUP BY birth_year, grade
        ORDER BY birth_year ASC
      `).all() as any[];

      // Avg earnings by birth year
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
        ORDER BY birth_year ASC
      `).all() as any[];

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

      res.json({ gradeByYear, earningsByYear, racesPerYear, topTracks });
    } finally { db.close(); }
  });

  // ──────────────────────────────────────────────
  // GET /api/top-races — migliori gare di sempre
  // ──────────────────────────────────────────────
  app.get("/api/top-races", (req, res) => {
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

  // ──────────────────────────────────────────────
  // GET /api/pedigree/:name — albero genealogico 4 generazioni + inbreeding
  // ──────────────────────────────────────────────
  app.get("/api/pedigree/:name", (req, res) => {
    const name = decodeURIComponent(req.params.name).toUpperCase().trim();
    const db = getDb();
    try {
      // Build pedigree tree recursively (4 generations)
      function getHorse(n: string): any {
        if (!n) return null;
        const h = db.prepare(`
          SELECT name, birth_year, sire, dam, sex, country, career_earnings, career_wins, career_races
          FROM horses WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) LIMIT 1
        `).get(n) as any;
        if (!h) return { name: n, birth_year: null, sire: null, dam: null, missing: true };
        return h;
      }

      function buildTree(n: string, depth: number): any {
        if (depth > 4 || !n) return null;
        const h = getHorse(n);
        if (!h) return null;
        return {
          name: h.name,
          birth_year: h.birth_year,
          sex: h.sex,
          country: h.country,
          career_earnings: h.career_earnings,
          career_wins: h.career_wins,
          career_races: h.career_races,
          sire: h.sire ? buildTree(h.sire, depth + 1) : null,
          dam: h.dam ? buildTree(h.dam, depth + 1) : null,
          missing: h.missing || false,
        };
      }

      const tree = buildTree(name, 0);
      if (!tree) {
        return res.status(404).json({ error: "Cavallo non trovato" });
      }

      // Compute inbreeding coefficient (Wright's formula)
      // Walk sire side and dam side separately, collecting ancestors with generation depth
      const sireAncestors = new Map<string, number>(); // name -> min generation on sire side
      const damAncestors = new Map<string, number>();

      function walkSire(node: any, gen: number) {
        if (!node || !node.name || node.missing || gen > 4) return;
        const key = node.name.toUpperCase();
        const existing = sireAncestors.get(key);
        if (existing === undefined || gen < existing) sireAncestors.set(key, gen);
        if (node.sire) walkSire(node.sire, gen + 1);
        if (node.dam) walkSire(node.dam, gen + 1);
      }
      function walkDam(node: any, gen: number) {
        if (!node || !node.name || node.missing || gen > 4) return;
        const key = node.name.toUpperCase();
        const existing = damAncestors.get(key);
        if (existing === undefined || gen < existing) damAncestors.set(key, gen);
        if (node.sire) walkDam(node.sire, gen + 1);
        if (node.dam) walkDam(node.dam, gen + 1);
      }

      // Start from the sire and dam of the subject horse
      if (tree.sire) walkSire(tree.sire, 1);
      if (tree.dam) walkDam(tree.dam, 1);

      // Find common ancestors on both sides
      const commonAncestors: { name: string; contribution: number; sire_gen: number; dam_gen: number }[] = [];
      for (const [name, sireGen] of sireAncestors) {
        const damGen = damAncestors.get(name);
        if (damGen !== undefined) {
          // Wright's formula: contribution = (1/2)^(sireGen + damGen - 1) * (1 + F_ancestor)
          // Simplified: assume F_ancestor = 0 (no recursive inbreeding)
          const contribution = Math.pow(0.5, sireGen + damGen - 1);
          commonAncestors.push({ name, contribution, sire_gen: sireGen, dam_gen: damGen });
        }
      }
      commonAncestors.sort((a, b) => b.contribution - a.contribution);

      // Inbreeding coefficient = sum of contributions
      const inbreedingCoeff = commonAncestors.reduce((sum, a) => sum + a.contribution, 0);

      // Get rating if available
      const rating = db.prepare(`
        SELECT grade, score, career_earnings, career_races, career_wins, win_rate
        FROM horse_ratings WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) AND rating_mode = 'performance' LIMIT 1
      `).get(name) as any;

      res.json({
        horse: tree,
        rating: rating || null,
        inbreeding_coefficient: Math.round(inbreedingCoeff * 1000) / 10,
        common_ancestors: commonAncestors.slice(0, 10),
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
      const studFee = studRow?.stud_fee_eur ?? 0;
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

      res.json({
        stallion,
        mare,
        mareData: mareData || null,
        stud_fee: studFee,
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
        inbreeding: {
          risk: inbreedingRisk,
          ancestor: inbreedingAncestor,
        },
      });
    } finally { db.close(); }
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
  // BREEDING — stima accoppiamento stallone x fattrice
  // Il modello (breeding_model.json) è addestrato offline da
  // train_breeding_model.py via GitHub Actions; qui si fa solo inferenza.
  // ──────────────────────────────────────────────
  const breedingModelLoaded = loadBreedingModel(
    path.resolve(process.cwd(), "breeding_model.json")
  );
  if (!breedingModelLoaded) {
    console.warn("[BREEDING] breeding_model.json non trovato: /api/breeding/* risponderà 503 " +
                  "finché non viene generato da train_breeding_model.py");
  }

  // GET /api/breeding/predict?stallion=NOME&mare=NOME
  app.get("/api/breeding/predict", (req, res) => {
    const stallion = ((req.query.stallion as string) || "").trim();
    const mare = ((req.query.mare as string) || "").trim();
    if (!stallion || !mare) {
      return res.status(400).json({ ok: false, error: "Parametri richiesti: stallion, mare" });
    }
    const db = getDb();
    try {
      const result = predictBreeding(db, stallion, mare);
      if (!result.ok) {
        // 503 se manca il modello, 404 se mancano i dati del cavallo
        const missingModel = (result.error || "").includes("breeding_model.json");
        return res.status(missingModel ? 503 : 404).json(result);
      }
      res.json(result);
    } catch (e: any) {
      console.error("[BREEDING] errore predizione:", e?.message);
      res.status(500).json({ ok: false, error: "Errore interno nella predizione" });
    } finally {
      db.close();
    }
  });

  // GET /api/breeding/info — stato del modello (per la UI)
  app.get("/api/breeding/info", (_req, res) => {
    try {
      const modelPath = path.resolve(process.cwd(), "breeding_model.json");
      const fs = require("fs");
      if (!fs.existsSync(modelPath)) {
        return res.status(503).json({ available: false, error: "Modello non ancora generato" });
      }
      const m = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
      const v = getValidationInfo(m);
      res.json({
        available: true,
        trained_at: m.trained_at,
        n_samples: m.n_samples,
        cv_r2_score: m.cv_r2_score,
        cv_auc_poor: m.cv_auc_poor,
        feature_importances: m.feature_importances,
        validation_status: v.validation_status,
        is_decision_support_ready: v.is_decision_support_ready,
        validation_criteria: v.validation_criteria,
        methodology_notice: v.methodology_notice,
      });
    } catch (e: any) {
      res.status(500).json({ available: false, error: e?.message });
    }
  });

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

        // Sort by win estimate descending
        entries.sort((a, b) => (b.win_estimate || 0) - (a.win_estimate || 0));

        return {
          track: ev.track,
          race_date: ev.race_date,
          race_time: ev.race_time,
          n_runners: entries.length,
          entries,
        };
      }).filter(ev => ev.n_runners > 0);

      res.json({ races: result, total: result.length });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    } finally {
      db.close();
    }
  });
}
