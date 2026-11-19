/**
 * L'intestazione comune delle schede singole (cavallo, stallone, fattrice,
 * guidatore, allenatore, ippodromo). Prima ognuna apriva a modo suo: un
 * titolo di dimensione diversa, una riga di dati in grigio e i numeri
 * principali sparsi piu' in basso. Ora tutte hanno lo stesso blocco: il
 * ritorno all'elenco, il tipo di scheda, il nome, una riga di contesto e le
 * cifre principali subito sotto, nello stesso stile delle pagine elenco.
 */
import React from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { CSS_DUE_COLONNE } from "./DueColonne";

export default function IntestazioneScheda({
  indietro, icona: Icona, colore, tipo, titolo, accanto, sotto, azioni, cifre, avviso, margineSotto = 18,
}: {
  indietro?: { href: string; testo: string };
  icona?: React.ElementType;
  colore: string;
  /** Che cosa e': "Stallone", "Guidatore"... */
  tipo: React.ReactNode;
  titolo: React.ReactNode;
  /** Targhette accanto al nome: voto, bandiera, aggiungi alla scuderia. */
  accanto?: React.ReactNode;
  /** Una riga di contesto sotto il nome. */
  sotto?: React.ReactNode;
  /** Bottoni a destra del nome (o sotto, su telefono). */
  azioni?: React.ReactNode;
  /** Le cifre principali: elementi <Cifra />. */
  cifre?: React.ReactNode;
  /** Un riquadro subito sotto le cifre, per gli avvisi che non vanno persi. */
  avviso?: React.ReactNode;
  margineSotto?: number;
}) {
  return (
    <div className="ed" style={{ ["--ed-acc" as any]: colore, marginBottom: margineSotto }} data-testid="intestazione-scheda">
      <style>{CSS_DUE_COLONNE + CSS_SCHEDA}</style>
      {indietro && (
        <Link href={indietro.href}>
          <a className="is-indietro"><ArrowLeft size={14} /> {indietro.testo}</a>
        </Link>
      )}
      <div className="is-testa">
        <div className="is-striscia" />
        <div className="is-corpo">
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div className="is-tipo">
                {Icona && <Icona size={14} />} {tipo}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                <h1 className="is-titolo">{titolo}</h1>
                {accanto}
              </div>
              {sotto && <div className="is-sotto">{sotto}</div>}
            </div>
            {azioni && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{azioni}</div>}
          </div>
          {cifre && <div className="ed-cifre" style={{ marginTop: 16 }}>{cifre}</div>}
          {avviso && <div style={{ marginTop: 12 }}>{avviso}</div>}
        </div>
      </div>
    </div>
  );
}

const CSS_SCHEDA = `
.is-indietro { display: inline-flex; align-items: center; gap: 6px; color: var(--ed-muto); font-size: 12.5px; text-decoration: none; margin-bottom: 12px; }
.is-indietro:hover { color: var(--ed-acc); }
.is-testa { position: relative; display: flex; border-radius: 14px; overflow: hidden; border: 1px solid var(--ed-bordo);
  background: linear-gradient(135deg, color-mix(in srgb, var(--ed-acc) 9%, var(--ed-fondo)) 0%, var(--ed-fondo) 55%); }
.is-striscia { width: 4px; flex-shrink: 0; background: var(--ed-acc); }
.is-corpo { flex: 1; min-width: 0; padding: 16px 18px 18px; }
.is-tipo { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ed-acc); }
.is-titolo { font-size: 26px; font-weight: 800; color: var(--ed-testo); margin: 0; letter-spacing: .02em; line-height: 1.15; overflow-wrap: anywhere; }
.is-sotto { font-size: 12.5px; color: var(--ed-muto); margin-top: 5px; line-height: 1.55; }
@media (max-width: 640px) { .is-titolo { font-size: 21px; } .is-corpo { padding: 14px 14px 16px; } .is-corpo .ed-cifra .v { font-size: 18px; } }
`;
