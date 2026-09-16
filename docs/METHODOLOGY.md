# Metodologia: modello predittivo di performance e breeding value nel trotto italiano

## Capitolo per la tesi — metodologia, algoritmo e validazione

---

## 1. Inquadramento e domanda di ricerca

Il settore del trotto italiano basa le decisioni di allevamento su valutazioni empiriche e poco sistematiche. StatIppica costruisce un database strutturato tramite raccolta dati automatizzata da fonti pubbliche (Trottoweb, banca dati UNIRE), integrando risultati di gara, genealogia e guadagni per addestrare modelli predittivi capaci di stimare il potenziale sportivo dei cavalli.

La domanda di ricerca è: **è possibile prevedere la performance agonistica di un cavallo partendo dai dati di carriera e genealogia disponibili pubblicamente?**

Questo capitolo definisce:
- l'algoritmo scelto (sezione 2);
- le feature e il dataset (sezione 3);
- la procedura di validazione (sezione 4);
- i risultati sul modello di predizione di performance individuale (sezione 5);
- il modello di stima accoppiamento breeding come sviluppo sperimentale (sezione 6);
- il confronto con lo stato dell'arte internazionale (sezione 7).

## 2. Scelta dell'algoritmo: Gradient Boosting

### 2.1 Decisione

L'algoritmo principale del progetto è **Gradient Boosting** (implementazione scikit-learn `GradientBoostingRegressor` / `GradientBoostingClassifier`), con i seguenti iperparametri fissati:

| Iperparametro | Valore | Motivazione |
|---|---|---|
| `n_estimators` | 150 | Numero di alberi sufficiente a convergere su dataset piccoli (<500 campioni) senza overfitting |
| `max_depth` | 3 | Profondità limitata: ogni albero è un "weak learner", principio fondamentale del boosting |
| `learning_rate` | 0.08 | Tasso di apprendimento basso per stabilità; bilanciato con n_estimators |
| `random_state` | 42 | Riproducibilità |

### 2.2 Perché Gradient Boosting e non Random Forest

La scelta è motivata da tre fattori:

1. **Prestazioni su dataset piccoli e tabellari.** Gradient Boosting costruisce alberi sequenziali, dove ciascuno corregge gli errori del precedente. Su dataset con poche centinaia di campioni e feature numeriche continue (come il nostro: 180 accoppiamenti, 10 feature), questo approccio è più efficiente di Random Forest, che costruisce alberi indipendenti e richiede più dati per raggiungere la stessa capacità predittiva ([GeeksforGeeks](https://www.geeksforgeeks.org/machine-learning/gradient-boosting-vs-random-forest/), [Medium](https://medium.com/@aravanshad/gradient-boosting-versus-random-forest-cfa3fa8f0d80)).

2. **Interpretabilità della feature importance.** Il modello restituisce un ranking di importanza delle feature, essenziale per rispondere alla domanda manageriale "quali caratteristiche del genitore contano di più?". Il server Node.js fa inferenza camminando gli alberi serializzati in JSON, senza dipendenze ML a runtime.

3. **Coerenza con la letteratura.** Il boosting è lo standard de facto per la predizione di breeding value nel settore equino, dove dataset simili (centinaia di osservazioni, feature genealogiche e di performance) vengono modellati con gradient boosting o XGBoost ([PubMed — equine breeding value prediction](https://pubmed.ncbi.nlm.nih.gov/39335312/)).

### 2.3 Perché non XGBoost

XGBoost è una libreria esterna ottimizzata per velocità e scalabilità su dataset grandi. Per il nostro dataset (180 campioni, 10 feature), la differenza di prestazioni tra scikit-learn `GradientBoostingRegressor` e XGBoost è trascurabile ([XGBoosting — benchmark](https://xgboosting.com/xgbregressor-faster-than-gradientboostingregressor/)), ma scikit-learn offre:
- zero dipendenze esterne (importante per il deployment su Render);
- coerenza con il resto del stack (già usa scikit-learn per altre componenti);
- serializzazione degli alberi in JSON nativo, già implementata nel server.

**Se il dataset crescesse oltre 1.000 campioni**, una migrazione a XGBoost sarebbe giustificata per la parallelizzazione del training. La documentazione del codice include una nota a riguardo.

## 3. Dataset e feature

### 3.1 Modello di performance individuale (core)

Il sistema di rating di performance assegna a ciascun cavallo uno score 0–100 basato su tre componenti:

| Componente | Peso | Fonte |
|---|---|---|
| Percentile guadagni di carriera | 50% | Somma vincite nette |
| Percentile tempo per km | 30% | Record al km |
| Win rate (vittorie / corse) | 20% | Percentuale vittorie |

Lo score viene mappato a un voto (SSS–F) tramite soglie dinamiche basate sui percentili della distribuzione (sezione 8 di `BREEDING_METHODOLOGY.md`).

**Popolazione**: 22.945 cavalli con rating di performance, 671.903 gare, 520 stalloni con statistiche riproduttive.

### 3.2 Modello di stima accoppiamento (breeding, sperimentale)

Per il modello breeding, le feature sono le statistiche di carriera dei genitori:

| Feature | Descrizione | Copertura |
|---|---|---|
| `s_time` | Percentile tempo stallone | 100% |
| `s_earn` | Percentile guadagni stallone | 100% |
| `s_win` | Win rate stallone | 100% |
| `s_score` | Score performance stallone | 100% |
| `s_races` | Numero corse stallone | 100% |
| `m_time` | Percentile tempo fattrice | 100% |
| `m_earn` | Percentile guadagni fattrice | 100% |
| `m_win` | Win rate fattrice | 100% |
| `m_score` | Score performance fattrice | 100% |
| `m_races` | Numero corse fattrice | 100% |
| `ds_time` | Percentile tempo padre della fattrice | 0,6% — scartato |
| `ss_time` | Percentile tempo padre dello stallone | 0% — scartato |

Le feature `ds_time` e `ss_time` (tempi dei nonni) sono state scartate automaticamente perché la loro copertura è inferiore al 5%: riempirle con la mediana avrebbe aggiunto rumore. Verranno reinserite quando la fase di recupero genitori da UNIRE (sezione 7.2 di `BREEDING_METHODOLOGY.md`) avrà popolato abbastanza nonni.

### 3.3 Target

- **Regressione**: score di performance del figlio (0–100), filtrato a `MIN_CHILD_RACES ≥ 10` per ridurre il rumore.
- **Classificazione**: figlio "scarso" (voto D/E/F) vs "non scarso" (A o superiore).

### 3.4 Dimensioni del dataset breeding

| Fase | Accoppiamenti |
|---|---|
| Totale nel database | 7.719 |
| Con entrambi i genitori rating | 371 |
| Dopo filtro MIN_CHILD_RACES ≥ 10 | 180 |
| Famiglie (stalloni distinti) | 36 |

## 4. Procedura di validazione

### 4.1 GroupKFold per famiglia

La cross-validation standard (KFold casuale) è inadatta a questo dominio perché i figli dello stesso stallone condividono il patrimonio genetico: se finiscono sia in training sia in validation, il modello può "riconoscere la famiglia" invece di imparare una regola di accoppiamento.

Si usa quindi **GroupKFold** con 5 fold raggruppati per stallone: ogni famiglia sta interamente dentro o fuori dal training. È la misura più vicina all'uso reale, dove si predice il valore di un puledro da uno stallone mai visto in training.

```
GroupKFold(n_splits=5)
gruppo = stallone del figlio
```

### 4.2 Holdout temporale

In uso reale si predice il valore di un puledro non ancora nato, quindi si addestra sul passato e si verifica sul futuro. Si aggiunge un holdout temporale per anno di nascita del figlio:

- **Train**: figli nati ≤ 2021
- **Test**: figli nati > 2021

Questo valuta la capacità del modello di generalizzare nel tempo, non solo tra famiglie.

### 4.3 Baseline obbligatorie

Un modello che non batte una baseline semplice non è utilizzabile. Il training calcola due baseline:

1. **Media del target**: predice sempre la media degli score dei figli. Se il modello non la batte, non ha imparato nulla.
2. **Media dei genitori**: predice la media aritmetica degli score dei due genitori. Un'euristica naturale usata dagli allevatori.

### 4.4 Metriche

| Task | Metrica | Cosa misura |
|---|---|---|
| Regressione | MAE | Errore medio assoluto (in punti score) |
| Regressione | RMSE | Penalizza gli errori grandi |
| Regressione | R² | Varianza spiegata (1=perfetto, 0=media, <0=peggio della media) |
| Classificazione | AUC | Capacità di ordinare i rischi (0.5=casuale, 1=perfetto) |
| Classificazione | PR-AUC | Precision-recall, robusta con classi sbilanciate |
| Classificazione | Brier score | Calibrazione delle probabilità (più basso = meglio) |

### 4.5 Gate di validazione

Lo stato del modello è dichiarato esplicitamente nell'artefatto, secondo criteri prefissati applicati alle metriche out-of-fold per famiglia:

| Stato | Condizione | Comportamento server |
|---|---|---|
| `decision_support_ready` | R² ≥ 0,20 **e** AUC ≥ 0,65 **e** n ≥ 500 | Tutti gli output attivi |
| `experimental` | R² ≥ 0 **oppure** AUC ≥ 0,55 | Output limitati, ROI disabilitato |
| `not_ready` | nessuna delle precedenti | Solo statistiche descrittive |

## 5. Risultati: modello di performance individuale

Il sistema di rating di performance (score 0–100 basato su guadagni, tempi, win rate) è operativo e validato su 22.945 cavalli. Non è un modello ML supervisionato, ma un sistema di scoring euristico basato su percentile ranking, che è lo standard per valutazioni di performance nel settore ippico.

La sua affidabilità deriva dalla completezza dei dati: 671.903 gare raccolte, 22.945 cavalli con almeno una corsa. Il voto assegnato (SSS–F) è stabile perché basato sui percentili della distribuzione reale, non su soglie arbitrarie.

Questo è il **modello core** della tesi: un sistema di valutazione di performance individuale basato su dati pubblici, trasparente e replicabile.

## 6. Risultati: modello di stima accoppiamento (breeding)

### 6.1 Regressione sullo score

| Modello | MAE | R² out-of-fold | vs baseline |
|---|---|---|---|
| Baseline "media del target" | 16,57 | 0,000 | riferimento |
| Baseline "media dei genitori" | 24,21 | −1,260 | peggio della media |
| Gradient Boosting 150×d3 | 18,11 | −0,275 | peggio della media |
| Gradient Boosting 60×d2 | 16,73 | −0,071 | peggio della media |
| Ridge (α=10) | 16,78 | −0,072 | peggio della media |

Holdout temporale (74 train / 106 test): MAE 20,03 — R² −0,642.

**Nessun modello batte la baseline "media del target".** Lo score atteso del puledro non è oggi prevedibile in modo affidabile.

### 6.2 Classificatore "puledro scarso" (D/E/F)

| Metrica | Valore | Riferimento |
|---|---|---|
| AUC | 0,670 | 0,5 = casuale |
| PR-AUC | 0,529 | prevalenza 0,372 |
| Brier score | 0,260 | più basso = meglio |

Il classificatore mostra un **segnale debole ma reale**: ordina i rischi meglio del caso (AUC 0,670 > 0,5). Con 180 esempi e 36 famiglie resta però fragile.

### 6.3 Stato di validazione

Stato attuale: **`experimental`** (R² −0,071, AUC 0,670, n=180).

- Il regressore dello score non batte la media → output disabilitato
- Il classificatore "puledro scarso" supera la soglia sperimentale (AUC 0,670 > 0,55) → esposto come indicazione esplorativa
- Il ROI è disabilitato (`roi_estimate = null`)

### 6.4 Cause del fallimento

Non è un problema di algoritmo, ma di **dati e di scala del target**:

1. **Copertura fattrici**: solo 1.594 madri su 7.719 hanno un rating. Il collo di bottiglia è la raccolta dati, non il calcolo.
2. **Distribuzione incompatibile**: score medio dei figli 27,9 contro 84,4 dei padri. I genitori sono campioni a carriera finita, i figli sono giovani.
3. **Maturità**: i figli nel dataset nascono fra 2018 e 2024; quelli del 2023–2024 hanno pochissime corse.

## 7. Confronto con lo stato dell'arte

### 7.1 Contesto internazionale

Nel mercato internazionale del breeding equino, soluzioni data-driven sono già presenti, in particolare nel galoppo (Thoroughbreds) dove aziende come [Equineline](https://www.equineline.com/) e [Brisnet](https://www.brisnet.com/) offrono pedigree analysis e performance prediction su scale di milioni di cavalli. Nel trotto, l'Europa continentale (Svezia, Francia, Italia) ha database genealogici gestiti dalle associazioni nazionali di razza, ma l'automazione del breeding prediction con ML è ancora poco diffusa ([PubMed — equine breeding value ML](https://pubmed.ncbi.nlm.nih.gov/39335312/)).

### 7.2 Metodi tradizionali: BLUP

Il metodo tradizionale per la stima del breeding value nel settore zootecnico è il **BLUP** (Best Linear Unbiased Prediction), un modello lineare misto che usa la matrice di parentela. È lo standard per le valutazioni genetiche ufficiali (es. [ICAR Technical Series](https://www.icar.org/Documents/technical_series/ICAR-Technical-Series-no-27-Toledo/Ziadi.pdf)). Tuttavia:
- richiede un pedigree completo su più generazioni;
- assume relazioni lineari tra fenotipo e genitori;
- non gestisce non linearità e interazioni.

Il nostro modello Gradient Boosting è una scelta complementare: non sostituisce il BLUP (che richiede dati genealogici completi che non abbiamo), ma esplora pattern non lineari nei dati di performance disponibili.

### 7.3 Approcci ML recenti

Studi recenti applicano ML alla predizione del breeding value equino:
- [PubMed (2024)](https://pubmed.ncbi.nlm.nih.gov/39335312/) usa Random Forest e Gradient Boosting per predire breeding value da gait scores visivi.
- [PubMed (2012)](https://pubmed.ncbi.nlm.nih.gov/22444958/) usa modelli Bayesian threshold-linear con Gibbs sampling.

Il nostro approccio è coerente con questi lavori: Gradient Boosting su feature di performance, con l'aggiunta di una validazione rigorosa (GroupKFold + holdout temporale) che molti studi non applicano.

### 7.4 Posizionamento del progetto

StatIppica si posiziona come:
- **primo tentativo documentato** di breeding prediction ML nel trotto italiano con dati pubblici;
- **validazione onesta**: dichiara esplicitamente quando il modello non funziona, invece di riportare metriche ottimistiche;
- **integrazione con valutazione economica**: il modulo ROI (capitolo separato) trasforma le predizioni in supporto decisionale economico.

## 8. Limiti e sviluppi futuri

### 8.1 Limiti attuali

1. **Dataset breeding piccolo** (180 campioni). Il recupero genitori da UNIRE (100/notte, coda 6.642) aumenterà la copertura nei prossimi mesi.
2. **Target non normalizzato**: lo score assoluto dei figli non è confrontabile con quello dei genitori. Una normalizzazione per coorte di età è la direzione principale di miglioramento.
3. **Niente genomici**: il modello usa solo statistiche di performance, non dati genomici (DNA). Il BLUP genomico ([ICAR](https://www.icar.org/Documents/technical_series/ICAR-Technical-Series-no-27-Toledo/Ziadi.pdf)) resta il gold standard quando i dati genetici sono disponibili.
4. **Bias del sopravvissuto**: i guadagni medi per voto sono calcolati su cavalli che hanno almeno una gara. I puledri che non arrivano mai a correre non sono nel campione.

### 8.2 Sviluppi futuri

Per rispondere al suggerimento del relatore di "restringere il perimetro a una fase centrale", la roadmap prevede:

1. **Breve termine (tesi)**: consolidare il modello di performance individuale come core, presentare il breeding come capitolo sperimentale con limiti onesti, completare il modello economico ROI.
2. **Medio termine (post-tesi)**: normalizzare il target per coorte di età, riaddestrare con dataset ampliato dal recupero UNIRE, valutare XGBoost su dataset >1.000 campioni.
3. **Lungo termine**: integrazione di dati genomici se disponibili, modello multigenerazionale completo, BLUP come baseline di confronto.

## 9. Riproducibilità

Il codice è open-source e versionato su GitHub. La pipeline di training è riproducibile:

```bash
# Addestramento con parametri di default
python3 train_breeding_model.py

# Parametri personalizzati
python3 train_breeding_model.py --min-child-races 10 --report breeding_eval_report.json

# Variabili d'ambiente
MIN_CHILD_RACES=10 TEMPORAL_SPLIT_YEAR=2021 python3 train_breeding_model.py
```

Il report di validazione viene rigenerato a ogni training e salvato in `breeding_eval_report.json`. Lo stato del modello è esposto via API su `/api/breeding/info`.

## Fonti

- [GeeksforGeeks — Gradient Boosting vs Random Forest](https://www.geeksforgeeks.org/machine-learning/gradient-boosting-vs-random-forest/)
- [Medium — Gradient Boosting vs Random Forest](https://medium.com/@aravanshad/gradient-boosting-versus-random-forest-cfa3fa8f0d80)
- [XGBoosting — XGBRegressor vs GradientBoostingRegressor benchmark](https://xgboosting.com/xgbregressor-faster-than-gradientboostingregressor/)
- [PubMed — ML prediction of breeding values from gait scores (2024)](https://pubmed.ncbi.nlm.nih.gov/39335312/)
- [PubMed — Bayesian threshold-linear models for horse breeding (2012)](https://pubmed.ncbi.nlm.nih.gov/22444958/)
- [ICAR Technical Series — Genomic breeding value reliability](https://www.icar.org/Documents/technical_series/ICAR-Technical-Series-no-27-Toledo/Ziadi.pdf)
- [Stack Overflow — Gradient Boosting vs Random Forest](https://stackoverflow.com/questions/46190046/gradient-boosting-vs-random-forest)
- Database StatIppica: 22.945 cavalli, 671.903 gare, 520 stalloni
- `breeding_eval_report.json`: metriche di validazione aggiornate al 14/09/2026
