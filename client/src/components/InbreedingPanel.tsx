import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";

/**
 * PANNELLO CONSANGUINEITA'.
 *
 * Mostra gli antenati che ricorrono sia dalla parte del padre sia da quella
 * della madre. La sigla "4+5" significa che quell'antenato compare due volte
 * su quel lato, alla quarta e alla quinta generazione; un trattino significa
 * che su quel lato non compare.
 *
 * Piu' l'antenato e' vicino (generazione bassa), piu' l'incrocio e' stretto.
 * Non e' di per se' un difetto: e' una scelta di allevamento, il "linebreeding",
 * con cui si cerca di fissare le qualita' di un capostipite.
 *
 * I dati arrivano dalla seconda fonte (VendoPuledri), che li ha per qualunque
 * cavallo e senza limiti d'eta'. Se un cavallo non e' ancora stato scaricato
 * dalla pipeline notturna, il pannello non compare.
 */

interface Crossing {
  ancestor_name: string;
  sire_line: string | null;
  dam_line: string | null;
  closest_gen: number | null;
}

interface Consanguineita {
  profile: {
    birth_date: string | null;
    sex: string | null;
    category: string | null;
    record_short: string | null;
    record_long: string | null;
    n_ancestors: number;
    n_inbreeding: number;
    closest_cross: number | null;
  };
  crossings: Crossing[];
  ancestors: { path: string; generation: number; ancestor_name: string; ancestor_record: string | null }[];
  breeders: string[];
}

const panelStyle: React.CSSProperties = {
  border: "1px solid hsl(220 10% 16%)",
  borderRadius: "12px",
  background: "hsl(220 12% 9%)",
  padding: "18px 20px",
  marginBottom: "22px",
};

const panelTitle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "hsl(210 8% 50%)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "14px",
};

function intensity(gen: number | null): { label: string; color: string } {
  if (gen == null) return { label: "—", color: "hsl(210 8% 50%)" };
  if (gen <= 2) return { label: "Molto stretto", color: "hsl(0 65% 60%)" };
  if (gen === 3) return { label: "Stretto", color: "hsl(25 75% 58%)" };
  if (gen === 4) return { label: "Moderato", color: "hsl(45 75% 58%)" };
  return { label: "Lontano", color: "hsl(140 45% 55%)" };
}

function itDate(d: string | null): string {
  if (!d || d.length !== 10) return "—";
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

export default function InbreedingPanel({ horseName }: { horseName: string }) {
  const { data } = useQuery<Consanguineita | null>({
    queryKey: ["/api/consanguineita", horseName],
    queryFn: async () =>
      (await apiRequest("GET", `/api/consanguineita/${encodeURIComponent(horseName)}`)).json(),
  });

  if (!data || !data.profile) return null;

  const p = data.profile;
  const closest = intensity(p.closest_cross);

  return (
    <div style={panelStyle}>
      <div style={panelTitle}>Consanguineità e genealogia estesa</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "22px", marginBottom: data.crossings.length ? "16px" : 0 }}>
        <div>
          <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)", marginBottom: "3px" }}>Antenati noti</div>
          <div className="tabular" style={{ fontSize: "19px", fontWeight: 700, color: "hsl(210 10% 90%)" }}>
            {p.n_ancestors} <span style={{ fontSize: "12px", fontWeight: 400, color: "hsl(210 8% 55%)" }}>su 5 generazioni</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)", marginBottom: "3px" }}>Incroci</div>
          <div className="tabular" style={{ fontSize: "19px", fontWeight: 700, color: "hsl(210 10% 90%)" }}>
            {p.n_inbreeding}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)", marginBottom: "3px" }}>Incrocio più stretto</div>
          <div style={{ fontSize: "19px", fontWeight: 700, color: closest.color }}>
            {p.closest_cross != null ? `${closest.label} (${p.closest_cross}ª gen.)` : "Nessuno"}
          </div>
        </div>
        {p.birth_date && (
          <div>
            <div style={{ fontSize: "11px", color: "hsl(210 8% 48%)", marginBottom: "3px" }}>Data di nascita</div>
            <div className="tabular" style={{ fontSize: "19px", fontWeight: 700, color: "hsl(210 10% 90%)" }}>
              {itDate(p.birth_date)}
            </div>
          </div>
        )}
      </div>

      {data.crossings.length > 0 ? (
        <>
          <p style={{ fontSize: "12px", color: "hsl(210 8% 58%)", margin: "0 0 10px", lineHeight: 1.55 }}>
            Questi antenati compaiono da entrambe le parti dell'albero. Le cifre indicano a quale
            generazione: «4+5» vuol dire due volte su quel lato, alla quarta e alla quinta. Più il
            numero è basso, più l'incrocio è stretto.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Antenato", "Lato padre", "Lato madre", "Intensità"].map((h, i) => (
                    <th key={h} style={{
                      padding: "8px 10px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.04em", color: "hsl(210 8% 55%)",
                      textAlign: i === 0 ? "left" : i === 3 ? "left" : "center",
                      borderBottom: "1px solid hsl(220 10% 16%)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.crossings.map((c, i) => {
                  const it = intensity(c.closest_gen);
                  return (
                    <tr key={c.ancestor_name} style={{ borderTop: i === 0 ? "none" : "1px solid hsl(220 10% 13%)" }}>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>
                        <Link href={`/stallion/${encodeURIComponent(c.ancestor_name)}`}>
                          <span style={{ color: "hsl(51 80% 62%)", cursor: "pointer", fontWeight: 600 }}>
                            {c.ancestor_name}
                          </span>
                        </Link>
                      </td>
                      <td className="tabular" style={{ padding: "8px 10px", fontSize: "13px", textAlign: "center", color: "hsl(210 10% 85%)" }}>
                        {c.sire_line && c.sire_line !== "-" ? c.sire_line : "—"}
                      </td>
                      <td className="tabular" style={{ padding: "8px 10px", fontSize: "13px", textAlign: "center", color: "hsl(210 10% 85%)" }}>
                        {c.dam_line && c.dam_line !== "-" ? c.dam_line : "—"}
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: "12px", fontWeight: 600, color: it.color, whiteSpace: "nowrap" }}>
                        {it.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p style={{ fontSize: "12px", color: "hsl(210 8% 58%)", margin: 0, lineHeight: 1.55 }}>
          Nessun antenato ricorrente entro cinque generazioni: è un pedigree aperto, senza
          linee raddoppiate.
        </p>
      )}

      {data.breeders.length > 0 && (
        <div style={{ marginTop: "14px", fontSize: "12px", color: "hsl(210 8% 58%)" }}>
          Allevamento: <span style={{ color: "hsl(210 10% 85%)" }}>{data.breeders.join(", ")}</span>
        </div>
      )}

      <p style={{ fontSize: "11px", color: "hsl(210 8% 42%)", marginTop: "12px", marginBottom: 0 }}>
        Genealogia estesa e allevamento: dati VendoPuledri.
      </p>
    </div>
  );
}
