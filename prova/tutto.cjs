const { chromium } = require('playwright');
const B = 'https://statippica.onrender.com';
(async () => {
  const br = await chromium.launch();
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const pg = await br.newPage({ viewport: vp });
    const err = []; pg.on('pageerror', e => err.push(e.message));
    const vai = async (u, t = 9000) => { await pg.goto(`${B}/#${u}`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(t); };
    const larg = () => pg.evaluate(() => document.documentElement.scrollWidth);
    await vai('/calendario');
    await pg.locator('.cal-riunione, [data-testid=riunione]').first().click().catch(() => {});
    const km = await pg.evaluate(() => [...document.querySelectorAll('.cal-meta span')].map(e => e.innerText).filter(t => t.includes('km previsto')).slice(0, 4));
    console.log('CAL', vp.width, JSON.stringify(km), await larg());
    for (const u of ['/guidatori', '/allenatori', '/proprietari']) {
      await vai(u, 6000);
      console.log('PERS', vp.width, u, await pg.evaluate(() => [...document.querySelectorAll('[data-testid=linguette-persone] a')].map(a => (a.getAttribute('aria-current') ? '*' : '') + a.innerText.split('\n')[0]).join('/')), await larg());
    }
    for (const [u, k] of [['/guidatore/A.Di%20Nardo', 'guidatore'], ['/allenatore/ANTONIO%20SIMIOLI', 'allenatore'], ['/stallion/NAD%20AL%20SHEBA', 'stallone']]) {
      await vai(u, 10000);
      console.log('SCHEDA', vp.width, k, JSON.stringify((await pg.evaluate(k => document.querySelector(`[data-testid=scheda-in-piu-${k}]`)?.innerText.slice(0, 400).replace(/\n/g, ' | '), k)) ?? 'ASSENTE'), await larg());
    }
    console.log('DBG', JSON.stringify(await pg.evaluate(async () => { const v = await (await fetch('/api/calendar/verifica?giorni=62')).json(); const t = await (await fetch('/api/track/TORINO')).json(); return { piste: (v.piste || []).slice(0, 6), nome: t.nome, codice: t.codice }; })));
    await vai('/ippodromo/TORINO', 10000);
    console.log('IPPO', vp.width, JSON.stringify((await pg.evaluate(() => document.querySelector('[data-testid=ippodromo-in-piu]')?.innerText.slice(0, 500).replace(/\n/g, ' | '))) ?? 'ASSENTE'), await larg());
    await vai('/metodo/pronostico', 10000);
    console.log('METODO', vp.width, await pg.evaluate(() => [...document.querySelectorAll('.ed-tit')].map(e => e.innerText).join(' / ')), await larg());
    console.log('ERR', vp.width, JSON.stringify(err.slice(0, 6)));
  }
  await br.close();
})();
