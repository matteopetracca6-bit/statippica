/**
 * Motore del simulatore della corsa (21/11/2026).
 *
 * Una corsa al trotto su una pista a stadio (due rettilinei e due curve, corda
 * a sinistra), un passo ogni frazione di secondo. Ogni cavallo ha:
 *  - un tempo al km atteso per questa corsa (le sue ultime corse su distanze
 *    simili, piu' un po' di caso, piu' l'effetto del guidatore);
 *  - un profilo di corsa: partenza, andatura, finale con lo spunto (quanto il
 *    suo tempo migliore e' sotto quello solito) e la tenuta (record sul lungo
 *    rispetto al corto, sulle distanze lunghe);
 *  - una corsia: alla corda si fa la strada piu' corta, in seconda e in terza
 *    ruota in curva si fanno metri in piu'; chi e' chiuso dietro uno piu' lento
 *    esce se c'e' spazio, altrimenti aspetta;
 *  - un rischio di rottura (il modello del calendario): piu' alto in partenza
 *    e nel finale. Chi rompe perde terreno; alla seconda rottura, o se resta
 *    al galoppo, o se rompe negli ultimi 200 metri, e' squalificato.
 * Nastri: chi ha la penalita' parte indietro di quei metri, da fermo.
 * Autostart: si parte lanciati, dalla seconda fila chi ha il numero dopo l'8.
 */

export interface CavalloDati {
  nome: string; numero: number | null; penalita: number; guidatore: string | null;
  km_base: number | null; km_migliore: number | null; record_corto: number | null; record_lungo: number | null;
  galoppo: number; effetto_guidatore: number | null; corse_note: number;
  /** Vittorie con questo numero su questa pista rispetto alla media dei numeri in corsa (1 = nella media). */
  vantaggio_numero?: number | null;
  /** Quota finale del totalizzatore, se c'e' (per "pesa il mercato"). */
  quota?: number | null;
  /** Il pronostico XGBoost: probabilita' di arrivare nei primi tre, in % (per "pesa il pronostico"). */
  pronostico_top3?: number | null;
}
export interface CorsaDati {
  distanza: number; partenza: "autostart" | "nastri"; lunghezza_pista: number; km_pista: number;
  cavalli: CavalloDati[];
}

export type Stato = "corre" | "galoppo" | "squalificato" | "arrivato";
export interface Corridore {
  i: number; s: number; v: number; corsia: number; corsiaMeta: number; stato: Stato;
  rotture: number; finoGaloppo: number; tempo: number | null; chiuso: boolean;
  vMedia: number; mMezzo: number; mFinale: number; rischioMetro: number;
  squalificaAlle: number | null;
}
export interface Simulazione {
  t: number; corridori: Corridore[]; finita: boolean; corsa: CorsaDati;
  arrivo: number[];          // indici in ordine d'arrivo
  rnd: () => number;
}

/**
 * Parametri tarati sulle corse vere (vedi TARATURA in fondo): si possono
 * cambiare per le prove, la pagina usa questi.
 */
export const PARAMETRI = {
  ritmo: 1.3,        // secondi al km aggiunti a tutti: cosi' il vincitore simulato va come quello vero
  incertezza: 1.8,   // quanto caso sul tempo al km di ogni corsa (piu' caso = previsioni meno sicure di se', e piu' giuste)
  numero: 5,         // metri guadagnati o persi alla partenza per ogni punto di ln(vantaggio del numero): conta poco
  galoppo: 1.03,     // probabilita' di rompere = rischio di squalifica x questo (squalifiche simulate = vere)
  spunto: 0.7,       // peso dello spunto nel finale
};

export const LARGHEZZA_CORSIA = 1.4;   // metri fra una ruota e l'altra
const ACCELERAZIONE = 2.2;             // m/s2 da fermo, ai nastri

/** Generatore ripetibile: stessa semina, stessa corsa. */
export function semina(seme: number) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normale(rnd: () => number) {
  const u = Math.max(1e-9, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Geometria della pista: raggio delle curve e dove stanno. */
export function geometria(lunghezza: number) {
  const curve = 0.46 * lunghezza;                 // le due curve insieme
  const raggio = curve / (2 * Math.PI);
  const rettilineo = (lunghezza - curve) / 2;
  // Il traguardo e' sul rettilineo d'arrivo, a 3/4 della sua lunghezza.
  const traguardoSulRett = 0.75 * rettilineo;
  return { lunghezza, raggio, rettilineo, traguardoSulRett };
}
/** u = metri dal traguardo in avanti, lungo la corda. In curva? */
export function inCurva(u: number, g: ReturnType<typeof geometria>) {
  const x = ((u % g.lunghezza) + g.lunghezza) % g.lunghezza;
  const fineRett = g.rettilineo - g.traguardoSulRett;          // resto del rettilineo d'arrivo
  const semi = Math.PI * g.raggio;
  if (x < fineRett) return false;
  if (x < fineRett + semi) return true;
  if (x < fineRett + semi + g.rettilineo) return false;
  if (x < fineRett + 2 * semi + g.rettilineo) return true;
  return false;
}

export function nuovaSimulazione(corsa: CorsaDati, seme: number): Simulazione {
  const rnd = semina(seme);
  const D = corsa.distanza;
  const kmDefault = corsa.km_pista + 1.5;
  const ordinati = corsa.cavalli.map((c, i) => ({ c, i })).sort((a, b) => (a.c.numero ?? 99) - (b.c.numero ?? 99));
  const corridori: Corridore[] = corsa.cavalli.map((c, i) => {
    const base = c.km_base ?? kmDefault;
    // Poche corse note: piu' incertezza.
    const incertezza = c.corse_note >= 4 ? 0.9 : c.corse_note >= 1 ? 1.3 : 1.8;
    const eff = Math.max(-0.3, Math.min(0.3, (c.effetto_guidatore ?? 0) * 1.5));
    const km = base + PARAMETRI.ritmo + normale(rnd) * incertezza * PARAMETRI.incertezza + eff;
    const vMedia = 1000 / km;
    const spunto = Math.max(0, Math.min(3, base - (c.km_migliore ?? base)));
    let mFinale = 1.03 + PARAMETRI.spunto * spunto / base;
    if (c.record_corto && c.record_lungo) {
      const diff = c.record_lungo - c.record_corto;      // >0: va meglio sul corto
      if (D >= 2000) mFinale -= Math.max(0, Math.min(0.04, (diff - 1) * 0.012));
      if (D <= 1700) mFinale -= Math.max(0, Math.min(0.03, -diff * 0.01));
    }
    const fPart = corsa.partenza === "nastri" ? 0.95 : 0.98;
    const mMezzo = 0.68 / Math.max(0.3, 1 - 0.12 / fPart - 0.2 / mFinale);
    // Rischio di rottura: il totale della corsa diviso sui metri, con piu'
    // peso in partenza (300 m, x3) e nel finale (400 m, x1,5).
    const pRompe = Math.min(0.9, (c.galoppo ?? 0.15) * PARAMETRI.galoppo);
    const lambda = -Math.log(1 - pRompe);
    const pesoTot = Math.min(300, D) * 3 + Math.min(400, D) * 1.5 + Math.max(0, D - 700);
    return {
      i, s: -(c.penalita || 0), v: 0, corsia: 0, corsiaMeta: 0, stato: "corre", rotture: 0, finoGaloppo: 0,
      tempo: null, chiuso: false, vMedia, mMezzo, mFinale, rischioMetro: lambda / pesoTot, squalificaAlle: null,
    };
  });
  // Schieramento.
  if (corsa.partenza === "autostart") {
    ordinati.forEach(({ i }, k) => {
      const fila = k < 8 ? 0 : 1, posto = fila ? k - 8 : k;
      corridori[i].corsia = corridori[i].corsiaMeta = posto;
      corridori[i].s = fila ? -5 : 0;
      corridori[i].v = corridori[i].vMedia * 0.97;
    });
  } else {
    const perPenalita = new Map<number, number>();
    ordinati.forEach(({ c, i }) => {
      const k = perPenalita.get(c.penalita) ?? 0;
      perPenalita.set(c.penalita, k + 1);
      corridori[i].corsia = corridori[i].corsiaMeta = k % 7;
      corridori[i].s -= Math.floor(k / 7) * 4;
      corridori[i].v = 0;
    });
  }
  // Il numero di partenza, dai dati della pista: metri di vantaggio o di svantaggio.
  if (PARAMETRI.numero) corsa.cavalli.forEach((c, i) => {
    const v = c.vantaggio_numero && c.vantaggio_numero > 0 ? c.vantaggio_numero : 1;
    corridori[i].s += PARAMETRI.numero * Math.log(v);
  });
  return { t: 0, corridori, finita: false, corsa, arrivo: [], rnd };
}

function velocitaVoluta(c: Corridore, D: number, partenza: string) {
  const f = Math.max(0, c.s) / D;
  let m = f < 0.12 ? (partenza === "nastri" ? 0.95 : 0.98) : f < 0.8 ? c.mMezzo : c.mFinale;
  if (f >= 0.8 && f < 0.85) m = c.mMezzo + (c.mFinale - c.mMezzo) * (f - 0.8) / 0.05;   // si lancia
  return c.vMedia * m;
}

/** Avanza la corsa di dt secondi. */
export function passo(sim: Simulazione, dt: number, g = geometria(sim.corsa.lunghezza_pista)) {
  if (sim.finita) return;
  const { corsa, rnd } = sim;
  const D = corsa.distanza;
  const inizio = ((-D % g.lunghezza) + g.lunghezza) % g.lunghezza;   // u della partenza
  const attivi = sim.corridori.filter(c => c.stato === "corre" || c.stato === "galoppo");
  // Dal primo all'ultimo: chi e' davanti decide per primo.
  attivi.sort((a, b) => b.s - a.s);
  for (const c of attivi) {
    let voluta = velocitaVoluta(c, D, corsa.partenza);
    if (c.stato === "galoppo") voluta *= 0.55;
    // Chi ha davanti, nella stessa corsia.
    c.chiuso = false;
    if (c.stato === "corre") {
      const davanti = attivi.filter(o => o !== c && Math.abs(o.corsia - c.corsia) < 0.6 && o.s > c.s && o.s - c.s < 3.2)
                            .sort((a, b) => a.s - b.s)[0];
      if (davanti && voluta > davanti.v) {
        const fuori = Math.round(c.corsiaMeta) + 1;
        const libera = fuori <= 3 && !attivi.some(o => o !== c && Math.abs(o.corsia - fuori) < 0.7 && o.s > c.s - 4 && o.s < c.s + 3);
        if (libera && c.s > 50) c.corsiaMeta = fuori;
        else { voluta = Math.min(voluta, davanti.v); c.chiuso = true; }
      } else if (c.corsiaMeta > 0) {
        // Rientra verso la corda se c'e' posto e nessuno gli e' attaccato dentro.
        const dentro = Math.round(c.corsiaMeta) - 1;
        const libero = !attivi.some(o => o !== c && Math.abs(o.corsia - dentro) < 0.7 && o.s > c.s - 2.5 && o.s < c.s + 3.5);
        if (libero) c.corsiaMeta = dentro;
      }
    }
    // Accelerazione: dal passo verso la velocita' voluta.
    const acc = c.v < voluta ? ACCELERAZIONE : -3.5;
    c.v = acc > 0 ? Math.min(voluta, c.v + acc * dt) : Math.max(voluta, c.v + acc * dt);
    // Cambio di corsia graduale.
    const dc = c.corsiaMeta - c.corsia;
    c.corsia += Math.sign(dc) * Math.min(Math.abs(dc), 0.6 * dt);
    // In curva fuori dalla corda la strada e' piu' lunga.
    const u = inizio + c.s;
    const fattore = inCurva(u, g) && c.s > 0 ? g.raggio / (g.raggio + c.corsia * LARGHEZZA_CORSIA) : 1;
    const prima = c.s;
    c.s += c.v * dt * fattore;
    // Rotture.
    if (c.stato === "corre" && c.s > 0) {
      const peso = c.s < 300 ? 3 : c.s > D - 400 ? 1.5 : 1;
      if (rnd() < c.rischioMetro * peso * (c.s - Math.max(0, prima))) {
        c.rotture++;
        if (c.rotture >= 2 || c.s > D - 200) { c.stato = "squalificato"; c.squalificaAlle = c.s; }
        else { c.stato = "galoppo"; c.finoGaloppo = 2.5 + rnd() * 2.5; c.corsiaMeta = Math.min(3, Math.round(c.corsiaMeta) + 1); }
      }
    } else if (c.stato === "galoppo") {
      c.finoGaloppo -= dt;
      if (c.finoGaloppo <= 0) {
        if (rnd() < 0.7) { c.stato = "squalificato"; c.squalificaAlle = c.s; }   // rottura prolungata
        else c.stato = "corre";
      }
    }
    if (c.s >= D && (c.stato === "corre" || c.stato === "galoppo")) {
      const oltre = c.s - D;
      c.tempo = sim.t + dt - oltre / Math.max(1, c.v * fattore);
      c.stato = "arrivato";
      sim.arrivo.push(c.i);
    }
  }
  // Gli squalificati si allargano e rallentano fino a fermarsi.
  for (const c of sim.corridori) if (c.stato === "squalificato") {
    c.v = Math.max(0, c.v - 2.5 * dt); c.s += c.v * dt; c.corsiaMeta = 4; c.corsia += Math.min(4 - c.corsia, 0.8 * dt);
  }
  sim.t += dt;
  if (!sim.corridori.some(c => c.stato === "corre" || c.stato === "galoppo")) {
    sim.arrivo.sort((a, b) => (sim.corridori[a].tempo ?? 1e9) - (sim.corridori[b].tempo ?? 1e9));
    sim.finita = true;
  }
}

/** Corsa intera senza disegno. */
export function corriTutta(corsa: CorsaDati, seme: number) {
  const sim = nuovaSimulazione(corsa, seme);
  const g = geometria(corsa.lunghezza_pista);
  while (!sim.finita && sim.t < 900) passo(sim, 0.2, g);
  return sim;
}

export interface Riepilogo {
  corse: number;
  perCavallo: { vittorie: number; top3: number; squalifiche: number; posizioneMedia: number; kmMedio: number | null }[];
}
/** Mille corse a pezzi, per non bloccare la pagina: avanzamento da 0 a 1. */
export function simulaMolte(corsa: CorsaDati, n: number, seme: number, avanzamento: (f: number) => void): Promise<Riepilogo> {
  const conta = corsa.cavalli.map(() => ({ vittorie: 0, top3: 0, squalifiche: 0, somma: 0, arrivi: 0, kmSomma: 0 }));
  return new Promise(resolve => {
    let fatte = 0;
    const blocco = () => {
      const fine = Math.min(n, fatte + 40);
      for (; fatte < fine; fatte++) {
        const sim = corriTutta(corsa, seme + fatte * 7919);
        sim.arrivo.forEach((idx, pos) => {
          const k = conta[idx]; k.somma += pos + 1; k.arrivi++;
          if (pos === 0) k.vittorie++;
          if (pos < 3) k.top3++;
          const t = sim.corridori[idx].tempo;
          if (t) k.kmSomma += t / (corsa.distanza + corsa.cavalli[idx].penalita) * 1000;
        });
        sim.corridori.forEach(c => { if (c.stato === "squalificato") conta[c.i].squalifiche++; });
      }
      avanzamento(fatte / n);
      if (fatte < n) setTimeout(blocco, 0);
      else resolve({
        corse: n,
        perCavallo: conta.map(k => ({
          vittorie: k.vittorie / n, top3: k.top3 / n, squalifiche: k.squalifiche / n,
          posizioneMedia: k.arrivi ? k.somma / k.arrivi : 0, kmMedio: k.arrivi ? k.kmSomma / k.arrivi : null,
        })),
      });
    };
    blocco();
  });
}

/**
 * "Pesa il mercato": quando ci sono le quote del totalizzatore, il tempo al
 * km di ogni cavallo si sposta finche' le vittorie simulate si avvicinano a
 * quelle che il pubblico dava (1/quota, normalizzato). peso 0 = solo i nostri
 * dati, 1 = tutto il mercato. Restituisce una copia della corsa.
 */
export function pesaMercato(corsa: CorsaDati, peso: number, giri = 3, prove = 160): CorsaDati {
  const quote = corsa.cavalli.map(c => c.quota ?? null);
  if (peso <= 0 || quote.some(q => !q || q <= 1)) return corsa;
  const inv = quote.map(q => 1 / q!), tot = inv.reduce((a, b) => a + b, 0);
  const pMercato = inv.map(x => x / tot);
  const kmDefault = corsa.km_pista + 1.5;
  let attuale: CorsaDati = { ...corsa, cavalli: corsa.cavalli.map(c => ({ ...c, km_base: c.km_base ?? kmDefault })) };
  for (let g = 0; g < giri; g++) {
    const vinte = new Array(corsa.cavalli.length).fill(0.5);
    for (let s = 0; s < prove; s++) { const sim = corriTutta(attuale, 99 + g * 1000 + s * 7919); if (sim.arrivo.length) vinte[sim.arrivo[0]]++; }
    const tv = vinte.reduce((a, b) => a + b, 0);
    attuale = { ...attuale, cavalli: attuale.cavalli.map((c, i) => ({
      ...c, km_base: c.km_base! + peso * 0.45 * (Math.log(vinte[i] / tv) - Math.log(pMercato[i])),
    })) };
  }
  return attuale;
}

/**
 * "Pesa il pronostico XGBoost" (24/11/2026): il tempo al km di ogni cavallo si
 * sposta finche' la quota di corse in cui arriva nei primi tre si avvicina a
 * quella del pronostico (il modello XGBoost del calendario, provato sulle corse
 * vere). La fisica della corsa resta la stessa: cambia quanto va forte ogni
 * cavallo. Cosi' simulatore e pronostico non si contraddicono piu', e le
 * vittorie, i distacchi e le squalifiche vengono dal simulatore. Chi non ha il
 * pronostico resta com'e'. Restituisce una copia della corsa.
 */
export function pesaPronostico(corsa: CorsaDati, giri = 4, prove = 150): CorsaDati {
  const n = corsa.cavalli.length;
  const t = corsa.cavalli.map(c => c.pronostico_top3 != null ? Math.min(0.97, Math.max(0.02, c.pronostico_top3 / 100)) : null);
  if (n < 4 || t.filter(x => x != null).length < Math.ceil(0.75 * n)) return corsa;
  const kmDefault = corsa.km_pista + 1.5;
  const logit = (p: number) => Math.log(p / (1 - p));
  let attuale: CorsaDati = { ...corsa, cavalli: corsa.cavalli.map(c => ({ ...c, km_base: c.km_base ?? kmDefault })) };
  for (let g = 0; g < giri; g++) {
    const top3 = new Array(n).fill(0);
    for (let s = 0; s < prove; s++) {
      const sim = corriTutta(attuale, 1234 + g * 1000 + s * 7919);
      sim.arrivo.slice(0, 3).forEach(i => top3[i]++);
    }
    const passo = g === 0 ? 0.9 : 0.6;
    attuale = { ...attuale, cavalli: attuale.cavalli.map((c, i) => {
      if (t[i] == null) return c;
      const p = Math.min(0.985, Math.max(0.015, (top3[i] + 0.5) / (prove + 1)));
      const d = Math.max(-1.5, Math.min(1.5, passo * (logit(p) - logit(t[i]!))));
      return { ...c, km_base: c.km_base! + d };
    }) };
  }
  return attuale;
}

/** "1'14\"3" da secondi al km. */
export function formatoKm(sec: number | null | undefined) {
  if (sec == null || !isFinite(sec)) return "—";
  const m = Math.floor(sec / 60), r = sec - m * 60;
  return `${m}'${r.toFixed(1).padStart(4, "0").replace(".", "\"")}`;
}
