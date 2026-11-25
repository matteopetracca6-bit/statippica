const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const br = await chromium.launch();
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const pg = await br.newPage({ viewport: vp });
    const err = []; pg.on('pageerror', e => err.push('PAGEERR ' + e.message + ' || ' + (e.stack || '').split('\n').slice(0, 6).join(' | ')));
    pg.on('console', m => m.type() === 'error' && err.push('CONSOLE ' + m.text().slice(0, 400)));
    pg.on('response', r => { if (r.status() >= 400) err.push('HTTP ' + r.status() + ' ' + r.url()); });
    await pg.goto(`${B}/#/calendario`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(5000);
    const n = await pg.locator('[data-testid=simula]').count();
    const href = await pg.locator('[data-testid=simula]').first().evaluate(e => e.getAttribute('href') || e.parentElement?.getAttribute('href'));
    await pg.locator('[data-testid=simula]').first().click();
    await pg.waitForTimeout(12000);
    const r = await pg.evaluate(() => ({ url: location.href, testo: document.body.innerText.slice(0, 600).replace(/\n/g, ' | ') }));
    console.log('RIS', vp.width, n, href, JSON.stringify(r));
    // anche aprendo direttamente l'indirizzo
    const pg2 = await br.newPage({ viewport: vp });
    pg2.on('pageerror', e => err.push('PAGEERR2 ' + e.message + ' || ' + (e.stack || '').split('\n').slice(0, 6).join(' | ')));
    await pg2.goto(r.url, { waitUntil: 'networkidle', timeout: 120000 }); await pg2.waitForTimeout(12000);
    console.log('DIRETTO', vp.width, (await pg2.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n/g, ' | '))));
    console.log('ERR', vp.width, JSON.stringify(err.slice(0, 12)));
  }
  await br.close();
})();
