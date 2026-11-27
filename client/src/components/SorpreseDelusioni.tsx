/**
 * Sorprese e delusioni della settimana (Home, 22/11/2026).
 * Dati da /api/home/sorprese (server/sorprese.ts): vincitori pagati almeno 10
 * a 1 e favoriti del pubblico (quota fino a 3) finiti fuori dai primi tre,
 * con i motivi probabili letti dalla corsa precedente.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Sparkles, TrendingDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import GradeBadge from "./GradeBadge";
import BandieraCavallo from "@/components/BandieraCavallo";
import CavalloCaricamento from "./CavalloCaricamento";
import { nomePista } from "@/lib/piste";

interface Voce {
  nome: string; anno: number | null; voto: string | null; data: string; pista: string; corsa: number; codice: string;
  quota: number | null; prob: number | null; partenti: number; motivi: string[]; arrivo?: string; vincitore?: string | null;
}
interface Risposta { giorni: number; corse: number; sorprese: Voce[]; delusioni: Voce[]; n_sorprese: number; n_delusioni: number }

const data = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
const quota = (q: number | null) => (q == null ? "—" : q.toFixed(q >= 10 ? 0 : 2).replace(".", ","));

function Riga({ v, tipo }: { v: Voce; tipo: "sorpresa" | "delusione" }) {
  const colore = tipo === "sorpresa" ? "hsl(100 60% 55%)" : "hsl(10 70% 62%)";
  return (
    <Link href={`/horse/${encodeURIComponent(v.nome)}/${v.anno || 0}`}>
      <a className="sd-riga">
        <span className="tabular sd-quota" style={{ color: colore }} title="Quota finale al totalizzatore">{quota(v.quota)}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <BandieraCavallo nome={v.nome} />
            <span className="sd-nome">{v.nome}</span>
            {v.voto && <GradeBadge grade={v.voto} size="sm" />}
          </span>
          <span className="sd-sotto">
            {data(v.data)} {nomePista(v.pista)}, corsa {v.corsa}
            {tipo === "delusione" ? <> · {v.arrivo}{v.vincitore ? <>, ha vinto {v.vincitore}</> : null}</> : <> · 1° su {v.partenti}</>}
            {v.prob != null ? <> · pronostico {Math.round(v.prob)}% nei primi tre</> : null}
          </span>
          {v.motivi.length > 0 && <span className="sd-motivi">{v.motivi.join(" · ")}</span>}
        </span>
      </a>
    </Link>
  );
}

function Pannello({ tipo, d, isLoading }: { tipo: "sorpresa" | "delusione"; d?: Risposta; isLoading: boolean }) {
  const sorp = tipo === "sorpresa";
  const voci = (sorp ? d?.sorprese : d?.delusioni) ?? [];
  const Icona = sorp ? Sparkles : TrendingDown;
  const colore = sorp ? "hsl(100 60% 50%)" : "hsl(10 70% 58%)";
  return (
    <div className="pannello" style={{ ["--colore-pannello" as any]: colore, padding: "22px 24px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <Icona size={16} style={{ color: colore }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "hsl(210 8% 60%)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {sorp ? "Le sorprese della settimana" : "Le delusioni della settimana"}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: "hsl(210 8% 48%)", marginBottom: 12, lineHeight: 1.45 }}>
        {sorp ? "Vincitori pagati almeno 10 volte la posta al totalizzatore." : "Favoriti del pubblico (quota fino a 3) arrivati fuori dai primi tre."}
      </div>
      {isLoading ? <CavalloCaricamento label="Caricamento" />
        : voci.length === 0 ? <div style={{ fontSize: 13, color: "hsl(210 8% 50%)" }}>Niente da segnalare negli ultimi {d?.giorni ?? 7} giorni.</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {voci.slice(0, 6).map(v => <Riga key={`${v.codice}-${v.nome}`} v={v} tipo={tipo} />)}
            {(sorp ? d!.n_sorprese : d!.n_delusioni) > 6 && (
              <div style={{ fontSize: 11.5, color: "hsl(210 8% 48%)", marginTop: 4 }}>
                {sorp ? d!.n_sorprese : d!.n_delusioni} in tutto su {d!.corse} corse; qui le {sorp ? "quote più alte" : "quote più basse"}.
              </div>
            )}
          </div>
        )}
    </div>
  );
}

const CSS = `
.sd-riga { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-radius: 8px; text-decoration: none; color: inherit; min-width: 0; }
.sd-riga:hover { background: hsl(220 10% 14%); }
.sd-quota { font-size: 14px; font-weight: 800; min-width: 40px; text-align: right; padding-top: 1px; flex-shrink: 0; }
.sd-nome { font-size: 13px; font-weight: 600; color: hsl(210 10% 85%); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.sd-sotto { display: block; font-size: 11.5px; color: hsl(210 8% 52%); margin-top: 2px; line-height: 1.4; }
.sd-motivi { display: block; font-size: 11.5px; color: hsl(38 70% 66%); margin-top: 2px; line-height: 1.4; }
`;

/** I due riquadri, da mettere nella griglia a due colonne della Home. */
export default function SorpreseDelusioni() {
  const { data: d, isLoading } = useQuery<Risposta>({
    queryKey: ["/api/home/sorprese"],
    queryFn: async () => (await apiRequest("GET", "/api/home/sorprese")).json(),
    staleTime: 10 * 60_000,
  });
  return (
    <>
      <style>{CSS}</style>
      <Pannello tipo="sorpresa" d={d} isLoading={isLoading} />
      <Pannello tipo="delusione" d={d} isLoading={isLoading} />
    </>
  );
}
