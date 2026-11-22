import { chromium } from "playwright";
const B = "https://statippica.onrender.com/#";
const pagine = ["/", "/horse/DON%20FANUCCI%20ZET%20(S)/2016", "/horse/FACE%20TIME%20BOURBON/2015", "/horse/GINOSTRABLIGGI/2022",
  "/stallion/VARENNE", "/stallion/MAHARAJAH", "/leaderboard", "/advisor", "/classifiche-eta", "/stalloni", "/stalloni/classifiche",
  "/fattrici", "/fattrice/ONE%20DREAM%20GRIF", "/calendario", "/simulatore", "/gran-premi", "/guidatori", "/allenatori",
  "/ippodromi", "/ippodromo/NAPOLI", "/cavalli", "/pedigree", "/trend", "/economia", "/qualifiche", "/allevatori", "/compare",
  "/albero-stalloni", "/generazione-m", "/scuderia", "/tenere", "/controllo", "/metodo"];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
for (const p of pagine) {
  try {
    await page.goto(B + p, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(4000);
    // apre le sezioni chiuse della scheda (SezioneScheda) per controllare anche il contenuto
    await page.evaluate(() => { document.querySelectorAll("details:not([open]) > summary, [aria-expanded='false']").forEach(e => { try { e.click(); } catch {} }); });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const W = window.innerWidth;
      const out = { testo: document.body.innerText.length, inizio: document.body.innerText.slice(0,80).replace(/\s+/g," "), elementi: document.querySelectorAll("body *").length, overflowX: document.documentElement.scrollWidth - W, sbordano: [], spezzate: [], badge: [] };
      const desc = (el) => { const t = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40); return `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} «${t}»`; };
      const inScroll = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(s.overflowX)) return true; } return false; };
      for (const el of document.querySelectorAll("body *")) {
        const b = el.getBoundingClientRect();
        if (b.width && b.right > W + 2 && !inScroll(el) && out.sbordano.length < 8) out.sbordano.push(`${desc(el)} destra=${Math.round(b.right)}`);
      }
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        const t = n.textContent.trim();
        if (t.length < 2 || /\s/.test(t) || t.length > 30) continue;
        const el = n.parentElement; if (!el || el.offsetParent === null) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        const rs = Array.from(rg.getClientRects()).filter(x => x.width > 0);
        const righe = new Set(rs.map(x => Math.round(x.top)));
        if (righe.size > 1 && out.spezzate.length < 10) out.spezzate.push(`«${t}» in ${desc(el)} su ${righe.size} righe`);
      }
      out.etichette = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.children.length || el.offsetParent === null) continue;
        const t = (el.textContent || "").trim();
        if (t.length < 3 || t.length > 26 || !/\s/.test(t)) continue;
        const cs = getComputedStyle(el); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
        const b = el.getBoundingClientRect();
        if (b.height > lh * 1.8 && b.width < 140 && out.etichette.length < 12) out.etichette.push(`«${t}» ${el.tagName.toLowerCase()}.${(el.className && typeof el.className === "string") ? el.className.split(" ")[0] : ""} largo ${Math.round(b.width)} alto ${Math.round(b.height)}`);
      }
      for (const el of document.querySelectorAll(".grade-badge")) {
        const b = el.getBoundingClientRect(); const fs = parseFloat(getComputedStyle(el).fontSize);
        if (b.height > fs * 2.2 && out.badge.length < 5) out.badge.push(`${el.textContent} alto ${Math.round(b.height)}px`);
      }
      return out;
    });
    console.log(JSON.stringify({ pagina: p, ...r }));
  } catch (e) { console.log(JSON.stringify({ pagina: p, errore: String(e).slice(0, 200) })); }
}
await browser.close();
