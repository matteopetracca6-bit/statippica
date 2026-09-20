/**
 * server/breedingRules.ts — StatIppica
 *
 * Regole del Libro genealogico del cavallo Trottatore italiano applicate
 * all'Advisor, e base scientifica dei pesi padre/madre.
 *
 * FONTE NORMATIVA
 * ---------------
 * Disciplinare del Libro genealogico del Cavallo Trottatore Italiano e
 * relative Norme tecniche (UNIRE / ANACT, testo del 30 ottobre 2008),
 * tenuto ai sensi dell'art. 3 della legge 15 gennaio 1991 n. 30.
 * Articoli usati qui:
 *   Norme tecniche art. 2  — performance minime stalloni esteri debuttanti
 *   Norme tecniche art. 3  — performance minime stalloni esteri con produzione
 *   Norme tecniche art. 4  — performance minime fattrici estere debuttanti
 *   Norme tecniche art. 5  — performance minime fattrici estere con produzione
 *   Norme tecniche art. 6  — come si contano record, somme vinte e gruppi
 *   Norme tecniche art. 7  — limite di 150 fattrici per stallone per stagione,
 *                            germoplasma dello stallone deceduto
 *   Disciplinare art. 12-14 — registro ordinario / supplementare, sezioni A e B
 *
 * ATTENZIONE: il controllo qui e' INFORMATIVO. Non sostituisce la verifica
 * dell'Ufficio Centrale del Libro genealogico, che e' l'unico organo
 * competente a decidere l'iscrivibilita' di un prodotto.
 */

import type { Database as DB } from "better-sqlite3";

export const FONTE_NORMATIVA = {
  titolo: "Disciplinare del Libro genealogico del Cavallo Trottatore Italiano — Norme tecniche",
  ente: "UNIRE / ANACT, vigilanza Ministero delle politiche agricole e forestali",
  base_legge: "Legge 15 gennaio 1991 n. 30, art. 3",
  versione: "testo del 30 ottobre 2008",
  url: "https://www.anact.it/",
};

// ── Soglie testuali del disciplinare (Norme tecniche, artt. 2-5) ──
// I valori in euro sono quelli scritti nel testo, in lire convertite.
export const SOGLIE = {
  stallone_debuttante: {
    record_km_ue: "1.14",
    record_miglio_extra_ue_pista_corta: "1.58",
    record_miglio_extra_ue_pista_lunga: "1.56",
    somme_ue_eur: 206582.60,
    somme_extra_ue_usd: 300000,
    gruppo1_vittorie: 1,
    gruppo1_vittorie_alternativa: 3,
  },
  stallone_con_produzione: {
    media_prodotti_record_per_annata: 5,
    record_prodotti_miglio: "2.00",
    record_prodotti_km_francia: "1.17",
    record_prodotti_km_altri_ue: "1.16",
    media_prodotti_gruppo_per_annata: 2,
    media_prodotti_somme_per_annata: 3,
    somme_prodotti_ue_eur: 51645.69,
    somme_prodotti_extra_ue_usd: 100000,
    requisiti_minimi_da_soddisfare: 2,
  },
  fattrice_debuttante: {
    record_km_ue: "1.15",
    somme_ue_eur: 51645.69,
    somme_extra_ue_usd: 100000,
  },
  fattrice_con_produzione: {
    record_prodotto_km_ue: "1.14",
    somme_prodotto_ue_eur: 77468.53,
    somme_prodotto_extra_ue_usd: 150000,
    finestra_ultimi_prodotti: 5,
  },
  limiti_impiego: {
    max_fattrici_per_stagione: 150,
    nota: "Art. 7 Norme tecniche: dalla stagione di monta 2006, 150 fattrici "
      + "iscritte al libro genealogico per stallone per anno solare, "
      + "indipendentemente dal tipo di inseminazione. Stesso limite per "
      + "stalloni esteri che servono in Italia con seme refrigerato o congelato.",
  },
  stallone_deceduto: {
    nota: "Art. 7 Norme tecniche: il germoplasma di uno stallone deceduto e' "
      + "utilizzabile solo nella stagione di monta in cui lo stallone e' morto.",
  },
};

/** True se il paese indicato e' l'Italia. L'archivio usa sia i codici
 *  ("ITA", "IT", "I") sia le etichette in italiano ("Italia"). */
export function isItalia(paese: string | null | undefined): boolean {
  const p = String(paese || "").trim().toUpperCase();
  return p === "ITA" || p === "IT" || p === "I" || p === "ITALIA" || p === "ITALY";
}

/** Converte un record in secondi al chilometro. Accetta le due forme usate
 *  nell'archivio: "1.13.5" / "1.14" (catalogo monta) e 1'13"5 (scheda cavallo). */
export function recordToSeconds(rec: string | null | undefined): number | null {
  if (!rec) return null;
  const raw = String(rec).trim();
  const q = raw.match(/^(\d+)\s*['’]\s*(\d{1,2})(?:\s*["”]\s*(\d))?/);
  if (q) {
    return parseInt(q[1], 10) * 60 + parseInt(q[2], 10) + (q[3] ? parseInt(q[3], 10) / 10 : 0);
  }
  const m = raw.match(/^(\d+)[.:](\d{1,2})(?:[.:](\d))?$/);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  const sec = parseInt(m[2], 10);
  const dec = m[3] ? parseInt(m[3], 10) / 10 : 0;
  return min * 60 + sec + dec;
}

export interface RuleCheck {
  id: string;
  articolo: string;
  titolo: string;
  esito: "conforme" | "non_conforme" | "non_verificabile" | "attenzione";
  dettaglio: string;
}

export interface EligibilityReport {
  stallone: string;
  fattrice: string;
  fonte: typeof FONTE_NORMATIVA;
  controlli: RuleCheck[];
  esito_complessivo: "nessun ostacolo rilevato" | "verifiche necessarie" | "ostacolo rilevato";
  avvertenza: string;
}

/**
 * Controlla una coppia stallone x fattrice rispetto alle regole del
 * Libro genealogico che possiamo verificare con i dati che abbiamo.
 */
export function checkEligibility(db: DB, stallion: string, mare: string): EligibilityReport {
  const controlli: RuleCheck[] = [];

  const s = db.prepare(`
    SELECT h.name, h.birth_year, h.country, h.nationality, h.career_earnings,
           h.record_career, h.career_races,
           st.stud_status, st.stud_fee_eur, st.record_1600, st.record_2000,
           st.tot_prod, st.somme_vinte_nette, st.catalog_earnings_eur, st.season
    FROM horses h
    LEFT JOIN stallions st ON UPPER(TRIM(st.name)) = UPPER(TRIM(h.name))
    WHERE UPPER(TRIM(h.name)) = UPPER(TRIM(?)) LIMIT 1
  `).get(stallion) as any;

  const stRow = db.prepare(`
    SELECT name, stud_status, stud_fee_eur, record_1600, record_2000, tot_prod,
           somme_vinte_nette, catalog_earnings_eur, season, country
    FROM stallions WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) LIMIT 1
  `).get(stallion) as any;
  const sd = s ?? stRow;

  let m = db.prepare(`
    SELECT name, birth_year, sex, country, career_earnings, career_races,
           career_wins, record_career
    FROM horses WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) LIMIT 1
  `).get(mare) as any;
  // Molte fattrici non hanno una scheda propria (non hanno corso in Italia, o
  // sono estere): esistono nell'archivio solo come madri dei loro figli.
  // In quel caso la ricostruiamo dai figli invece di dire "non in archivio".
  let mareFromOffspring = false;
  if (!m) {
    const agg = db.prepare(`
      SELECT COUNT(*) AS n FROM horses WHERE UPPER(TRIM(dam)) = UPPER(TRIM(?))
    `).get(mare) as any;
    if ((agg?.n ?? 0) > 0) {
      mareFromOffspring = true;
      m = {
        name: mare, birth_year: null, sex: "F", country: null,
        career_earnings: null, career_races: null, career_wins: null,
        record_career: null,
      };
    }
  }

  // ── 1. Stato dello stallone in monta (art. 7: stallone deceduto) ──
  const status = sd?.stud_status ?? null;
  if (status === "deceased") {
    controlli.push({
      id: "stallone_deceduto", articolo: "Norme tecniche art. 7",
      titolo: "Stallone deceduto",
      esito: "non_conforme",
      dettaglio: SOGLIE.stallone_deceduto.nota
        + " Questo stallone risulta deceduto: il suo seme e' utilizzabile solo "
        + "nella stagione in cui e' morto.",
    });
  } else if (status === "non_in_catalogo") {
    controlli.push({
      id: "fuori_catalogo", articolo: "Catalogo monta",
      titolo: "Fuori dal catalogo della stagione",
      esito: "attenzione",
      dettaglio: "Lo stallone non risulta nel catalogo monta della stagione in corso. "
        + "I dati mostrati sono dell'ultima stagione rilevata: verificare la "
        + "disponibilita' presso la stazione di monta.",
    });
  } else if (status) {
    controlli.push({
      id: "in_monta", articolo: "Catalogo monta",
      titolo: "Disponibilita' in monta",
      esito: "conforme",
      dettaglio: status === "free" ? "Monta gratuita nella stagione in corso."
        : status === "da_concordare" ? "Monta da concordare con la stazione."
        : "Stallone attivo nella stagione di monta in corso.",
    });
  }

  // ── 2. Limite di 150 fattrici per stagione (art. 7) ──
  controlli.push({
    id: "limite_150", articolo: "Norme tecniche art. 7",
    titolo: "Limite di 150 fattrici per stagione",
    esito: "non_verificabile",
    dettaglio: SOGLIE.limiti_impiego.nota
      + " Il numero di breeding card gia' emesse per questa stagione non e' "
      + "un dato pubblico: va chiesto alla stazione di monta prima di prenotare.",
  });

  // ── 3. Requisiti dello stallone estero (artt. 2 e 3) ──
  const paese = String(sd?.country || sd?.nationality || (stRow?.country ?? "")).trim();
  const estero = !!paese && !isItalia(paese);
  if (estero) {
    const rec = recordToSeconds(sd?.record_career) ?? recordToSeconds(sd?.record_1600);
    const soglia = recordToSeconds(SOGLIE.stallone_debuttante.record_km_ue)!;
    const somme = Number(sd?.catalog_earnings_eur ?? sd?.somme_vinte_nette ?? sd?.career_earnings ?? 0);
    const prodotti = Number(sd?.tot_prod ?? 0);

    if (prodotti >= 5) {
      controlli.push({
        id: "stallone_estero_produzione", articolo: "Norme tecniche art. 3",
        titolo: "Stallone estero con produzione",
        esito: "non_verificabile",
        dettaglio: `Stallone estero (${paese}) con ${prodotti} prodotti: l'iscrizione `
          + "dei prodotti richiede almeno due requisiti su tre, calcolati come media "
          + "per annata di produzione (record 2.00 al miglio, vittorie di gruppo, "
          + `somme vinte dai prodotti oltre ${SOGLIE.stallone_con_produzione.somme_prodotti_ue_eur.toLocaleString("it-IT")} euro). `
          + "Il calcolo per annata richiede dati che l'archivio non copre per intero.",
      });
    } else {
      const okRec = rec !== null && rec <= soglia;
      const okSomme = somme >= SOGLIE.stallone_debuttante.somme_ue_eur;
      controlli.push({
        id: "stallone_estero_debuttante", articolo: "Norme tecniche art. 2",
        titolo: "Stallone estero debuttante",
        esito: okRec || okSomme ? "conforme" : "non_verificabile",
        dettaglio: `Stallone estero (${paese}). Requisiti: record ${SOGLIE.stallone_debuttante.record_km_ue} al km `
          + `(qui ${sd?.record_career ?? sd?.record_1600 ?? "non noto"}${okRec ? " — soddisfatto" : ""}), `
          + `oppure ${SOGLIE.stallone_debuttante.somme_ue_eur.toLocaleString("it-IT")} euro di somme vinte `
          + `(qui ${somme ? somme.toLocaleString("it-IT") + " euro" : "non note"}${okSomme ? " — soddisfatto" : ""}), `
          + "oppure una vittoria di gruppo I. Le vittorie di gruppo non sono nell'archivio.",
      });
    }
  }

  // ── 4. Requisiti della fattrice (artt. 4 e 5) ──
  if (m) {
    const figli = db.prepare(`
      SELECT COUNT(*) AS n, MAX(career_earnings) AS best_earn
      FROM horses WHERE UPPER(TRIM(dam)) = UPPER(TRIM(?))
    `).get(mare) as any;
    const nFigli = figli?.n ?? 0;
    const bestEarn = Number(figli?.best_earn ?? 0);
    const recM = recordToSeconds(m.record_career);
    const sogliaM = recordToSeconds(SOGLIE.fattrice_debuttante.record_km_ue)!;
    const earnM = Number(m.career_earnings ?? 0);

    if (mareFromOffspring) {
      controlli.push({
        id: "fattrice_senza_scheda", articolo: "Disciplinare art. 12",
        titolo: "Fattrice senza scheda di corsa",
        esito: "non_verificabile",
        dettaglio: `${mare} risulta nell'archivio solo come madre (${nFigli} prodotti): `
          + "la sua carriera di corsa non e' registrata, quindi i requisiti di "
          + "record e somme vinte non sono verificabili qui. Se e' estera, "
          + "l'iscrizione passa per il riconoscimento del libro genealogico di origine.",
      });
    }
    if (nFigli >= 2) {
      const ok = bestEarn >= SOGLIE.fattrice_con_produzione.somme_prodotto_ue_eur;
      controlli.push({
        id: "fattrice_produzione", articolo: "Norme tecniche art. 5",
        titolo: "Fattrice con produzione",
        esito: ok ? "conforme" : "non_verificabile",
        dettaglio: `La fattrice ha ${nFigli} prodotti. Serve almeno un prodotto vincitore `
          + `di gruppo, oppure con record ${SOGLIE.fattrice_con_produzione.record_prodotto_km_ue} al km, `
          + `oppure con oltre ${SOGLIE.fattrice_con_produzione.somme_prodotto_ue_eur.toLocaleString("it-IT")} euro `
          + `di somme vinte fra gli ultimi ${SOGLIE.fattrice_con_produzione.finestra_ultimi_prodotti} prodotti in eta' di corsa. `
          + `Miglior prodotto in archivio: ${bestEarn ? bestEarn.toLocaleString("it-IT") + " euro" : "non noto"}`
          + `${ok ? " — requisito soddisfatto" : ""}.`,
      });
    } else {
      const okR = recM !== null && recM <= sogliaM;
      const okE = earnM >= SOGLIE.fattrice_debuttante.somme_ue_eur;
      controlli.push({
        id: "fattrice_debuttante", articolo: "Norme tecniche art. 4",
        titolo: "Fattrice debuttante",
        esito: okR || okE ? "conforme" : "non_verificabile",
        dettaglio: `La fattrice ha meno di due prodotti in eta' di corsa. Requisiti: record `
          + `${SOGLIE.fattrice_debuttante.record_km_ue} al km (qui ${m.record_career ?? "non noto"}`
          + `${okR ? " — soddisfatto" : ""}), oppure ${SOGLIE.fattrice_debuttante.somme_ue_eur.toLocaleString("it-IT")} euro `
          + `di somme vinte (qui ${earnM ? earnM.toLocaleString("it-IT") + " euro" : "non note"}`
          + `${okE ? " — soddisfatto" : ""}), oppure una vittoria di gruppo, oppure la discendenza `
          + "da vincitrici o madri di vincitori di gruppo.",
      });
    }

    // Sesso: un controllo banale ma che evita errori grossolani
    if (!mareFromOffspring && m.sex && String(m.sex).toUpperCase() !== "F") {
      controlli.push({
        id: "sesso_fattrice", articolo: "Disciplinare art. 12",
        titolo: "Sesso della fattrice",
        esito: "non_conforme",
        dettaglio: `Nell'archivio ${m.name} non risulta femmina: controllare il nome inserito.`,
      });
    }
  } else {
    controlli.push({
      id: "fattrice_sconosciuta", articolo: "Disciplinare art. 12",
      titolo: "Fattrice non in archivio",
      esito: "non_verificabile",
      dettaglio: "La fattrice non e' presente nell'archivio: i controlli sulle "
        + "performance minime non sono stati eseguiti.",
    });
  }

  // ── 5. Sezione di iscrizione del prodotto (Disciplinare art. 12) ──
  controlli.push({
    id: "sezione_prodotto", articolo: "Disciplinare artt. 12-14",
    titolo: "Sezione di iscrizione del puledro",
    esito: "non_verificabile",
    dettaglio: "Il puledro va in sezione A se entrambi i genitori sono iscritti al "
      + "registro ordinario (o uno ordinario e l'altro supplementare o estero "
      + "riconosciuto), in sezione B se entrambi provengono dal registro "
      + "supplementare. L'archivio non riporta il registro di iscrizione dei "
      + "singoli soggetti, quindi la sezione non e' determinabile qui.",
  });

  const bloccanti = controlli.filter(c => c.esito === "non_conforme").length;
  const dubbi = controlli.filter(c => c.esito === "non_verificabile" || c.esito === "attenzione").length;

  return {
    stallone: stallion, fattrice: mare, fonte: FONTE_NORMATIVA, controlli,
    esito_complessivo: bloccanti > 0 ? "ostacolo rilevato"
      : dubbi > 0 ? "verifiche necessarie" : "nessun ostacolo rilevato",
    avvertenza: "Controllo informativo basato sul disciplinare del Libro genealogico. "
      + "Non sostituisce la verifica dell'Ufficio Centrale del Libro genealogico, "
      + "unico organo competente sull'iscrivibilita' del prodotto.",
  };
}

// ── Base scientifica dei pesi padre / madre ───────────────────────

export const BASI_SCIENTIFICHE = {
  sintesi:
    "In genetica quantitativa padre e madre trasmettono ciascuno meta' del "
    + "patrimonio genetico, quindi il loro contributo ereditario e' per "
    + "definizione uguale. La madre pero' aggiunge un effetto materno che il "
    + "padre non ha: ambiente uterino, latte, DNA mitocondriale e linea "
    + "femminile. Per questo la letteratura trova associazioni madre-figlio "
    + "spesso superiori a quelle padre-figlio. In pratica, pero', lo stallone "
    + "si stima molto meglio perche' ha centinaia di figli, mentre una fattrice "
    + "ne ha pochi: la stima del padre e' piu' precisa, non piu' importante.",
  implicazione_modello:
    "Per questo l'Advisor pesa i due indizi in modo diverso e li attenua in base "
    + "al numero di figli osservati. Il peso maggiore del padre nei coefficienti "
    + "non significa che il padre conti di piu' in biologia: significa che il suo "
    + "indizio e' misurato su molti piu' figli, quindi contiene meno rumore.",
  perche_la_precisione_e_bassa:
    "L'ereditabilita' dei caratteri di corsa nel trotto e' da bassa a media: "
    + "circa 0,28-0,36 per il tempo sul chilometro e circa 0,09-0,20 per i "
    + "guadagni. Significa che la maggior parte delle differenze fra cavalli "
    + "dipende da fattori non ereditari (allenamento, driver, salute, "
    + "infortuni, sorte). Un modello di accoppiamento, per quanto ben fatto, "
    + "non puo' quindi superare un tetto teorico modesto: previsioni molto "
    + "precise sul singolo puledro sarebbero un segnale di errore, non di bravura.",
  fonti: [
    {
      autori: "Suontama M., van der Werf J.H.J., Juga J., Ojala M.",
      anno: 2012,
      titolo: "Genetic parameters for racing records in trotters using linear and generalized linear models",
      rivista: "Journal of Animal Science 90(9): 2921-2930",
      doi: "10.2527/jas.2011-4526",
      url: "https://academic.oup.com/jas/article/90/9/2921/4701538",
      rilevanza: "510.519 record su 17.792 Finnhorse e 513.161 record su 25.536 "
        + "trottatori Standardbred. Ereditabilita' del tempo al chilometro 0,34; "
        + "dei guadagni per singola corsa 0,02-0,09 a seconda della scala.",
    },
    {
      autori: "Rohe R., Savas T., Brka M., Willms F., Kalm E.",
      anno: 2001,
      titolo: "Multiple-trait genetic analyses of racing performances of German trotters with disentanglement of genetic and driver effects",
      rivista: "Archiv fur Tierzucht 44(6): 580-588",
      url: "https://d-nb.info/1149260505/34",
      rilevanza: "6.611 trottatori tedeschi, 163.322 partenze. Ereditabilita' del "
        + "tempo 0,28 e dei guadagni 0,09 una volta tolto l'effetto del driver. "
        + "Ignorare il driver gonfia l'ereditabilita' dei guadagni del 44%: "
        + "e' la prova che gran parte del risultato non e' genetica.",
    },
    {
      autori: "Thiruvenkadan A.K., Kandasamy N., Panneerselvam S.",
      anno: 2009,
      titolo: "Inheritance of racing performance of trotter horses: an overview",
      rivista: "Livestock Science 124: 163-181",
      doi: "10.1016/j.livsci.2009.01.010",
      url: "https://doi.org/10.1016/j.livsci.2009.01.010",
      rilevanza: "Rassegna delle stime pubblicate: tempo 0,31 in media su 10 studi "
        + "(intervallo 0,04-0,48), miglior tempo 0,24, guadagni 0,16. Riporta "
        + "anche Arnason, Darenius e Philipsson (1982) sui trottatori svedesi: "
        + "0,31 per il logaritmo del miglior tempo, 0,08 per il numero di partenze.",
    },
    {
      autori: "Lin X., Zhou S., Wen L., Davie A., Yao X., Liu W., Zhang Y.",
      anno: 2016,
      titolo: "Potential role of maternal lineage in the thoroughbred breeding strategy",
      rivista: "Reproduction, Fertility and Development 28(11): 1704-1711",
      doi: "10.1071/RD15063",
      url: "https://www.publish.csiro.au/rd/RD15063",
      rilevanza: "675 purosangue australiani: l'associazione madre-figlio sul "
        + "guadagno per partenza (r = 0,141, p < 0,001) risulta significativamente "
        + "superiore a quella padre-figlio (r = 0,035, p = 0,366). E' l'argomento "
        + "principale per non ignorare la fattrice, come faceva la versione "
        + "precedente dell'Advisor.",
    },
    {
      autori: "Harrison S.P., Turrion-Gomez J.L.",
      anno: 2006,
      titolo: "Mitochondrial DNA: an important female contribution to thoroughbred racehorse performance",
      rivista: "Mitochondrion 6(2): 53-63",
      doi: "10.1016/j.mito.2006.01.002",
      url: "https://pubmed.ncbi.nlm.nih.gov/16516561/",
      rilevanza: "Il DNA mitocondriale si trasmette solo per via materna ed e' "
        + "coinvolto nella produzione di energia: e' un meccanismo biologico "
        + "concreto per cui la linea femminile conta oltre la meta' di geni.",
    },
    {
      autori: "Kuhl J., Stock K.F., Wulf M., Aurich C.",
      anno: 2015,
      titolo: "Maternal lineage of warmblood mares contributes to variation of gestation length and bias of foal sex ratio",
      rivista: "PLoS ONE 10(10): e0139358",
      doi: "10.1371/journal.pone.0139358",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4593555/",
      rilevanza: "La linea materna spiega il 13-18% della variazione della durata "
        + "della gestazione contro il 2-3% del padre: misura diretta di quanto "
        + "pesa l'effetto materno rispetto a quello paterno.",
    },
    {
      autori: "UNIRE / ANACT",
      anno: 2008,
      titolo: "Disciplinare del Libro genealogico del Cavallo Trottatore Italiano e Norme tecniche",
      rivista: "Ministero delle politiche agricole e forestali, legge 15 gennaio 1991 n. 30",
      url: "https://www.anact.it/",
      rilevanza: "Fonte normativa dei requisiti minimi di stalloni e fattrici, del "
        + "limite di 150 fattrici per stagione e delle sezioni di iscrizione dei prodotti.",
    },
  ],
};
