const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const v = await (await fetch(`${B}/api/calendar/verifica?giorni=7`)).json();
  const per = {}; for (const c of v.corse) per[c.race_date] = (per[c.race_date] || 0) + 1;
  console.log('VERIFICA corse per giorno', JSON.stringify(per), 'in attesa', v.in_attesa, JSON.stringify((v.in_attesa_elenco || []).map(x => x.race_date + ' ' + x.pista + ' ' + x.corsa)));
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const pg = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    const errori = []; pg.on('pageerror', e => errori.push(e.message.slice(0, 160)));
    await pg.goto(`${B}/#/calendario`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(5000);
    const r = await pg.evaluate(() => ({
      giorni: [...document.querySelectorAll('[aria-label=Giorno] button')].map(b => b.innerText).join(' | '),
      piste: [...document.querySelectorAll('[aria-label=Ippodromo] button')].map(b => b.innerText).join(' | '),
      titoli: [...document.querySelectorAll('.cal-giorno')].map(e => e.innerText).join(' | '),
      riunioni: [...document.querySelectorAll('.cal-riunione-testa')].map(e => e.innerText.replace(/\n/g, ' ')).slice(0, 6),
      prima: document.querySelector('.cal-corsa-testa')?.innerText.replace(/\n/g, ' | ').slice(0, 200),
      riga: document.querySelector('.cal-riga')?.innerText.replace(/\n/g, ' | ').slice(0, 200),
      simula: document.querySelectorAll('[data-testid=simula]').length,
      scorre: document.documentElement.scrollWidth > innerWidth + 1 }));
    console.log(w, 'PROSSIME', JSON.stringify(r));
    // segui un cavallo e filtra
    await pg.locator('.cal-riga [data-testid=stellina-segui]').first().click().catch(() => {}); await pg.waitForTimeout(600);
    const miei = await pg.locator('[data-testid=solo-miei]').innerText().catch(() => 'nessun filtro');
    await pg.click('[data-testid=solo-miei]').catch(() => {}); await pg.waitForTimeout(600);
    console.log(w, 'MIEI', miei, 'corse mostrate', await pg.locator('.cal-corsa').count());
    await pg.click('[data-testid=tab-verifica]'); await pg.waitForTimeout(5000);
    const v2 = await pg.evaluate(() => ({ attesa: document.querySelector('[data-testid=giorni-in-attesa]')?.innerText.replace(/\n/g, ' | ').slice(0, 300) ?? null,
      giorni: [...document.querySelectorAll('[data-testid=scelta-giorno] button')].map(b => b.innerText.replace(/\n/g, ' ')).slice(0, 9).join(' | '),
      scorre: document.documentElement.scrollWidth > innerWidth + 1 }));
    console.log(w, 'VERIFICA', JSON.stringify(v2));
    const lun = pg.locator('[data-testid=scelta-giorno] button', { hasText: 'lun' }).first();
    if (await lun.count()) { await lun.click(); await pg.waitForTimeout(800); console.log(w, 'LUNEDI corse', await pg.locator('.verifica-corsa').count()); }
    console.log(w, 'errori', JSON.stringify(errori));
  }
  await b.close();
})();
