const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); 
  for (const [n, w] of [["PASCIA'%20LEST", 390], ['VARENNE', 390], ['MAHARAJAH', 1280], ['READY%20CASH', 390]]) {
    const pg = await br.newPage({ viewport: { width: w, height: 900 } }); const err = []; pg.on('pageerror', e => err.push(e.message.slice(0, 120)));
    await pg.goto("https://statippica.onrender.com/#/stallion/" + n, { waitUntil: 'networkidle', timeout: 90000 }); await pg.waitForTimeout(9000);
    const r = await pg.evaluate(() => ({
      linea: document.querySelector('[data-testid="linea-paterna-stallone"]')?.innerText.replace(/\s+/g, ' ').slice(0, 260),
      voto: !!document.querySelector('[data-testid="voto-stallone"]'),
      sezioni: [...document.querySelectorAll('.sez-testa')].map(b => b.innerText.replace(/\s+/g, ' ') + '/' + b.getAttribute('aria-expanded')).join(' | '),
      vecchia: document.body.innerText.includes('Genealogia (clicca'), alt: document.body.scrollHeight, larg: document.documentElement.scrollWidth }));
    console.log('STA', n, w, JSON.stringify(r), JSON.stringify(err));
    for (const b of await pg.$$('button.sez-testa[aria-expanded="false"]')) { await b.click(); await pg.waitForTimeout(500); }
    await pg.waitForTimeout(4000);
    console.log('STA aperte', n, JSON.stringify({ alt: await pg.evaluate(() => document.body.scrollHeight), err }));
    await pg.close();
  }
  await br.close();
})();
