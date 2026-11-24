const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const c = await (await fetch(`${B}/api/calendar?limit=5`)).json();
  console.log('CAL', c.races?.length, JSON.stringify(c.races?.[0]?.entries?.[0]?.top3 ?? null).slice(0, 200));
  const el = await (await fetch(`${B}/api/simulatore/elenco`)).json();
  const p = el.prossime[0];
  const s = await (await fetch(`${B}/api/simulatore/corsa?tipo=prossima&pista=${encodeURIComponent(p.sigla)}&data=${p.data}&ora=${encodeURIComponent(p.ora)}`)).json();
  console.log('SIM', s.partenza, s.partenza_fonte, JSON.stringify(s.cavalli?.slice(0, 2).map(x => [x.nome, x.pronostico_top3, x.pronostico_vince])));
  const b = await chromium.launch();
  for (const url of ['/calendario', `/simulatore?tipo=prossima&pista=${encodeURIComponent(p.sigla)}&data=${p.data}&ora=${encodeURIComponent(p.ora)}`]) {
    const pg = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errori = []; pg.on('pageerror', e => errori.push(e.message.slice(0, 160)));
    await pg.goto(`${B}/#${url}`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(5000);
    console.log('PAGINA', url.slice(0, 20), 'h1', await pg.evaluate(() => document.querySelector('h1')?.innerText), 'errori', JSON.stringify(errori));
  }
  await b.close();
})();
