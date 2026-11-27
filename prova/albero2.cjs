const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const err = [];
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const pg = await br.newPage({ viewport: vp }); pg.on('pageerror', e => err.push(e.message));
    await pg.goto('https://statippica.onrender.com/#/stalloni/albero', { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(8000);
    const r1 = await pg.evaluate(() => ({ righe: [...document.querySelectorAll('.as-lista .ed-riga')].slice(0, 4).map(x => x.innerText.replace(/\n/g, ' ').slice(0, 100)), n: document.querySelectorAll('.as-lista .ed-riga').length, scheda: !!document.querySelector('[data-testid=scheda-stallone-albero]'), larg: document.documentElement.scrollWidth }));
    console.log('ELENCO', vp.width, JSON.stringify(r1));
    await pg.locator('.as-lista .ed-riga').first().click(); await pg.waitForTimeout(800);
    console.log('SCHEDA', vp.width, JSON.stringify(await pg.evaluate(() => document.querySelector('[data-testid=scheda-stallone-albero]')?.innerText.slice(0, 300).replace(/\n/g, ' | '))), await pg.evaluate(() => document.documentElement.scrollWidth));
    await pg.fill('[data-testid=cerca-albero]', 'WAIKIKI'); await pg.waitForTimeout(600);
    console.log('CERCA', vp.width, await pg.evaluate(() => [...document.querySelectorAll('.as-lista .ed-riga')].map(x => x.innerText.split('\n')[1]).join(' / ')));
    await pg.click('[data-testid=tab-dinastie]'); await pg.waitForTimeout(1000);
    const r2 = await pg.evaluate(() => ({ testo: document.querySelector('[data-testid=dinastie]')?.innerText.slice(0, 500).replace(/\n/g, ' | '), nodi: document.querySelectorAll('.as-nodo').length, larg: document.documentElement.scrollWidth }));
    console.log('DINASTIE', vp.width, JSON.stringify(r2));
    await pg.fill('[data-testid=cerca-dinastie]', 'NAD AL'); await pg.waitForTimeout(500);
    await pg.locator('[data-testid=dinastie] button', { hasText: 'NAD AL SHEBA' }).first().click(); await pg.waitForTimeout(1000);
    console.log('CERCATO', vp.width, await pg.evaluate(() => { const n = document.querySelector('.as-nodo[data-cercato=true]'); let s = []; let e = n; while (e) { const nm = e.querySelector?.(':scope > .as-nome'); if (nm) s.unshift(nm.innerText); e = e.parentElement?.closest('.as-figli-albero')?.previousElementSibling; } return s.join(' > '); }), await pg.evaluate(() => document.documentElement.scrollWidth));
  }
  console.log('ERR', JSON.stringify(err.slice(0, 5)));
  await br.close();
})();
