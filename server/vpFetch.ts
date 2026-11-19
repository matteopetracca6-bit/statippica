/**
 * GENEALOGIA SU RICHIESTA.
 *
 * La pipeline notturna scarica la genealogia di circa milleduecento cavalli a
 * notte: con quasi novemila soggetti in rubrica servirebbero settimane prima
 * che la pagina Pedigree sia completa per tutti.
 *
 * Qui invece, quando qualcuno apre la scheda di un cavallo che non e' ancora
 * stato scaricato, l'albero viene chiesto alla fonte in quel momento e salvato
 * nel database: la prossima volta e' gia' pronto, e il lavoro notturno trova
 * meno da fare.
 *
 * Tre cautele:
 *  - un solo tentativo per cavallo al giorno, annotato in una tabellina, cosi'
 *    un nome che la fonte non conosce non viene richiesto a ogni visita;
 *  - attesa massima di pochi secondi: se la fonte tarda, la pagina esce lo
 *    stesso con i dati dell'archivio corse;
 *  - nessuna scrittura su tabelle dell'archivio corse, solo su quelle della
 *    seconda fonte.
 */

import Database from "better-sqlite3";

const VP_API = process.env.VP_API_BASE || "https://api.vendopuledri.it";
const VP_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://www.vendopuledri.it/",
  Accept: "application/json",
};
const TIMEOUT_MS = 6000;

function clean(v: any): string {
  return String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function isoDate(v: any): string | null {
  const s = String(v ?? "").trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s || null;
}

function ensureAttemptTable(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vp_fetch_attempt (
      horse_name TEXT PRIMARY KEY,
      day        TEXT,
      ok         INTEGER
    )
  `);
}

function tableExists(db: any, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function nameId(db: any, raw: any): number | null {
  const n = clean(raw);
  if (!n) return null;
  const row = db.prepare("SELECT id FROM vp_names WHERE name = ?").get(n) as any;
  if (row) return row.id;
  const r = db.prepare("INSERT INTO vp_names (name) VALUES (?)").run(n);
  return Number(r.lastInsertRowid);
}

/** Codice della fonte per un cavallo: rubrica, poi classifica stalloni. */
function lookupCode(db: any, name: string): string | null {
  if (tableExists(db, "vp_horse_codes")) {
    const r = db.prepare("SELECT vp_code FROM vp_horse_codes WHERE horse_name = ?").get(name) as any;
    if (r?.vp_code) return String(r.vp_code);
  }
  if (tableExists(db, "vendopuledri_stalloni_rankings")) {
    const r = db.prepare(
      "SELECT vp_id FROM vendopuledri_stalloni_rankings WHERE name = ? AND vp_id IS NOT NULL LIMIT 1"
    ).get(name) as any;
    if (r?.vp_id) return String(r.vp_id);
  }
  return null;
}

/**
 * Scarica e salva la genealogia del cavallo se manca. Restituisce true solo
 * quando ha effettivamente aggiunto dati nuovi.
 */
export async function ensureGenealogy(dbPath: string, rawName: string): Promise<boolean> {
  const name = clean(rawName);
  if (!name) return false;

  // Le rotte leggono il database in sola lettura: per salvare serve una
  // connessione a parte, aperta solo per il tempo della scrittura.
  const db: any = new Database(dbPath);
  db.pragma("busy_timeout = 5000");
  try {
    return await run(db, name);
  } catch {
    return false;
  } finally {
    try { db.close(); } catch { /* gia' chiuso */ }
  }
}

async function run(db: any, name: string): Promise<boolean> {
  if (!tableExists(db, "vp_pedigree") || !tableExists(db, "vp_names")) return false;

  // Gia' presente?
  const have = db.prepare(`
    SELECT 1 FROM vp_names n JOIN vp_pedigree p ON p.horse_id = n.id WHERE n.name = ? LIMIT 1
  `).get(name);
  if (have) return false;

  ensureAttemptTable(db);
  const today = new Date().toISOString().slice(0, 10);
  const tried = db.prepare("SELECT day FROM vp_fetch_attempt WHERE horse_name = ?").get(name) as any;
  if (tried?.day === today) return false;
  db.prepare(
    "INSERT INTO vp_fetch_attempt (horse_name, day, ok) VALUES (?,?,0) " +
    "ON CONFLICT(horse_name) DO UPDATE SET day = excluded.day"
  ).run(name, today);

  const code = lookupCode(db, name);
  if (!code) return false;

  let g: any;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const resp = await fetch(`${VP_API}/api/v1/cavalli/genealogia/${code}`, {
      headers: VP_HEADERS, signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return false;
    g = await resp.json();
  } catch {
    return false;
  }
  if (!g || !Array.isArray(g.genealogy) || g.genealogy.length === 0) return false;

  const hid = nameId(db, name);
  if (hid === null) return false;

  const save = db.transaction(() => {
    db.prepare("DELETE FROM vp_pedigree WHERE horse_id = ?").run(hid);
    const insPed = db.prepare(
      "INSERT OR REPLACE INTO vp_pedigree (horse_id, path, ancestor_id) VALUES (?,?,?)"
    );
    for (const a of g.genealogy) {
      const path = String(a?.type ?? "").trim();
      const aid = nameId(db, a?.nome);
      if (!path || aid === null) continue;
      insPed.run(hid, path, aid);
    }

    let closest: number | null = null;
    if (tableExists(db, "vp_inbreeding")) {
      db.prepare("DELETE FROM vp_inbreeding WHERE horse_id = ?").run(hid);
      const insInb = db.prepare(`
        INSERT OR REPLACE INTO vp_inbreeding
          (horse_id, ancestor_id, sire_line, dam_line, closest_gen)
        VALUES (?,?,?,?,?)
      `);
      for (const x of (g.crossings || [])) {
        const aid = nameId(db, x?.name);
        if (aid === null) continue;
        const gens: number[] = [];
        for (const side of [x?.p, x?.m]) {
          for (const part of String(side ?? "").split("+")) {
            const t = part.trim();
            if (/^\d+$/.test(t)) gens.push(parseInt(t, 10));
          }
        }
        const near = gens.length ? Math.min(...gens) : null;
        if (near !== null) closest = closest === null ? near : Math.min(closest, near);
        insInb.run(hid, aid, x?.p ?? null, x?.m ?? null, near);
      }
    }

    if (tableExists(db, "vp_horse_profile")) {
      const c = g.c || {};
      db.prepare(`
        INSERT OR REPLACE INTO vp_horse_profile
          (horse_id, horse_name, vp_code, birth_date, sex, coat, nationality, category,
           record_short, record_long, maternal_gsire, n_ancestors, n_inbreeding,
           closest_cross, last_updated)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        hid, name, String(code), isoDate(c.DataNascita), c.Sesso ?? null,
        c.ColoreMantello ?? null, c.Nazionalita ?? null, c.Categoria ?? null,
        c.TempoCarrieraBreve || null, c.TempoCarrieraLunga || null,
        clean(c.nonnoMaterno) || null,
        g.genealogy.length, (g.crossings || []).length, closest,
        new Date().toISOString()
      );
    }

    if (tableExists(db, "vp_horse_codes")) {
      db.prepare(`
        INSERT INTO vp_horse_codes (horse_name, vp_code, source, last_seen)
        VALUES (?,?,'richiesta',?)
        ON CONFLICT(horse_name) DO UPDATE SET vp_code = excluded.vp_code, last_seen = excluded.last_seen
      `).run(name, String(code), today);
    }

    db.prepare("UPDATE vp_fetch_attempt SET ok = 1 WHERE horse_name = ?").run(name);
  });

  try { save(); } catch { return false; }
  return true;
}
