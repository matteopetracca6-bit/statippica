/**
 * ROTTURE AL GALOPPO — solo dati, nessuna previsione.
 *
 * Quante corse di un cavallo, di un guidatore o di un allenatore sono finite
 * con una squalifica per galoppo (rottura prolungata o galoppo in arrivo),
 * in tutto e nell'ultimo anno, confrontate con la media dell'archivio.
 * Per il cavallo anche le ultime dieci corse e la differenza fra ferrato e
 * scalzo; per guidatori e allenatori l'andamento anno per anno.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type Dati = {
  corse: number; rotture: number; in_arrivo: number; quota: number | null;
  anno_corse: number; anno_rotture: number; anno_quota: number | null;
  media_archivio: number; media_anno: number;
  ultime?: { data: string; pista: string; galoppo: boolean; esito: string }[];
  ferri?: { come: string; corse: number; rotture: number; quota: number | null }[];
  per_anno?: { anno: string; corse: number; rotture: number; quota: number | null }[];
};

const num = (n: number) => n.toLocaleString("it-IT");
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`);

function confronto(q: number | null, media: number, corse: number) {
  if (q == null || corse < 10) return "troppe poche corse per un confronto";
  if (q >= media * 1.3) return `più della media (${pct(media)})`;
  if (q <= media * 0.7) return `meno della media (${pct(media)})`;
  return `vicino alla media (${pct(media)})`;
}

export default function RottureGaloppo({ tipo, nome }: { tipo: "cavallo" | "guidatore" | "allenatore"; nome: string }) {
  const { data: d } = useQuery<Dati>({
    queryKey: ["/api/rotture", tipo, nome],
    queryFn: async () => (await apiRequest("GET", `/api/rotture?tipo=${tipo}&nome=${encodeURIComponent(nome)}`)).json(),
    enabled: !!nome,
    staleTime: 10 * 60_000,
  });
  if (!d || !d.corse) return null;
  const chi = tipo === "cavallo" ? "le sue corse" : tipo === "guidatore" ? "le corse dei cavalli che ha guidato" : "le corse dei cavalli che ha allenato";
  return (
    <div className="box-rotture" data-testid="rotture-galoppo">
      <div className="titolo">Squalifiche per galoppo</div>
      <div className="cifre">
        <div className="cifra">
          <b>{pct(d.quota)}</b>
          <small>{num(d.rotture)} su {num(d.corse)} corse in archivio · {confronto(d.quota, d.media_archivio, d.corse)}</small>
        </div>
        {d.anno_corse > 0 && (
          <div className="cifra">
            <b>{pct(d.anno_quota)}</b>
            <small>ultimo anno: {num(d.anno_rotture)} su {num(d.anno_corse)} · {confronto(d.anno_quota, d.media_anno, d.anno_corse)}</small>
          </div>
        )}
      </div>
      {d.ultime && d.ultime.length > 0 && (
        <div className="esiti" aria-label="Ultime corse, dalla più recente">
          <span style={{ background: "none", paddingLeft: 0 }}>ultime corse, dalla più recente:</span>
          {d.ultime.map((u, i) => (
            <span key={i} className={u.galoppo ? "gal" : ""} title={`${u.data} · ${u.pista}`}>{u.galoppo ? "galoppo" : u.esito.replace(/ \(.*\)/, "")}</span>
          ))}
        </div>
      )}
      {d.ferri && d.ferri.length === 2 && d.ferri.every(f => f.corse >= 5) && (
        <div className="nota">
          {d.ferri.map(f => `${f.come}: ${pct(f.quota)} su ${num(f.corse)} corse`).join(" · ")}
        </div>
      )}
      {d.per_anno && d.per_anno.length > 1 && (
        <div className="esiti" aria-label="Anno per anno">
          {d.per_anno.map(a => <span key={a.anno}>{a.anno}: {pct(a.quota)} su {num(a.corse)}</span>)}
        </div>
      )}
      <div className="nota">
        Conta {chi} finite con una squalifica per galoppo, durante la corsa o in arrivo{d.in_arrivo ? ` (${num(d.in_arrivo)} in arrivo)` : ""}.
        In tutto l'archivio succede nel {pct(d.media_archivio)} delle corse, nell'ultimo anno nel {pct(d.media_anno)}. Sono dati, non una previsione.
      </div>
    </div>
  );
}
