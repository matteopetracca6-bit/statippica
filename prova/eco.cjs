const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com/#';
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const errori = [];
    p.on('pageerror', e => errori.push(e.message.slice(0, 120)));
    p.on('console', m => { if (m.type() === 'error') errori.push('console: ' + m.text().slice(0, 120)); });
    const prova = async (url, attesa, nota) => {
      await p.goto(B + url, { waitUntil: 'networkidle', timeout: 90000 }); await p.waitForTimeout(3500);
      const r = await p.evaluate(() => {
        const h1 = document.querySelector('h1')?.innerText;
        const barra = document.querySelector('[data-testid=barra-spese]')?.innerText.replace(/\n/g, ' ').slice(0, 160);
        const risp = document.querySelector('[data-testid=risposta]')?.innerText.replace(/\n/g, ' ').slice(0, 160);
        const tab = document.querySelector('[role=tab][aria-selected=true]')?.innerText.split('\n')[0];
        const largo = document.documentElement.scrollWidth > window.innerWidth + 1;
        return { h1, tab, barra, risp, scorre_lato: largo };
      });
      console.log(w, nota || url, JSON.stringify(r));
    };
    await prova('/puledro?padre=FACE%20TIME%20BOURBON');
    await prova('/puledro?modo=incrocio&padre=FACE%20TIME%20BOURBON');
    await prova('/puledro?modo=vendo');
    await prova('/tenere');
    await prova('/scuderia');
    await prova('/mercato');
    await prova('/mercato?vista=generazione');
    await prova('/mercato?vista=voti');
    await prova('/pareggio', null, 'vecchio /pareggio');
    await prova('/economia', null, 'vecchio /economia');
    await prova('/aste', null, 'vecchio /aste');
    // cambio spese: vale ovunque
    await p.goto(B + '/tenere', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    await p.click('[data-testid=cambia-spese]'); await p.fill('[data-testid=input-mensile]', '900'); await p.press('[data-testid=input-mensile]', 'Enter');
    await p.goto(B + '/mercato?vista=voti', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    console.log(w, 'dopo 900 in In corsa, Mercato dice:', await p.evaluate(() => document.querySelector('[data-testid=barra-spese]')?.innerText.replace(/\n/g, ' ').slice(0, 120)));
    // menu Economia
    const menu = await p.evaluate(() => [...document.querySelectorAll('a')].map(a => a.getAttribute('href')).filter(h => h && /puledro|tenere|scuderia|mercato|pareggio|economia/.test(h)));
    console.log(w, 'link economia nella pagina', JSON.stringify([...new Set(menu)]));
    console.log(w, 'errori', JSON.stringify(errori.slice(0, 6)));
    await ctx.close();
  }
  await b.close();
})();
