const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 390, height: 900 } }); const err = []; pg.on('pageerror', e => err.push(e.message.slice(0, 120)));
  await pg.goto('https://statippica.onrender.com/#/stallion/LEMON%20DRA', { waitUntil: 'networkidle', timeout: 90000 }); await pg.waitForTimeout(8000);
  const b = await pg.$('#sez-stallone-figli button.sez-testa'); if (b && (await b.getAttribute('aria-expanded')) === 'false') { await b.click(); await pg.waitForTimeout(5000); }
  const prima = () => pg.evaluate(() => [...document.querySelectorAll('[data-testid="figli-stallone"] tbody tr')].slice(0, 2).map(t => t.innerText.replace(/\s+/g, ' ')).join(' || '));
  const out = { testa: await pg.evaluate(() => document.querySelector('[data-testid="intestazione-scheda"]')?.innerText.match(/FIGLI\s+\S+/i)?.[0]),
    curva: await pg.evaluate(() => document.querySelector('[data-testid^="voto-anni"]')?.innerText.replace(/\s+/g, ' ').slice(0, 90)), guadagni: await prima() };
  for (const h of ['Record', 'Corse', 'Vinte', 'Voto']) { await pg.click(`[data-testid="figli-stallone"] th button:has-text("${h}")`); await pg.waitForTimeout(400); out[h] = await prima(); }
  await pg.click(`[data-testid="figli-stallone"] th button:has-text("Record")`); await pg.waitForTimeout(300); await pg.click(`[data-testid="figli-stallone"] th button:has-text("Record")`); await pg.waitForTimeout(300);
  out.recordInverso = await prima();
  console.log('ORD', JSON.stringify(out, null, 0), 'larg', await pg.evaluate(() => document.documentElement.scrollWidth), JSON.stringify(err));
  await br.close();
})();
