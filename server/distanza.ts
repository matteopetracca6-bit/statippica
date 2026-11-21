/**
 * Km su gara corta e su gara lunga (21/11/2026).
 *
 * I conti si fanno di notte in scripts/record_distanza.py (tabelle
 * record_distanza, piste_velocita, stalloni_distanza, distanza_soglie): qui si
 * leggono. Corta = fino a 1700 metri, lunga = da 2000 metri. Il "km
 * corretto" e' il tempo riportato a una pista media, a parita' di cavallo; il
 * tipo di partenza (autostart o nastri) l'archivio non lo dice.
 */
import type Database from "better-sqlite3";

const tabella = (db: Database.Database, n: string) =>
  !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(n);

function soglie(db: Database.Database) {
  if (!tabella(db, "distanza_soglie")) return null;
  const m = Object.fromEntries((db.prepare(`SELECT nome, valore FROM distanza_soglie`).all() as any[]).map(r => [r.nome, r.valore]));
  return { q1: m.q1 ?? null, mediana: m.mediana ?? null, q3: m.q3 ?? null, cavalli: m.cavalli ?? null };
}

/** I due km di un cavallo; senza gare nostre, il record della fonte (vendopuledri). */
export function distanzaCavallo(db: Database.Database, nome: string, recordFonte: { corto?: string | null; lungo?: string | null }) {
  const r = tabella(db, "record_distanza")
    ? db.prepare(`SELECT * FROM record_distanza WHERE horse_name = ?`).get(nome) as any : null;
  const parte = (p: "corto" | "lungo") => {
    if (r && r[`${p}_km`] != null) {
      return {
        km: r[`${p}_km`], data: r[`${p}_data`], pista: r[`${p}_pista`], distanza: r[`${p}_dist`],
        piazzamento: r[`${p}_pos`], gare: r[`${p}_n`],
        corretto: r[`${p}_corr`], corretto_data: r[`${p}_corr_data`], corretto_pista: r[`${p}_corr_pista`],
        fonte: "gare" as const,
      };
    }
    const f = recordFonte[p];
    return f ? { km_testo: f, fonte: "vendopuledri" as const } : null;
  };
  const corto = parte("corto"), lungo = parte("lungo");
  if (!corto && !lungo) return null;
  return { corto, lungo, differenza: r?.differenza ?? null, profilo: r?.profilo ?? null, soglie: soglie(db) };
}

/** Profilo dei figli di uno stallone. */
export function distanzaStallone(db: Database.Database, nome: string) {
  if (!tabella(db, "stalloni_distanza")) return null;
  const r = db.prepare(`SELECT * FROM stalloni_distanza WHERE sire = ?`).get(nome) as any;
  if (!r) return null;
  return { figli: r.figli, corto: r.figli_corto, lungo: r.figli_lungo, entrambi: r.figli_entrambi,
           differenza_media: r.differenza_media, profilo: r.profilo, soglie: soglie(db) };
}

/** Profilo dei figli per tutti gli stalloni (Advisor). */
export function profiliStalloni(db: Database.Database): Map<string, { profilo: string | null; figli: number; differenza_media: number }> {
  const m = new Map();
  if (!tabella(db, "stalloni_distanza")) return m;
  for (const r of db.prepare(`SELECT sire, profilo, figli, differenza_media FROM stalloni_distanza`).all() as any[])
    m.set(String(r.sire).toUpperCase(), { profilo: r.profilo, figli: r.figli, differenza_media: r.differenza_media });
  return m;
}

/** Velocita' delle piste (negativa = pista veloce). */
export function velocitaPiste(db: Database.Database) {
  if (!tabella(db, "piste_velocita")) return [];
  return db.prepare(`SELECT pista, classe, scarto, gare FROM piste_velocita ORDER BY classe, scarto`).all();
}
