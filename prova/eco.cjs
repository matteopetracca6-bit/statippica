const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const el = await (await fetch(`${B}/api/simulatore/elenco`)).json();
  const p = el.prossime.find(x => x.partenti >= 8) || el.prossime[0];
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    const errori = []; pg.on('pageerror', e => errori.push(e.message.slice(0, 160)));
    const t0 = Date.now();
    await pg.goto(`${B}/#/simulatore?tipo=prossima&pista=${encodeURIComponent(p.sigla)}&data=${p.data}&ora=${encodeURIComponent(p.ora)}`, { waitUntil: 'networkidle', timeout: 120000 });
    await pg.waitForSelector('text=Pesa il pronostico XGBoost', { timeout: 30000 }).catch(() => {});
    const pronto = Date.now() - t0;
    await pg.click('text=Simula 1000 volte'); 
    await pg.waitForSelector('text=Rifai le 1000', { timeout: 120000 }).catch(() => {});
    const r = await pg.evaluate(() => {
      const t = [...document.querySelectorAll('table.sim-tab')][0];
      const righe = t ? [...t.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.innerText.trim())) : [];
      return { selettore: !!document.body.innerText.includes('Pesa il pronostico XGBoost'), righe: righe.slice(0, 8).map(x => `${x[0].replace(/\n/g, ' ')}: vince ${x[1]} primi3 ${x[2]} pron ${x[5]}`),
        scorre: document.documentElement.scrollWidth > innerWidth + 1, prova: document.body.innerText.includes('tarato 35,6%') || document.body.innerText.includes('tarato 35.6%') };
    });
    console.log(w, p.pista, p.data, p.ora, 'pronto in', pronto, 'ms', JSON.stringify(r));
    console.log(w, 'errori', JSON.stringify(errori));
  }
  await b.close();
})();
