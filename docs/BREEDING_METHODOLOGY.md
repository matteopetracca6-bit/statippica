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

## 7. Copertura dei genitori (fase `parents_coverage`)

Il limite principale del dataset non è il calcolo del rating, ma la **raccolta dati**:
delle 7.719 fattrici citate nel campo `dam`, solo 1.911 hanno una riga in `horses`
e 1.594 un rating `performance`; 5.808 non sono mai state raccolte. Lato stalloni,
solo 71 su 571 hanno un rating da carriera. Nessuna madre "raccolta ma non valutata"
esiste (0 casi con corse e senza rating): il collo di bottiglia è a monte.

`nightly_update.py` include quindi la **FASE 2c — `phase_parents_coverage`**:

- seleziona i genitori citati come `sire`/`dam` ma assenti da `horses` (o senza carriera),
  ordinati per numero di figli nel DB, con **metà quota riservata alle fattrici**
  (gli stalloni hanno centinaia di figli e altrimenti monopolizzerebbero ogni batch);
- ne scarica profilo e carriera completa da `cavAn.php`, a batch
  (`PARENT_COVERAGE_BATCH_SIZE`, default 150 per esecuzione) con pausa tra le richieste;
- usa `PARENT_MIN_RACE_DATE` (default 2000-01-01) invece di `MIN_RACE_DATE` (2012):
  i genitori hanno corso prima del 2012 e col filtro standard risulterebbero senza carriera;
- marca `parent_fetch_at` a ogni tentativo, così un genitore introvabile non viene
  richiesto a ogni esecuzione successiva (idempotenza e coda che avanza sempre).

### Perché i voti già pubblicati non cambiano

I soggetti recuperati sono marcati `source_role='parent_backfill'`. In `phase_ratings`
essi **ricevono** un punteggio calcolato contro il pool storico, ma **non entrano**
nei pool di percentile (guadagni, tempo, gruppo per stallone). Senza questa
separazione, aggiungere migliaia di cavalli anziani e selezionati sposterebbe il voto
di ogni cavallo già mostrato nel sito.

Verifica eseguita su copia del database: dopo l'inserimento di 500 soggetti
`parent_backfill` con carriere molto ricche (caso peggiore), i rating dei 16.015
cavalli esistenti risultano **invariati (0 differenze)** e i 500 nuovi ricevono
regolarmente il proprio rating.

Il modello breeding va riaddestrato dopo alcune esecuzioni notturne: l'aumento di
copertura amplia il dataset degli accoppiamenti utilizzabili (oggi 180 dopo il filtro
≥10 corse) ed è la condizione necessaria — non sufficiente — perché la validazione
possa passare da `experimental` a uno stato più solido.

### 7.1 Verifica sul campo: Trottoweb non copre le fattrici (15/09/2026)

La fase è stata implementata e testata contro la fonte reale, e il risultato è negativo:

- `cavAn.php` dichiara esplicitamente il proprio perimetro: *"indigeni ed esteri da 2 a 14 anni
  (10 per le femmine) presenti nel nostro database"*. Per un nome fuori perimetro risponde
  "Nome sconosciuto", con HTTP 200 — quindi il fallimento è silenzioso.
- Test su 40 fattrici reali (le più citate, comprese quelle con iniziale di annata recente):
  **0 trovate su 40**. Anche `VARENNE`, come stallone a carriera conclusa, non è recuperabile.
- La stessa limitazione spiega perché `fill_pedigree.py` completa i genitori "via fallback
  Trottoweb" senza recuperare dati reali, e perché ANACT (`13.39.149.176:3000`) risulta
  irraggiungibile sia dalla sandbox sia da GitHub Actions (log: *"3 fallimenti consecutivi →
  disattivo ANACT"*).

Conseguenze operative:

- `PARENT_COVERAGE_BATCH_SIZE` ha **default 0**: la fase resta nel codice, testata e pronta,
  ma non gira, per non scaricare 150 pagine a vuoto ogni notte.
- La fase registra ora la **resa** (genitori trovati / processati) e avvisa nei log se scende
  sotto il 5%: se la fonte cambia perimetro, ce ne accorgiamo dai log invece che per caso.
- `parent_fetch_at` rende comunque la coda avanzante e idempotente.

**Il vincolo non era quindi di modellazione ma di accesso ai dati.** È stato risolto: vedi 7.2.

### 7.2 Fonte risolutiva: banca dati UNIRE (15/09/2026)

Modulo: `unire_source.py`. Fonte: `https://www.unire.it/index.php/ita/trotto/list` — banca dati
ufficiale del trotto italiano, anni di nascita **dal 1900 al 2026**, quindi include i riproduttori
a carriera conclusa che Trottoweb esclude per costruzione.

Per ogni cavallo la scheda espone anagrafica (sesso, anno, paese, allevatore), genealogia su più
generazioni e i **totali di carriera**: corse, vittorie, piazzamenti, record al km, vincite —
esattamente gli input del rating performance.

**Come si raggiunge una fattrice.** La ricerca richiede obbligatoriamente *nome + sesso + anno*
(con il solo nome risponde "Ho trovato 0 cavalli"), e l'anno di nascita di una madre non lo
conosciamo. Si parte allora da un **figlio**, di cui sappiamo tutto, e si segue il link
`list?id_cav=<id>` della fattrice presente nella riga dei risultati. Una sola ricerca sblocca la
madre per tutti i suoi figli. Il nome trovato viene confrontato con quello nel DB prima di
scrivere, perché la ricerca è "contiene" e restituisce anche omonimi parziali.

**Resa misurata** su genitori reali del nostro DB: **9 su 10 recuperati** (7 con carriera
effettiva, gli altri mai corsi), contro 0 su 40 di Trottoweb. Bonus: si popolano anche
`sire`/`dam` del genitore stesso, cioè i nonni.

**Accorgimenti di produzione:**

- `PARENT_COVERAGE_BATCH_SIZE` ora ha default **100** (attivo in `nightly-maintenance.yml`):
  2 richieste per genitore con 1 secondo di pausa ≈ 4 minuti su un job che dura ~23 minuti.
- I soggetti sono marcati `source_role='parent_backfill'` e `backfill_status='done'`: restano
  fuori dai pool di percentile (i voti già pubblicati non cambiano — verificato: 0 variazioni su
  23.016 rating esistenti) e fuori da `phase_backfill_gaps`, che altrimenti li cercherebbe su
  Trottoweb e, non trovandoli, **azzererebbe i loro totali di carriera** ricalcolandoli dalla
  tabella `races` (per loro vuota, perché UNIRE fornisce gli aggregati e non le singole corse).
- `UnireUnavailable` distingue "fonte giù" da "cavallo assente": in caso di disservizio la fase
  si interrompe **senza** marcare `parent_fetch_at`, così un 502 temporaneo non brucia
  definitivamente centinaia di genitori dalla coda. 3 tentativi con backoff progressivo.
- La resa resta loggata ogni notte, con avviso sotto il 20%.
- Limite noto: la fonte dichiara "dati aggiornati al 17-04-2024". Adeguato per carriere concluse,
  non per la forma recente, che continua ad arrivare da Trottoweb.

Coda attuale: **6.642 genitori** da recuperare → a 100 per notte, copertura completa in circa
**due mesi**, con i riproduttori più citati (più figli nel DB) serviti per primi.

## 8. Sistema di voto (grading)

I voti (SSS, SS, S, A, B, C, D, E, F) sono assegnati **dinamicamente** in base ai
percentili della distribuzione degli score, non con soglie fisse. Questo vale sia
per i cavalli in corsa (rating `performance`) sia per gli stalloni.

| Voto | Percentile | Significato |
|---|---|---|
| SSS | top 1% | Eccellenza assoluta |
| SS | top 5% | Eccellenza |
| S | top 10% | Molto buono |
| A | top 25% | Buono |
| B | top 40% | Sopra la media |
| C | top 60% | Nella media |
| D | top 75% | Sotto la media |
| E | top 80% | Debole |
| F | bottom 20% | Scarso |

Le soglie sono calcolate da `build_horse_grade_thresholds()` e
`build_stallion_grade_thresholds()` in `nightly_update.py`, sul pool di riferimento
(popolazione corsa storica, esclusi i genitori recuperati). I genitori recuperati
ricevono un voto calcolato contro questo pool ma non ne modificano i percentili,
quindi l'aggiunta di copertura non sposta i confini dei voti già pubblicati.

Lo stesso sistema di soglie è salvato in `breeding_model.json` (`grade_thresholds`),
calcolato da `compute_grade_thresholds()` in `train_breeding_model.py`, per
mappare lo score predetto del puledro al voto corrispondente lato server.
