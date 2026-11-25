const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const br = await chromium.launch();
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const pg = await br.newPage({ viewport: vp });
    const err = []; pg.on('pageerror', e => err.push(e.message));
    await pg.goto(`${B}/#/classifiche-eta?eta=2`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(8000);
    const r = await pg.evaluate(() => {
      const viola = [...document.querySelectorAll('*')].filter(e => /rgb\((1[5-9]\d|2\d\d), (1[0-9]\d), 2[3-5]\d\)/.test(getComputedStyle(e).color) && e.innerText && e.innerText.length < 8).map(e => e.innerText).slice(0, 5);
      return { badge: document.querySelectorAll('.ed-riga .grade-badge').length, viola, larg: document.documentElement.scrollWidth };
    });
    console.log('RIS', vp.width, JSON.stringify(r), 'ERR', JSON.stringify(err.slice(0, 3)));
  }
  await br.close();
})();
