/**
 * Confronto sul prezzo della monta, tutti gli stalloni con prezzo (28/11/2026).
 *
 * Prima la tabella contava solo gli stalloni con almeno 5 figli nati fra il
 * 2012 e il 2021 (59 su 143). Ora ognuno ha la prova che ha:
 *
 *  - "provati": almeno 5 figli nati 2012-2021, carriere quasi complete. Il
 *    conto di sempre (pareggio.valutaIncrocio).
 *  - "giovani": i primi figli sono nati dopo. Stima precoce: quanto hanno
 *    vinto i figli fino ai 3 anni, rispetto ai coetanei (tutti i nati, anche
 *    chi non ha corso). Provato sugli stalloni con figli nati 2013-2018
 *    (archivio del 24/11/2026, 167 stalloni con almeno 10 figli): l'indice ai
 *    3 anni e quanto i figli hanno vinto in carriera rispetto ai coetanei
 *    hanno correlazione 0,685; la retta finale = -0,128 + 1,287 x indice
 *    sbaglia in media di 0,48 volte la media dei coetanei contro 0,75 di chi
 *    da' a tutti la media, e 8 volte su 10 di meno di 0,45 (la forbice).
 *  - "senza": nessun figlio nell'archivio (stalloni esteri o al primo anno):
 *    non valutabile, si mostrano la carriera da atleta e il padre.
 *
 * Gli omonimi ("BRILLANTISSIME (2011)") si risolvono con la tabella omonimi.
 */
import { valutaIncrocio } from "./pareggio";

const INTERCETTA = -0.128, PENDENZA = 1.287, K = 5, FORBICE = 0.45, MIN_FIGLI = 5;
/** Forbice all'80%, dalla stessa prova: l'errore cresce con la stima (stime alte, errori alti). */
const forbice = (rel: number) => rel < 0.7 ? 0.28 : rel < 1.3 ? 0.45 : rel < 2 ? 0.69 : 0.57 * rel;
const PREMIO = "COALESCE(r.prize_calc, r.prize_net, 0)";

let memoBase: { t: number; anno: number; medieCoorte: Map<number, number>; mediaFinale: number } | null = null;
function base(db: any) {
  const anno = new Date().getFullYear();
  if (memoBase && memoBase.anno === anno && Date.now() - memoBase.t < 6 * 3600_000) return memoBase;
  const da = anno - 6, a = anno - 3;
  const nati = new Map<number, number>();
  for (const r of db.prepare(`SELECT birth_year y, COUNT(*) n FROM horses WHERE birth_year BETWEEN ? AND ? AND sire IS NOT NULL AND TRIM(sire) <> '' GROUP BY 1`).all(da, a) as any[]) nati.set(r.y, r.n);
  const medieCoorte = new Map<number, number>();
  for (const r of db.prepare(`SELECT h.birth_year y, SUM(${PREMIO}) p FROM races r JOIN horses h ON h.name = r.horse_name
      WHERE h.birth_year BETWEEN ? AND ? AND h.sire IS NOT NULL AND TRIM(h.sire) <> ''
        AND CAST(substr(r.race_date, 1, 4) AS INTEGER) <= h.birth_year + 3 GROUP BY 1`).all(da, a) as any[])
    if (nati.get(r.y)) medieCoorte.set(r.y, r.p / nati.get(r.y)!);
  const f = db.prepare(`SELECT AVG(COALESCE(hr.career_earnings, 0)) m FROM horses h
      LEFT JOIN horse_ratings hr ON hr.name = h.name AND hr.birth_year = h.birth_year AND hr.rating_mode = 'performance'
      WHERE h.birth_year BETWEEN 2014 AND 2018 AND h.sire IS NOT NULL AND TRIM(h.sire) <> ''`).get() as any;
  memoBase = { t: Date.now(), anno, medieCoorte, mediaFinale: f?.m ?? 0 };
  return memoBase;
}

/** Nome senza spazi, apostrofi e accenti: "PASCIA LEST" del catalogo e' "PASCIA' LEST" nell'archivio. */
const chiave = (s: string) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
let memoPadri: { t: number; m: Map<string, string> } | null = null;
function padriNormalizzati(db: any) {
  if (memoPadri && Date.now() - memoPadri.t < 6 * 3600_000) return memoPadri.m;
  const conta = new Map<string, { nome: string; n: number }>();
  for (const r of db.prepare(`SELECT sire, COUNT(*) n FROM horses WHERE sire IS NOT NULL AND TRIM(sire) <> '' GROUP BY sire`).all() as any[]) {
    const k = chiave(r.sire), c = conta.get(k);
    if (!c || r.n > c.n) conta.set(k, { nome: r.sire, n: r.n });
  }
  memoPadri = { t: Date.now(), m: new Map(Array.from(conta.entries()).map(([k, v]) => [k, v.nome])) };
  return memoPadri.m;
}

function nomeConFigli(db: any, nome: string, haOmonimi: boolean): string {
  const n = (x: string) => (db.prepare(`SELECT COUNT(*) c FROM horses WHERE sire = ?`).get(x) as any).c as number;
  if (n(nome) > 0) return nome;
  if (haOmonimi) for (const o of db.prepare(`SELECT nome_omonimo FROM omonimi WHERE nome = ?`).all(nome) as any[])
    if (n(o.nome_omonimo) > 0) return o.nome_omonimo;
  return padriNormalizzati(db).get(chiave(nome)) ?? nome;
}

export function confrontoMonta(db: any, mensile: number, haOmonimi: boolean) {
  const b = base(db);
  const anni = Array.from(b.medieCoorte.keys());
  const stalloni = db.prepare(`
    SELECT s.name, s.stud_fee_eur fee, s.stud_farm, srs.grade, srs.final_score
      FROM stallions s LEFT JOIN stallion_rating_stats srs ON srs.sire = s.name
     WHERE s.stud_fee_eur > 0`).all() as any[];
  const provati2012 = db.prepare(`SELECT COUNT(*) c FROM horse_ratings WHERE sire = ? AND birth_year BETWEEN 2012 AND 2021 AND COALESCE(horse_class, 'athlete') = 'athlete'`);
  const figliGiovani = db.prepare(`
    SELECT h.name, h.birth_year y, COALESCE(h.career_races, 0) corse,
           (SELECT SUM(${PREMIO}) FROM races r WHERE r.horse_name = h.name AND CAST(substr(r.race_date, 1, 4) AS INTEGER) <= h.birth_year + 3) p
      FROM horses h WHERE h.sire = ? AND h.birth_year BETWEEN ? AND ?`);
  const figliGiovaniLargo = db.prepare(`
    SELECT h.name, h.birth_year y, COALESCE(h.career_races, 0) corse,
           (SELECT SUM(${PREMIO}) FROM races r WHERE r.horse_name = h.name AND CAST(substr(r.race_date, 1, 4) AS INTEGER) <= h.birth_year + 3) p
      FROM horses h WHERE UPPER(TRIM(h.sire)) = UPPER(TRIM(?)) AND h.birth_year BETWEEN ? AND ?`);
  const tuttiFigli = db.prepare(`SELECT COUNT(*) c, MIN(birth_year) primo FROM horses WHERE UPPER(TRIM(sire)) = UPPER(TRIM(?))`);
  const atleta = db.prepare(`SELECT name, birth_year, sire, career_races, career_wins, career_earnings, record_career FROM horses WHERE name = ?`);
  const votoPadre = db.prepare(`SELECT grade FROM stallion_rating_stats WHERE sire = ?`);

  const righe = stalloni.map(s => {
    const nome = nomeConFigli(db, s.name, haOmonimi);
    const comune = { nome: s.name, voto: s.grade ?? null, monta: Math.round(s.fee), allevamento: s.stud_farm ?? null };
    const nProv = (provati2012.get(nome) as any).c as number;
    if (nProv >= MIN_FIGLI) {
      const r = valutaIncrocio(db, nome, null, mensile, Math.round(s.fee)) as any;
      return { ...comune, gruppo: "provati", figli: r.figli_osservati.padre, affidabilita: r.affidabilita,
        utile_atteso: r.utile_atteso, prob_profitto: r.prob_profitto, esito: r.esito,
        guadagno_atteso: r.utile_atteso + r.costo_atteso, costo_atteso: r.costo_atteso, forbice: null };
    }
    const tf = tuttiFigli.get(nome) as any;
    if (anni.length) {
      let fg = figliGiovani.all(nome, Math.min(...anni), Math.max(...anni)) as any[];
      // Il padre scritto in un altro modo (spazi, minuscole): si riprova senza l'indice.
      if (fg.length < MIN_FIGLI) fg = figliGiovaniLargo.all(nome, Math.min(...anni), Math.max(...anni)) as any[];
      if (fg.length >= MIN_FIGLI) {
        const indice = fg.reduce((t, f) => t + (f.p ?? 0) / (b.medieCoorte.get(f.y) || 1), 0) / fg.length;
        const w = fg.length / (fg.length + K);
        const rel = Math.max(0, 1 + w * ((INTERCETTA + PENDENZA * indice) - 1));
        const r = valutaIncrocio(db, nome, null, mensile, Math.round(s.fee)) as any;
        const guadagno = Math.round(rel * b.mediaFinale);
        const costo = r.costo_atteso;
        const utile = guadagno - costo;
        const fb = forbice(rel);
        const basso = Math.round(Math.max(0, rel - fb) * b.mediaFinale), alto = Math.round((rel + fb) * b.mediaFinale);
        return { ...comune, gruppo: "giovani", figli: fg.length, figli_totali: tf?.c ?? fg.length, primo_figlio: tf?.primo ?? null,
          debuttati: fg.filter(f => f.corse > 0).length, indice: Math.round(indice * 100) / 100,
          affidabilita: Math.round(100 * w * 0.5) / 100,
          utile_atteso: utile, prob_profitto: null,
          esito: basso - costo > 0 ? "profitto" : alto - costo < 0 ? "perdita" : "pareggio",
          guadagno_atteso: guadagno, costo_atteso: costo, forbice: [basso, alto] };
      }
    }
    const at = atleta.get(nome) as any;
    return { ...comune, gruppo: "senza", figli: tf?.c ?? 0, primo_figlio: tf?.primo ?? null, affidabilita: 0,
      utile_atteso: null, prob_profitto: null, esito: null, guadagno_atteso: null, costo_atteso: null, forbice: null,
      atleta: at ? { corse: at.career_races, vittorie: at.career_wins, guadagni: at.career_earnings, record: at.record_career, nato: at.birth_year } : null,
      padre: at?.sire ?? null, voto_padre: at?.sire ? ((votoPadre.get(at.sire) as any)?.grade ?? null) : null };
  });
  const conteggi = { provati: 0, giovani: 0, senza: 0 } as Record<string, number>;
  for (const r of righe) conteggi[r.gruppo]++;
  return {
    mensile, stalloni: righe, conteggi, media_figlio_popolazione: Math.round(b.mediaFinale),
    anni_giovani: anni.length ? [Math.min(...anni), Math.max(...anni)] : null,
    prova_giovani: { stalloni: 167, correlazione: 0.685, errore: 0.48, errore_riferimento: 0.75, forbice_80: FORBICE },
    // per controllo: quanti figli giovani ha trovato chi e' rimasto senza conto
    senza_motivo: righe.filter(r => r.gruppo === "senza").map(r => [r.nome, r.figli, (r as any).primo_figlio]),
  };
}
