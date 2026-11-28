const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  const r0 = await (await fetch('https://statippica.onrender.com/api/pareggio/stalloni?mensile=1200')).json().catch(e => ({ err: String(e) }));
  if (r0.stalloni) {
    console.log('MON api', JSON.stringify(r0.conteggi), 'media', r0.media_figlio_popolazione, 'anni', JSON.stringify(r0.anni_giovani));
    const g = r0.stalloni.filter(s => s.gruppo === 'giovani').sort((a, b) => b.utile_atteso - a.utile_atteso);
    console.log('MON giovani top', JSON.stringify(g.slice(0, 5).map(s => [s.nome, s.monta, s.figli, s.debuttati, s.indice, s.guadagno_atteso, s.utile_atteso, s.forbice])));
    console.log('MON giovani coda', JSON.stringify(g.slice(-3).map(s => [s.nome, s.indice, s.utile_atteso])));
    const p = r0.stalloni.filter(s => s.gruppo === 'provati').sort((a, b) => b.utile_atteso - a.utile_atteso);
    console.log('MON provati top', JSON.stringify(p.slice(0, 3).map(s => [s.nome, s.monta, s.guadagno_atteso, s.utile_atteso])));
    console.log('MON senza', JSON.stringify(r0.senza_motivo.filter(x => !x[2] || x[2] < 2024)));
    console.log('MON pascia', JSON.stringify(r0.stalloni.filter(s => /PASCIA/.test(s.nome)).map(s => [s.nome, s.gruppo, s.figli, s.guadagno_atteso, s.utile_atteso])));
  } else console.log('MON api err', JSON.stringify(r0).slice(0, 300));
  const r1 = await (await fetch('https://statippica.onrender.com/api/pareggio/stalloni?mensile=600')).json();
  console.log('MON 600 in utile', r1.stalloni.filter(s => (s.utile_atteso ?? -1) > 0).length, '1200 in utile', r0.stalloni.filter(s => (s.utile_atteso ?? -1) > 0).length);
  for (const w of [390, 1280]) {
    const pg = await br.newPage({ viewport: { width: w, height: 900 } }); const err = []; pg.on('pageerror', e => err.push(e.message.slice(0, 120)));
    await pg.goto('https://statippica.onrender.com/#/stalloni', { waitUntil: 'networkidle', timeout: 90000 }); await pg.waitForTimeout(8000);
    const out = {};
    for (const o of ['Utile atteso', 'Resa per euro di monta', 'Vinto dai figli', 'Monta più bassa']) {
      await pg.click(`[data-testid="confronto-monta"] button:has-text("${o}")`); await pg.waitForTimeout(800);
      out[o] = await pg.evaluate(() => { const g = document.querySelector('[data-testid^="grafico-monta-"]'); return g ? g.getAttribute('data-testid') + ':' + g.innerText.replace(/\s+/g, ' ').slice(0, 90) : null; });
    }
    const righe = await pg.evaluate(() => document.querySelectorAll('[data-testid="elenco-monta"] > div').length);
    const barra = await pg.$('[data-testid="confronto-monta"] input[type=range]');
    let dopo = null;
    if (barra) { await barra.evaluate(el => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, '600'); el.dispatchEvent(new Event('input', { bubbles: true })); }); await pg.waitForTimeout(6000);
      dopo = await pg.evaluate(() => document.querySelector('[data-testid="confronto-monta"]').innerText.match(/\d+ su \d+ valutabili/)?.[0]); }
    console.log('MON pagina', w, JSON.stringify(out), 'righe', righe, 'dopo 600:', dopo, 'larg', await pg.evaluate(() => document.documentElement.scrollWidth), JSON.stringify(err));
    await pg.close();
  }
  await br.close();
})();
