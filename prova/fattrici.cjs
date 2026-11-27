const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const err = [];
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const pg = await br.newPage({ viewport: vp }); pg.on('pageerror', e => err.push(e.message));
    for (const n of ['IALMAZ', 'DIVINA DEI', 'AMOUR ANGUS']) {
      await pg.goto(`https://statippica.onrender.com/#/fattrice/${encodeURIComponent(n)}`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(7000);
      const t = await pg.evaluate(() => ({ testo: document.body.innerText.match(/(SSS|SS|S|A|B|C|D|E|F)\s*\n?[^\n]{0,80}figli[^\n]{0,120}/)?.[0]?.replace(/\n/g, ' | '), voto: document.querySelector('.grade-badge')?.innerText, larg: document.documentElement.scrollWidth }));
      console.log('FATTRICE', vp.width, n, JSON.stringify(t));
    }
    await pg.goto('https://statippica.onrender.com/#/fattrici', { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(7000);
    console.log('CLASSIFICA', vp.width, JSON.stringify(await pg.evaluate(() => ({ righe: [...document.querySelectorAll('.ed-riga, tbody tr')].slice(0, 5).map(r => r.innerText.replace(/\n/g, ' ').slice(0, 90)), larg: document.documentElement.scrollWidth }))));
    const api = await pg.evaluate(async () => { const o = {}; for (const n of ['IALMAZ', 'DIVINA DEI', 'AMOUR ANGUS']) { const r = await fetch('/api/dam/' + encodeURIComponent(n)).catch(() => null); o[n] = r ? (await r.text()).slice(0, 160) : null; } return o; });
    if (vp.width > 1000) console.log('API', JSON.stringify(api));
  }
  console.log('ERR', JSON.stringify(err.slice(0, 5)));
  await br.close();
})();
