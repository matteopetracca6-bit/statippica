# Capitolo 4 — Valutazione economica e ROI delle decisioni di breeding

## 4.1 Introduzione

L'industria del trotto italiano si basa su decisioni di allevamento ancora largamente empiriche: la scelta dello stallone, della fattrice e la strategia di accoppiamento dipendono da conoscenze tramandate, intuizione degli allevatori e valutazioni qualitative. Questo capitolo costruisce un modello economico quantitativo che risponde a una domanda concreta: **vale la pena pagare il tasso di monta di un determinato stallone?**

Il modello integra dati reali da tre fonti: il database StatIppica (22.940 cavalli, 671.711 gare, guadagni di carriera per ciascun cavallo), i tassi di monta pubblici per la stagione 2026 (126 stalloni, da €500 a €35.000) e i costi di allevamento da listini di settore italiani. Il risultato è uno strumento di supporto decisionale che calcola il ritorno sull'investimento atteso (ROI) per ciascun accoppiamento, con intervalli di confidenza e analisi di sensitività.

## 4.2 Modello dei costi

Il costo totale di un ciclo di allevamento — dalla monta alla prima gara — è composto da cinque fasi, ciascuna con voci di costo documentate da fonti pubbliche.

### 4.2.1 Riproduzione e gestazione

| Voce | Valore | Fonte |
|---|---|---|
| Inseminazione artificiale (seme fresco/refrigerato) + diagnosi gravidanza | €430 | [CTS Moruzzo](https://www.ctsmoruzzo.it), listino servizi 2026, servizio 6 |
| Monitoraggio gravidanza (conferma oltre 60gg + monitoraggio rischio) | €80 | CTS Moruzzo, servizi 9+11 |
| Assistenza al parto + analisi isoeritrolisi | €400 | CTS Moruzzo, servizio 12 |
| Boarding fattrice in box (340 giorni di gestazione × €15/giorno) | €5.100 | CTS Moruzzo, servizio 1 |
| **Totale riproduzione** | **€6.010** | |

### 4.2.2 Puledro (primo anno)

| Voce | Valore | Fonte |
|---|---|---|
| Boarding fattrice+puledro al prato (180 giorni × €9/giorno) | €1.620 | CTS Moruzzo, servizio 4 |
| Registrazione nascita puledro | €96 | [UNIRE](https://www.unire.gov.it), tariffa 2026 |
| Veterinario (vaccinazioni, sverminazione) | €500 | Media settore |
| **Totale primo anno** | **€2.216** | |

### 4.2.3 Yearling (12 mesi in box)

| Voce | Valore | Fonte |
|---|---|---|
| Boarding in box (365 giorni × €15/giorno) | €5.475 | CTS Moruzzo, servizio 1 |
| Veterinario annuale | €500 | Media settore |
| Maniscalco annuale | €600 | [Club Cavallo Italia](https://www.clubcavalloitalia.it) |
| **Totale yearling** | **€6.575** | |

### 4.2.4 Training (18 mesi)

| Voce | Valore | Fonte |
|---|---|---|
| Addestramento/doma (18 mesi × €350/mese) | €6.300 | Listini scuderie italiane |
| Boarding durante training (540 giorni × €15/giorno) | €8.100 | CTS Moruzzo, servizio 1 |
| Veterinario (1,5 anni) | €750 | Media settore |
| Maniscalco (1,5 anni) | €900 | Media settore |
| **Totale training** | **€16.050** | |

### 4.2.5 Attività agonistica (4 anni)

| Voce | Valore | Fonte |
|---|---|---|
| Iscrizioni gare (4 anni × €500/anno) | €2.000 | Media settore |
| Assicurazione (4 anni × €600/anno) | €2.400 | Media settore |
| Attrezzatura (una tantum) | €1.500 | Media settore |
| **Totale agonistico** | **€5.900** | |

### 4.2.6 Costo fisso totale e rischio mortalità

Il costo fisso totale (escluso stud fee) ammonta a **€35.214**. A questo si aggiunge il rischio di mortalità neonatale: con un tasso del 5% ([Friesian Horse Italia](https://fivmagazine.it)), in caso di morte del puledro si perdono lo stud fee e i costi di riproduzione (€14.510 per Varenne). Il costo atteso, ponderato per il rischio, è:

\[ C_{atteso} = (1 - p_{morte}) \cdot C_{totale} + p_{morte} \cdot C_{se\ morte} \]

### 4.2.7 Breakdown visivo

![Breakdown costi allevamento](docs/roi_charts/05_cost_breakdown.png)

*Figura 4.1 — Breakdown dei costi di allevamento per un accoppiamento con Varenne (stud fee €8.500). Il costo totale atteso è €43.714. Fonti: CTS Moruzzo 2026, UNIRE 2026, listini di settore.*

## 4.3 Modello dei ricavi

### 4.3.1 Guadagni medi per voto di performance

Il database StatIppica contiene i guadagni di carriera reali per 16.585 cavalli con rating di performance. La distribuzione per voto è:

![Guadagni per voto](docs/roi_charts/01_grade_earnings.png)

*Figura 4.2 — Guadagno medio di carriera per voto di performance. I cavalli di grado SSS guadagnano in media €378.645, quelli di grado F €166. Fonte: database StatIppica (16.585 cavalli).*

| Voto | N. cavalli | Guadagno medio | Minimo | Massimo |
|---|---|---|---|---|
| SSS | 195 | €378.645 | €50.558 | €3.437.556 |
| SS | 700 | €149.022 | €26.100 | €1.068.246 |
| S | 841 | €65.753 | €21.150 | €361.547 |
| A | 2.497 | €35.647 | €6.647 | €126.619 |
| B | 2.479 | €19.888 | €2.669 | €1.679.676 |
| C | 3.259 | €9.091 | €306 | €28.787 |
| D | 2.393 | €3.285 | €129 | €9.234 |
| E | 2.016 | €699 | €58 | €3.483 |
| F | 137 | €166 | €30 | €306 |

### 4.3.2 Probabilità di ottenere ciascun voto

Per ciascuno stallone, la probabilità che un figlio ottenga un determinato voto è stimata dalla distribuzione empirica dei figli già nati e valutati nel database. Se lo stallone ha almeno 10 figli valutati, si usa la sua distribuzione specifica; altrimenti si ricorre alla distribuzione della popolazione generale.

### 4.3.3 Ricavo atteso

Il ricavo atteso per un accoppiamento è:

\[ R_{atteso} = \sum_{g \in \{SSS,...,F\}} P(g | stallone) \cdot \bar{E}(g) \]

dove \(P(g | stallone)\) è la probabilità che il figlio ottenga il voto \(g\) dato lo stallone, e \(\bar{E}(g)\) è il guadagno medio di carriera per il voto \(g\).

## 4.4 Calcolo del ROI

Il ROI è definito come:

\[ ROI = \frac{R_{atteso} - C_{atteso}}{C_{atteso}} \]

### 4.4.1 ROI a livello di popolazione

A livello di popolazione generale (senza considerare lo stallone specifico), il ricavo atteso è €24.825 e il costo atteso (senza stud fee) è €35.214. Il ROI è quindi **-29,5%** anche con stud fee zero, e peggiora con l'aumentare del costo della monta.

![ROI per stud fee](docs/roi_charts/02_roi_by_studfee.png)

*Figura 4.3 — ROI atteso per livello di stud fee (modello popolazione). Il ROI è negativo a tutti i livelli di stud fee. Fonte: database StatIppica + listini costi 2026.*

Questo risultato indica che **l'allevamento di trotto in Italia è strutturalmente in perdita come valore atteso**: i costi fissi di allevamento superano i guadagni medi di carriera. La redditività dipende interamente dalla capacità di selezionare stalloni le cui progenie hanno performance sopra la media.

### 4.4.2 ROI per stallone

Su 100 stalloni con stud fee disponibile, solo **5 hanno ROI positivo**:

| Stallone | Voto | Stud Fee | ROI | P(recupero costi) |
|---|---|---|---|---|
| Raja Mirchi | SS | €4.500 | +48,3% | 33,3% |
| Village Mystic | S | €3.000 | +20,1% | 16,7% |
| Readly Express | SS | €11.500 | +9,1% | 15,7% |
| Royal Dream | S | €3.000 | +6,9% | 15,4% |
| Donato Hanover | S | €5.000 | +6,0% | 18,7% |

I 95 stalloni restanti hanno ROI negativo. I casi più notevoli:

- **Face Time Bourbon** (€35.000): ROI -1,4% — essenzialmente in pareggio, ma con elevato rischio
- **Varenne** (€8.500): ROI -16,2% — il costo della monta non è recuperato dai guadagni medi dei figli
- **Bold Eagle** (€8.000): ROI -20,4%

![Top 15 stalloni per ROI](docs/roi_charts/03_top15_roi.png)

*Figura 4.4 — Top 15 stalloni per ROI atteso. Solo 5 su 100 hanno ROI positivo. Fonte: database StatIppica + Trot Stallions Directory 2026.*

### 4.4.3 Scatter plot: stud fee vs ROI

![Scatter fee vs ROI](docs/roi_charts/07_fee_vs_roi_scatter.png)

*Figura 4.5 — Stud fee vs ROI atteso per 100 stalloni. Il colore indica il voto di performance dello stallone. Non c'è correlazione tra costo della monta e redditività: stalloni costosi non garantiscono ROI positivi. Fonte: database StatIppica + ANACT 2025 + Trot Stallions Directory 2026.*

## 4.5 Analisi di sensitività

L'analisi di sensitività valuta come cambia il ROI se la probabilità di ottenere figli top-grade (voti SSS, SS, S) varia del ±10%, ±20%, ±30% rispetto al baseline.

![Sensitivity Varenne](docs/roi_charts/06_sensitivity_varenne.png)

*Figura 4.6 — Analisi di sensitività per Varenne (€8.500). Anche con un aumento del 30% della probabilità di figli top-grade, il ROI resta leggermente negativo (-1,0%).*

Per Varenne, il ROI passa da -16,2% (base) a -1,0% con un +30% di probabilità di figli top-grade. Il break-even richiederebbe un incremento del 35-40% rispetto alla distribuzione osservata — un scenario improbabile senza cambiamenti nelle pratiche di selezione.

## 4.6 Simulazione Monte Carlo

L'analisi del valore atteso nasconde un aspetto cruciale: la distribuzione dei risultati è fortemente asimmetrica. La maggior parte dei cavalli perde denaro, ma una piccola percentuale genera guadagni eccezionali.

La simulazione Monte Carlo (10.000 iterazioni) per un accoppiamento con Varenne produce questa distribuzione:

![Monte Carlo Varenne](docs/roi_charts/04_montecarlo_varenne.png)

*Figura 4.7 — Distribuzione dei risultati economici per 10.000 cicli di allevamento simulati con Varenne (stud fee €8.500). La mediana è negativa (-€27.376), ma la media è meno negativa grazie agli outcome positivi rari.*

| Statistica | Valore |
|---|---|
| Mediana dell'utile | -€27.376 |
| P(utile > 0) | 19,8% |
| Perdita massima | -€43.714 |
| Guadagno massimo | +€3.393.842 |

Il 19,8% delle simulazioni produce un utile positivo — circa 1 cavallo su 5 ripaga l'investimento. Ma la mediana è fortemente negativa: il risultato tipico è una perdita di circa €27.000.

### 4.6.1 Bootstrap: intervalli di confidenza sul ROI

Per i top 10 stalloni, il ROI è stato calcolato con bootstrap (1.000 ricampionamenti dei guadagni per grado):

| Stallone | ROI | IC 95% bootstrap | P(ROI > 0) |
|---|---|---|---|
| Raja Mirchi | +48,3% | [+41,7%, +55,2%] | 100,0% |
| Village Mystic | +20,1% | [+14,1%, +27,5%] | 100,0% |
| Readly Express | +9,1% | [+0,4%, +18,5%] | 97,9% |
| Royal Dream | +6,9% | [+1,0%, +12,9%] | 99,5% |
| Donato Hanover | +6,0% | [+1,3%, +11,8%] | 99,5% |
| Face Time Bourbon | -1,4% | [-9,5%, +6,7%] | 35,0% |
| Father Patrick | -13,3% | [-19,3%, -6,3%] | 0,0% |
| Maharajah | -13,7% | [-17,4%, -9,6%] | 0,0% |
| Varenne | -16,2% | [-19,2%, -13,0%] | 0,0% |
| Bold Eagle | -20,4% | [-23,8%, -16,6%] | 0,0% |

Raja Mirchi è l'unico stallone il cui ROI è statisticamente significativo con elevata confidenza (IC 95% interamente positivo). Readly Express e Face Time Bourbon hanno intervalli che includono lo zero, indicando incertezza sulla redditività.

## 4.7 Analisi di break-even

Per ciascuno stallone è stato calcolato lo stud fee massimo che renderebbe il ROI nullo:

| Stallone | Stud fee attuale | Break-even fee | Margine |
|---|---|---|---|
| Raja Mirchi | €4.500 | €23.673 | +€19.173 |
| Village Mystic | €3.000 | €10.696 | +€7.696 |
| Readly Express | €11.500 | €15.750 | +€4.250 |
| Royal Dream | €3.000 | €5.633 | +€2.633 |
| Donato Hanover | €5.000 | €7.420 | +€2.420 |
| Face Time Bourbon | €35.000 | €34.009 | -€991 |
| Varenne | €8.500 | €1.413 | -€7.087 |

Solo 5 stalloni hanno uno stud fee inferiore al break-even. Per Varenne, il break-even è €1.413 contro un costo attuale di €8.500: il prezzo della monta è 6 volte superiore al valore che i dati attribuiscono alla progenie.

## 4.8 Discussione

### 4.8.1 L'allevamento come lotteria

I risultati mostrano che l'allevamento di trotto è economicamente paragonabile a una lotteria: il valore atteso è negativo per il 95% degli stalloni, ma circa 1 figlio su 5 (19,8% per Varenne) genera un ritorno positivo. La redditività dipende non dalla frequenza delle vincite, ma dall'entità delle vincite rare — i cavalli di grado SSS che guadagnano €378.645 in media.

Questo risultato ha implicazioni pratiche importanti:
- **Diversificazione**: un allevatore dovrebbe considerare multiple monte per distribuire il rischio, non investire tutto in una singola fattrice.
- **Selezione dello stallone**: lo stud fee non è un indicatore di redditività. Raja Mirchi (€4.500) ha un ROI 50 volte superiore a Face Time Bourbon (€35.000).
- **Soglia di investimento**: con costi fissi di €35.214, solo stalloni con progenie sistematicamente sopra la media possono generare ROI positivo.

### 4.8.2 Limiti del modello

1. **Guadagni di carriera incompleti**: i guadagni nel database riflettono le corse fino alla data di raccolta. I cavalli giovani non hanno ancora completato la carriera, quindi i guadagni medi per grado sono sottostimati per le coorti recenti.
2. **Valore di riproduzione non incluso**: un figlio che diventa stallone o fattrice genera ricavi aggiuntivi tramite il valore riproduttivo. Questo modello considera solo i guadagni di corsa, sottostimando il ROI per le progenie di qualità superiore.
3. **Costi medi, non specifici**: i costi di allevamento variano significativamente tra regioni e strutture. I valori usati sono medie nazionali.
4. **Modello probabilistico per stallone**: la distribuzione dei voti dei figli è basata su campioni storici. Per stalloni con pochi figli valutati, si ricorre alla distribuzione di popolazione, che può non riflettere la qualità genetica specifica.
5. **Assenza della componente materna**: il modello non distingue l'apporto della fattrice. Due figli dello stesso stallone da fattrici diverse possono avere esiti molto diversi.

### 4.8.3 Estensioni future

- **Modello gerarchico bayesiano**: per stalloni con pochi figli, combinare la distribuzione specifica con quella di popolazione usando un prior informativo.
- **Valore riproduttivo**: integrare il valore di mercato di un puledro che diventa riproduttore, usando i tassi di monta dei figli stalloni.
- **Dati ANACT/UNIRE**: integrare le performance delle fattrici per modellare l'interazione genetica stallone × fattrice.

## 4.9 Conclusioni

Il modello economico costruito in questo capitolo trasforma il problema del breeding da una valutazione qualitativa a una decisione quantitativa. Le tre conclusioni principali sono:

1. **L'allevamento di trotto in Italia è strutturalmente in perdita come valore atteso** (-29,5% a livello di popolazione), e la redditività dipende interamente dalla selezione dello stallone.

2. **Solo 5 stalloni su 100 generano ROI positivo**, e nessuno di questi ha uno stud fee superiore a €11.500. Il costo della monta non è correlato alla redditività.

3. **La distribuzione dei risultati è fortemente asimmetrica**: la mediana è negativa anche per i migliori stalloni, ma circa 1 figlio su 5 produce un ritorno positivo. L'allevamento è un'attività ad alto rischio che richiede diversificazione.

Questi risultati forniscono una base quantitativa per le decisioni di breeding nel trotto italiano e rappresentano il contributo manageriale distintivo di questa tesi: uno strumento di supporto decisionale economico per un settore che ne è sprovvisto.

---

### Fonti dati

| Fonte | Dato | URL |
|---|---|---|
| Database StatIppica | Guadagni di carriera per 16.585 cavalli | Dati interni |
| Trot Stallions Directory | 126 tassi di monta stagione 2026 | https://www.trotstallionsdirectory.com/t-en/catalogo |
| ANACT Speciale Stalloni | Tassi di monta stalloni italiani | https://www.anact.it/wp-content/uploads/2025/02/ilTrottatore_SpecialeStalloni_25.pdf |
| CTS Moruzzo | Listino servizi riproduzione 2026 | https://www.ctsmoruzzo.it |
| UNIRE | Tariffe iscrizione puledri 2026 | https://www.unire.gov.it |
| ISMEA | Prezzi medi nazionali equini | https://www.ismea.it |
| Friesian Horse Italia | Tasso mortalità neonatale | https://fivmagazine.it |
| Gioconews | Montepremi trotto 2024 | https://www.gioconews.it/news/ippica/trotto-italiano-tutti-i-numeri-del-2024.aspx |
| Millionaire | Costi gestione cavallo | https://millionaire.it/article/corri-cavallo-corri-ti-prego |
| Quantocosta.info | Costi mantenimento 2026 | https://quantocosta.info/animali/mantenimento-cavallo-mensile-costo-alimentazione-2026 |
