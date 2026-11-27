const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com/#';
const PAG = ['/', '/stalloni', '/stalloni/albero', '/stalloni/classifiche', '/allevamento', '/allevatori/classifiche', '/trend', '/pedigree', '/fattrici',
  '/calendario', '/simulatore', '/gran-premi', '/guidatori', '/allenatori', '/proprietari', '/ippodromi', '/mercato', '/conto', '/rende', '/generazioni',
  '/generazione-m', '/controllo', '/economia', '/scuderia', '/metodo', '/metodo/pronostico', '/qualifiche', '/advisor', '/validazione', '/compare', '/seguiti',
  ['/fattrici', /#\/fattrice\//], ['/stalloni', /#\/stallion\//], ['/guidatori', /#\/guidatore\//], ['/allenatori', /#\/allenatore\//],
  ['/proprietari', /#\/proprietario\//], ['/ippodromi', /#\/ippodromo\//], ['/allevamento', /#\/allevatore\//]];
async function prosa(pg) {
  return pg.evaluate(() => {
    const vis = el => { for (let e = el; e; e = e.parentElement) { if (e.tagName === 'DETAILS' && !e.open) return false; if (e.tagName === 'SUMMARY' || e.tagName === 'NAV' || e.tagName === 'HEADER') return false; } return el.offsetParent !== null; };
    const out = []; const seen = new Set();
    for (const e of document.querySelectorAll('main p, main div, main span, main li, p, div, span, li')) {
      if (seen.has(e)) continue;
      const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      if (own.length < 35 || !vis(e)) continue;
      const t = e.innerText.replace(/\s+/g, ' ').trim(); if (t.length < 90) continue;
      if (e.closest('table')) continue;
      e.querySelectorAll('*').forEach(x => seen.add(x));
      let h = ''; for (let x = e; x && !h; x = x.parentElement) h = (x.getAttribute && (x.getAttribute('data-testid') || x.id)) || '';
      out.push(`[${h}] ${t.slice(0, 150)} (${t.length})`);
    }
    return { tot: document.body.innerText.length, out };
  });
}
(async () => {
  const br = await chromium.launch();
  const lavora = async (p) => {
    const pg = await br.newPage({ viewport: { width: 390, height: 900 } });
    let u = typeof p === 'string' ? p : p[0];
    try {
      await pg.goto(B + u, { waitUntil: 'networkidle', timeout: 90000 }); await pg.waitForTimeout(7000);
      if (typeof p !== 'string') {
        const href = await pg.evaluate(re => [...document.querySelectorAll('a[href]')].map(a => a.href).find(h => new RegExp(re).test(h)), p[1].source);
        if (!href) { console.log(`PRO ${u} -> nessun link`); await pg.close(); return; }
        u = decodeURIComponent(href.split('#')[1]); await pg.goto(href, { waitUntil: 'networkidle', timeout: 90000 }); await pg.waitForTimeout(7000);
      }
      for (const b of await pg.$$('button.sez-testa[aria-expanded="false"]')) { try { await b.click(); await pg.waitForTimeout(300); } catch {} }
      await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 200)); } });
      await pg.waitForTimeout(3000);
      const r = await prosa(pg);
      console.log(`PRO ===== ${u} tot=${r.tot} blocchi=${r.out.length}\n` + r.out.map(l => 'PRO   ' + l).join('\n'));
    } catch (e) { console.log(`PRO ${u} ERR ${e.message.slice(0, 80)}`); }
    await pg.close();
  };
  const coda = [...PAG]; await Promise.all([0, 1, 2, 3].map(async () => { while (coda.length) await lavora(coda.shift()); }));
  await br.close();
})();
