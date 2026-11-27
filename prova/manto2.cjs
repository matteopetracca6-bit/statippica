const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  for (const u of ['stallion/VARENNE', 'stallion/READY%20CASH', 'stallion/MAHARAJAH', 'fattrice/ZIGIS%20SISTER', 'fattrice/IALMAZ']) {
    const pg = await br.newPage({ viewport: { width: 390, height: 900 } }); const err = []; pg.on('pageerror', e => err.push(e.message.slice(0, 120)));
    await pg.goto('https://statippica.onrender.com/#/' + u, { waitUntil: 'networkidle', timeout: 90000 }); await pg.waitForTimeout(8000);
    const r = await pg.evaluate(() => { const h = document.querySelector('[data-testid="intestazione-scheda"]'); const m = document.querySelector('.manto-sesso');
      return { acc: h ? getComputedStyle(h).getPropertyValue('--ed-acc') : null, manto: m?.innerText.replace(/\s+/g, ' '), img: m?.querySelector('img')?.getAttribute('src'), larg: document.documentElement.scrollWidth }; });
    console.log('MAN', u, JSON.stringify(r), JSON.stringify(err)); await pg.close();
  }
  await br.close();
})();
