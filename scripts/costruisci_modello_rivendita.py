#!/usr/bin/env python3
"""
Costruisce resale_model.json: quanto vale in asta il puledro di uno stallone.

COS'ERA PRIMA E PERCHE' NON ANDAVA. La versione precedente era una regressione
del prezzo sul voto medio dei figli dello stallone, con R2 0,068, e soprattutto
veniva poi usata male: il coefficiente era stato stimato su una grandezza che
si sparpaglia molto (il voto medio dei figli va da 0,8 a 49,5) ma gli si dava
in pasto il voto ATTESO del puledro, che esce dal modello di accoppiamento
schiacciato verso la media e sta tutto fra 43 e 51, cioe' quattro volte e mezzo
piu' compresso. Risultato: il prezzo stimato era praticamente lo stesso per
tutti, circa 28.000 euro, mentre la tassa di monta varia da 1.500 a 35.000. Il
ritorno economico diventava allora una divisione con il numeratore fisso, e
premiava meccanicamente lo stallone piu' economico. Non era un risultato: era
un artefatto.

COSA FA ORA, in ordine di preferenza:

1. FASCIA STORICA PROPRIA. Se lo stallone ha almeno tre yearling realmente
   venduti nelle aste raccolte, si usano i prezzi dei suoi figli: mediana e
   quartili veri, piu' il numero di vendite su cui poggiano. Nessun modello di
   mezzo, e chi legge vede su quanti casi si basa.

2. STIMA DALLA TASSA DI MONTA. Per gli altri si usa una regressione di
   log(prezzo) su log(tassa di monta). La monta e' la valutazione che il
   mercato stesso fa dello stallone, fatta da gente che vede i cavalli dal
   vivo, ed e' molto piu' informativa del voto dei figli: spiega circa il 39%
   del prezzo contro il 7%. La pendenza e' inferiore a uno, cioe' raddoppiare
   la monta non raddoppia il prezzo del puledro.

In entrambi i casi si riporta anche la quota di lotti che trova davvero un
compratore, perche' chi non vende non incassa.
"""

from __future__ import annotations

import csv
import json
import math
import statistics as st
import sys
from collections import defaultdict
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
CSV_ASTE = RADICE / "aste_yearling.csv"
ARCHIVIO = RADICE / "data.db"
USCITA = RADICE / "resale_model.json"

# Sotto tre vendite la mediana dei prezzi e' un numero casuale: due lotti
# fortunati la spostano del doppio. Con tre si accetta, dichiarando quanti sono.
MIN_VENDITE_FASCIA = 3


def quantile(v: list[float], q: float) -> float:
    """Quantile per interpolazione lineare, su lista ordinata."""
    if not v:
        return 0.0
    if len(v) == 1:
        return float(v[0])
    pos = (len(v) - 1) * q
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return float(v[lo])
    return float(v[lo] + (v[hi] - v[lo]) * (pos - lo))


def regressione(xs: list[float], ys: list[float]) -> tuple[float, float, float, float]:
    """Minimi quadrati su una variabile. Ritorna b0, b1, r2, deviazione dei resti."""
    n = len(xs)
    mx, my = st.mean(xs), st.mean(ys)
    sxy = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    sxx = sum((a - mx) ** 2 for a in xs)
    b1 = sxy / sxx
    b0 = my - b1 * mx
    resti = [b - (b0 + b1 * a) for a, b in zip(xs, ys)]
    sst = sum((b - my) ** 2 for b in ys)
    sse = sum(r * r for r in resti)
    r2 = 1 - sse / sst if sst > 0 else 0.0
    sd = st.pstdev(resti) if n > 2 else 0.0
    return b0, b1, r2, sd


def main() -> int:
    if not CSV_ASTE.exists():
        print(f"ERRORE: manca {CSV_ASTE.name}. Lancia prima raccogli_aste_yearling.py")
        return 1

    righe = list(csv.DictReader(CSV_ASTE.open(encoding="utf-8")))
    venduti = [r for r in righe if r["venduto"] == "si" and r["prezzo_eur"]]
    print(f"  {len(righe)} lotti, {len(venduti)} venduti "
          f"({100 * len(venduti) / len(righe):.1f}%)")

    # ── 1. Fasce storiche per stallone ────────────────────────────────
    prezzi_per_padre: dict[str, list[int]] = defaultdict(list)
    lotti_per_padre: dict[str, int] = defaultdict(int)
    for r in righe:
        lotti_per_padre[r["padre"]] += 1
        if r["venduto"] == "si" and r["prezzo_eur"]:
            prezzi_per_padre[r["padre"]].append(int(r["prezzo_eur"]))

    fasce: dict[str, dict] = {}
    for padre, prezzi in prezzi_per_padre.items():
        if len(prezzi) < MIN_VENDITE_FASCIA:
            continue
        p = sorted(prezzi)
        fasce[padre] = {
            "n_venduti": len(p),
            "n_lotti": lotti_per_padre[padre],
            "quota_venduti": round(len(p) / lotti_per_padre[padre], 3),
            "p25": round(quantile(p, 0.25)),
            "mediana": round(quantile(p, 0.50)),
            "p75": round(quantile(p, 0.75)),
            "minimo": p[0],
            "massimo": p[-1],
        }
    print(f"  fasce storiche costruite per {len(fasce)} stalloni "
          f"(almeno {MIN_VENDITE_FASCIA} vendite ciascuno)")

    # ── 2. Stima dalla tassa di monta, per tutti gli altri ────────────
    import sqlite3
    tasse: dict[str, float] = {}
    if ARCHIVIO.exists():
        con = sqlite3.connect(ARCHIVIO)
        for nome, fee in con.execute(
                "SELECT UPPER(TRIM(name)), stud_fee_eur FROM stallions "
                "WHERE stud_fee_eur IS NOT NULL AND stud_fee_eur > 0"):
            tasse[nome] = float(fee)
        con.close()
    print(f"  tasse di monta note: {len(tasse)}")

    # La regressione si costruisce su UNA riga per stallone, non su un lotto per
    # riga: altrimenti MAHARAJAH, che ha 56 vendite, peserebbe come cinquanta
    # stalloni e la relazione descriverebbe lui invece del mercato.
    coppie = [(tasse[p], st.median(v)) for p, v in prezzi_per_padre.items()
              if p in tasse and len(v) >= MIN_VENDITE_FASCIA]
    if len(coppie) < 10:
        print(f"ERRORE: solo {len(coppie)} stalloni con monta nota e vendite. Troppo pochi.")
        return 1

    xs = [math.log(f) for f, _ in coppie]
    ys = [math.log(m) for _, m in coppie]
    b0, b1, r2, sd = regressione(xs, ys)
    print(f"\n  STIMA DALLA TASSA DI MONTA, su {len(coppie)} stalloni")
    print(f"    spiega il {r2 * 100:.1f}% del prezzo (il modello vecchio: 6,8%)")
    print(f"    pendenza {b1:.3f}: raddoppiare la monta alza il prezzo del "
          f"{(2 ** b1 - 1) * 100:.0f}%, non del 100%")

    # Verifica onesta: si rifa' la stima togliendo uno stallone alla volta e si
    # guarda l'errore su quello escluso. Senza questo passaggio il 39% e' un
    # numero misurato sugli stessi dati usati per costruirlo.
    errori: list[float] = []
    for i in range(len(coppie)):
        xs_i = xs[:i] + xs[i + 1:]
        ys_i = ys[:i] + ys[i + 1:]
        c0, c1, _, _ = regressione(xs_i, ys_i)
        errori.append(ys[i] - (c0 + c1 * xs[i]))
    sse = sum(e * e for e in errori)
    sst = sum((y - st.mean(ys)) ** 2 for y in ys)
    r2_onesto = 1 - sse / sst
    print(f"    verificato escludendo uno stallone alla volta: {r2_onesto * 100:.1f}%")

    quota_globale = round(len(venduti) / len(righe), 3)

    modello = {
        "versione": 2,
        "metodo": ("fascia storica dei figli venduti quando ci sono almeno "
                   f"{MIN_VENDITE_FASCIA} vendite; altrimenti stima dalla tassa di monta"),
        "fasce_per_stallone": fasce,
        "min_vendite_fascia": MIN_VENDITE_FASCIA,
        "stima_da_monta": {
            "b0": round(b0, 6),
            "b1": round(b1, 6),
            "sd_log": round(sd, 6),
            "r2": round(r2, 4),
            "r2_verificato": round(r2_onesto, 4),
            "n_stalloni": len(coppie),
        },
        "quota_venduti_globale": quota_globale,
        "mediana_globale": round(st.median([int(r["prezzo_eur"]) for r in venduti])),
        "p25_globale": round(quantile(sorted(int(r["prezzo_eur"]) for r in venduti), 0.25)),
        "p75_globale": round(quantile(sorted(int(r["prezzo_eur"]) for r in venduti), 0.75)),
        "n_lotti_totali": len(righe),
        "n_venduti": len(venduti),
        "fonti": [
            {"nome": "ITS Asta Selezionata Yearling Trottatori 2025",
             "url": "https://www.its-aste.com/aste/asta-selezionata-yearling-trottatori/"},
            {"nome": "ITS Asta Selezionata Yearlings Trottatori 2024",
             "url": "https://www.its-aste.com/aste/asta-selezionata-yearlings-trottatori-5/"},
            {"nome": "Asta ANACT yearlings, risultati ufficiali",
             "url": "https://www.gaet.it/notizie/daily/asta-anact-risultati-ufficiali"},
        ],
        "nota": (
            f"Fasce di prezzo ricavate da {len(righe)} lotti yearling delle aste italiane "
            f"ANACT e ITS, di cui {len(venduti)} realmente aggiudicati ({quota_globale * 100:.0f}%). "
            f"I lotti ricomprati dal venditore non contano come vendite. Per {len(fasce)} "
            f"stalloni la fascia e' quella dei loro figli veri; per gli altri e' stimata "
            f"dalla tassa di monta, che spiega il {r2_onesto * 100:.0f} per cento del prezzo "
            "(verificato su stalloni esclusi dal calcolo). Le aste sono selezionate: il "
            "prezzo base parte da 3.000 euro e un puledro qualunque non vi accede."
        ),
    }

    USCITA.write_text(json.dumps(modello, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n  salvato in {USCITA.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
