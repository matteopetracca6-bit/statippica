#!/usr/bin/env python3
"""
Controlla i tre calcoli rifatti ogni notte prima di pubblicarli:

  * advisor_model.json      pesi del Consigliere di allevamento
  * advisor_backtest.json   la sua verifica sul passato
  * career_value_model.json valore di carriera (tavola dei guadagni per eta')

Se un file e' rotto o incompleto (per esempio l'archivio era parziale) esce con
errore e il flusso notturno NON lo pubblica: resta online la versione di prima.
Meglio un calcolo di ieri che uno sbagliato.
"""

import json
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent


def carica(nome: str) -> dict:
    return json.loads((RADICE / nome).read_text(encoding="utf-8"))


def main() -> int:
    errori = []
    try:
        m = carica("advisor_model.json")
        for k in ("intercept", "w_sire", "w_dam", "population_mean", "residual_sd"):
            v = m.get(k)
            if not isinstance(v, (int, float)) or v != v:
                errori.append(f"advisor_model.json: valore mancante o non valido: {k}")
    except Exception as e:  # file assente o non leggibile
        errori.append(f"advisor_model.json non leggibile: {e}")

    try:
        b = carica("advisor_backtest.json")
        if (b.get("n_train") or 0) < 1000 or (b.get("n_test") or 0) < 300:
            errori.append(f"advisor_backtest.json: troppo pochi cavalli "
                          f"(addestramento {b.get('n_train')}, prova {b.get('n_test')})")
        if not b.get("models"):
            errori.append("advisor_backtest.json: mancano i confronti")
    except Exception as e:
        errori.append(f"advisor_backtest.json non leggibile: {e}")

    try:
        c = carica("career_value_model.json")
        if not c.get("fasce") or not c.get("tavola_sopravvivenza"):
            errori.append("career_value_model.json: mancano fasce o tavola")
    except Exception as e:
        errori.append(f"career_value_model.json non leggibile: {e}")

    if errori:
        for e in errori:
            print("::error::" + e)
        return 1
    print(f"Calcoli in ordine: consigliere su {b['n_train']} + {b['n_test']} cavalli, "
          f"{len(c['fasce'])} fasce di valore di carriera.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
