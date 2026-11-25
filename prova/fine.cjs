const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const br = await chromium.launch();
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const pg = await br.newPage({ viewport: vp });
    const err = []; pg.on('pageerror', e => err.push(e.message));
    await pg.goto(`${B}/#/calendario`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(5000);
    await pg.locator('[data-testid=simula]').first().click(); await pg.waitForTimeout(12000);
    const s = await pg.evaluate(() => ({ prev: [...document.querySelectorAll('.sim-tab tbody tr')].slice(0, 3).map(r => [...r.children].slice(1, 6).map(td => td.innerText).join(' / ')), larg: document.documentElement.scrollWidth }));
    console.log('SIM', vp.width, JSON.stringify(s));
    await pg.goto(`${B}/#/conto?modo=cavallo&cavallo=INCREDIBLE%20RUN`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(9000);
    await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /conto completo|completo/i.test(x.innerText)); b && b.click(); }); await pg.waitForTimeout(4000);
    const api = await pg.evaluate(async () => (await (await fetch('/api/pareggio/cavallo?nome=INCREDIBLE%20RUN&mensile=1200')).json()).futuro);
    console.log('API', JSON.stringify(api).slice(0, 400));
    const c = await pg.evaluate(() => ({ futuro: document.querySelector('[data-testid=carriera-futura]')?.innerText.slice(0, 400).replace(/\n/g, ' | '), larg: document.documentElement.scrollWidth }));
    console.log('CONTO', vp.width, JSON.stringify(c));
    console.log('ERR', vp.width, JSON.stringify(err.slice(0, 5)));
  }
  await br.close();
})();
