/**
 * Coefficiente di consanguineita' (inbreeding) con la formula di Wright,
 * fatta per bene (20/11/2026).
 *
 * Prima si prendeva ogni antenato comune una volta sola, alla generazione piu'
 * vicina per lato, e si contavano anche gli antenati che arrivano solo
 * attraverso un altro antenato comune. Su VIVID WISE AS usciva 4,1% invece di
 * 3,7%: SPEEDY CROWN (3+5 lato padre, 4 lato madre) contava solo la coppia 3-4,
 * mentre MISSILE TOE (che arriva solo tramite VALLEY VICTORY) e SPEEDY SCOT
 * (solo tramite SPEEDY CROWN) venivano contati una seconda volta.
 *
 * Ora: per ogni antenato comune si sommano tutte le coppie di comparse, una dal
 * lato del padre e una da quello della madre, (1/2)^(g1 + g2 + 1) con g contato
 * dal genitore (il genitore stesso e' 0). Una coppia vale solo se i due
 * percorsi non passano per uno stesso cavallo: altrimenti quel tratto e' gia'
 * contato dall'antenato piu' vicino. La consanguineita' propria degli antenati
 * si trascura (si conoscono solo 5 generazioni).
 *
 * Gli antenati ripetuti su un lato solo (GARLAND LOBELL 4+4 lato madre) rendono
 * consanguineo quel genitore, non il puledro: non entrano nel coefficiente, ma
 * si elencano a parte.
 */

export interface Comparsa { nome: string; gen: number; via: string[] }

export interface AntenatoComune {
  name: string; contribution: number; sire_gen: number; dam_gen: number;
  sire_gens: number[]; dam_gens: number[];
}
export interface RipetutoUnLato { name: string; lato: "padre" | "madre"; gens: number[] }

export function calcolaWright(padre: Comparsa[], madre: Comparsa[], scarto = 0) {
  // scarto: quanto aggiungere a gen per mostrarla contata dal cavallo (1 per l'albero del cavallo).
  const perNome = (l: Comparsa[]) => {
    const m = new Map<string, Comparsa[]>();
    for (const c of l) { const k = c.nome.toUpperCase(); (m.get(k) || m.set(k, []).get(k)!).push(c); }
    return m;
  };
  const P = perNome(padre), M = perNome(madre);
  const comuni: AntenatoComune[] = [];
  let totale = 0;
  for (const [nome, cp] of Array.from(P.entries())) {
    const cm = M.get(nome);
    if (!cm) continue;
    let contr = 0;
    for (const a of cp) {
      const viaA = new Set(a.via.map(x => x.toUpperCase()));
      for (const b of cm) {
        if (b.via.some(x => viaA.has(x.toUpperCase()))) continue;
        contr += Math.pow(0.5, a.gen + b.gen + 1);
      }
    }
    const sg = cp.map(c => c.gen + scarto).sort((x, y) => x - y);
    const dg = cm.map(c => c.gen + scarto).sort((x, y) => x - y);
    if (contr > 0) {
      totale += contr;
      comuni.push({ name: cp[0].nome, contribution: contr, sire_gen: sg[0], dam_gen: dg[0], sire_gens: sg, dam_gens: dg });
    }
  }
  comuni.sort((a, b) => b.contribution - a.contribution);
  const ripetuti: RipetutoUnLato[] = [];
  for (const [lista, altra, lato] of [[P, M, "padre"], [M, P, "madre"]] as const) {
    for (const [nome, cs] of Array.from(lista.entries())) {
      if (cs.length < 2 || altra.has(nome)) continue;
      ripetuti.push({ name: cs[0].nome, lato, gens: cs.map(c => c.gen + scarto).sort((x, y) => x - y) });
    }
  }
  ripetuti.sort((a, b) => a.gens[0] - b.gens[0] || a.gens[1] - b.gens[1]);
  return { coefficiente: totale, comuni, ripetuti };
}

/** Comparse di un sottoalbero (nodi con name, sire, dam), dal genitore (gen 0). */
export function comparseAlbero(radice: any, maxGen: number): Comparsa[] {
  const out: Comparsa[] = [];
  const giro = (n: any, gen: number, via: string[]) => {
    if (!n || !n.name || gen > maxGen) return;
    if (!n.omonimo) out.push({ nome: n.name, gen, via });
    const v = [...via, n.name];
    giro(n.sire, gen + 1, v);
    giro(n.dam, gen + 1, v);
  };
  giro(radice, 0, []);
  return out;
}

/**
 * Comparse dall'albero di vendopuledri di un cavallo (vp_pedigree: il percorso
 * si legge da destra, dal cavallo verso l'antenato). Il cavallo stesso e' gen 0.
 */
export function comparseVp(righe: { path: string; nome: string }[], nomeCavallo: string): Comparsa[] {
  const perPercorso = new Map<string, string>();
  for (const r of righe) perPercorso.set(r.path.split("").reverse().join(""), r.nome);
  const out: Comparsa[] = [{ nome: nomeCavallo, gen: 0, via: [] }];
  for (const [p, nome] of Array.from(perPercorso.entries())) {
    const via = [nomeCavallo];
    for (let i = 1; i < p.length; i++) { const x = perPercorso.get(p.slice(0, i)); if (x) via.push(x); }
    out.push({ nome, gen: p.length, via });
  }
  return out;
}
