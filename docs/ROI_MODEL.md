# Modello di Valutazione Economica (ROI) per decisioni di breeding

## Capitolo per la tesi: analisi del ritorno sull'investimento nelle scelte di allevamento del trotto italiano

---

## 1. Introduzione

Questo capitolo sviluppa il modello di valutazione economica che il relatore ha identificato come contributo manageriale distintivo della tesi. L'obiettivo è trasformare il sistema di rating di StatIppica da strumento puramente descrittivo a strumento di supporto decisionale economico per gli allevatori del settore ippico italiano.

Il modello risponde alla domanda: **dati i costi di allevamento e i ricavi attesi, quali accoppiamenti stallone × fattrice generano il miglior ritorno sull'investimento?**

## 2. Modello dei costi

I costi sono suddivisi in cinque fasi che coprono l'intero ciclo dall'accoppiamento alla prima gara del puledro (circa 4 anni).

### 2.1 Fonti dei dati

| Voce | Fonte | Anno |
|---|---|---|
| Stud fee | Catalogo ANACT stalloni trottatori | 2025 |
| Inseminazione, diagnosi gravidanza, assistenza parto | Listino CTS Moruzzo servizi riproduzione | 2026 |
| Boarding fattrice (box e prato) | Listino CTS Moruzzo | 2026 |
| Registrazione puledro | Tariffe UNIRE | 2026 |
| Addestramento e training | Listini scuderie italiane | 2024-2026 |
| Veterinario, maniscalco, assicurazione | Club Cavallo Italia, medie settore | 2025 |
| Tasso mortalità neonatale | Friesian Horse Italia (4-8%) | 2016 |

### 2.2 Struttura dei costi

| Fase | Durata | Costo (€) | Note |
|---|---|---|---|
| **1. Riproduzione** | 11 mesi | 6.010 | Inseminazione (€430), monitoraggio gravidanza (€80), assistenza parto (€400), boarding fattrice in box (€15/gg × 340gg) |
| **2. Puledro (anno 1)** | 6 mesi | 2.216 | Boarding fattrice+puledro al prato (€9/gg × 180gg), registrazione UNIRE (€96), veterinario (€500) |
| **3. Yearling** | 12 mesi | 6.575 | Boarding in box (€15/gg × 365gg), veterinario (€500), maniscalco (€600) |
| **4. Training** | 18 mesi | 16.050 | Addestramento (€350/mese × 18), boarding box (€15/gg × 540gg), veterinario+maniscalco |
| **5. Attività agonistica** | 4 anni | 5.900 | Iscrizioni gare (€500/anno × 4), assicurazione (€600/anno × 4), attrezzatura (€1.500) |
| **Costi fissi totali** | ~4 anni | **35.214** | Escluso stud fee |

### 2.3 Rischio di mortalità neonatale

Il 4-8% dei puledri non sopravvive alle prime settimane di vita ([Friesian Horse Italia](https://www.friesian.it/files/PRINCIPALI-PATOLOGIE-DEI-PULEDRI-APPENA-NATI2016.pdf)). In caso di morte, l'allevatore perde lo stud fee e i costi di riproduzione sostenuti fino al parto. Il modello incorpora questo rischio calcolando il costo atteso come:

\[
E[costo] = (1 - p_{morte}) \times costo_{completo} + p_{morte} \times costo_{parziale}
\]

con \(p_{morte} = 0.05\) (media del range 4-8%).

### 2.4 Costo atteso per livello di stud fee

| Stud fee (€) | Costo atteso (€) | Note |
|---|---|---|
| 0 | 35.214 | Solo costi fissi |
| 1.000 | 36.214 | Stalloni minori (Antony Leone, Violetto Jet) |
| 3.000 | 38.214 | Fascia media (Vitruvio, Axl Rose) |
| 5.000 | 40.214 | Fascia media-alta (El Ideal, Googoo Gaagaa) |
| 8.500 | 43.714 | Varenne |
| 11.500 | 46.714 | Maharajah, Readly Express |
| 15.000 | 50.214 | Fascia alta |
| 25.000 | 60.214 | Fascia altissima |
| 35.000 | 70.214 | Face Time Bourbon (top assoluto) |

## 3. Modello dei ricavi

### 3.1 Guadagni medi per voto (dati reali)

I guadagni medi di carriera per voto sono calcolati dal database StatIppica su 22.945 cavalli con rating di performance e carriera conclusa o in corso:

| Voto | N. cavalli | Guadagno medio (€) | Min (€) | Max (€) |
|---|---|---|---|---|
| SSS | 161 | 339.466 | 49.812 | 3.515.852 |
| SS | 640 | 143.311 | 31.622 | 1.421.959 |
| S | 801 | 67.620 | 21.150 | 246.967 |
| A | 2.404 | 37.755 | 5.474 | 145.596 |
| B | 2.397 | 20.535 | 1.742 | 60.839 |
| C | 3.183 | 10.228 | 306 | 27.321 |
| D | 2.325 | 4.013 | 129 | 11.543 |
| E | 2.116 | 990 | 95 | 4.403 |
| F | 291 | 214 | 30 | 459 |

### 3.2 Distribuzione di probabilità

Il modello usa due livelli di probabilità:

1. **Distribuzione di popolazione**: P(voto) calcolata su tutti i 22.945 cavalli. Usata come fallback quando lo stallone ha meno di 10 figli nel database.

2. **Distribuzione per stallone**: P(voto | stallone) calcolata sui figli osservati di uno specifico stallone. Più precisa ma richiede almeno 10 figli con rating.

### 3.3 Ricavo atteso

\[
E[ricavo] = \sum_{g \in \{SSS,...,F\}} P(g) \times \overline{earnings}(g)
\]

## 4. ROI

\[
ROI = \frac{E[ricavo] - E[costo]}{E[costo]}
\]

### 4.1 Risultati per stallone (top 30)

| Stallone | Voto | Stud fee (€) | Costo atteso (€) | Ricavo atteso (€) | ROI | P(recupero) |
|---|---|---|---|---|---|---|
| READY CASH | SSS | n/d | 35.214 | 85.935 | +144,0% | 59,3% |
| MUSCLE HILL | SSS | n/d | 35.214 | 81.557 | +131,6% | 50,0% |
| FILIPP ROC | SSS | n/d | 35.214 | 53.556 | +52,1% | 60,3% |
| TRIXTON | SS | 7.500 | 42.714 | 51.839 | +21,4% | 25,5% |
| BAR HOPPING | SS | n/d | 35.214 | 41.388 | +17,5% | 46,2% |
| CANTAB HALL | SS | n/d | 35.214 | 41.208 | +17,0% | 50,8% |
| MAJESTIC SON | S | n/d | 35.214 | 39.439 | +12,0% | 40,0% |
| READLY EXPRESS | SS | 11.500 | 46.714 | 51.836 | +11,0% | 18,1% |
| ANDOVER HALL | SS | n/d | 35.214 | 39.255 | +11,5% | 43,1% |
| GANYMEDE | SS | n/d | 35.214 | 35.913 | +2,0% | 39,5% |
| ROYAL DREAM | SS | 3.000 | 38.214 | 41.049 | +7,4% | 15,4% |
| FACE TIME BOURBON | SSS | 35.000 | 70.214 | 65.771 | -6,3% | 20,0% |
| VARENNE | SS | 8.500 | 43.714 | 34.530 | -21,0% | 16,9% |
| MAHARAJAH | SSS | 11.500 | 46.714 | 41.059 | -12,1% | 16,9% |
| BOLD EAGLE | SS | 8.000 | 43.214 | 35.515 | -17,8% | 15,4% |

**Nota**: gli stalloni con stud fee "n/d" non hanno il prezzo nel database ANACT; il ROI è calcolato a costo zero per la monta. Per READY CASH, MUSCLE HILL e FILIPP ROC il prezzo reale (sperma congelato, mercato internazionale) può superare €15.000-20.000.

### 4.2 Analisi di sensitività: Face Time Bourbon

Face Time Bourbon è lo stallone più costoso d'Italia (€35.000 di stud fee). Il ROI base è -6,3%, ma l'analisi di sensitività mostra che basta un aumento del 10% nella probabilità di figli top (SSS+SS+S) per portare il ROI in positivo:

| Scenario | ROI |
|---|---|
| Base | -6,3% |
| Top +10% | +0,5% |
| Top +20% | +7,4% |
| Top +30% | +14,2% |
| Top -10% | -13,2% |
| Top -20% | -20,0% |
| Top -30% | -26,9% |

Questo significa che la selezione della fattrice (che può aumentare la probabilità di un figlio top) è il fattore determinante per la redditività di un accoppiamento con uno stallone di fascia alta.

## 5. Limiti del modello

1. **Guadagni di carriera non scontati**: i costi sono sostenuti nei primi 4 anni, i ricavi arrivano nei 4-8 anni successivi. Un'analisi più rigorosa applicherebbe un tasso di sconto (es. WACC del settore agricolo, 5-7%).

2. **La fattrice non è nel modello**: la probabilità P(voto | stallone) è calcolata sui figli di tutti gli accoppiamenti dello stallone, non su un accoppiamento specifico. Il modello breeding predittivo (attualmente `experimental`) potrebbe migliorare questo aspetto in futuro, quando la copertura dei rating delle fattrici sarà aumentata.

3. **Costi semplificati**: i costi sono medie nazionali. Un allevatore con strutture proprie avrà costi inferiori; uno che affida tutto a scuderie esterne avrà costi superiori.

4. **Ricavi non completi**: il modello considera solo i guadagni da premi di gara. Non include:
   - Valore del puledro come riproduttore (se maschio di successo)
   - Valore della fattrice come madre (se femmina di successo)
   - Plusvalenza da vendita del puledro prima della gara
   - Premi di allevamento (premi UNIRE per allevatori)

5. **Bias del sopravvissuto**: i guadagni medi per voto sono calcolati su cavalli con almeno una gara. I puledri che non arrivano mai a correre (infortuni, mancanza di talento) non sono nel campione, sovrastimando il ricavo atteso.

## 6. Conclusioni manageriali

1. **L'allevamento del trotto è un'attività a rischio**: con stud fee sopra €5.000, il ROI atteso è negativo per la maggior parte degli stalloni. La redditività dipende quasi interamente dalla probabilità di ottenere un figlio di fascia alta (SSS/SS/S).

2. **Il valore della fattrice è cruciale**: l'analisi di sensitività mostra che un aumento del 10% nella probabilità di un figlio top può trasformare un ROI negativo in positivo. La selezione accurata della fattrice (con rating elevato e genealogia solida) è il leva manageriale più importante.

3. **Economia di scala**: gli allevatori con strutture proprie (che eliminano i costi di boarding) hanno un vantaggio competitivo strutturale. Il costo fisso di €35.214 si riduce a circa €20.000-25.000 senza i costi di boarding.

4. **Diversificazione del rischio**: dato il 5% di mortalità neonatale e la bassa probabilità di ottenere un figlio top (10-15% per SSS+SS+S), un allevatore dovrebbe considerare almeno 3-5 accoppiamenti all'anno per diluire il rischio su un singolo puledro.

## 7. Implementazione tecnica

Il modulo `roi_model.py` è integrato nel progetto StatIppica e utilizza i dati reali dal database. Può essere invocato via CLI:

```bash
# ROI per uno stallone specifico
python roi_model.py --sire "FACE TIME BOURBON" --sensitivity

# ROI per tutti gli stalloni
python roi_model.py --list

# ROI con stud fee personalizzato
python roi_model.py --sire "VARENNE" --stud-fee 10000
```

## Fonti dati

- [CTS Moruzzo - Listino prezzi servizi riproduzione 2026](https://en.ctsmoruzzo.it/contenuti/allegati/servizi-per-la-riproduzione-listino-prezzi-2026.pdf)
- [ANACT - Catalogo stalloni trottatori 2025](https://www.anact.it/wp-content/uploads/2025/02/ilTrottatore_SpecialeStalloni_25.pdf)
- [Italian Gaming News - Regole iscrizione puledri 2026](https://italiangamingnews.it/2026/02/17/puledri-trottatori-tutte-le-nuove-regole-su-iscrizioni-scadenze-e-costi-per-gli-allevatori/)
- [Club Cavallo Italia - Costi gestione cavallo](https://www.clubcavalloitalia.it/quanto-costa-mantenere-un-cavallo/)
- [Friesian Horse Italia - Patologie neonatali](https://www.friesian.it/files/PRINCIPALI-PATOLOGIE-DEI-PULEDRI-APPENA-NATI2016.pdf)
- [Trot Stallions Directory - Catalogo stalloni](https://www.trotstallionsdirectory.com/catalogo)
- Database StatIppica: 22.945 cavalli, 671.903 gare, 520 stalloni
