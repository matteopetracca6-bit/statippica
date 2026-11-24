const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const br = await chromium.launch();
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const pg = await br.newPage({ viewport: vp });
    const err = []; pg.on('pageerror', e => err.push(e.message));
    await pg.goto(`${B}/#/rende?vista=previsto`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(6000);
    const r = {};
    for (const k of ['allenatori', 'guidatori', 'stalloni']) {
      await pg.click(`[data-testid=previsto-${k}]`); await pg.waitForTimeout(800);
      r[k] = [...document_righe(await pg.$$eval('.ed-riga', els => els.slice(0, 3).map(e => e.innerText.replace(/\n/g, ' | '))))];
    }
    r.larg = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    const api = await pg.evaluate(async () => { const x = await fetch('/api/pareggio/cavallo?nome=INCREDIBLE%20RUN&mensile=1200'); const j = await x.json(); return { futuro: j.futuro }; });
    console.log('RIS', vp.width, JSON.stringify(r), JSON.stringify(api).slice(0, 300)); console.log('ERR', JSON.stringify(err.slice(0, 4)));
  }
  await br.close();
})();
function document_righe(x) { return x; }
