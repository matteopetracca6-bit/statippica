const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  for (const u of ['stallion/VARENNE', 'stallion/MAHARAJAH', 'stallion/LOVE%20YOU']) {
    const pg = await br.newPage({ viewport: { width: 390, height: 900 } }); const err = []; pg.on('pageerror', e => err.push(e.message.slice(0, 120)));
    await pg.goto('https://statippica.onrender.com/#/' + u, { waitUntil: 'networkidle', timeout: 90000 }); await pg.waitForTimeout(8000);
    for (const b of await pg.$$('button.sez-testa[aria-expanded="false"]')) { await b.click(); await pg.waitForTimeout(400); }
    const t0 = Date.now();
    await pg.waitForSelector('[data-testid="incroci-stallone"]', { timeout: 60000 }).catch(() => {});
    const tempo = Date.now() - t0; await pg.waitForTimeout(4000);
    const r = await pg.evaluate(() => {
      const root = document.querySelector('.scheda-stallone');
      const pan = [...document.querySelectorAll('.sez-corpo .pannello')];
      const conBordo = pan.filter(p => { const s = getComputedStyle(p); return s.borderTopWidth !== '0px' && s.borderTopStyle !== 'none' || s.boxShadow !== 'none'; }).length;
      const sez = [...document.querySelectorAll('.sez-scheda')].map(s => getComputedStyle(s).getPropertyValue('--c').trim());
      const fuori = [...document.querySelectorAll('.scheda-stallone > .pannello, [data-testid="voto-stallone"], [data-testid="linea-paterna-stallone"]')].map(p => getComputedStyle(p).boxShadow.slice(0, 40));
      const inc = document.querySelector('[data-testid="incroci-stallone"]');
      return { verde: root ? getComputedStyle(root).getPropertyValue('--colore-pannello') : null, pannelliNelleSezioni: pan.length, conBordo, sez, fuori,
        incroci: inc ? [...inc.querySelectorAll('tbody tr')].slice(0, 2).map(t => t.innerText.replace(/\s+/g, ' ')).join(' || ') : null, larg: document.documentElement.scrollWidth };
    });
    console.log('RIP', u, 'incroci in', tempo, 'ms', JSON.stringify(r), JSON.stringify(err)); await pg.close();
  }
  await br.close();
})();
