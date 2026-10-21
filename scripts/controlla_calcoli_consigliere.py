#!/usr/bin/env python3
"""
Controlla i tre calcoli rifatti ogni notte prima di pubblicarli:

  * advisor_model.json      pesi del Consigliere di allevamento
  * advisor_backtest.json   la sua verifica sul passato
  * career_value_model.json valore di carriera (tavola dei guadagni per eta')
  * puledri_model.json      previsione dei puledri (arriva alle corse? diventa buono?)
  * puledri_verifica.json   la sua prova sui nati mai visti

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

    LUNGHEZZE = {"madre": 1, "nonna": 1, "padre_madre": 1, "eta_madre": 4, "parto": 2}
    try:
        pm = carica("puledri_model.json")
        attese = 2 + sum(LUNGHEZZE.get(g, 99) for g in pm.get("informazioni", []))
        for campo in ("corre", "buono"):
            if len(pm.get("pesi", {}).get(campo, [])) != attese:
                errori.append(f"puledri_model.json: pesi '{campo}' non coerenti con le informazioni")
            if len(pm.get("taratura", {}).get(campo, [])) != 2:
                errori.append(f"puledri_model.json: taratura '{campo}' mancante")
        if len(pm.get("soglie_buono", {})) < 8:
            errori.append("puledri_model.json: mancano le soglie per annata")
        if not isinstance(pm.get("sperimentale"), bool):
            errori.append("puledri_model.json: manca lo stato sperimentale")
    except Exception as e:
        errori.append(f"puledri_model.json non leggibile: {e}")
    try:
        pv = carica("puledri_verifica.json")
        if (pv.get("n_prova") or 0) < 3000:
            errori.append(f"puledri_verifica.json: prova su troppi pochi nati ({pv.get('n_prova')})")
        if not pv.get("regole") or not pv.get("buono", {}).get("fasce"):
            errori.append("puledri_verifica.json: mancano regole o fasce")
    except Exception as e:
        errori.append(f"puledri_verifica.json non leggibile: {e}")

    if errori:
        for e in errori:
            print("::error::" + e)
        return 1
    print(f"Calcoli in ordine: consigliere su {b['n_train']} + {b['n_test']} cavalli, "
          f"{len(c['fasce'])} fasce di valore di carriera; puledri provati su "
          f"{pv['n_prova']} nati, stato: {pv.get('stato')}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
