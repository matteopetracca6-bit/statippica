const { chromium } = require('playwright');
const [nome, anno] = process.argv.slice(2);
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 390, height: 844 } });
  await pg.goto(`https://statippica.onrender.com/#/horse/${encodeURIComponent(nome)}/${anno}`, { waitUntil: 'networkidle', timeout: 120000 }); await pg.waitForTimeout(8000);
  console.log('SCHEDA', nome, JSON.stringify(await pg.evaluate(() => ({ manto: document.querySelector('.manto-sesso')?.innerText.replace(/\n/g, ' '), img: !!document.querySelector('.manto-sesso img'), larg: document.documentElement.scrollWidth }))));
  await br.close();
})();
