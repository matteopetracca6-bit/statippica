"""Genera il componente React con i 12 fotogrammi del galoppo."""
righe = open('/tmp/tracciati.txt').read().split('\n')
W,H = righe[0].split()
tracciati = [r for r in righe[1:] if r.strip()]
assert len(tracciati)==12, len(tracciati)

DUR = 0.72   # un ciclo di galoppo completo: 12 fotogrammi in 0,72s = 60ms l'uno

# Ogni fotogramma resta visibile per 1/12 del ciclo e poi scompare di netto.
# Niente dissolvenza: e' cosi' che funziona la sequenza fotografica originale,
# e una dissolvenza farebbe comparire due cavalli sovrapposti.
keyframes = []
for i in range(12):
    a = i*100/12
    b = (i+1)*100/12
    keyframes.append(
      f"  @keyframes galoppo-{i} {{\n"
      f"    0%, {a:.4f}% {{ opacity: 0; }}\n"
      f"    {a+0.0001:.4f}%, {b-0.0001:.4f}% {{ opacity: 1; }}\n"
      f"    {b:.4f}%, 100% {{ opacity: 0; }}\n"
      f"  }}")

classi = "\n".join(
  f"  .galoppo-f{i} {{ animation: galoppo-{i} {DUR}s steps(1, end) infinite; }}"
  for i in range(12))

paths = "\n".join(
  f'          <path className="galoppo-f{i}" d="{t}" fill="url(#pelo-cavallo)" />'
  for i,t in enumerate(tracciati))

comp = f'''/**
 * Cavallo al galoppo, animazione di caricamento.
 *
 * PERCHE' 12 FOTOGRAMMI E NON UNA FIGURA CON LE ZAMPE CHE RUOTANO.
 * La versione precedente era un cavallo con il sulky costruito a mano: corpo
 * ovale, zampe come segmenti che oscillavano avanti e indietro. Non sembrava
 * un cavallo, e il motivo e' che il galoppo non e' un movimento simmetrico.
 * E' un'andatura a quattro battute in cui le due zampe di uno stesso lato non
 * fanno la stessa cosa e in un istante il cavallo e' completamente sospeso.
 * Far oscillare quattro segmenti in controfase da' un trotto meccanico, e a
 * occhio nessuno riesce a indovinare gli angoli giusti.
 *
 * Quindi le posizioni non sono inventate: sono le 12 del ciclo di galoppo
 * della sequenza fotografica di riferimento (opera di pubblico dominio,
 * Wikimedia Commons, autore Yodalr, rilasciata senza condizioni:
 * https://commons.wikimedia.org/wiki/File:Horse_gif.gif). Ogni fotogramma e'
 * stato convertito in un tracciato vettoriale, quindi resta nitido a
 * qualunque dimensione e non c'e' nessuna immagine da scaricare.
 *
 * I fotogrammi si alternano di netto, uno per volta, senza dissolvenza: e'
 * cosi' che funziona la sequenza originale, e una dissolvenza mostrerebbe due
 * cavalli sovrapposti a meta' strada.
 *
 * Tutti e 12 i tracciati sono ritagliati sullo stesso riquadro, calcolato
 * sull'unione dei fotogrammi: con un ritaglio per fotogramma il cavallo
 * sobbalzerebbe per un difetto di allineamento invece che per il movimento.
 */
export default function TrottingHorseLoader({{
  label = "Caricamento...",
  size = 96,
}}: {{ label?: string; size?: number }}) {{
  return (
    <div
      style={{{{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "14px",
        padding: "40px 20px",
      }}}}
    >
      <style>{{`
{chr(10).join(keyframes)}
  @keyframes galoppo-terra {{
    0% {{ background-position: 0 0; }}
    100% {{ background-position: -48px 0; }}
  }}
{classi}
  .galoppo-terra {{
    animation: galoppo-terra 0.4s linear infinite;
    background-image: repeating-linear-gradient(
      90deg,
      transparent 0, transparent 10px,
      hsl(183 30% 45% / 0.22) 10px, hsl(183 30% 45% / 0.22) 16px
    );
  }}
  /* Chi ha chiesto al sistema di ridurre le animazioni vede il cavallo
     fermo in una posizione sola, non un lampeggio di 12 immagini. */
  @media (prefers-reduced-motion: reduce) {{
    .galoppo-f0 {{ animation: none; opacity: 1; }}
{chr(10).join(f"    .galoppo-f{i} {{ animation: none; opacity: 0; }}" for i in range(1,12))}
    .galoppo-terra {{ animation: none; }}
  }}
      `}}</style>

      <svg
        width={{size}}
        height={{Math.round((size * {H}) / {W})}}
        viewBox="0 0 {W} {H}"
        role="img"
        aria-label="Cavallo al galoppo"
      >
        <defs>
          <linearGradient id="pelo-cavallo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(183 45% 62%)" />
            <stop offset="55%" stopColor="hsl(190 40% 48%)" />
            <stop offset="100%" stopColor="hsl(200 35% 36%)" />
          </linearGradient>
        </defs>
        <g>
{paths}
        </g>
      </svg>

      {{/* Striscia che scorre sotto il cavallo: da sola non si nota, ma senza
          di lei il cavallo sembra correre sul posto invece che avanzare. */}}
      <div
        className="galoppo-terra"
        style={{{{ width: size, height: "2px", borderRadius: "1px" }}}}
      />

      <div style={{{{ fontSize: "13px", color: "hsl(210 8% 45%)", letterSpacing: "0.03em" }}}}>
        {{label}}
      </div>
    </div>
  );
}}
'''
open('/home/user/workspace/repo/client/src/components/TrottingHorseLoader.tsx','w').write(comp)
print('scritto,', len(comp), 'caratteri')
