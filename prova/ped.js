const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('https://statippica.onrender.com/#/pedigree?nome=CHICCA%20ROSS', { waitUntil: 'networkidle', timeout: 90000 });
    await p.waitForTimeout(4000);
    const misura = () => p.evaluate(() => {
      const cells = [...document.querySelectorAll('button[title="Tocca per i dettagli"]')];
      let tagliati = 0, alte = 0, ex = [];
      for (const c of cells) {
        const nome = c.children[0]?.querySelector('span[style*="font-weight: 700"]');
        if (nome && nome.scrollWidth > nome.clientWidth + 1) { tagliati++; if (ex.length < 5) ex.push(nome.innerText); }
        if (c.scrollHeight > c.clientHeight + 1) alte++;
      }
      return { caselle: cells.length, bollini: document.querySelectorAll('button .grade-badge').length, nomi_tagliati: tagliati, es: ex, troppo_alte: alte };
    });
    console.log(w, 'iniziale', JSON.stringify(await misura()));
    const c = await p.$$('button[title="Tocca per i dettagli"]');
    if (c[1]) { await c[1].click(); await p.waitForTimeout(500);
      console.log('dettaglio', await p.evaluate(() => { const e = document.querySelector('[data-testid=dettaglio-antenato]'); return e ? e.innerText.replace(/\n/g, ' | ').slice(0, 250) : 'NESSUN PANNELLO'; })); }
    for (const g of ['3', '4', '5']) {
      const bt = (await p.$$('button')).filter(async x => true);
      const btn = await p.evaluateHandle(g => [...document.querySelectorAll('button')].find(x => x.innerText.trim().startsWith(g) && x.innerText.length < 12), g);
      if (!btn.asElement()) continue; await btn.asElement().click(); await p.waitForTimeout(800);
      console.log(w, 'gen', g, JSON.stringify(await misura()));
    }
  }
  await b.close();
})();
