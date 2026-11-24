const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    const errori = []; pg.on('pageerror', e => errori.push(e.message.slice(0, 160)));
    const prova = async (url, nota) => {
      await pg.goto(`${B}/#${url}`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(5000);
      const r = await pg.evaluate(() => ({ h1: document.querySelector('h1')?.innerText,
        modo: document.querySelector('[aria-label="Cosa hai"] [aria-pressed=true]')?.innerText.split('\n')[0],
        tab: document.querySelector('[role=tab][aria-selected=true]')?.innerText.split('\n')[0],
        domanda: document.querySelector('.co-domanda')?.innerText,
        risposta: document.querySelector('[data-testid=risposta]')?.innerText.replace(/\n/g, ' | ').slice(0, 220),
        cifre: [...document.querySelectorAll('.ed-cifra')].slice(0, 4).map(c => c.innerText.replace(/\n/g, ' ')).join(' || ').slice(0, 400),
        gm: !!document.querySelector('#generazione-m'), scorre: document.documentElement.scrollWidth > innerWidth + 1 }));
      console.log(w, nota || url, JSON.stringify(r));
    };
    await prova('/conto');
    await pg.click('[data-testid=conto-completo]').catch(() => {}); await pg.waitForTimeout(800);
    console.log(w, 'completo aperto', await pg.evaluate(() => document.querySelectorAll('.co-caso').length));
    await prova('/conto?modo=cavallo');
    await prova('/tenere', 'vecchio /tenere');
    await prova('/puledro?padre=VARENNE&prezzo=20000', 'vecchio /puledro con padre');
    await prova('/mercato', 'vecchio /mercato');
    await prova('/rende?vista=aste2026');
    await prova('/rende?vista=voti');
    await prova('/generazione-m', 'vecchio /generazione-m');
    console.log(w, 'menu', JSON.stringify(await pg.evaluate(() => [...new Set([...document.querySelectorAll('a')].map(a => a.getAttribute('href')).filter(h => /conto|rende|scuderia|puledro|tenere|mercato/.test(h || '')))])));
    console.log(w, 'errori', JSON.stringify(errori));
  }
  await b.close();
})();
