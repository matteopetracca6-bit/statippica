import { pesaPronostico, corriTutta, PARAMETRI, type CorsaDati } from "./simulaCorsa";
const B = "https://statippica.onrender.com";
const v = process.env.VARIANTE || "base";
if (v === "inc13") PARAMETRI.incertezza = 1.3;
if (v === "inc24") PARAMETRI.incertezza = 2.4;
if (v === "spunto10") PARAMETRI.spunto = 1.0;
if (v === "spunto04") PARAMETRI.spunto = 0.4;
const piste = v === "piste" || v === "solo_piste";
const tarato = v !== "solo_piste" && v !== "solo_base";
function stima(corsa: CorsaDati, n: number) {
  const k = corsa.cavalli.length, w = new Array(k).fill(0), t3 = new Array(k).fill(0);
  for (let s = 0; s < n; s++) { const sim = corriTutta(corsa, 5 + s * 7919); sim.arrivo.forEach((i, pos) => { if (pos === 0) w[i]++; if (pos < 3) t3[i]++; }); }
  return { w: w.map(x => x / n), t3: t3.map(x => x / n) };
}
(async () => {
  const el = await (await fetch(`${B}/api/simulatore/elenco`)).json();
  const passate = el.passate.filter((x: any) => x.partenti >= 6).slice(0, 220);
  const m = { corse: 0, pw: 0, fav: 0, b3: 0, bw: 0, nb: 0, llw: 0 };
  for (const p of passate) {
    let c: any;
    try { c = await (await fetch(`${B}/api/simulatore/corsa?tipo=passata&codice=${encodeURIComponent(p.codice)}${piste ? "&piste=1" : ""}`)).json(); } catch { continue; }
    if (!c?.cavalli?.length || c.cavalli.filter((x: any) => x.pronostico_top3 != null).length < 0.75 * c.cavalli.length) continue;
    const vinc = c.cavalli.findIndex((x: any) => x.arrivo === 1); if (vinc < 0) continue;
    const corsa: CorsaDati = { distanza: c.distanza, partenza: c.partenza, lunghezza_pista: c.lunghezza_pista, km_pista: c.km_pista, cavalli: c.cavalli };
    const e = stima(tarato ? pesaPronostico(corsa) : corsa, 250);
    m.corse++; m.pw += e.w[vinc]; m.llw += -Math.log(Math.max(0.005, e.w[vinc]));
    if (e.w.indexOf(Math.max(...e.w)) === vinc) m.fav++;
    c.cavalli.forEach((x: any, i: number) => { const y3 = x.arrivo != null && x.arrivo <= 3 ? 1 : 0; m.b3 += (e.t3[i] - y3) ** 2; m.bw += (e.w[i] - (x.arrivo === 1 ? 1 : 0)) ** 2; m.nb++; });
  }
  const r = (x: number, d: number) => Math.round(1000 * x / d) / 1000;
  console.log("RISULTATO", v, "corse", m.corse, "p_al_vincitore", r(m.pw, m.corse), "favorito_vince", r(m.fav, m.corse), "logloss_vincitore", r(m.llw, m.corse), "brier_top3", r(m.b3, m.nb), "brier_vince", r(m.bw, m.nb));
})();
