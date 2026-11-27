const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com/#';
const RE0 = [/#\/guidatore\//, /#\/allenatore\//, /#\/proprietario\//, /#\/ippodromo\//, /#\/stallion\//, /#\/fattrice\//];
const PAG = ['/stallion/PASCIA\'%20LEST', '/fattrice/ZIGIS%20SISTER', '/horse/FLY%20HOME/2021', '/horse/VARENNE/1995', '/', '/calendario', '/simulatore', '/guidatori', '/allenatori', '/proprietari', '/ippodromi', '/ippodromo/PADOVA', '/allevamento', '/allevatori/classifiche', '/stalloni', '/generazione-m', '/scuderia', '/advisor', '/validazione', '/cavalli'];
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
    const pg = await br.newPage({ viewport: { width: 390, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message.slice(0, 120)));
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
      console.log(`PRO ===== ${u} tot=${r.tot} blocchi=${r.out.length} errori=${JSON.stringify(errs)} larg=${await pg.evaluate(() => document.documentElement.scrollWidth)}\n` + r.out.map(l => 'PRO   ' + l).join('\n'));
    } catch (e) { console.log(`PRO ${u} ERR ${e.message.slice(0, 80)}`); }
    await pg.close();
  };
  const RE = []; const p0 = await br.newPage(); await p0.goto(B + '/horse/FLY%20HOME/2021', { waitUntil: 'networkidle', timeout: 90000 }); await p0.waitForTimeout(8000);
  for (const b of await p0.$$('button.sez-testa[aria-expanded="false"]')) { try { await b.click(); await p0.waitForTimeout(300); } catch {} }
  await p0.waitForTimeout(4000);
  const hrefs = await p0.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')));
  for (const re of RE) { const h = hrefs.find(x => re.test(x.startsWith('#') ? x : '#' + x)); if (h) PAG.push(decodeURIComponent(h.replace(/^#/, ''))); else console.log('PRO manca ' + re.source); }
  await p0.close();
  const coda = [...PAG]; await Promise.all([0, 1, 2, 3].map(async () => { while (coda.length) await lavora(coda.shift()); }));
  await br.close();
})();
