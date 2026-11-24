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
        const W = document.documentElement.clientWidth;
        const fuori = [];
        for (const e of document.querySelectorAll('body *')) {
          const rc = e.getBoundingClientRect();
          if (rc.width && (rc.right > W + 1 || rc.left < -1)) {
            // salta se dentro un contenitore che scorre
            let p = e.parentElement, scorre = false;
            while (p) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowX) && p !== document.body && p !== document.documentElement) { scorre = true; break; } p = p.parentElement; }
            if (!scorre) fuori.push(`${e.tagName}.${(e.className || '').toString().slice(0, 30)} w${Math.round(rc.width)} r${Math.round(rc.right)} "${(e.innerText || '').replace(/\n/g, ' ').slice(0, 50)}"`);
          }
        }
        return { pagina: document.documentElement.scrollWidth, W, fuori: fuori.slice(0, 14) };
      });
      console.log(w, url, JSON.stringify(r));
    }
  }
  await b.close();
})();
