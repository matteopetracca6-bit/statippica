const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const t0 = Date.now(); const d = await (await fetch(`${B}/api/generazioni`)).json(); console.log('API elenco', Date.now() - t0 + 'ms', d.message || '', 'anni', JSON.stringify(d.anni), 'storiche', JSON.stringify(d.storiche_complete), 'recupero', JSON.stringify(d.in_recupero));
  for (const g of d.generazioni || []) console.log('GEN', g.anno, `nati ${g.nati} corsi ${g.corsi} (${g.quota_corsi}%) vinc ${g.quota_vincitori}% premi ${g.premi_totali} medi ${g.premi_medi} tip ${g.premi_mediani} rec ${g.record_mediano}/${g.record_migliore} (${g.con_record}) corse ${g.corse_medie} F ${g.quota_femmine}% top10 ${g.quota_top10}% padri ${g.padri} camp ${g.campione?.nome} ${g.campione?.premi} voti ${JSON.stringify(g.voti)}`);
  for (const a of [2008, 2011, 2016]) {
    const t1 = Date.now(); const x = await (await fetch(`${B}/api/generazioni/${a}`)).json();
    console.log('DETT', a, Date.now() - t1 + 'ms', 'copertura', x.copertura_corse, 'per_eta', x.per_eta ? x.per_eta.length : null, 'migliori', (x.migliori || []).slice(0, 3).map(m => m.nome + ':' + m.premi).join(','), 'stalloni', (x.stalloni || []).slice(0, 3).map(m => m.nome).join(','), 'fasce', (x.record || []).length);
  }
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    const errori = []; pg.on('pageerror', e => errori.push(e.message.slice(0, 160)));
    await pg.goto(`${B}/#/generazioni`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(6000);
    const r = await pg.evaluate(() => ({ h1: document.querySelector('h1')?.innerText, chip: document.querySelectorAll('[aria-label="Scegli l\'annata"] button').length,
      scheda: !!document.querySelector('[data-testid=scheda-annata]'), linee: document.querySelectorAll('.recharts-line').length, svg: document.querySelectorAll('.recharts-surface').length,
      righe_tab: document.querySelectorAll('table tbody tr').length, scorre: document.documentElement.scrollWidth > innerWidth + 1,
      testa: document.querySelector('[data-testid=scheda-annata]')?.innerText.replace(/\n/g, ' | ').slice(0, 300) }));
    console.log(w, JSON.stringify(r)); console.log(w, 'errori', JSON.stringify(errori));
  }
  await b.close();
})();
