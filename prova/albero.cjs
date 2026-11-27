const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch(); const pg = await br.newPage();
  await pg.goto('https://statippica.onrender.com/#/', { waitUntil: 'networkidle', timeout: 120000 });
  const r = await pg.evaluate(async () => {
    const a = await (await fetch('/api/stalloni/albero')).json();
    const st = await (await fetch('/api/stallions')).json();
    const lista = Array.isArray(st) ? st : (st.stallions ?? st.voci ?? []);
    const nell = new Set(a.stalloni.map(s => s.nome));
    const votati = lista.filter(s => s.grade && s.grade !== 'N/A').map(s => String(s.name).toUpperCase());
    const tutti = new Map(a.stalloni.map(s => [s.nome, s])); const mancano = votati.filter(n => !nell.has(n)); const info = lista.filter(s => mancano.includes(String(s.name).toUpperCase())); const fasce = {}; for (const s of info) { const k = (s.n_figli_totali ?? 0) >= 10 ? '10+' : String(s.n_figli_totali ?? 0); fasce[k] = (fasce[k] ?? 0) + 1; } const dieci = info.filter(s => (s.n_figli_totali ?? 0) >= 10).slice(0, 10).map(s => [s.name, s.n_figli_totali, s.grade]);
    const es = ['WAIKIKI BEACH', 'SPEEDY CROWN', 'ZEBU', 'VARENNE', 'NAPOLEON'].map(n => { const s = a.stalloni.find(x => x.nome === n); return [n, s ? [s.generazione, s.figli, s.voto, s.posto_generazione] : 'ASSENTE']; });
    return { albero: a.stalloni.length, generazioni: a.generazioni.map(g => [g.nome, g.stalloni]), votati: votati.length, mancano: mancano.length, esempi_mancano: mancano.slice(0, 20), fasce, dieci, chiavi: Object.keys(lista[0] || {}).join(','), es };
  });
  console.log('ALBERO', JSON.stringify(r));
  await br.close();
})();
