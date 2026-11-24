const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  for (const t of ['stalloni', 'allenatori?mensile=1200', 'ippodromi', 'aste']) {
    const t0 = Date.now(); const r = await (await fetch(`${B}/api/rende/${t}`)).json(); const ms = Date.now() - t0;
    const v = (r.voci || []);
    const k = { stalloni: 'premi_per_nato', 'allenatori?mensile=1200': 'premi_per_cavallo', ippodromi: 'premi_per_partente', aste: 'saldo' }[t];
    const top = [...v].sort((a, b) => b[k] - a[k]).slice(0, 5).map(x => `${x.nome}:${x[k]}`);
    console.log('API', t, ms + 'ms', 'voci', v.length, r.message || '', JSON.stringify(top), t === 'aste' ? `padri ${r.per_padre?.length} ritrovati ${r.ritrovati}/${r.lotti_venduti}` : '');
  }
  for (const [p, m] of [['VARENNE', ''], ['FACE TIME BOURBON', ''], ['ORLANDO VICI', '']]) {
    const r = await (await fetch(`${B}/api/pareggio/incrocio?padre=${encodeURIComponent(p)}&madre=${m}&mensile=1200`)).json();
    console.log('INCROCIO', p, 'peso_figli', r.peso_figli, (r.probabilita || []).map(x => `${x.voto}:${x.p}`).join(' '), 'utile', r.utile_atteso);
  }
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    const errori = []; pg.on('pageerror', e => errori.push(e.message.slice(0, 120)));
    for (const v of ['stalloni', 'allenatori', 'ippodromi', 'aste']) {
      await pg.goto(`${B}/#/rende?vista=${v}`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(5000);
      const r = await pg.evaluate(() => ({ h1: document.querySelector('h1')?.innerText, tab: document.querySelector('[role=tab][aria-selected=true]')?.innerText.split('\n')[0],
        righe: document.querySelectorAll('.ed-riga').length, prima: document.querySelector('.ed-riga')?.innerText.replace(/\n/g, ' | ').slice(0, 150),
        scorre: document.documentElement.scrollWidth > innerWidth + 1 }));
      console.log(w, v, JSON.stringify(r));
    }
    console.log(w, 'errori', JSON.stringify(errori));
  }
  await b.close();
})();
