# Modello breeding — metodologia e stato di validazione

Documento di riferimento per il modulo "stima accoppiamento" (stallone × fattrice).
Aggiornato con l'audit del 15 settembre 2026 sul database `data.db` versionato nel repo.

## 1. Cosa fa il modello

Per ogni accoppiamento storico già avvenuto si prende:

- come **input** le statistiche dei genitori (percentile tempi, percentile guadagni, percentuale vittorie, score, numero corse);
- come **target** il risultato del figlio (`score` 0–100 e voto A–F).

Si addestrano due modelli Gradient Boosting: un regressore sullo score e un classificatore binario sulla probabilità di figlio "scarso" (voto D/E/F). L'artefatto viene esportato in `breeding_model.json` e il server Node fa solo inferenza camminando gli alberi.

## 2. Perché la validazione v1 non era attendibile

La v1 usava `cross_val_score(cv=5)`, cioè una cross-validation **casuale**. In questo dominio è una misura inadatta:

| Problema | Effetto | Correzione v2 |
|---|---|---|
| Figli dello stesso stallone divisi fra train e validation | Il modello riconosce la famiglia invece della regola di accoppiamento | `GroupKFold` raggruppato per stallone |
| Nessuna dimensione temporale | Si valuta su cavalli "contemporanei", non sul futuro | Holdout temporale per anno di nascita del figlio (train ≤ 2021, test > 2021) |
| Target rumoroso | La mediana dei figli aveva **9 corse** in carriera: lo score è quasi casuale | Filtro `MIN_CHILD_RACES = 10` |
| Nessuna baseline | Non si sapeva se il modello battesse la semplice media | Baseline media del target e media dei genitori |
| Feature vuote riempite con la mediana | `ss_time` copertura 0%, `ds_time` 0,6% | Scarto automatico sotto il 5% di copertura |

## 3. Risultati onesti (dati reali, 15/09/2026)

Dataset: 371 accoppiamenti con entrambi i genitori dotati di rating → **180** dopo il filtro sulle corse del figlio, su **36 famiglie** (stalloni distinti).

### Regressione sullo score

| Modello | MAE | R² out-of-fold (per famiglia) |
|---|---|---|
| Baseline "media del target" | 16,57 | 0,000 |
| Baseline "media dei genitori" | 24,21 | −1,260 |
| Gradient Boosting 150×d3 | 18,11 | −0,275 |
| Gradient Boosting 60×d2 | 16,73 | −0,071 |
| Ridge (α=10) | 16,78 | −0,072 |

Holdout temporale (74 train / 106 test): MAE 20,03 — R² −0,634.

**Conclusione: nessun modello batte la media.** Lo score atteso del puledro non è oggi previsto in modo affidabile e non può essere presentato come stima.

### Classificatore "puledro scarso" (D/E/F)

| Metrica | Valore | Riferimento |
|---|---|---|
| AUC | 0,670 | 0,5 = casuale |
| PR-AUC | 0,529 | prevalenza 0,372 |
| Brier score | 0,260 | più basso è meglio |

Qui esiste un **segnale debole ma reale**: il modello ordina i rischi meglio del caso. Con 180 esempi e 36 famiglie resta però fragile e va trattato come indicazione esplorativa, non come verdetto.

## 4. Perché il modello non predice: causa principale

Non è un problema di algoritmo, ma di **dati e di scala del target**:

- **Copertura fattrici**: solo 1.594 madri su 7.719 hanno un rating di performance. Il collo di bottiglia del dataset sono le madri, non gli stalloni.
- **Distribuzione incompatibile**: score medio dei figli 27,9 contro 84,4 dei padri e 43,8 delle madri. I genitori sono soggetti selezionati e a carriera conclusa, i figli sono giovani e ancora in corsa: il target non è sulla stessa scala degli input. È esattamente ciò che rende la baseline "media dei genitori" pessima (R² −1,26).
- **Maturità**: i figli nel dataset nascono fra 2018 e 2024; quelli del 2023–2024 hanno pochissime corse.

Direzioni di lavoro (in ordine di impatto atteso):

1. normalizzare il target per coorte di nascita/età invece di usare lo score assoluto;
2. aumentare la copertura dei rating delle fattrici, anche con un rating specifico "da riproduttrice";
3. usare la genealogia (nonni) solo dopo aver popolato davvero i tempi degli antenati;
4. valutare un target più robusto, per esempio percentile dei guadagni a pari età;
5. riconsiderare il modello solo dopo che il dataset supera qualche migliaio di accoppiamenti.

## 5. Gate di validazione

Il training scrive nell'artefatto lo stato del modello secondo criteri espliciti, applicati alle metriche **out-of-fold per famiglia**:

| Stato | Condizione |
|---|---|
| `decision_support_ready` | R² ≥ 0,20 **e** AUC ≥ 0,65 **e** n ≥ 500 |
| `experimental` | R² ≥ 0 **oppure** AUC ≥ 0,55 |
| `not_ready` | nessuna delle precedenti |

Stato attuale: **`experimental`** (R² −0,071, AUC 0,670, n=180). Di conseguenza il server:

- espone `validation_status`, `is_decision_support_ready`, `validation_criteria` e `methodology_notice` su `/api/breeding/info` e `/api/breeding/predict`;
- restituisce `roi_estimate = null` e lo elenca in `disabled_outputs`, perché un ROI costruito su una predizione non validata e su medie storiche per voto non è difendibile (ignora costi di allevamento, mantenimento, mortalità e varianza);
- espone i guadagni come `grade_avg_earnings_observed`, cioè media storica osservata per quel voto, non previsione economica individuale.

Il report completo, rigenerato a ogni training, è in `breeding_eval_report.json`.

## 6. Riproducibilità

```bash
python3 train_breeding_model.py                        # default: min 10 corse per figlio
python3 train_breeding_model.py --min-child-races 5    # dataset più ampio, target più rumoroso
python3 train_breeding_model.py --report /tmp/rep.json
```

Parametri da variabili d'ambiente: `MIN_CHILD_RACES`, `TEMPORAL_SPLIT_YEAR`, `MIN_FEATURE_COVERAGE`, `DB_PATH`, `BREEDING_MODEL_PATH`, `BREEDING_REPORT_PATH`.
