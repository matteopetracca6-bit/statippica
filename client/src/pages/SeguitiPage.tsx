/**
 * Cavalli seguiti (23/11/2026): i cavalli messi fra i seguiti con la stellina
 * della scheda. Prima chi corre presto (data, ora, pista, numero, guidatore),
 * poi gli altri, ognuno con le ultime corse. L'elenco sta nel browser.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Star, CalendarClock, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { coloreScheda } from "@/lib/sezioni";
import { nomePista } from "@/lib/piste";
import { useSeguiti } from "@/lib/seguiti";
import IntestazionePagina from "../components/IntestazionePagina";
import { Caricamento } from "../components/Caricamento";
import GradeBadge from "../components/GradeBadge";
import HorseSearchBar from "../components/HorseSearchBar";

const ACCENTO = coloreScheda("/seguiti");
const MUTO = "hsl(210 8% 55%)", TESTO = "hsl(210 10% 88%)";
const euro = (x?: number | null) => (x ? `€ ${Math.round(x).toLocaleString("it-IT")}` : "—");
const giorno = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
const colEsito = (e: string) => (e === "1" ? "hsl(51 85% 60%)" : e === "2" || e === "3" ? "hsl(100 50% 58%)" : /^\d+$/.test(e) ? MUTO : "hsl(10 65% 62%)");

export default function SeguitiPage() {
  const { seguiti, togli } = useSeguiti();
  const { data, isLoading } = useQuery<{ cavalli: any[] }>({
    queryKey: ["/api/seguiti", seguiti.map(s => `${s.nome}|${s.anno}`).join(",")],
    queryFn: async () => (await apiRequest("POST", "/api/seguiti", { cavalli: seguiti.map(s => ({ nome: s.nome, anno: s.anno })) })).json(),
    enabled: seguiti.length > 0,
    staleTime: 5 * 60_000,
  });
  const cavalli = (data?.cavalli ?? []).slice().sort((a, b) => {
    const pa = a.prossime?.[0], pb = b.prossime?.[0];
    if (pa && pb) return (pa.data + (pa.ora ?? "")).localeCompare(pb.data + (pb.ora ?? ""));
    if (pa) return -1; if (pb) return 1;
    return (a.giorni_dall_ultima ?? 1e9) - (b.giorni_dall_ultima ?? 1e9);
  });
  const corrono = cavalli.filter(c => c.prossime?.length);

  return (
    <div className="page-shell">
      <IntestazionePagina icona={Star} colore={ACCENTO} titolo="Cavalli seguiti" margineSotto={14}
        sottotitolo="I cavalli che segui con la stellina della scheda: quando corrono e come sono andati. L'elenco resta su questo dispositivo." />

      <div className="pannello" style={{ padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: MUTO, marginBottom: 6 }}>Cerca un cavallo e apri la sua scheda: lì trovi la stellina «Segui».</div>
        <HorseSearchBar />
      </div>

      {seguiti.length === 0 ? (
        <div className="pannello" style={{ padding: "22px 18px", textAlign: "center", color: MUTO, fontSize: 13.5, lineHeight: 1.6 }}>
          <Star size={22} style={{ color: ACCENTO, marginBottom: 6 }} />
          <div>Non segui ancora nessun cavallo.</div>
          <div>Apri la scheda di un cavallo e tocca <strong style={{ color: ACCENTO }}>Segui</strong>: comparirà qui con le prossime corse e gli ultimi arrivi.</div>
          <div style={{ marginTop: 10 }}><Link href="/leaderboard" style={{ color: ACCENTO, fontWeight: 700 }}>Vai a Cavalli e classifica</Link></div>
        </div>
      ) : isLoading ? <Caricamento testo="Guardo il calendario e gli ultimi arrivi..." /> : (
        <>
          {corrono.length > 0 && (
            <div className="pannello" style={{ padding: "14px 16px", marginBottom: 14, borderColor: "hsl(54 60% 35% / .6)" }} data-testid="seguiti-in-programma">
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 800, color: TESTO, marginBottom: 8 }}>
                <CalendarClock size={15} style={{ color: ACCENTO }} /> In programma
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {corrono.flatMap(c => c.prossime.map((p: any, i: number) => (
                  <div key={c.nome + i} style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", alignItems: "baseline", fontSize: 13 }}>
                    <span className="tabular" style={{ color: ACCENTO, fontWeight: 700, minWidth: 120 }}>{giorno(p.data)}{p.ora ? ` · ${p.ora}` : ""}</span>
                    <Link href={`/horse/${encodeURIComponent(c.nome)}/${c.anno ?? 0}`} style={{ color: TESTO, fontWeight: 700 }}>{c.nome}</Link>
                    <span style={{ color: MUTO }}>
                      <Link href={`/ippodromo/${encodeURIComponent(p.pista)}`} style={{ color: MUTO }}>{nomePista(p.pista)}</Link>
                      {p.distanza ? ` · ${p.distanza} m` : ""}{p.numero ? ` · numero ${p.numero}` : ""}{p.guidatore ? ` · ${p.guidatore}` : ""}
                    </span>
                  </div>
                )))}
              </div>
              <div style={{ fontSize: 11.5, color: MUTO, marginTop: 8 }}>Dal calendario ufficiale; i pronostici della corsa sono nel <Link href="/calendario" style={{ color: ACCENTO }}>Calendario</Link>.</div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 10 }}>
            {cavalli.map(c => (
              <div key={`${c.nome}|${c.anno}`} className="pannello" style={{ padding: "12px 14px", minWidth: 0 }} data-testid="seguito">
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  {c.voto && <GradeBadge grade={c.voto} />}
                  <Link href={`/horse/${encodeURIComponent(c.nome)}/${c.anno ?? 0}`}
                        style={{ color: TESTO, fontWeight: 800, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</Link>
                  <span style={{ color: MUTO, fontSize: 12, flexShrink: 0 }}>{c.anno ?? ""}</span>
                  <button type="button" onClick={() => togli(c.nome, c.anno)} title="Smetti di seguirlo" aria-label="Smetti di seguirlo"
                    style={{ marginLeft: "auto", background: "none", border: "none", color: MUTO, cursor: "pointer", padding: 2, flexShrink: 0 }}><X size={15} /></button>
                </div>
                {!c.trovato ? <div style={{ fontSize: 12, color: MUTO, marginTop: 6 }}>Non lo trovo più nell'archivio.</div> : (
                  <>
                    <div style={{ fontSize: 12, color: MUTO, marginTop: 3 }}>
                      {c.padre ? `${c.padre} × ${c.madre ?? "?"}` : ""}
                      {c.corse ? ` · ${c.corse} corse, ${c.vittorie ?? 0} vinte, ${euro(c.guadagni)}` : " · nessuna corsa"}
                    </div>
                    {c.prossime?.[0] && (
                      <div style={{ fontSize: 12.5, color: ACCENTO, marginTop: 6, fontWeight: 700 }}>
                        Corre {giorno(c.prossime[0].data)} a {nomePista(c.prossime[0].pista)}
                      </div>
                    )}
                    {c.ultime?.length > 0 ? (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                        {c.ultime.map((u: any, i: number) => (
                          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "baseline" }}>
                            <span className="tabular" style={{ minWidth: 26, textAlign: "center", fontWeight: 800, color: colEsito(u.esito) }}>{u.esito}</span>
                            <span className="tabular" style={{ color: MUTO, whiteSpace: "nowrap" }}>{u.data ? giorno(u.data) : "—"}</span>
                            <span style={{ color: "hsl(210 8% 72%)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {u.pista === "ESTERO" ? "estero" : nomePista(u.pista)}{u.distanza ? ` ${u.distanza} m` : ""}{u.km ? ` · ${String(u.km).replace(".", ",")}` : ""}{u.guidatore ? ` · ${u.guidatore}` : ""}
                            </span>
                          </div>
                        ))}
                        {c.giorni_dall_ultima != null && <div style={{ fontSize: 11, color: MUTO, marginTop: 2 }}>Ultima corsa {c.giorni_dall_ultima === 0 ? "oggi" : c.giorni_dall_ultima === 1 ? "ieri" : `${c.giorni_dall_ultima} giorni fa`}.</div>}
                      </div>
                    ) : <div style={{ fontSize: 12, color: MUTO, marginTop: 6 }}>Nessuna corsa in archivio.</div>}
                  </>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: MUTO, marginTop: 12 }}>
            L'elenco è salvato solo in questo browser: su un altro telefono o computer va rifatto. Le corse in programma
            arrivano dal calendario ufficiale ogni notte.
          </p>
        </>
      )}
    </div>
  );
}
