/**
 * LINEA MATERNA (novembre 2026).
 *
 * La "famiglia" di un cavallo dal lato della madre: la madre (1a madre), la
 * nonna materna (2a madre) e la bisnonna (3a madre), ognuna con tutti i figli
 * che conosciamo e, per ogni figlio, voto, vincite e record. Serve a vedere a
 * colpo d'occhio se una famiglia produce cavalli che corrono e vincono.
 *
 * L'idea viene da VendoPuledri, ma il calcolo e' nostro: i nomi delle madri
 * vengono dall'archivio cavalli (e, dove manca un anello, dalla genealogia a
 * cinque generazioni gia' raccolta), i figli e i loro numeri dall'archivio
 * corse e dai voti di StatIppica.
 *
 * Nella genealogia raccolta il percorso si legge da destra: "m" e' la madre,
 * "mm" la madre della madre, "mmm" la bisnonna.
 */
import type Database from "better-sqlite3";

export interface FiglioLinea {
  nome: string; nato: number | null; sesso: string | null; padre: string | null;
  corse: number; vittorie: number; vincite: number; record: string | null; voto: string | null;
  /** E' il cavallo da cui scende la linea (la figlia che diventa la madre successiva, o il cavallo stesso). */
  linea: boolean;
}
export interface MadreLinea {
  livello: number; etichetta: string; nome: string;
  nata: number | null; padre: string | null; voto_fattrice: string | null;
  sue_corse: number | null; sue_vincite: number | null;
  figli: FiglioLinea[];
  riassunto: { figli: number; corsi: number; vincite: number; vittorie: number; di_vertice: number; migliore: string | null };
}

const VERTICE = new Set(["S", "SS", "SSS"]);
const ETICHETTE = ["1ª madre", "2ª madre", "3ª madre"];
const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();

function damDi(db: Database.Database, nome: string): string | null {
  const r = db.prepare("SELECT dam FROM horses WHERE name = ? LIMIT 1").get(nome) as { dam: string | null } | undefined;
  const d = norm(r?.dam);
  return d || null;
}

/** Madri dalla genealogia raccolta: percorsi "m", "mm", "mmm" del cavallo. */
function madriDaGenealogia(db: Database.Database, nome: string): Record<string, string> {
  try {
    const rows = db.prepare(`
      SELECT g.path, n.name FROM vp_horse_profile p
      JOIN vp_pedigree g ON g.horse_id = p.horse_id
      JOIN vp_names n ON n.id = g.ancestor_id
      WHERE p.horse_name = ? AND g.path IN ('m', 'mm', 'mmm')`).all(nome) as { path: string; name: string }[];
    return Object.fromEntries(rows.map(r => [r.path, norm(r.name)]));
  } catch {
    return {}; // archivio senza le tabelle della genealogia
  }
}

/**
 * Figli di una madre, dentro una finestra di anni. Un solo cavallo per nome
 * in archivio: se due cavalle si chiamano uguale (GENNY JET del 2022 e una
 * GENNY JET piu' anziana), i figli nati prima che la giovane avesse due anni
 * sono dell'altra.
 */
function figliDi(db: Database.Database, madre: string, natiDal: number | null = null, natiPrima: number | null = null): Omit<FiglioLinea, "linea">[] {
  return (db.prepare(`
    SELECT h.name nome, h.birth_year nato, NULLIF(h.sex, '') sesso, h.sire padre,
           COALESCE(h.career_races, 0) corse, COALESCE(h.career_wins, 0) vittorie,
           COALESCE(h.career_earnings, 0) vincite, h.record_career record,
           (SELECT hr.grade FROM horse_ratings hr WHERE hr.name = h.name AND hr.birth_year = h.birth_year
              AND hr.rating_mode IN ('performance', 'storico')
            ORDER BY hr.rating_mode = 'performance' DESC LIMIT 1) voto
    FROM horses h
    WHERE h.dam = ?
      -- stesso cavallo registrato con e senza sigla del paese: si tiene quello con le corse
      AND NOT (COALESCE(h.career_races, 0) = 0 AND EXISTS (
            SELECT 1 FROM horses t
            WHERE t.birth_year = h.birth_year AND t.dam = h.dam AND t.name <> h.name
              AND substr(t.name, 1, length(h.name) + 2) = h.name || ' ('))
    ORDER BY h.birth_year, h.name`).all(madre) as Omit<FiglioLinea, "linea">[])
    .filter(f => f.nato == null
      || ((natiDal == null || f.nato >= natiDal) && (natiPrima == null || f.nato < natiPrima)));
}

const annoDi = (db: Database.Database, nome: string): number | null =>
  (db.prepare("SELECT birth_year FROM horses WHERE name = ? LIMIT 1").get(nome) as any)?.birth_year ?? null;

export function lineaMaterna(db: Database.Database, nomeCavallo: string): { cavallo: string; madri: MadreLinea[] } {
  const cavallo = norm(nomeCavallo);
  const gen = madriDaGenealogia(db, cavallo);
  const catena: string[] = [];
  // Per ogni madre: e' l'omonima piu' anziana di un cavallo dell'archivio?
  // Allora la riga in archivio non e' sua e i suoi dati non si usano.
  const omonime: boolean[] = [];
  const anniOmonima: (number | null)[] = [];
  let corrente = cavallo;
  let annoGiu = annoDi(db, cavallo);
  let rigaValida = true;
  for (let i = 0; i < 3; i++) {
    const m = (rigaValida ? damDi(db, corrente) : null) ?? gen["m".repeat(i + 1)] ?? null;
    if (!m || catena.includes(m) || m === cavallo) break;
    const annoM = annoDi(db, m);
    const omonima = annoGiu != null && annoM != null && annoM > annoGiu - 2;
    catena.push(m);
    omonime.push(omonima);
    anniOmonima.push(omonima ? annoM : null);
    rigaValida = !omonima;
    annoGiu = omonima ? null : annoM;
    corrente = m;
  }

  const madri: MadreLinea[] = catena.map((nome, i) => {
    const omonima = omonime[i];
    const annoRiga = annoDi(db, nome);
    const figli = (omonima
      ? figliDi(db, nome, null, anniOmonima[i]! + 2)
      : figliDi(db, nome, annoRiga != null ? annoRiga + 2 : null, null)).map(f => ({
      ...f, vincite: Math.round(f.vincite || 0),
      linea: norm(f.nome) === (i === 0 ? cavallo : catena[i - 1]),
    }));
    // Il cavallo da cui scende la linea a volte non e' fra i figli (madre
    // scritta in modo diverso): lo si aggiunge, cosi' la catena resta leggibile.
    const giu = i === 0 ? cavallo : catena[i - 1];
    if (!figli.some(f => f.linea)) {
      const h = db.prepare(`SELECT name nome, birth_year nato, NULLIF(sex, '') sesso, sire padre,
          COALESCE(career_races, 0) corse, COALESCE(career_wins, 0) vittorie, COALESCE(career_earnings, 0) vincite,
          record_career record FROM horses WHERE name = ? LIMIT 1`).get(giu) as any;
      figli.push(h ? { ...h, vincite: Math.round(h.vincite || 0), voto: null, linea: true }
        : { nome: giu, nato: null, sesso: null, padre: null, corse: 0, vittorie: 0, vincite: 0, record: null, voto: null, linea: true });
      figli.sort((a, b) => (a.nato ?? 0) - (b.nato ?? 0));
    }
    const propria = omonima ? null
      : db.prepare(`SELECT birth_year, sire, career_races, career_earnings FROM horses WHERE name = ? LIMIT 1`).get(nome) as any;
    const stats = omonima ? null
      : db.prepare(`SELECT grade, own_races, own_earnings FROM dam_rating_stats WHERE dam = ?`).get(nome) as any;
    const corsi = figli.filter(f => f.corse > 0);
    const migliore = corsi.reduce<FiglioLinea | null>((b, f) => (!b || f.vincite > b.vincite ? f : b), null);
    return {
      livello: i + 1, etichetta: ETICHETTE[i], nome,
      nata: propria?.birth_year ?? null, padre: propria?.sire ? norm(propria.sire) : null,
      voto_fattrice: stats?.grade ?? null,
      sue_corse: stats?.own_races ?? propria?.career_races ?? null,
      sue_vincite: stats?.own_earnings ?? propria?.career_earnings ?? null,
      figli,
      riassunto: {
        figli: figli.length, corsi: corsi.length,
        vincite: corsi.reduce((s, f) => s + f.vincite, 0),
        vittorie: corsi.reduce((s, f) => s + f.vittorie, 0),
        di_vertice: figli.filter(f => f.voto && VERTICE.has(f.voto)).length,
        migliore: migliore && migliore.vincite > 0 ? migliore.nome : null,
      },
    };
  });
  return { cavallo, madri };
}
