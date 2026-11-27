const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  for (const u of ['stallion/VARENNE', 'stallion/MAHARAJAH', 'stallion/READY%20CASH', 'fattrice/ZIGIS%20SISTER', 'fattrice/IALMAZ']) {
    const pg = await br.newPage({ viewport: { width: 390, height: 900 } }); const err = []; pg.on('pageerror', e => err.push(e.message.slice(0, 120)));
    await pg.goto('https://statippica.onrender.com/#/' + u, { waitUntil: 'networkidle', timeout: 90000 }); await pg.waitForTimeout(9000);
    const b = await pg.$('#sez-stallone-incroci button.sez-testa'); if (b && (await b.getAttribute('aria-expanded')) === 'false') { await b.click(); await pg.waitForTimeout(6000); }
    const r = await pg.evaluate(() => {
      const a = document.querySelector('[data-testid^="voto-anni"]'); const i = document.querySelector('[data-testid="incroci-stallone"]');
      return { anni: a ? a.innerText.replace(/\s+/g, ' ').slice(0, 140) : null, punti: a ? a.querySelectorAll('circle').length : 0,
        incroci: i ? [...i.querySelectorAll('tbody tr')].slice(0, 3).map(t => t.innerText.replace(/\s+/g, ' ')).join(' || ') : null, larg: document.documentElement.scrollWidth };
    });
    console.log('RIP', u, JSON.stringify(r), JSON.stringify(err)); await pg.close();
  }
  await br.close();
})();
