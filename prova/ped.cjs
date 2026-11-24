const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('https://statippica.onrender.com/#/pedigree?nome=CHICCA%20ROSS', { waitUntil: 'networkidle', timeout: 90000 });
    await p.waitForTimeout(4000);
    const misura = () => p.evaluate(() => {
      const cells = [...document.querySelectorAll('button[title="Tocca per i dettagli"]')];
      let tagliati = 0, alte = 0, ex = [], bollOver = 0;
      for (const c of cells) {
        const nome = c.children[0]?.querySelector('span[style*="font-weight: 700"]');
        if (nome && nome.scrollWidth > nome.clientWidth + 1) { tagliati++; if (ex.length < 8) ex.push(nome.innerText); }
        if (c.scrollHeight > c.clientHeight + 1) alte++;
        const r2 = c.children[c.children.length - 1]; const cr = c.getBoundingClientRect();
        for (const x of r2.children) { const xr = x.getBoundingClientRect(); if (xr.right > cr.right + 1) bollOver++; }
      }
      // linee: ogni linea verticale deve finire al centro del genitore
      const vert = [...document.querySelectorAll('span[aria-hidden]')].filter(s => s.style.borderLeft && s.style.height === '50%');
      const fasce = [...document.querySelectorAll('div[aria-hidden]')].length;
      const etich = [...document.querySelectorAll('div')].filter(d => /^lato (padre|madre) →$/i.test(d.innerText)).length;
      return { caselle: cells.length, nomi_tagliati: tagliati, es: ex, troppo_alte: alte, voti_fuori: bollOver, linee_vert: vert.length, fasce, etichette_lato: etich };
    });
    // controllo geometrico linee: per ogni coppia padre/madre, la giunzione coincide col centro del figlio
    const giunz = () => p.evaluate(() => {
      const grid = [...document.querySelectorAll('div')].find(d => d.style.gridTemplateRows && d.style.gridTemplateRows.includes('repeat'));
      const items = [...grid.children].filter(x => x.style.position === 'relative');
      let err = 0, n = 0;
      for (const it of items) {
        const stubR = [...it.children].find(s => s.tagName === 'SPAN' && s.style.right);
        if (!stubR) continue;
        const y = stubR.getBoundingClientRect().top; const x = stubR.getBoundingClientRect().right;
        const v = [...grid.querySelectorAll('span[aria-hidden]')].filter(s => s.style.borderLeft && Math.abs(s.getBoundingClientRect().left - x) < 2);
        const hit = v.some(s => { const r = s.getBoundingClientRect(); return Math.abs(r.top - y) < 1.5 || Math.abs(r.bottom - y) < 1.5; });
        n++; if (!hit) err++;
      }
      return `giunzioni ${n - err}/${n} ok`;
    });
    console.log(w, 'iniziale', JSON.stringify(await misura()), await giunz());
    for (const g of ['Nonni', 'Bisnonni', 'Trisavoli', '5ª generazione']) {
      await p.click(`button:text-is("${g}")`); await p.waitForTimeout(900);
      console.log(w, g, JSON.stringify(await misura()), await giunz());
    }
  }
  await b.close();
})();
