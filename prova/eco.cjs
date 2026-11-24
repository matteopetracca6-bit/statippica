const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  for (const [p, m] of [['FACE TIME BOURBON', ''], ['VARENNE', ''], ['READY CASH', 'CHICCA ROSS'], ['ORLANDO VICI', '']]) {
    const r = await (await fetch(`${B}/api/pareggio/incrocio?padre=${encodeURIComponent(p)}&madre=${encodeURIComponent(m)}&mensile=1200`)).json();
    console.log('INCROCIO', p, m, r.fonte_probabilita, JSON.stringify(r.potenziale), (r.probabilita || []).map(x => `${x.voto}:${x.p}`).join(' '), 'utile', r.utile_atteso, r.esito, 'figli', JSON.stringify(r.figli_osservati), r.message || '');
  }
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const pg = await ctx.newPage();
    const errori = [];
    pg.on('pageerror', e => errori.push(e.message.slice(0, 120)));
    pg.on('console', m => { if (m.type() === 'error') errori.push('console: ' + m.text().slice(0, 120)); });
    for (const url of ['/puledro?padre=FACE%20TIME%20BOURBON', '/puledro?modo=incrocio&padre=FACE%20TIME%20BOURBON', '/tenere', '/scuderia', '/mercato', '/mercato?vista=generazione', '/mercato?vista=voti']) {
      await pg.goto(B + '/#' + url, { waitUntil: 'networkidle', timeout: 90000 }); await pg.waitForTimeout(4000);
      const r = await pg.evaluate(() => {
        const viola = [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).color === 'rgb(169, 130, 251)' || /hsl\(265/.test(e.getAttribute('style') || '')).length;
        const oroVecchio = [...document.querySelectorAll('*')].filter(e => ['rgb(240, 194, 71)', 'rgb(237, 194, 84)', 'rgb(234, 166, 71)'].includes(getComputedStyle(e).color)).length;
        const barre = [...document.querySelectorAll('svg rect, [data-colonna]')].map(e => e.getAttribute('fill') || e.style.background).filter(Boolean).slice(0, 10);
        return { h1: document.querySelector('h1')?.innerText, bollini: document.querySelectorAll('.grade-badge').length,
          legenda: !!document.querySelector('[data-testid=legenda-economia]'), risposta: document.querySelector('[data-testid=risposta]')?.innerText.replace(/\n/g, ' ').slice(0, 110),
          viola, oroVecchio, scorre: document.documentElement.scrollWidth > innerWidth + 1, barre };
      });
      console.log(w, url, JSON.stringify(r));
    }
    console.log(w, 'errori', JSON.stringify(errori.slice(0, 6)));
    await ctx.close();
  }
  await b.close();
})();
