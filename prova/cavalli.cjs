const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const err = [];
  for (const w of [390, 1280]) {
    const pg = await br.newPage({ viewport: { width: w, height: 900 } }); pg.on('pageerror', e => err.push(e.message));
    await pg.goto('https://statippica.onrender.com/#/cavalli', { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(6000);
    const r = await pg.evaluate(() => ({ cifre: document.querySelectorAll('.ed-cifre').length, spieg: [...document.querySelectorAll('summary')].map(s => s.innerText).join('|'), righe: document.querySelectorAll('.ed-riga').length, conta: [...document.querySelectorAll('.tabular')].map(e=>e.innerText).find(t=>/cavalli/.test(t)), larg: document.documentElement.scrollWidth, testo: document.body.innerText.length }));
    console.log('CAV', w, JSON.stringify(r));
    await pg.click('button:has-text("Tutti")'); await pg.waitForTimeout(5000);
    console.log('CAV', w, 'tutti', JSON.stringify(await pg.evaluate(() => ({ bottoni: [...document.querySelectorAll('[aria-label="Tipo"] button')].map(b=>b.innerText).join('|'), larg: document.documentElement.scrollWidth }))));
    await pg.close();
  }
  console.log('CAV err', JSON.stringify(err)); await br.close();
})();
