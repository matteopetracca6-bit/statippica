// ─────────────────────────────────────────────────────────────────────────────
// L'ALBERO DEGLI STALLONI PER GENERAZIONE (novembre 2026)
//
// Il voto di uno stallone si basa sui figli che hanno corso negli anni
// dell'archivio (dal 2016 circa). Uno stallone di una generazione vecchia,
// come COKTAIL JET, ha pochi figli in quegli anni e quindi un voto basso,
// anche se non era uno stallone scarso. Qui ogni stallone viene messo nella
// sua generazione, in base agli anni in cui sono nati i suoi figli:
//
//   papa'      in monta nella stagione di adesso o in quella che viene
//              (catalogo), anche con il solo seme congelato dopo la morte;
//   nonni      la generazione prima;
//   bisnonni   quella prima ancora, e cosi' via.
//
// La "generazione" si misura con l'anno centrale dei figli (meta' dei figli
// nati prima, meta' dopo) e la distanza fra un padre e un figlio stallone,
// misurata sull'archivio (di solito 8-9 anni). Dentro ogni generazione gli
// stalloni si confrontano solo fra loro.
//
// Periodo di attivita' in monta: l'anno di nascita del primo figlio meno uno
// fino all'anno di nascita dell'ultimo meno uno (la monta e' l'anno prima
// della nascita). Per chi e' in monta adesso il periodo arriva a oggi.
// ─────────────────────────────────────────────────────────────────────────────
import type Database from "better-sqlite3";

// Stalloni morti di cui il catalogo non lo dice ancora. Se restano nel
// catalogo della stagione, la monta avviene con il seme congelato.
export const MORTI_NOTI: Record<string, { data: string; fonte: string; url: string }> = {
  VARENNE: {
    data: "2026-08-18", fonte: "ANSA",
    url: "https://www.ansa.it/sito/notizie/sport/2026/08/18/e-morto-varenne-leggenda-del-trotto_afc60a9c-6bb3-4dd0-af76-654f2f714a80.html",
  },
};

// Stati del catalogo che vogliono dire "si puo' prenotare la monta".
const STATI_IN_MONTA = new Set(["active", "da_concordare", "free"]);
// Sotto questo numero di figli in archivio la generazione non e' affidabile.
export const MIN_FIGLI_ALBERO = 10;
// I figli nati da questo anno in poi hanno corso negli anni dell'archivio
// (dal 2016 circa, a 3-4 anni): sono quelli su cui si basa il voto.
export const ANNO_INIZIO_VOTO = 2012;

export const NOMI_GENERAZIONE = ["Papà", "Nonni", "Bisnonni", "Trisnonni", "Antenati"];

export interface StalloneAlbero {
  nome: string;
  nato: number | null;
  padre: string | null;
  figli: number;
  primo_figlio: number | null;
  ultimo_figlio: number | null;
  anno_punta: number | null;       // l'anno con piu' figli nati
  anno_centrale: number | null;
  monta_dal: number | null;
  monta_al: number | null;         // null = ancora oggi
  in_monta: boolean;               // nel catalogo della stagione
  fuori_catalogo_recente: boolean; // non nel catalogo italiano, ma figli nati da poco
  morto: { data: string | null; fonte: string | null; url: string | null } | null;
  seme_congelato: boolean;
  stagione: string | null;
  generazione: number;             // 0 = papa', 1 = nonni, ...
  voto: string | null;
  punteggio: number | null;
  figli_valutati: number;
  posto_generazione: number | null;
  su_generazione: number | null;
  per_anno: { anno: number; n: number }[];
  nell_albero: boolean;
  // Il voto conta solo i figli che hanno corso negli anni dell'archivio.
  // Se gran parte dei figli e' nata prima del 2012, il voto non dice quanto
  // valeva lo stallone: lo si segnala invece di nasconderlo.
  voto_confrontabile: boolean;
}

export interface Albero {
  anno_riferimento: number;
  stagione: string | null;
  distanza_generazione: number;
  centrale_papa: number;
  generazioni: { indice: number; nome: string; da: number | null; a: number | null; stalloni: number }[];
  stalloni: StalloneAlbero[];
}

let cache: { chiave: string; albero: Albero } | null = null;

const mediana = (v: number[]) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const haTabella = (db: Database.Database, t: string) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const pulisci = (s: unknown) => (s == null ? "" : String(s).trim().toUpperCase());

export function alberoStalloni(db: Database.Database, chiaveCache: string): Albero {
  if (cache && cache.chiave === chiaveCache) return cache.albero;

  // 1. I figli in archivio, per padre e anno di nascita.
  const perPadre = new Map<string, Map<number, number>>();
  for (const r of db.prepare(`
    SELECT UPPER(TRIM(sire)) AS p, birth_year AS y, COUNT(*) AS n FROM horses
    WHERE sire IS NOT NULL AND TRIM(sire) <> '' AND birth_year > 1900
    GROUP BY 1, 2`).all() as any[]) {
    if (!perPadre.has(r.p)) perPadre.set(r.p, new Map());
    perPadre.get(r.p)!.set(r.y, r.n);
  }
  // Figli isolati molto prima degli altri (BOLD EAGLE con un figlio "nato" nel
  // 2003 e i successivi dal 2017) sono omonimi o errori: si tolgono, altrimenti
  // il periodo in monta partirebbe da un anno impossibile.
  perPadre.forEach(m => {
    let tot = 0; m.forEach(n => (tot += n));
    for (;;) {
      const anni = Array.from(m.keys()).sort((a, b) => a - b);
      if (anni.length < 2) break;
      const [a0, a1] = anni;
      if (a1 - a0 >= 3 && (m.get(a0) ?? 0) <= Math.max(2, tot * 0.02)) m.delete(a0); else break;
    }
  });
  const annoRif = (db.prepare("SELECT MAX(birth_year) AS y FROM horses").get() as any)?.y ?? new Date().getFullYear();

  // 2. Il catalogo: chi e' in monta nella stagione piu' recente.
  const catalogo = new Map<string, any>();
  let stagione: string | null = null;
  if (haTabella(db, "stallions")) {
    const righe = db.prepare(`SELECT name, stud_status, season, catalog_birth_year, catalog_sire, catalog_notes FROM stallions`).all() as any[];
    // La stagione piu' recente: "2026" o "2025-2026" valgono come 2026.
    const fine = (s: string | null) => { const m = String(s ?? "").match(/(\d{4})\s*$/); return m ? Number(m[1]) : 0; };
    const ultima = Math.max(0, ...righe.map(r => fine(r.season)));
    stagione = ultima ? String(ultima) : null;
    for (const r of righe) catalogo.set(pulisci(r.name), { ...r, stagione_ok: ultima > 0 && fine(r.season) === ultima });
  }

  // 3. Anno di nascita e padre dello stallone (catalogo, poi archivio, poi seconda fonte).
  // Ci sono omonimi (IDEALE LUIS stallone e un IDEALE LUIS nato nel 2014):
  // vale solo un cavallo nato almeno 3 anni prima del primo figlio, il piu'
  // vicino a quella data.
  const nascita = new Map<string, { y: number | null; padre: string | null }>();
  const primoFiglio = (n: string) => { const m = perPadre.get(n); return m ? Math.min(...Array.from(m.keys())) : null; };
  for (const r of db.prepare(`SELECT UPPER(TRIM(name)) AS n, birth_year AS y, UPPER(TRIM(sire)) AS s FROM horses`).all() as any[]) {
    if (!perPadre.has(r.n)) continue;
    const pf = primoFiglio(r.n);
    if (r.y && pf != null && r.y > pf - 3) continue;
    const prima = nascita.get(r.n);
    if (!prima || (r.y && (!prima.y || r.y > prima.y))) nascita.set(r.n, { y: r.y || null, padre: r.s || null });
  }
  const profilo = new Map<string, number>();
  if (haTabella(db, "vp_horse_profile")) {
    for (const r of db.prepare(`SELECT UPPER(TRIM(horse_name)) AS n, birth_date AS d FROM vp_horse_profile`).all() as any[]) {
      const y = Number(String(r.d ?? "").slice(0, 4));
      if (y > 1900) profilo.set(r.n, y);
    }
  }
  const pedigree = new Map<string, string>();
  if (haTabella(db, "stallion_pedigree")) {
    for (const r of db.prepare(`SELECT UPPER(TRIM(name)) AS n, UPPER(TRIM(sire)) AS s FROM stallion_pedigree`).all() as any[]) {
      if (r.s) pedigree.set(r.n, r.s);
    }
  }
  const voti = new Map<string, any>();
  if (haTabella(db, "stallion_rating_stats")) {
    for (const r of db.prepare(`SELECT UPPER(TRIM(sire)) AS n, grade, final_score, n_figli_totali FROM stallion_rating_stats`).all() as any[]) voti.set(r.n, r);
  }

  // 4. Una scheda per ogni stallone con abbastanza figli, o in monta adesso.
  const nomi = new Set<string>();
  // Nella pagina dello stallone servono anche quelli con pochi figli; l'albero
  // mostra solo chi ne ha almeno MIN_FIGLI_ALBERO (campo nell_albero).
  perPadre.forEach((m, p) => { let t = 0; m.forEach(n => (t += n)); if (t >= 1) nomi.add(p); });
  catalogo.forEach((c, n) => { if (c.stagione_ok && STATI_IN_MONTA.has(c.stud_status) && perPadre.has(n)) nomi.add(n); });

  const schede: StalloneAlbero[] = [];
  for (const nome of Array.from(nomi)) {
    const m = perPadre.get(nome) ?? new Map<number, number>();
    const anni: number[] = [];
    const per_anno: { anno: number; n: number }[] = [];
    Array.from(m.entries()).sort((a, b) => a[0] - b[0]).forEach(([y, n]) => { per_anno.push({ anno: y, n }); for (let i = 0; i < n; i++) anni.push(y); });
    const figli = anni.length;
    const primo = figli ? anni[0] : null, ultimo = figli ? anni[anni.length - 1] : null;
    let punta: number | null = null, maxN = -1;
    per_anno.forEach(a => { if (a.n >= maxN) { maxN = a.n; punta = a.anno; } });
    const cat = catalogo.get(nome);
    const notaMorte = MORTI_NOTI[nome];
    const morto = notaMorte
      ? { data: notaMorte.data, fonte: notaMorte.fonte, url: notaMorte.url }
      : cat?.stud_status === "deceased" ? { data: null, fonte: "catalogo di monta", url: null } : null;
    // Deceduto ma ancora nel catalogo della stagione (come VARENNE o READY
    // CASH): resta fra gli stalloni in monta, e nell'albero ha il fiocco di neve.
    const inMonta = !!(cat?.stagione_ok && (STATI_IN_MONTA.has(cat.stud_status) || (morto && cat.stud_status === "deceased")));
    const congelato = inMonta && !!morto;
    // Senza catalogo italiano: se i figli piu' giovani sono nati negli ultimi
    // due anni dell'archivio, lo stallone probabilmente e' ancora in monta
    // (spesso all'estero). Lo si mette con i papa', con una nota.
    const recente = !inMonta && !morto && ultimo != null && ultimo >= annoRif - 1;
    const n = nascita.get(nome);
    // Anno di nascita: catalogo, archivio, seconda fonte. Vale il primo che sia
    // almeno 3 anni prima del primo figlio (il catalogo a volte sbaglia: per
    // IDEALE LUIS scrive 2014, ma i suoi figli nascono dal 2010).
    const plausibile = (y: unknown) => { const v = Number(y); return v > 1900 && (primo == null || v <= primo - 3) ? v : null; };
    const nato = plausibile(cat?.catalog_birth_year) ?? plausibile(n?.y) ?? plausibile(profilo.get(nome)) ?? null;
    const v = voti.get(nome);
    schede.push({
      nome, nato,
      padre: pulisci(cat?.catalog_sire) || n?.padre || pedigree.get(nome) || null,
      figli, primo_figlio: primo, ultimo_figlio: ultimo, anno_punta: punta,
      anno_centrale: figli ? Math.round(mediana(anni)) : null,
      monta_dal: primo != null ? primo - 1 : null,
      monta_al: inMonta || recente ? null : (ultimo != null ? ultimo - 1 : null),
      in_monta: inMonta, fuori_catalogo_recente: recente,
      morto, seme_congelato: congelato, stagione: inMonta ? stagione : null,
      generazione: 0,
      voto: v?.grade ?? null, punteggio: v?.final_score ?? null, figli_valutati: v?.n_figli_totali ?? 0,
      posto_generazione: null, su_generazione: null,
      per_anno,
      nell_albero: figli >= MIN_FIGLI_ALBERO || inMonta,
      voto_confrontabile: (v?.n_figli_totali ?? 0) >= 30 && figli > 0 && anni.filter(y => y >= ANNO_INIZIO_VOTO).length / figli >= 0.5,
    });
  }

  // 5. La distanza fra due generazioni, misurata sull'archivio: anno centrale
  //    dei figli di un padre e di suo figlio stallone.
  const perNome = new Map(schede.map(s => [s.nome, s]));
  const salti: number[] = [];
  for (const s of schede) {
    const p = s.padre ? perNome.get(s.padre) : null;
    if (p && s.nell_albero && p.nell_albero && p.anno_centrale != null && s.anno_centrale != null && s.figli >= 20 && p.figli >= 20) salti.push(s.anno_centrale - p.anno_centrale);
  }
  const L = Math.min(12, Math.max(7, Math.round(mediana(salti.filter(x => x > 0)) || 9)));
  const papa = schede.filter(s => s.nell_albero && (s.in_monta || s.fuori_catalogo_recente));
  const centralePapa = Math.round(mediana(papa.map(s => s.anno_centrale!).filter(x => x != null)) || annoRif - 5);
  for (const s of schede) {
    if (s.in_monta || s.fuori_catalogo_recente) { s.generazione = 0; continue; }
    const k = Math.round((centralePapa - (s.anno_centrale ?? centralePapa)) / L);
    s.generazione = Math.min(NOMI_GENERAZIONE.length - 1, Math.max(1, k));
  }

  // 6. Il posto nella propria generazione, per punteggio stallone. Solo chi
  //    ha un voto confrontabile (abbastanza figli negli anni dell'archivio).
  for (let g = 0; g < NOMI_GENERAZIONE.length; g++) {
    const elenco = schede.filter(s => s.nell_albero && s.generazione === g && s.punteggio != null && s.voto_confrontabile)
      .sort((a, b) => (b.punteggio! - a.punteggio!));
    elenco.forEach((s, i) => { s.posto_generazione = i + 1; s.su_generazione = elenco.length; });
  }

  schede.sort((a, b) => a.generazione - b.generazione || b.figli - a.figli);
  const generazioni = NOMI_GENERAZIONE.map((nome, indice) => {
    const qui = schede.filter(s => s.nell_albero && s.generazione === indice && s.anno_centrale != null);
    return {
      indice, nome,
      da: qui.length ? Math.min(...qui.map(s => s.anno_centrale!)) : null,
      a: qui.length ? Math.max(...qui.map(s => s.anno_centrale!)) : null,
      stalloni: schede.filter(s => s.nell_albero && s.generazione === indice).length,
    };
  });
  const albero: Albero = { anno_riferimento: annoRif, stagione, distanza_generazione: L, centrale_papa: centralePapa, generazioni, stalloni: schede };
  cache = { chiave: chiaveCache, albero };
  return albero;
}

// Le informazioni di un solo stallone (per la sua pagina). Se ha meno figli
// della soglia dell'albero, si calcolano lo stesso nascita e periodo.
export function attivitaStallone(db: Database.Database, chiaveCache: string, nome: string): (StalloneAlbero & { nome_generazione: string | null }) | null {
  const a = alberoStalloni(db, chiaveCache);
  const s = a.stalloni.find(x => x.nome === pulisci(nome));
  if (s) return { ...s, nome_generazione: NOMI_GENERAZIONE[s.generazione] ?? null };
  return null;
}
