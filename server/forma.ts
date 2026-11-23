/**
 * Forma di guidatori e allenatori (23/11/2026), per le loro schede.
 *
 *  - ultimi 30 giorni: corse, vittorie, primi tre, premi, confrontati con il
 *    suo ritmo degli ultimi 12 mesi (in forma / nella media / sotto);
 *  - le piste dove rende di piu' rispetto al suo solito (ultimi 24 mesi);
 *  - con i favoriti del pubblico: quante volte il suo cavallo partiva con la
 *    quota piu' bassa e quanto ha vinto, contro la media di tutti i favoriti;
 *    e le vittorie rispetto a quelle che il pubblico si aspettava (somma delle
 *    probabilita' implicite nelle quote finali del totalizzatore).
 * Le quote ci sono dal 2025: il confronto con il pubblico conta solo da li'.
 */
import type Database from "better-sqlite3";

const nomeQuota = (n: string) => String(n || "").toUpperCase().replace(/\s*[-(]\s*([A-Z]{1,3})\s*[-)]\s*$/, " $1").replace(/[^A-Z0-9]/g, "");

interface Mercato { versione: number; quote: Map<string, { quota: number; posto: number; p: number }>; fav: { n: number; v: number; t3: number } }
let MERCATO: Mercato | null = null;

/** Quote finali di tutte le corse, con il posto nel mercato e la probabilita' implicita. */
function mercato(db: Database.Database, versione: number): Mercato {
  if (MERCATO && MERCATO.versione === versione) return MERCATO;
  const quote = new Map<string, { quota: number; posto: number; p: number }>();
  const gruppi = new Map<string, { k: string; q: number }[]>();
  for (const r of db.prepare(`SELECT race_date, pista, corsa, horse_name, quota FROM quote_totalizzatore WHERE quota > 0`).all() as any[]) {
    const g = `${r.race_date}|${r.pista}|${r.corsa}`;
    if (!gruppi.has(g)) gruppi.set(g, []);
    gruppi.get(g)!.push({ k: `${g}|${nomeQuota(r.horse_name)}`, q: r.quota });
  }
  gruppi.forEach(v => {
    if (v.length < 4) return;
    const s = v.reduce((a, x) => a + 1 / x.q, 0);
    v.sort((a, b) => a.q - b.q).forEach((x, i) => quote.set(x.k, { quota: x.q, posto: i + 1, p: (1 / x.q) / s }));
  });
  // Come vanno in generale i favoriti del pubblico (per il confronto).
  const fav = { n: 0, v: 0, t3: 0 };
  const righe = db.prepare(`SELECT race_date, track, race_code, race_number, horse_name, placement FROM races
                             WHERE race_date >= '2025-01-01' AND race_code IS NOT NULL AND track <> 'ESTERO'`).all() as any[];
  for (const r of righe) {
    const nc = numeroCorsa(r); if (nc == null) continue;
    const q = quote.get(`${r.race_date}|${r.track}|${nc}|${nomeQuota(r.horse_name)}`);
    if (q?.posto === 1) { fav.n++; if (r.placement === 1) fav.v++; if (r.placement != null && r.placement <= 3) fav.t3++; }
  }
  MERCATO = { versione, quote, fav };
  return MERCATO;
}

// Il numero della corsa: fino a giugno 2026 il codice e' solo la sigla della
// pista ("RO") e il numero sta in race_number; da luglio il codice e'
// "2026-11-20_FI_R1". Leggendo solo il codice si perdevano le corse 2025-26
// con le quote (23/11/2026).
function numeroCorsa(r: any): number | null {
  const m = String(r.race_code ?? "").match(/_R?(\d+)$/);
  if (m) return Number(m[1]);
  return r.race_number != null && Number.isFinite(Number(r.race_number)) ? Number(r.race_number) : null;
}

const pct = (a: number, b: number) => (b ? Math.round(1000 * a / b) / 10 : null);

export function formaPersona(db: Database.Database, colonna: "driver" | "trainer", nome: string, versione: number) {
  const corse = db.prepare(`
    SELECT race_date, track, race_code, race_number, horse_name, placement, placement_raw, COALESCE(prize_net, 0) premio
      FROM races WHERE ${colonna} = ? AND race_date >= date('now', '-24 months') AND race_date < date('now')
     ORDER BY race_date DESC`).all(nome) as any[];
  if (!corse.length) return null;
  const oggi = Date.now();
  const giorni = (d: string) => (oggi - Date.parse(d)) / 86400000;
  const conta = (rr: any[]) => ({
    corse: rr.length,
    vittorie: rr.filter(r => r.placement === 1).length,
    primi_tre: rr.filter(r => r.placement != null && r.placement <= 3).length,
    premi: Math.round(rr.reduce((a, r) => a + r.premio, 0)),
  });
  const u30 = conta(corse.filter(r => giorni(r.race_date) <= 30));
  const u365 = conta(corse.filter(r => giorni(r.race_date) <= 365));
  const p30 = pct(u30.vittorie, u30.corse), p365 = pct(u365.vittorie, u365.corse);
  // In forma se negli ultimi 30 giorni vince almeno un quarto piu' del suo
  // solito, sotto se un quarto meno; con meno di 15 corse non si dice.
  let tendenza: "in_forma" | "media" | "sotto" | null = null;
  if (u30.corse >= 15 && p30 != null && p365 != null && p365 > 0) {
    tendenza = p30 >= p365 * 1.25 ? "in_forma" : p30 <= p365 * 0.75 ? "sotto" : "media";
  }
  const ultime = corse.slice(0, 12).map(r => ({
    data: r.race_date, pista: r.track, cavallo: r.horse_name,
    esito: r.placement != null ? String(r.placement) : String(r.placement_raw ?? "").trim() || "—",
  }));

  // Piste: rendimento nei primi tre rispetto al suo solito (ultimi 24 mesi).
  const tot = conta(corse);
  const base = pct(tot.primi_tre, tot.corse) ?? 0;
  const perPista = new Map<string, any[]>();
  for (const r of corse) { if (r.track === "ESTERO") continue; if (!perPista.has(r.track)) perPista.set(r.track, []); perPista.get(r.track)!.push(r); }
  const piste = Array.from(perPista.entries()).map(([pista, rr]) => {
    const c = conta(rr);
    return { pista, ...c, pct_vittorie: pct(c.vittorie, c.corse), pct_primi_tre: pct(c.primi_tre, c.corse),
             scarto: Math.round(((pct(c.primi_tre, c.corse) ?? 0) - base) * 10) / 10 };
  }).filter(p => p.corse >= 15).sort((a, b) => b.scarto - a.scarto);

  // Con il pubblico (quote finali, dal 2025).
  let favoriti: any = null;
  if (db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='quote_totalizzatore'`).get()) {
    const M = mercato(db, versione);
    let n = 0, vinte = 0, attese = 0, fn = 0, fv = 0, ft3 = 0, sorprese = 0;
    for (const r of corse) {
      const nc = numeroCorsa(r); if (nc == null) continue;
      const q = M.quote.get(`${r.race_date}|${r.track}|${nc}|${nomeQuota(r.horse_name)}`);
      if (!q) continue;
      n++; attese += q.p; if (r.placement === 1) { vinte++; if (q.quota >= 10) sorprese++; }
      if (q.posto === 1) { fn++; if (r.placement === 1) fv++; if (r.placement != null && r.placement <= 3) ft3++; }
    }
    if (n >= 20) favoriti = {
      corse_con_quota: n, vittorie: vinte, vittorie_attese: Math.round(attese * 10) / 10,
      rispetto_al_pubblico: Math.round((vinte - attese) * 10) / 10,
      favorito: { corse: fn, vittorie: fv, primi_tre: ft3, pct_vittorie: pct(fv, fn), pct_primi_tre: pct(ft3, fn) },
      tutti_i_favoriti: { pct_vittorie: pct(M.fav.v, M.fav.n), pct_primi_tre: pct(M.fav.t3, M.fav.n) },
      vittorie_a_quota_alta: sorprese,
    };
  }
  return { ultimi_30: { ...u30, pct_vittorie: p30 }, ultimi_12_mesi: { ...u365, pct_vittorie: p365 }, tendenza, ultime,
           piste_migliori: piste.slice(0, 3), piste_peggiori: piste.slice(-2).reverse().filter(p => p.scarto < 0 && piste.length > 4),
           base_primi_tre: base, favoriti };
}
