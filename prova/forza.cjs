const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const br = await chromium.launch();
  for (const [vp, nome] of [[{ width: 1280, height: 900 }, 'IN%20THE%20WIND%20GAR/2023'], [{ width: 390, height: 844 }, 'IN%20THE%20WIND%20GAR/2023'], [{ width: 1280, height: 900 }, "GOURMET%20D'ARC/2022"]]) {
    const pg = await br.newPage({ viewport: vp });
    const err = []; pg.on('pageerror', e => err.push(e.message));
    await pg.goto(`${B}/#/horse/${nome}`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(10000);
    const r = await pg.evaluate(() => ({ pannello: document.querySelector('[data-testid=curva-voto]')?.innerText.slice(0, 700).replace(/\n/g, ' | '), larg: document.documentElement.scrollWidth }));
    console.log('RIS', vp.width, JSON.stringify(r), 'ERR', JSON.stringify(err.slice(0, 3)));
  }
  await br.close();
})();
