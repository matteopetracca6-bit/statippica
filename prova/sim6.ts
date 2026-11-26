import { pesaPronostico, corriTutta, type CorsaDati } from "./simulaCorsa";
const B = "https://statippica.onrender.com";
function stima(corsa: CorsaDati, n: number) {
  const k = corsa.cavalli.length, w = new Array(k).fill(0), t3 = new Array(k).fill(0);
  for (let s = 0; s < n; s++) { const sim = corriTutta(corsa, 5 + s * 7919); sim.arrivo.forEach((i, pos) => { if (pos === 0) w[i]++; if (pos < 3) t3[i]++; }); }
  return { w: w.map(x => x / n), t3: t3.map(x => x / n) };
}
(async () => {
  const el = await (await fetch(`${B}/api/simulatore/elenco`)).json();
  const passate = el.passate.filter((x: any) => x.partenti >= 6).slice(0, 300);
  const V = ["solo", "tarato_primi_tre", "tarato_con_vittoria"];
  const M: any = Object.fromEntries(V.map(v => [v, { pw: 0, fav: 0, b3: 0, bw: 0 }]));
  const P = { b3: 0, bw: 0, fav: 0, pw: 0 }; const T = { pw: 0, fav: 0, bw: 0, n: 0, nb: 0 };
  let corse = 0, nb = 0, giorni = new Set<string>();
  for (const p of passate) {
    let c: any;
    try { c = await (await fetch(`${B}/api/simulatore/corsa?tipo=passata&codice=${encodeURIComponent(p.codice)}`)).json(); } catch { continue; }
    if (!c?.cavalli?.length) continue;
    const nv = c.cavalli.filter((x: any) => x.pronostico_vince != null).length;
    if (nv < 0.75 * c.cavalli.length) continue;
    const vinc = c.cavalli.findIndex((x: any) => x.arrivo === 1); if (vinc < 0) continue;
    const corsa: CorsaDati = { distanza: c.distanza, partenza: c.partenza, lunghezza_pista: c.lunghezza_pista, km_pista: c.km_pista, cavalli: c.cavalli };
    const senzaV: CorsaDati = { ...corsa, cavalli: corsa.cavalli.map((x: any) => ({ ...x, pronostico_vince: null })) };
    const es: any = { solo: stima(corsa, 250), tarato_primi_tre: stima(pesaPronostico(senzaV), 250), tarato_con_vittoria: stima(pesaPronostico(corsa), 250) };
    corse++; giorni.add(c.data);
    for (const v of V) { const e = es[v], m = M[v]; m.pw += e.w[vinc]; if (e.w.indexOf(Math.max(...e.w)) === vinc) m.fav++;
      c.cavalli.forEach((x: any, i: number) => { m.b3 += (e.t3[i] - (x.arrivo != null && x.arrivo <= 3 ? 1 : 0)) ** 2; m.bw += (e.w[i] - (x.arrivo === 1 ? 1 : 0)) ** 2; }); }
    const pv = c.cavalli.map((x: any) => (x.pronostico_vince ?? 0) / 100); const sv = pv.reduce((a: number, b: number) => a + b, 0) || 1;
    const pvn = pv.map((x: number) => x / sv); P.pw += pvn[vinc]; if (pvn.indexOf(Math.max(...pvn)) === vinc) P.fav++;
    c.cavalli.forEach((x: any, i: number) => { nb++; P.b3 += ((x.pronostico_top3 ?? 0) / 100 - (x.arrivo != null && x.arrivo <= 3 ? 1 : 0)) ** 2; P.bw += (pvn[i] - (x.arrivo === 1 ? 1 : 0)) ** 2; });
    if (c.cavalli.every((x: any) => x.quota > 1)) {
      const inv = c.cavalli.map((x: any) => 1 / x.quota), tt = inv.reduce((a: number, b: number) => a + b, 0), q = inv.map((x: number) => x / tt);
      T.n++; T.pw += q[vinc]; if (q.indexOf(Math.max(...q)) === vinc) T.fav++; c.cavalli.forEach((x: any, i: number) => { T.nb++; T.bw += (q[i] - (x.arrivo === 1 ? 1 : 0)) ** 2; });
    }
  }
  const r = (x: number, d: number) => Math.round(1000 * x / d) / 1000;
  console.log("RISULTATO corse", corse, "giorni", [...giorni].sort().join(","), "con quote", T.n);
  for (const v of V) { const m = M[v]; console.log("RISULTATO", v, "p_al_vincitore", r(m.pw, corse), "favorito_vince", r(m.fav, corse), "brier_top3", r(m.b3, nb), "brier_vince", r(m.bw, nb)); }
  console.log("RISULTATO pronostico p_al_vincitore", r(P.pw, corse), "favorito_vince", r(P.fav, corse), "brier_top3", r(P.b3, nb), "brier_vince", r(P.bw, nb));
  console.log("RISULTATO totalizzatore p_al_vincitore", r(T.pw, T.n), "favorito_vince", r(T.fav, T.n), "brier_vince", r(T.bw, T.nb));
})();
