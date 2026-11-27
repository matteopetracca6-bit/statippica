const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  for (const u of ['horse/FLY%20HOME/2021', 'horse/EBANO%20VALCH/2021', 'horse/VARENNE/1995']) {
    const pg = await br.newPage({ viewport: { width: 390, height: 900 } });
    await pg.goto('https://statippica.onrender.com/#/' + u, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(12000); for (const b of await pg.$$('button.sez-testa[aria-expanded="false"]')) { await b.click(); await pg.waitForTimeout(400); }
    await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 300)); } });
    await pg.waitForTimeout(6000);
    const r = await pg.evaluate(() => {
      const out = [];
      const vis = el => { for (let e = el; e; e = e.parentElement) { if (e.tagName === 'DETAILS' && !e.open) return false; if (e.tagName === 'SUMMARY') return false; } return el.offsetParent !== null; };
      const els = [...document.querySelectorAll('p, div, span, li, small')].filter(e => {
        const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
        return own.length > 40 && vis(e);
      });
      for (const e of els) {
        let t = e.innerText.replace(/\s+/g, ' ').trim(); if (t.length < 60) continue;
        let h = ''; let x = e; while (x && !h) { const tid = x.getAttribute && x.getAttribute('data-testid'); if (tid) h = tid; x = x.parentElement; }
        out.push(`[${h}] ${t.slice(0, 220)} (${t.length})`);
      }
      return { tot: document.body.innerText.length, n: out.length, out };
    });
    console.log('TXT ' + u + ' tot=' + r.tot + ' n=' + r.n); r.out.forEach(l => console.log('TXT  ' + l));
    await pg.close();
  }
  await br.close();
})();
