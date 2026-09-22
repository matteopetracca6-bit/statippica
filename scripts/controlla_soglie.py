#!/usr/bin/env python3
"""Controlla che le soglie di validazione siano identiche nei due punti.

PERCHE' ESISTE QUESTO CONTROLLO. Le soglie che decidono se il modello di
allevamento e' utilizzabile sono scritte in due posti: in
`train_breeding_model.py`, che addestra, e in `server/breeding.ts`, che giudica
sul sito quando il modello non porta i campi dentro di se'.

Se i due numeri divergono non succede niente di visibile: nessun errore,
nessun avviso. Semplicemente chi addestra usa un criterio e il sito ne usa un
altro, e un modello potrebbe risultare "utilizzabile" sul sito e "sperimentale"
per chi lo ha addestrato. E' il tipo di errore che resta nascosto per mesi.

E' successo davvero: la soglia era 0,20 in entrambi, poi l'ho corretta a 0,08
in uno solo. Questo controllo esiste perche' non ricapiti.

Si lancia da solo nei flussi notturni. Torna 1 se i numeri non coincidono.
"""
import re
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
PY_FILE = RADICE / "train_breeding_model.py"
TS_FILE = RADICE / "server" / "breeding.ts"

SOGLIE = [
    "MIN_R2_DECISION",
    "MIN_AUC_DECISION",
    "MIN_SAMPLES_DECISION",
    "MIN_R2_EXPERIMENTAL",
    "MIN_AUC_EXPERIMENTAL",
]


def leggi(percorso: Path, nome: str) -> float | None:
    """Prende il valore di una soglia, in Python o in TypeScript.

    Cerca solo assegnazioni a inizio riga, altrimenti la parola dentro un
    commento o dentro un dizionario verrebbe letta come se fosse il valore.
    """
    testo = percorso.read_text(encoding="utf-8")
    m = re.search(
        rf"^(?:const\s+)?{re.escape(nome)}\s*=\s*(-?\d+(?:\.\d+)?)",
        testo,
        re.MULTILINE,
    )
    return float(m.group(1)) if m else None


def main() -> int:
    problemi = []
    print("Soglie di validazione del modello di allevamento:\n")
    print(f"  {'soglia':24}{'chi addestra':>14}{'il sito':>10}")
    for nome in SOGLIE:
        a = leggi(PY_FILE, nome)
        b = leggi(TS_FILE, nome)
        if a is None:
            problemi.append(f"{nome} non si trova in chi addestra")
            continue
        if b is None:
            problemi.append(f"{nome} non si trova nel sito")
            continue
        uguali = abs(a - b) < 1e-9
        print(f"  {nome:24}{a:>14}{b:>10}   {'ok' if uguali else 'DIVERSE'}")
        if not uguali:
            problemi.append(f"{nome}: chi addestra dice {a}, il sito dice {b}")

    print()
    if problemi:
        for p in problemi:
            print(f"::error::{p}")
        print("\nLe soglie devono coincidere. Chi ne cambia una deve cambiarla")
        print("in entrambi i punti, altrimenti il sito giudica il modello con")
        print("un criterio diverso da quello con cui e' stato addestrato.")
        return 1

    print("Tutte le soglie coincidono.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
