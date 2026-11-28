const { chromium } = require('playwright');
(async () => {
  for (const n of ['LEMON%20DRA', 'VARENNE', 'SPEEDY%20SOMOLLI']) {
    const r = await (await fetch('https://statippica.onrender.com/api/stallion/' + n + '/figli')).json();
    const f = r.figli || []; console.log('FIG api', n, f.length, 'con voto', f.filter(x => x.grade).length, 'storici', f.filter(x => x.scala === 'storico').length, JSON.stringify(f.slice(0, 2).map(x => [x.name, x.birth_year, x.grade, x.scala, Math.round(x.career_earnings || 0)])));
  }
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 390, height: 900 } }); const err = []; pg.on('pageerror', e => err.push(e.message.slice(0, 120)));
  await pg.goto('https://statippica.onrender.com/#/stallion/LEMON%20DRA', { waitUntil: 'networkidle', timeout: 90000 }); await pg.waitForTimeout(8000);
  const b = await pg.$('#sez-stallone-figli button.sez-testa'); if (b && (await b.getAttribute('aria-expanded')) === 'false') { await b.click(); await pg.waitForTimeout(5000); }
  const r = await pg.evaluate(() => { const f = document.querySelector('[data-testid="figli-stallone"]');
    return { testa: f?.innerText.replace(/\s+/g, ' ').slice(0, 260), righe: f?.querySelectorAll('tbody tr').length, cifre: document.querySelector('[data-testid="intestazione-scheda"]')?.innerText.replace(/\s+/g, ' ').slice(0, 300), larg: document.documentElement.scrollWidth }; });
  console.log('FIG pagina', JSON.stringify(r), JSON.stringify(err));
  await br.close();
})();
