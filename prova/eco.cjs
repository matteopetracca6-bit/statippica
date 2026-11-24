const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844]]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true })).newPage();
    for (const url of ['/conto?modo=cavallo', '/conto?modo=cavallo&cavallo=CHICCA%20ROSS', '/conto']) {
      await pg.goto(`${B}/#${url}`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(6000);
      await pg.click('[data-testid=conto-completo]'); await pg.waitForTimeout(9000);
      const r = await pg.evaluate(() => {
        const fuori = [];
        const scatole = [...document.querySelectorAll('.ed-pannello, .ed-cifra, [data-testid=risposta], .co-scelta button, [data-testid=barra-spese], .page-shell')];
        for (const sc of scatole) {
          const R = sc.getBoundingClientRect();
          for (const e of sc.querySelectorAll('*')) {
            const rc = e.getBoundingClientRect();
            if (!rc.width) continue;
            let p = e.parentElement, scorre = false;
            while (p && p !== sc) { if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) { scorre = true; break; } p = p.parentElement; }
            if (!scorre && (rc.right > R.right + 1 || rc.left < R.left - 1)) fuori.push(`[${(sc.className || sc.dataset.testid || sc.tagName).toString().slice(0, 18)}] ${e.tagName} +${Math.round(rc.right - R.right)}px "${(e.innerText || '').replace(/\n/g, ' ').slice(0, 45)}"`);
          }
          if (sc.scrollWidth > sc.clientWidth + 1 && !/(auto|scroll)/.test(getComputedStyle(sc).overflowX)) fuori.push(`[${(sc.className || '').toString().slice(0, 18)}] tagliato ${sc.scrollWidth}/${sc.clientWidth}`);
        }
        return { fuori: [...new Set(fuori)].slice(0, 25) };
      });
      console.log(w, url, JSON.stringify(r));
    }
  }
  await b.close();
})();
