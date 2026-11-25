const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const br = await chromium.launch();
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const pg = await br.newPage({ viewport: vp });
    const err = []; pg.on('pageerror', e => err.push(e.message));
    const vai = async (u, t = 6000) => { await pg.goto(`${B}/#${u}`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(t); };
    const info = () => pg.evaluate(() => ({ h1: document.querySelector('h1')?.innerText, lingue: [...document.querySelectorAll('[aria-current=page], [role=tab][aria-selected=true]')].map(e => e.innerText.split('\n')[0]), larg: document.documentElement.scrollWidth, url: location.hash }));
    // simula dal calendario
    await vai('/calendario');
    await pg.locator('[data-testid=simula]').first().click(); await pg.waitForTimeout(10000);
    console.log('SIMULA', vp.width, JSON.stringify(await pg.evaluate(() => ({ url: location.href, h1: document.querySelector('h1')?.innerText, partenti: document.body.innerText.includes('partenti') }))));
    for (const u of ['/generazioni', '/classifiche-eta?eta=4', '/allevamento', '/allevatori/classifiche', '/advisor', '/validazione', '/metodo', '/metodo/pronostico', '/controllo']) {
      await vai(u); const x = await info();
      let extra = '';
      if (u === '/classifiche-eta?eta=4') extra = await pg.evaluate(() => document.querySelector('[data-testid=eta-4]')?.getAttribute('aria-pressed'));
      console.log('PAG', vp.width, u, JSON.stringify(x), extra);
    }
    await vai('/generazioni');
    const l = pg.locator('[data-testid=link-classifica-completa]');
    if (await l.count()) { await l.first().click(); await pg.waitForTimeout(5000); console.log('CLASSCOMPL', vp.width, JSON.stringify(await info())); }
    await vai('/classifiche-eta?eta=3');
    if (vp.width < 600) { await pg.locator('.ed-riga').first().click(); await pg.waitForTimeout(1500); }
    const a = pg.locator('[data-testid=link-annata]');
    if (await a.count()) { await a.first().click(); await pg.waitForTimeout(5000); console.log('ANNATA', vp.width, JSON.stringify(await info())); } else console.log('ANNATA', vp.width, 'link assente');
    console.log('ERR', vp.width, JSON.stringify(err.slice(0, 6)));
  }
  await br.close();
})();
