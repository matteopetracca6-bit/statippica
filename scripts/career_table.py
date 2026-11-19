"""Quanto puo' ancora guadagnare un cavallo, dato il suo voto e la sua eta'.

Il metodo e' quello delle tavole di sopravvivenza usate in demografia,
applicato alla carriera agonistica invece che alla vita:

  1. per ogni voto e ogni eta' si misura la probabilita' di correre ancora
     l'anno dopo, avendo corso quest'anno (il cavallo si "ritira");
  2. per ogni voto e ogni eta' si misura quanto incassa tipicamente chi
     corre a quell'eta';
  3. il guadagno residuo e' la somma, sugli anni futuri, del guadagno di
     quell'anno moltiplicato per la probabilita' di arrivarci ancora in
     attivita'.

Si usano solo osservazioni COMPLETE: l'eta' di un cavallo entra nei conti
solo se l'anno corrispondente e' gia' finito (2026 e' in corso, quindi
escluso). Senza questo accorgimento i cavalli giovani sembrerebbero
smettere di correre, quando in realta' e' l'archivio che si ferma.
"""
import json, collections, math

ANNO_ULTIMO_COMPLETO = 2025
ETA_MAX = 12
MIN_CELLA = 25          # sotto questa numerosita' si usa il dato di tutti i voti

d = json.load(open('/tmp/carriera.json'))
voti = {k: tuple(v) for k, v in d["voti"].items()}
premi = {}
for k, v in d["per_eta"].items():
    n, e = k.rsplit("|", 1); premi[(n, int(e))] = v
gare = {}
for k, v in d["gare_eta"].items():
    n, e = k.rsplit("|", 1); gare[(n, int(e))] = v

def fascia(score):
    """Raggruppa i voti in fasce: le celle per singolo voto sarebbero vuote."""
    if score >= 70: return "70+"
    if score >= 60: return "60-70"
    if score >= 50: return "50-60"
    if score >= 40: return "40-50"
    if score >= 30: return "30-40"
    return "<30"

FASCE = ["<30", "30-40", "40-50", "50-60", "60-70", "70+"]

# ── conteggi ────────────────────────────────────────────────────────
# attivi[(f,e)]   quanti cavalli di fascia f hanno corso a eta' e
# osserv[(f,e)]   quanti cavalli di fascia f hanno l'eta' e osservabile
# segue[(f,e)]    fra gli attivi a e-1, quanti sono attivi anche a e
attivi = collections.Counter()
osserv = collections.Counter()
base_segue = collections.Counter()
segue = collections.Counter()
somma_premi = collections.defaultdict(list)

for nome, (by, sc, grado) in voti.items():
    f = fascia(sc)
    for e in range(2, ETA_MAX + 1):
        if by + e > ANNO_ULTIMO_COMPLETO:
            break                       # anno non ancora concluso: si ferma
        osserv[(f, e)] += 1
        g = gare.get((nome, e), 0)
        if g > 0:
            attivi[(f, e)] += 1
            somma_premi[(f, e)].append(premi.get((nome, e), 0.0))
        # transizione e-1 -> e
        if gare.get((nome, e - 1), 0) > 0:
            base_segue[(f, e)] += 1
            if g > 0:
                segue[(f, e)] += 1

def mediana(v):
    if not v: return 0.0
    v = sorted(v); n = len(v)
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2

def quantile(v, q):
    if not v: return 0.0
    v = sorted(v); i = min(len(v) - 1, max(0, int(round(q * (len(v) - 1)))))
    return v[i]

# aggregati su TUTTE le fasce, usati quando una cella e' troppo piccola
tot_segue = collections.Counter(); tot_base = collections.Counter()
tot_premi = collections.defaultdict(list)
for (f, e), v in segue.items(): tot_segue[e] += v
for (f, e), v in base_segue.items(): tot_base[e] += v
for (f, e), v in somma_premi.items(): tot_premi[e].extend(v)

tavola = {}
for f in FASCE:
    righe = []
    for e in range(2, ETA_MAX + 1):
        nb = base_segue[(f, e)]
        if nb >= MIN_CELLA:
            p = segue[(f, e)] / nb
            fonte_p = "fascia"
        elif tot_base[e] >= MIN_CELLA:
            p = tot_segue[e] / tot_base[e]
            fonte_p = "tutte le fasce"
        else:
            p = 0.0; fonte_p = "dato assente"
        prem = somma_premi[(f, e)]
        if len(prem) >= MIN_CELLA:
            fonte_g = "fascia"
        else:
            prem = tot_premi[e]; fonte_g = "tutte le fasce"
        righe.append({
            "eta": e,
            "prob_corre_ancora": round(p, 4),
            "n_base": nb,
            "fonte_probabilita": fonte_p,
            "guadagno_mediano": round(mediana(prem), 0),
            "guadagno_medio": round(sum(prem) / len(prem), 0) if prem else 0.0,
            "guadagno_p25": round(quantile(prem, 0.25), 0),
            "guadagno_p75": round(quantile(prem, 0.75), 0),
            "n_attivi": len(somma_premi[(f, e)]),
            "fonte_guadagno": fonte_g,
        })
    tavola[f] = righe

json.dump({"fasce": FASCE, "tavola": tavola,
           "anno_ultimo_completo": ANNO_ULTIMO_COMPLETO,
           "eta_max": ETA_MAX, "min_cella": MIN_CELLA},
          open('/tmp/tavola.json','w'), indent=1)

# stampa di controllo
for f in FASCE:
    r = tavola[f]
    print(f"\n--- fascia {f}")
    for x in r[:8]:
        print(f"  eta {x['eta']:2d}  corre ancora {x['prob_corre_ancora']:.2f} "
              f"(n={x['n_base']:5d})  mediana EUR{x['guadagno_mediano']:>8.0f}  "
              f"attivi={x['n_attivi']:5d}")

# ── Guadagno cumulato tipico a ogni eta', per fascia ─────────────────
# Serve a due cose che senza di questo non funzionano:
#  1. dire a che punto della carriera TIPICA si trova il cavallo, invece
#     di confrontare il residuo di fascia con i guadagni individuali, che
#     sono grandezze su scale diverse (un campione ha incassato dieci
#     volte la mediana della sua fascia, e il confronto lo fa sembrare
#     finito quando ha appena iniziato);
#  2. capire quanto il singolo cavallo rende sopra o sotto i suoi pari,
#     per riproporzionare la stima su di lui.
cum = collections.defaultdict(list)
for nome, (by, sc, grado) in voti.items():
    f = fascia(sc)
    tot = 0.0
    for e in range(2, ETA_MAX + 1):
        if by + e > ANNO_ULTIMO_COMPLETO:
            break
        tot += premi.get((nome, e), 0.0)
        # solo cavalli che a quell'eta' avevano davvero iniziato a correre
        if any(gare.get((nome, k), 0) > 0 for k in range(2, e + 1)):
            cum[(f, e)].append(tot)

cumulato = {}
for f in FASCE:
    cumulato[f] = {}
    for e in range(2, ETA_MAX + 1):
        v = cum[(f, e)]
        cumulato[f][e] = {
            "n": len(v),
            "mediano": round(mediana(v), 0),
            "medio": round(sum(v) / len(v), 0) if v else 0.0,
        }

d2 = json.load(open('/tmp/tavola.json'))
d2["cumulato"] = cumulato
json.dump(d2, open('/tmp/tavola.json', 'w'), indent=1)

print("\nGUADAGNO CUMULATO TIPICO (mediana) per eta'")
print(f"{'fascia':>8} | " + " | ".join(f"{a:>2}anni" for a in [3,4,5,6,7,8]))
for f in FASCE:
    print(f"{f:>8} | " + " | ".join(
        f"{cumulato[f][a]['mediano']:>6.0f}" for a in [3,4,5,6,7,8]))
