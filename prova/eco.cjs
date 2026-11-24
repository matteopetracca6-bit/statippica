const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    const errori = []; pg.on('pageerror', e => errori.push(e.message.slice(0, 160)));
    for (const url of ['/conto?modo=cavallo', '/conto?modo=cavallo&cavallo=CHICCA%20ROSS']) {
      await pg.goto(`${B}/#${url}`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(4000);
      await pg.click('[data-testid=conto-completo]'); await pg.waitForTimeout(5000);
      const r = await pg.evaluate(() => {
        const tit = [...document.querySelectorAll('.ed-tit')].map(e => e.innerText.replace(/\n/g, ' '));
        const testo = (t) => { const e = [...document.querySelectorAll('.ed-pannello')].find(p => p.querySelector('.ed-tit')?.innerText.startsWith(t)); return e ? e.innerText.replace(/\n/g, ' | ').slice(0, 380) : null; };
        return { risposta: document.querySelector('[data-testid=risposta]')?.innerText.replace(/\n/g, ' | ').slice(0, 120), titoli: tit,
          dodici: testo('Come possono'), spesa: testo('Se cambi'), motivi: testo('Perché'), carriera: testo('La carriera'), tipico: testo('Il cavallo tipico'), prossima: testo('La prossima'),
          scorre: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      console.log(w, url, JSON.stringify(r));
    }
    console.log(w, 'errori', JSON.stringify(errori));
  }
  await b.close();
})();
