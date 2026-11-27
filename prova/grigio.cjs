const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 390, height: 844 } }); const err = [];
  pg.on('pageerror', e => err.push(e.message));
  await pg.goto('https://statippica.onrender.com/#/horse/FLY%20HOME/2021', { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(8000);
  console.log('ROANO', JSON.stringify(await pg.evaluate(() => { const i = document.querySelector('.manto-sesso img'); return { testo: document.querySelector('.manto-sesso')?.innerText.replace(/\n/g, ' '), img: i?.getAttribute('src'), caricata: i ? i.complete && i.naturalWidth > 0 : false, larg: document.documentElement.scrollWidth }; })), JSON.stringify(err));
  await br.close();
})();
