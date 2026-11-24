const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
const G = { campione: ["SSS", "SS", "S"], buono: ["A", "B"], discreto: ["C", "D"], poco: ["E", "F"], non_corre: ["Non corre"] };
(async () => {
  for (const [p, m] of [['FACE TIME BOURBON', ''], ['VARENNE', ''], ['READY CASH', 'CHICCA ROSS'], ['ORLANDO VICI', '']]) {
    const v = await (await fetch(`${B}/api/puledro/valore?padre=${encodeURIComponent(p)}&madre=${encodeURIComponent(m)}&mensile=1200&margine=0&asta=0&prezzo=`)).json();
    const i = await (await fetch(`${B}/api/pareggio/incrocio?padre=${encodeURIComponent(p)}&madre=${encodeURIComponent(m)}&mensile=1200&monta=`)).json();
    const casi = Object.fromEntries(v.con_regola.scenari.map(s => [s.chiave, s.p]));
    const dalGrafico = Object.fromEntries(Object.entries(G).map(([k, vs]) => [k, Math.round(10 * i.probabilita.filter(x => vs.includes(x.voto)).reduce((t, x) => t + x.p, 0)) / 10]));
    console.log('COERENZA', p, m, 'casi', JSON.stringify(casi), 'grafico', JSON.stringify(dalGrafico), 'prezzo_max', v.con_regola.prezzo_massimo);
  }
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    const errori = []; pg.on('pageerror', e => errori.push(e.message.slice(0, 160)));
    await pg.goto(`${B}/#/conto`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(4000);
    const campo = pg.locator('[data-testid=modulo-puledro] input').first();
    await campo.click(); await campo.fill('READY'); await pg.waitForTimeout(2500);
    const opzioni = await pg.locator('[role=option]').count();
    const prima = await pg.locator('[role=option]').first().innerText().catch(() => '');
    await pg.locator('[role=option]').first().click(); await pg.waitForTimeout(800);
    const aperta = await pg.locator('[role=option]').count();
    const valore = await campo.inputValue();
    await pg.waitForTimeout(3500);
    const risp = await pg.evaluate(() => document.querySelector('[data-testid=risposta]')?.innerText.replace(/\n/g, ' | ').slice(0, 120));
    const larga = await pg.evaluate(() => { const e = document.querySelector('[data-testid=modulo-puledro]'); return e ? e.scrollWidth > e.clientWidth + 1 : null; });
    console.log(w, 'TENDINA opzioni', opzioni, 'prima', JSON.stringify(prima.replace(/\n/g, ' ')), 'dopo il clic aperta', aperta, 'valore', valore, 'risposta', risp, 'esce', larga);
    // cavallo
    await pg.click('[data-testid=scegli-cavallo]'); await pg.waitForTimeout(2500);
    const c2 = pg.locator('[data-testid=modulo-cavallo] input').first();
    await c2.click(); await c2.fill('FREE TIME'); await pg.waitForTimeout(2500);
    const n2 = await pg.locator('[role=option]').count();
    await pg.locator('[role=option]').first().click().catch(() => {}); await pg.waitForTimeout(3500);
    console.log(w, 'TENDINA cavallo opzioni', n2, 'aperta', await pg.locator('[role=option]').count(), 'valore', await c2.inputValue(),
      'risposta', await pg.evaluate(() => document.querySelector('[data-testid=risposta]')?.innerText.replace(/\n/g, ' | ').slice(0, 100)));
    console.log(w, 'errori', JSON.stringify(errori));
  }
  await b.close();
})();
