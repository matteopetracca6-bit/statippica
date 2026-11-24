const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const br = await chromium.launch();
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const pg = await br.newPage({ viewport: vp });
    const err = []; pg.on('pageerror', e => err.push(e.message)); pg.on('console', m => m.type() === 'error' && err.push(m.text()));
    await pg.goto(`${B}/#/metodo/pronostico`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(8000);
    const r = await pg.evaluate(() => ({
      cifre: document.querySelector('[data-testid=metodo-cifre]')?.innerText.replace(/\n/g, ' | '),
      pesi: [...document.querySelectorAll('[data-testid=peso-variabile]')].slice(0, 5).map(e => e.innerText.replace(/\n/g, ' ')),
      tit: [...document.querySelectorAll('.ed-tit')].map(e => e.innerText),
      svg: document.querySelectorAll('.recharts-surface').length,
      larg: document.documentElement.scrollWidth, vista: innerWidth,
      vivo: document.body.innerText.match(/Com'è andato dal vivo[\s\S]{0,300}/)?.[0].replace(/\n/g, ' | '),
    }));
    console.log('RIS', vp.width, JSON.stringify(r)); console.log('ERR', vp.width, JSON.stringify(err.slice(0, 5)));
  }
  await br.close();
})();
