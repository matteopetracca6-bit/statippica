/**
 * Forma di un guidatore o di un allenatore (23/11/2026): ultimi 30 giorni,
 * piste dove rende di piu' e rendimento con i favoriti del pubblico.
 * Dati da /api/driver/:name e /api/allenatore/:name (server/forma.ts).
 */
import { Link } from "wouter";
import { Flame, MapPin, Scale } from "lucide-react";
import { nomePista } from "@/lib/piste";
import { Spiegazione } from "./Spiegazione";

export interface Forma {
  ultimi_30: { corse: number; vittorie: number; primi_tre: number; premi: number; pct_vittorie: number | null };
  ultimi_12_mesi: { corse: number; vittorie: number; primi_tre: number; premi: number; pct_vittorie: number | null };
  tendenza: "in_forma" | "media" | "sotto" | null;
  ultime: { data: string; pista: string; cavallo: string; esito: string }[];
  piste_migliori: { pista: string; corse: number; vittorie: number; primi_tre: number; pct_vittorie: number | null; pct_primi_tre: number | null; scarto: number }[];
  piste_peggiori: Forma["piste_migliori"];
  base_primi_tre: number;
  favoriti: null | {
    corse_con_quota: number; vittorie: number; vittorie_attese: number; rispetto_al_pubblico: number; vittorie_a_quota_alta: number;
    favorito: { corse: number; vittorie: number; primi_tre: number; pct_vittorie: number | null; pct_primi_tre: number | null };
    tutti_i_favoriti: { pct_vittorie: number | null; pct_primi_tre: number | null };
  };
}

const MUTO = "hsl(210 8% 55%)", TESTO = "hsl(210 10% 88%)";
const v1 = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1).replace(".", ","));
const euro = (n: number) => `€ ${Math.round(n).toLocaleString("it-IT")}`;
const TENDENZA = {
  in_forma: { t: "in forma", c: "hsl(100 60% 55%)" },
  media: { t: "nella sua media", c: "hsl(205 60% 65%)" },
  sotto: { t: "sotto il suo solito", c: "hsl(15 70% 62%)" },
} as const;
const colEsito = (e: string) => (e === "1" ? "hsl(51 85% 60%)" : e === "2" || e === "3" ? "hsl(100 50% 58%)" : /^\d+$/.test(e) ? MUTO : "hsl(10 65% 62%)");

const box: React.CSSProperties = { padding: "12px 14px", borderRadius: 10, background: "hsl(220 12% 11%)", border: "1px solid hsl(220 10% 18%)", minWidth: 0 };
const tit: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: MUTO, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 };

export default function FormaPersona({ f, chi }: { f: Forma | null | undefined; chi: "guidatore" | "allenatore" }) {
  if (!f) return null;
  const t = f.tendenza ? TENDENZA[f.tendenza] : null;
  const fav = f.favoriti;
  return (
    <div className="pannello" style={{ padding: "16px 18px", marginTop: 16 }} data-testid="forma-persona">
      <div style={{ fontSize: 14, fontWeight: 800, color: TESTO, marginBottom: 12 }}>Forma e dove rende</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(250px, 100%), 1fr))", gap: 10 }}>
        {/* Ultimi 30 giorni */}
        <div style={box}>
          <div style={tit}><Flame size={13} /> Ultimi 30 giorni</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span className="tabular" style={{ fontSize: 22, fontWeight: 800, color: TESTO }}>{v1(f.ultimi_30.pct_vittorie)}%</span>
            <span style={{ fontSize: 12, color: MUTO }}>vittorie</span>
            {t && <span style={{ fontSize: 11.5, fontWeight: 700, color: t.c, border: `1px solid ${t.c}`, borderRadius: 999, padding: "1px 8px" }}>{t.t}</span>}
          </div>
          <div style={{ fontSize: 12, color: MUTO, marginTop: 4, lineHeight: 1.5 }}>
            {f.ultimi_30.vittorie} vittorie e {f.ultimi_30.primi_tre} volte nei primi tre su {f.ultimi_30.corse} corse, {euro(f.ultimi_30.premi)} di premi.
            {" "}Negli ultimi 12 mesi: {v1(f.ultimi_12_mesi.pct_vittorie)}% di vittorie su {f.ultimi_12_mesi.corse} corse.
            {f.ultimi_30.corse < 15 && " Troppe poche corse per dire se è in forma."}
          </div>
          {f.ultime.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }} title="Le ultime corse, dalla più recente">
              {f.ultime.map((u, i) => (
                <span key={i} className="tabular" title={`${u.data} ${nomePista(u.pista)} · ${u.cavallo}`}
                  style={{ fontSize: 11, fontWeight: 700, minWidth: 22, textAlign: "center", padding: "2px 4px", borderRadius: 5,
                           border: "1px solid hsl(220 10% 22%)", color: colEsito(u.esito), whiteSpace: "nowrap" }}>{u.esito}</span>
              ))}
            </div>
          )}
        </div>

        {/* Piste */}
        <div style={box}>
          <div style={tit}><MapPin size={13} /> Dove rende di più</div>
          {f.piste_migliori.length === 0 ? <div style={{ fontSize: 12, color: MUTO }}>Meno di 15 corse su ogni pista negli ultimi 24 mesi.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {f.piste_migliori.map(p => (
                <div key={p.pista} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5 }}>
                  <Link href={`/ippodromo/${encodeURIComponent(p.pista)}`}><a style={{ color: TESTO, fontWeight: 700, flex: 1, minWidth: 0 }}>{nomePista(p.pista)}</a></Link>
                  <span className="tabular" style={{ color: "hsl(100 55% 58%)", fontWeight: 700, whiteSpace: "nowrap" }}>{v1(p.pct_primi_tre)}% nei primi tre</span>
                  <span className="tabular" style={{ color: MUTO, fontSize: 11.5, whiteSpace: "nowrap" }}>{p.corse} corse</span>
                </div>
              ))}
              {f.piste_peggiori.length > 0 && (
                <div style={{ fontSize: 11.5, color: MUTO, marginTop: 3 }}>
                  Rende meno a {f.piste_peggiori.map(p => `${nomePista(p.pista)} (${v1(p.pct_primi_tre)}%)`).join(", ")}.
                </div>
              )}
              <div style={{ fontSize: 11.5, color: MUTO }}>In media è nei primi tre {v1(f.base_primi_tre)} volte su 100 (ultimi 24 mesi).</div>
            </div>
          )}
        </div>

        {/* Con i favoriti */}
        <div style={box}>
          <div style={tit}><Scale size={13} /> Con il pubblico</div>
          {!fav ? <div style={{ fontSize: 12, color: MUTO }}>Meno di 20 corse con le quote finali (raccolte dal 2025).</div> : (
            <div style={{ fontSize: 12.5, color: "hsl(210 8% 75%)", lineHeight: 1.55 }}>
              {fav.favorito.corse > 0 ? <>
                Da favorito (quota più bassa) <strong className="tabular" style={{ color: TESTO }}>{fav.favorito.corse}</strong> volte:
                {" "}vince il <strong className="tabular" style={{ color: TESTO }}>{v1(fav.favorito.pct_vittorie)}%</strong>
                {fav.tutti_i_favoriti.pct_vittorie != null && <span style={{ color: MUTO }}> (tutti i favoriti: {v1(fav.tutti_i_favoriti.pct_vittorie)}%)</span>}.
              </> : <>Mai partito da favorito del pubblico.</>}
              <div style={{ marginTop: 4 }}>
                Ha vinto <strong className="tabular" style={{ color: TESTO }}>{fav.vittorie}</strong> corse; il pubblico, sommando le quote, se ne aspettava
                {" "}<strong className="tabular">{v1(fav.vittorie_attese)}</strong>:
                {" "}<strong style={{ color: fav.rispetto_al_pubblico >= 0 ? "hsl(100 55% 58%)" : "hsl(15 70% 62%)" }}>
                  {fav.rispetto_al_pubblico >= 0 ? `${v1(fav.rispetto_al_pubblico)} in più` : `${v1(-fav.rispetto_al_pubblico)} in meno`}
                </strong>.
                {fav.vittorie_a_quota_alta > 0 && <> {fav.vittorie_a_quota_alta} a quota 10 o più.</>}
              </div>
            </div>
          )}
        </div>
      </div>
      <Spiegazione titolo="Come si leggono" compatta>
        «In forma» vuol dire che negli ultimi 30 giorni il {chi} vince almeno un quarto più spesso del suo ritmo degli ultimi
        12 mesi (con almeno 15 corse), «sotto» un quarto meno. Le piste sono quelle dove i suoi cavalli arrivano nei primi tre
        più spesso del suo solito, con almeno 15 corse negli ultimi 24 mesi. «Con il pubblico» usa le quote finali del
        totalizzatore, raccolte dal 2025: le vittorie attese sono la somma delle probabilità che le quote davano ai suoi cavalli.
        Vincere più del previsto vuol dire che i suoi cavalli rendono più di quanto il pubblico creda; dipende anche dai cavalli che riceve.
      </Spiegazione>
    </div>
  );
}
