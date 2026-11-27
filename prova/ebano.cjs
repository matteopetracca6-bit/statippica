const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const err = [];
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const pg = await br.newPage({ viewport: vp }); pg.on('pageerror', e => err.push(e.message));
    await pg.goto('https://statippica.onrender.com/#/horse/EBANO%20VALCH/2020', { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(9000);
    console.log('CURVA', vp.width, JSON.stringify(await pg.evaluate(() => ({ t: document.querySelector('[data-testid=curva-voto]')?.innerText.slice(0, 420).replace(/\n/g, ' | '), rombo: !!document.querySelector('[data-testid=curva-voto] svg path'), larg: document.documentElement.scrollWidth }))));
  }
  console.log('ERR', JSON.stringify(err.slice(0, 4)));
  await br.close();
})();
