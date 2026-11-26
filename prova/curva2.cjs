const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 390, height: 844 } });
  for (const u of ["IN%20THE%20WIND%20GAR/2023", "GOURMET%20D'ARC/2022"]) {
    await pg.goto(`https://statippica.onrender.com/#/horse/${u}`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(9000);
    console.log('CURVA', u, JSON.stringify(await pg.evaluate(() => document.querySelector('[data-testid=curva-voto]')?.innerText.slice(0, 260).replace(/\n/g, ' | '))));
  }
  await br.close();
})();
