const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  await pg.goto('https://statippica.onrender.com/#/', { waitUntil: 'networkidle', timeout: 120000 });
  const r = await pg.evaluate(async () => (await (await fetch('/api/cavalli/tutti?ordine=vincite')).json()).righe.slice(0, 5).map(x => [x.nome, x.vincite]));
  console.log('TUTTI', JSON.stringify(r));
  await br.close();
})();
