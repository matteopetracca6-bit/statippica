import { pesaPronostico, corriTutta, type CorsaDati } from "./simulaCorsa";
import fs from "fs";
const B = "https://statippica.onrender.com";
const KM: Record<string, number> = JSON.parse(fs.readFileSync("prova/km.json", "utf8"));
function stima(corsa: CorsaDati, n: number) {
  const k = corsa.cavalli.length, w = new Array(k).fill(0), t3 = new Array(k).fill(0);
  for (let s = 0; s < n; s++) { const sim = corriTutta(corsa, 5 + s * 7919); sim.arrivo.forEach((i, pos) => { if (pos === 0) w[i]++; if (pos < 3) t3[i]++; }); }
  return { w: w.map(x => x / n), t3: t3.map(x => x / n) };
}
const varianti = ["base", "tempo", "media", "base_solo", "tempo_solo", "media_solo"];
(async () => {
  const el = await (await fetch(`${B}/api/simulatore/elenco`)).json();
  const passate = el.passate.filter((x: any) => x.partenti >= 6).slice(0, 240);
  const M: Record<string, any> = Object.fromEntries(varianti.map(v => [v, { corse: 0, pw: 0, fav: 0, b3: 0, bw: 0, nb: 0, llw: 0 }]));
  let coperti = 0, tot = 0;
  for (const p of passate) {
    let c: any;
    try { c = await (await fetch(`${B}/api/simulatore/corsa?tipo=passata&codice=${encodeURIComponent(p.codice)}`)).json(); } catch { continue; }
    if (!c?.cavalli?.length || c.cavalli.filter((x: any) => x.pronostico_top3 != null).length < 0.75 * c.cavalli.length) continue;
    const vinc = c.cavalli.findIndex((x: any) => x.arrivo === 1); if (vinc < 0) continue;
    const kmp = c.cavalli.map((x: any) => KM[`${c.data}|${c.pista}|${x.nome}`]);
    tot += kmp.length; coperti += kmp.filter((x: any) => x != null).length;
    if (kmp.filter((x: any) => x != null).length < 0.75 * kmp.length) continue;
    for (const v of varianti) {
      const cav = c.cavalli.map((x: any, i: number) => {
        const t = kmp[i] != null ? kmp[i] + (x.ferri_effetto ?? 0) : null;
        const km = v.startsWith("tempo") ? (t ?? x.km_base) : v.startsWith("media") ? (t != null && x.km_base != null ? (t + x.km_base) / 2 : (t ?? x.km_base)) : x.km_base;
        return { ...x, km_base: km };
      });
      const corsa: CorsaDati = { distanza: c.distanza, partenza: c.partenza, lunghezza_pista: c.lunghezza_pista, km_pista: c.km_pista, cavalli: cav };
      const e = stima(v.endsWith("_solo") ? corsa : pesaPronostico(corsa), 250);
      const m = M[v];
      m.corse++; m.pw += e.w[vinc]; m.llw += -Math.log(Math.max(0.005, e.w[vinc]));
      if (e.w.indexOf(Math.max(...e.w)) === vinc) m.fav++;
      c.cavalli.forEach((x: any, i: number) => { const y3 = x.arrivo != null && x.arrivo <= 3 ? 1 : 0; m.b3 += (e.t3[i] - y3) ** 2; m.bw += (e.w[i] - (x.arrivo === 1 ? 1 : 0)) ** 2; m.nb++; });
    }
  }
  const r = (x: number, d: number) => Math.round(1000 * x / d) / 1000;
  console.log("COPERTURA", coperti, tot);
  for (const v of varianti) { const m = M[v]; console.log("RISULTATO", v, "corse", m.corse, "p_al_vincitore", r(m.pw, m.corse), "favorito_vince", r(m.fav, m.corse), "logloss_vincitore", r(m.llw, m.corse), "brier_top3", r(m.b3, m.nb), "brier_vince", r(m.bw, m.nb)); }
})();
