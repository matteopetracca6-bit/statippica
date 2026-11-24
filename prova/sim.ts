import { simulaMolte, pesaPronostico, pesaMercato, corriTutta, type CorsaDati } from "./simulaCorsa";
const B = "https://statippica.onrender.com";
function stima(corsa: CorsaDati, n: number, seme: number) {
  const k = corsa.cavalli.length, w = new Array(k).fill(0), t3 = new Array(k).fill(0);
  for (let s = 0; s < n; s++) { const sim = corriTutta(corsa, seme + s * 7919); sim.arrivo.forEach((i, pos) => { if (pos === 0) w[i]++; if (pos < 3) t3[i]++; }); }
  return { w: w.map(x => x / n), t3: t3.map(x => x / n) };
}
(async () => {
  const el = await (await fetch(`${B}/api/simulatore/elenco`)).json();
  const passate = el.passate.filter((x: any) => x.partenti >= 6).slice(0, 260);
  const m: any = { corse: 0, raw: { pw: 0, fav: 0, b3: 0, bw: 0 }, cal: { pw: 0, fav: 0, b3: 0, bw: 0 }, mix: { pw: 0, fav: 0, b3: 0, bw: 0, n: 0 }, pron: { b3: 0 }, tot: { pw: 0, fav: 0, bw: 0, n: 0 }, nb: 0, nbw: 0 };
  const t0 = Date.now();
  for (const p of passate) {
    let c: any;
    try { c = await (await fetch(`${B}/api/simulatore/corsa?tipo=passata&codice=${encodeURIComponent(p.codice)}`)).json(); } catch { continue; }
    if (!c?.cavalli?.length || c.cavalli.filter((x: any) => x.pronostico_top3 != null).length < 0.75 * c.cavalli.length) continue;
    const vinc = c.cavalli.findIndex((x: any) => x.arrivo === 1);
    if (vinc < 0) continue;
    const corsa: CorsaDati = { distanza: c.distanza, partenza: c.partenza, lunghezza_pista: c.lunghezza_pista, km_pista: c.km_pista, cavalli: c.cavalli };
    const raw = stima(corsa, 250, 5);
    const cal = stima(pesaPronostico(corsa), 250, 5);
    m.corse++;
    const conta = (nome: string, e: { w: number[]; t3: number[] }) => {
      m[nome].pw += e.w[vinc];
      const f = e.w.indexOf(Math.max(...e.w)); if (f === vinc) m[nome].fav++;
      c.cavalli.forEach((x: any, i: number) => {
        const y3 = x.arrivo != null && x.arrivo <= 3 ? 1 : 0, yw = x.arrivo === 1 ? 1 : 0;
        m[nome].b3 += (e.t3[i] - y3) ** 2; m[nome].bw += (e.w[i] - yw) ** 2;
      });
    };
    conta("raw", raw); conta("cal", cal);
    c.cavalli.forEach((x: any) => { const y3 = x.arrivo != null && x.arrivo <= 3 ? 1 : 0; m.pron.b3 += ((x.pronostico_top3 ?? 0) / 100 - y3) ** 2; m.nb++; });
    if (c.cavalli.every((x: any) => x.quota > 1)) {
      const inv = c.cavalli.map((x: any) => 1 / x.quota), tt = inv.reduce((a: number, b: number) => a + b, 0), pq = inv.map((x: number) => x / tt);
      m.tot.n++; m.tot.pw += pq[vinc]; if (pq.indexOf(Math.max(...pq)) === vinc) m.tot.fav++;
      c.cavalli.forEach((x: any, i: number) => { m.tot.bw += (pq[i] - (x.arrivo === 1 ? 1 : 0)) ** 2; });
      const mx = stima(pesaMercato(pesaPronostico(corsa), 0.5), 200, 5);
      m.mix.n++; m.mix.pw += mx.w[vinc]; if (mx.w.indexOf(Math.max(...mx.w)) === vinc) m.mix.fav++;
      c.cavalli.forEach((x: any, i: number) => { m.mix.bw += (mx.w[i] - (x.arrivo === 1 ? 1 : 0)) ** 2; m.mix.b3 += (mx.t3[i] - (x.arrivo != null && x.arrivo <= 3 ? 1 : 0)) ** 2; m.nbw++; });
    }
    if (m.corse % 25 === 0) console.log("RISULTATO parziale", m.corse, Math.round((Date.now() - t0) / 1000) + "s");
  }
  const r = (x: number, d: number) => Math.round(1000 * x / d) / 1000;
  console.log("RISULTATO corse", m.corse, "con quote", m.tot.n);
  for (const k of ["raw", "cal"]) console.log("RISULTATO", k, "p_al_vincitore", r(m[k].pw, m.corse), "favorito_vince", r(m[k].fav, m.corse), "brier_top3", r(m[k].b3, m.nb), "brier_vince", r(m[k].bw, m.nb));
  console.log("RISULTATO pronostico brier_top3", r(m.pron.b3, m.nb));
  console.log("RISULTATO totalizzatore (su corse con quote) p_al_vincitore", r(m.tot.pw, m.tot.n), "favorito_vince", r(m.tot.fav, m.tot.n), "brier_vince", r(m.tot.bw, m.nbw));
  console.log("RISULTATO pronostico+meta_mercato p_al_vincitore", r(m.mix.pw, m.mix.n), "favorito_vince", r(m.mix.fav, m.mix.n), "brier_vince", r(m.mix.bw, m.nbw), "brier_top3", r(m.mix.b3, m.nbw));
})();
