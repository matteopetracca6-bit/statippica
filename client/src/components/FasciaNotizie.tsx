/**
 * La fascia di notizie che scorre in alto nella home, come i titoli di borsa.
 *
 * Mostra tre cose, tutte prese dall'archivio e quindi aggiornate da sole ogni
 * notte: i vincitori dell'ultima giornata corsa, le corse in programma nei
 * prossimi giorni e lo stato dell'archivio.
 *
 * Ogni nome si puo' cliccare e apre la sua scheda. Quando il cursore ci passa
 * sopra (o la si tocca, o ci si arriva col tasto Tab) la fascia si ferma, per
 * dare il tempo di leggere e cliccare. Chi ha chiesto al sistema meno
 * animazioni la vede ferma, e la puo' scorrere a mano.
 *
 * I colori sono quelli dei riquadri della home: giallo per i cavalli, azzurro
 * per i guidatori, verde per le piste, rosso per il calendario.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

type Risultato = { data: string; pista: string; pista_codice: string | null; cavallo: string; anno: number | null; guidatore: string | null; guidatore_scheda: boolean; tempo: string | null };
type Programma = { data: string; pista: string; pista_codice: string | null; corse: number; partenti: number };
type Notizie = { risultati: Risultato[]; programma: Programma[]; stato: { gare: number; ultima_gara: string | null; archivio_pubblicato: string | null } };

const GIALLO = "hsl(51 80% 58%)";
const AZZURRO = "hsl(200 70% 64%)";
const VERDE = "hsl(95 55% 58%)";
const ROSSO = "hsl(0 65% 62%)";
const CIANO = "hsl(183 75% 55%)";

/** "Oggi", "Ieri", "Domani" o il giorno della settimana, sull'ora italiana. */
function giorno(d: string): string {
  const oggi = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }) + "T12:00:00");
  const x = new Date(d + "T12:00:00");
  const diff = Math.round((x.getTime() - oggi.getTime()) / 86400000);
  if (diff === 0) return "Oggi";
  if (diff === -1) return "Ieri";
  if (diff === 1) return "Domani";
  const s = x.toLocaleDateString("it-IT", { weekday: "long", day: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "NAPOLI" -> "Napoli"; i nomi gia' scritti bene ("Castelluccio dei Sauri") restano.
function titolo(s: string) {
  return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

function migliaia(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function Pista({ nome, codice }: { nome: string; codice: string | null }) {
  const testo = titolo(nome);
  return codice
    ? <Link href={`/ippodromo/${encodeURIComponent(codice)}`} className="notizia-link" style={{ color: VERDE }}>{testo}</Link>
    : <span style={{ color: VERDE }}>{testo}</span>;
}

function Voce({ colore, etichetta, children }: { colore: string; etichetta: string; children: React.ReactNode }) {
  return (
    <span className="notizia">
      <span className="notizia-etichetta" style={{ color: colore, borderColor: colore }}>{etichetta}</span>
      {children}
    </span>
  );
}

function Contenuto({ n }: { n: Notizie }) {
  const voci: React.ReactNode[] = [];
  const { stato } = n;

  if (stato.archivio_pubblicato || stato.gare) {
    const pub = stato.archivio_pubblicato ? new Date(stato.archivio_pubblicato) : null;
    const ore = pub ? (Date.now() - pub.getTime()) / 3600000 : null;
    const quando = ore == null ? null
      : ore < 20 ? "stanotte"
      : `il ${pub!.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`;
    voci.push(
      <Voce key="stato" colore={CIANO} etichetta="Archivio">
        {quando ? <>aggiornato {quando}</> : <>in linea</>}
        <span className="notizia-sep">·</span>
        <Link href="/metodo" className="notizia-link" style={{ color: CIANO }}>{migliaia(stato.gare)} gare</Link>
      </Voce>,
    );
  }

  n.risultati.forEach((r, i) => {
    voci.push(
      <Voce key={`r${i}`} colore={GIALLO} etichetta={i === 0 ? `${giorno(r.data)}` : "Vince"}>
        {i === 0 && <span style={{ color: "hsl(210 8% 55%)" }}>vince&nbsp;</span>}
        <Link href={r.anno ? `/horse/${encodeURIComponent(r.cavallo)}/${r.anno}` : `/horse/${encodeURIComponent(r.cavallo)}`}
              className="notizia-link" style={{ color: GIALLO, fontWeight: 700 }}>{r.cavallo}</Link>
        <span>&nbsp;a&nbsp;</span><Pista nome={r.pista} codice={r.pista_codice} />
        {r.guidatore && <>
          <span>&nbsp;con&nbsp;</span>
          {r.guidatore_scheda
            ? <Link href={`/guidatore/${encodeURIComponent(r.guidatore)}`} className="notizia-link" style={{ color: AZZURRO }}>{r.guidatore}</Link>
            : <span style={{ color: AZZURRO }}>{r.guidatore}</span>}
        </>}
        {r.tempo && <><span className="notizia-sep">·</span><span className="tabular">{r.tempo}</span></>}
      </Voce>,
    );
  });

  n.programma.forEach((p, i) => {
    voci.push(
      <Voce key={`p${i}`} colore={ROSSO} etichetta={giorno(p.data)}>
        <Pista nome={p.pista} codice={p.pista_codice} />
        <span className="notizia-sep">·</span>
        <Link href="/calendario" className="notizia-link" style={{ color: "inherit" }}>
          {p.corse} {p.corse === 1 ? "corsa" : "corse"}, {p.partenti} partenti
        </Link>
      </Voce>,
    );
  });

  return <>{voci}</>;
}

export default function FasciaNotizie() {
  const { data } = useQuery<Notizie>({
    queryKey: ["/api/notizie"],
    queryFn: () => apiRequest("GET", "/api/notizie").then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  });
  const vuota = !data || (data.risultati.length === 0 && data.programma.length === 0 && !data.stato.gare);
  if (vuota) return <div className="fascia-notizie" aria-hidden="true" />;

  // Velocita' costante qualunque sia la lunghezza: circa 45 pixel al secondo.
  const quante = 1 + data.risultati.length + data.programma.length;
  const durata = Math.max(30, quante * 7);

  return (
    <div className="fascia-notizie" role="region" aria-label="Ultime notizie dall'archivio">
      <div className="fascia-notizie-nastro" style={{ animationDuration: `${durata}s` }}>
        {/* Il contenuto e' ripetuto due volte: quando la prima copia e' uscita
            del tutto a sinistra, la seconda e' esattamente al suo posto e
            l'animazione ricomincia senza scatti. La copia e' nascosta ai
            lettori di schermo. */}
        <div className="fascia-notizie-copia"><Contenuto n={data} /></div>
        <div className="fascia-notizie-copia" aria-hidden="true" ref={el => el?.setAttribute("inert", "")}><Contenuto n={data} /></div>
      </div>
    </div>
  );
}
