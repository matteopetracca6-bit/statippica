const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const br = await chromium.launch();
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const pg = await br.newPage({ viewport: vp });
    const err = []; pg.on('pageerror', e => err.push(e.message));
    await pg.goto(`${B}/#/horse/INCREDIBLE%20RUN/2023`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(10000);
    const r = await pg.evaluate(() => ({ pannello: document.querySelector('[data-testid=pannello-forza]')?.innerText.slice(0, 700).replace(/\n/g, ' | '), larg: document.documentElement.scrollWidth }));
    console.log('RIS', vp.width, JSON.stringify(r), 'ERR', JSON.stringify(err.slice(0, 3)));
  }
  await br.close();
})();
