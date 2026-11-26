const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  await pg.goto('https://statippica.onrender.com/#/', { waitUntil: 'networkidle', timeout: 120000 });
  const r = await pg.evaluate(async () => {
    const out = {};
    for (const n of ['NAD AL SHEBA', 'CONWAY HALL', 'GANYMEDE', 'CALGARY GAMES']) {
      const s = await (await fetch('/api/stallion/' + encodeURIComponent(n))).json();
      out[n] = s.nationality;
    }
    const l = await (await fetch('/api/stallions?limit=400')).json().catch(() => null);
    const arr = Array.isArray(l) ? l : (l?.stallions ?? l?.voci ?? []);
    out.lista = arr.filter(x => ['NAD AL SHEBA', 'CONWAY HALL', 'GANYMEDE', 'CALGARY GAMES'].includes(x.name ?? x.sire)).map(x => [(x.name ?? x.sire), x.nationality]);
    return out;
  });
  console.log('NAZ', JSON.stringify(r));
  await br.close();
})();
