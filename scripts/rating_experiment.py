#!/usr/bin/env python3
"""Banco di prova per la formula del voto. Non scrive nulla nell'archivio.

La formula attuale premia troppo chi ha vinto tanto su pochissime corse.
American Kronos, otto corse e otto vittorie per 66.878 euro, prende 95,96 e
risulta il miglior cavallo dell'archivio; Ampia Mede SM, 93 corse e 1.620.812
euro, cioe' ventiquattro volte tanto, prende 85,29. Un cavallo che ha fatto
guadagnare un ventiquattresimo non puo' valere piu' di quello che li ha fatti.

Le cause sono due e vanno distinte.

La prima e' che la percentuale di vittorie viene presa per quello che dice,
senza guardare su quante corse e' calcolata. Otto vittorie su otto danno il
100% e i venti punti pieni, ma con otto corse non si puo' distinguere un
cavallo che vince davvero sempre da uno fortunato: con quattro teste di fila
non si dimostra che una moneta e' truccata. La correzione e' vecchia come la
statistica: si tira la stima verso la media della popolazione tanto piu' forte
quanto meno numerose sono le prove.

La seconda e' che il record sul chilometro pesa 0,30, quasi come i guadagni.
Ma il record e' il singolo giorno migliore di una carriera: premiarlo cosi'
tanto e' esattamente il difetto che vogliamo togliere, non una difesa.

Manca poi del tutto una misura della tenuta. Durare e' la cosa che conta di
piu' economicamente — la tavola di sopravvivenza di questo stesso progetto
mostra che i guadagni stanno negli anni in pista, non nel colpo singolo — e
oggi il voto non la guarda affatto.

    python3 scripts/rating_experiment.py
"""

import bisect
import os
import sqlite3
import statistics as st
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data.db")

# Quanto tirare la percentuale di vittorie verso la media della popolazione.
# Vale come "corse fantasma" a rendimento medio aggiunte a quelle vere: con 20
# corse vere il peso della media e' la meta', con 90 conta poco.
FORZA_RICHIAMO = 20

ANNO_OGGI = 2026
# Oltre questa eta' non si pretende che un cavallo sia ancora in pista.
ETA_MAX = 10


def _sec(rec: str):
    """Record sul chilometro in secondi. Formato '1.10.5' oppure '10.6'."""
    if not rec:
        return None
    p = str(rec).strip().split(".")
    try:
        if len(p) == 3:
            return int(p[0]) * 60 + int(p[1]) + int(p[2]) / 10
        if len(p) == 2:
            return 60 + int(p[0]) + int(p[1]) / 10
    except ValueError:
        return None
    return None


def percentile_maker(valori: list):
    """Restituisce una funzione che dice in che percentile cade un valore."""
    ordinati = sorted(valori)
    n = len(ordinati)

    def pct(v) -> float:
        if not n or v is None:
            return 0.0
        # bisect trova la posizione senza riscorrere tutta la lista ogni volta:
        # con 16.000 cavalli il conto ingenuo diventa proibitivo.
        return round(bisect.bisect_right(ordinati, v) / n * 100, 2)

    return pct


def carica(conn):
    righe = conn.execute("""
        SELECT h.name, h.birth_year, h.career_races, h.career_wins,
               h.career_earnings, h.record_career, hr.score, hr.grade
        FROM horses h
        JOIN horse_ratings hr ON hr.name = h.name AND hr.birth_year = h.birth_year
        WHERE hr.rating_mode = 'performance' AND h.career_races > 0
          AND COALESCE(h.horse_class, '') != 'breeder'
    """).fetchall()

    # Stagioni in cui il cavallo e' effettivamente scceso in pista: la misura
    # piu' diretta della tenuta. Diventa affidabile solo ora che le date delle
    # gare sono state recuperate.
    stagioni = {}
    for nome, n in conn.execute("""
        SELECT horse_name, COUNT(DISTINCT substr(race_date, 1, 4))
        FROM races WHERE race_date LIKE '____-%' GROUP BY horse_name
    """):
        stagioni[(nome or "").strip().upper()] = n

    out = []
    for nome, anno, corse, vitt, euro, rec, voto_ora, grado_ora in righe:
        out.append({
            "nome": nome, "anno": anno,
            "corse": corse or 0, "vitt": vitt or 0,
            "euro": euro or 0.0, "rec": _sec(rec),
            "stagioni": stagioni.get((nome or "").strip().upper(), 0),
            # Stagioni che il cavallo ha AVUTO a disposizione: si debutta a due
            # anni, quindi un quattro anni ne ha avute tre. Serve a non
            # confondere "carriera corta" con "carriera non ancora finita".
            "stagioni_possibili": max(1, min(ANNO_OGGI, (anno or ANNO_OGGI) + ETA_MAX)
                                      - (anno or ANNO_OGGI) - 1),
            "voto_ora": voto_ora, "grado_ora": grado_ora,
        })
    return out


def calcola(dati: list, pesi: dict, richiamo: bool) -> None:
    """Scrive in ogni riga il voto secondo i pesi dati."""
    p_euro = percentile_maker([d["euro"] for d in dati if d["euro"]])
    tempi = [d["rec"] for d in dati if d["rec"]]
    tempi_ord = sorted(tempi)
    n_t = len(tempi_ord)

    def p_tempo(t):
        """Sul tempo il piu' basso e' il migliore, quindi si conta al contrario."""
        if not t or not n_t:
            return 0.0
        return round((n_t - bisect.bisect_left(tempi_ord, t)) / n_t * 100, 2)

    p_tenuta = percentile_maker([d["stagioni"] for d in dati])
    # Tenuta rapportata all'eta': quante delle stagioni che poteva correre ha
    # corso davvero. Un quattro anni con tre stagioni su tre e' integro; un
    # dieci anni con due stagioni su otto si e' fermato subito.
    p_integrita = percentile_maker(
        [d["stagioni"] / d["stagioni_possibili"] for d in dati])

    tot_v = sum(d["vitt"] for d in dati)
    tot_c = sum(d["corse"] for d in dati)
    media_vitt = (tot_v / tot_c) if tot_c else 0.0

    for d in dati:
        if richiamo:
            # Media pesata fra il rendimento del cavallo e quello della
            # popolazione: poche corse, pesa la popolazione.
            tasso = ((d["vitt"] + FORZA_RICHIAMO * media_vitt)
                     / (d["corse"] + FORZA_RICHIAMO)) * 100
        else:
            tasso = (d["vitt"] / d["corse"] * 100) if d["corse"] else 0.0
        d["voto"] = round(min(
            p_euro(d["euro"]) * pesi["euro"]
            + p_tempo(d["rec"]) * pesi["tempo"]
            + tasso * pesi["vittorie"]
            + p_tenuta(d["stagioni"]) * pesi["tenuta"]
            + p_integrita(d["stagioni"] / d["stagioni_possibili"])
            * pesi.get("integrita", 0.0), 100.0), 2)


def mostra(dati, titolo, campioni):
    per_nome = {d["nome"]: d for d in dati}
    ordinati = sorted(dati, key=lambda d: -d["voto"])
    pos = {d["nome"]: i + 1 for i, d in enumerate(ordinati)}
    print(f"\n{'=' * 78}\n{titolo}\n{'=' * 78}")
    print(f"{'cavallo':<18}{'corse':>6}{'vitt':>5}{'euro':>11}{'stag':>5}{'/poss':>6}"
          f"{'voto':>7}{'posizione':>11}")
    for n in campioni:
        d = per_nome.get(n)
        if not d:
            continue
        print(f"{d['nome']:<18}{d['corse']:>6}{d['vitt']:>5}{d['euro']:>11,.0f}"
              f"{d['stagioni']:>5}{d['stagioni_possibili']:>6}"
              f"{d['voto']:>7.1f}{pos[d['nome']]:>11,}")
    print("\nprimi 8 dell'archivio:")
    for i, d in enumerate(ordinati[:8], 1):
        print(f"  {i}. {d['nome']:<20} corse {d['corse']:>3} vitt {d['vitt']:>3} "
              f"euro {d['euro']:>10,.0f} stagioni {d['stagioni']:>2} voto {d['voto']:.1f}")


def main() -> int:
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    dati = carica(conn)
    print(f"cavalli in prova: {len(dati):,}")

    campioni = ["AMERICAN KRONOS", "AMPIA MEDE SM", "CAPITAL MAIL",
                "GINOSTRABLIGGI", "EXECUTIV EK", "VIVID WISE AS"]

    prove = [
        ("ATTUALE  guadagni 0,50 · record 0,30 · vittorie 0,20 (senza richiamo)",
         {"euro": 0.50, "tempo": 0.30, "vittorie": 0.20, "tenuta": 0.0}, False),
        ("A  come ora, ma vittorie corrette per numero di corse",
         {"euro": 0.50, "tempo": 0.30, "vittorie": 0.20, "tenuta": 0.0}, True),
        ("B  meno peso al record, vittorie corrette",
         {"euro": 0.60, "tempo": 0.20, "vittorie": 0.20, "tenuta": 0.0}, True),
        ("C  con la tenuta: guadagni 0,45 · record 0,15 · vittorie 0,15 · tenuta 0,25",
         {"euro": 0.45, "tempo": 0.15, "vittorie": 0.15, "tenuta": 0.25}, True),
        ("D  tenuta piu' forte: guadagni 0,45 · record 0,10 · vittorie 0,15 · tenuta 0,30",
         {"euro": 0.45, "tempo": 0.10, "vittorie": 0.15, "tenuta": 0.30}, True),
        ("E  tenuta rapportata all'eta': guadagni 0,50 · record 0,15 · vittorie 0,15 · integrita 0,20",
         {"euro": 0.50, "tempo": 0.15, "vittorie": 0.15, "tenuta": 0.0,
          "integrita": 0.20}, True),
        ("F  meta' tenuta assoluta, meta' rapportata all'eta'",
         {"euro": 0.45, "tempo": 0.15, "vittorie": 0.15, "tenuta": 0.125,
          "integrita": 0.125}, True),
    ]

    for titolo, pesi, richiamo in prove:
        calcola(dati, pesi, richiamo)
        mostra(dati, titolo, campioni)

    # Controllo di sanita': la tenuta non deve far salire i cavalli che corrono
    # tanto senza guadagnare nulla.
    calcola(dati, {"euro": 0.45, "tempo": 0.15, "vittorie": 0.15, "tenuta": 0.25}, True)
    ferro = [d for d in dati if d["corse"] >= 80 and d["euro"] < 20000]
    if ferro:
        print(f"\n{'=' * 78}\nCONTROLLO con la formula C: cavalli con 80+ corse e meno di "
              f"20.000 euro ({len(ferro)})\n{'=' * 78}")
        print(f"  voto mediano {st.median(d['voto'] for d in ferro):.1f} | "
              f"massimo {max(d['voto'] for d in ferro):.1f}")
        for d in sorted(ferro, key=lambda x: -x["voto"])[:4]:
            print(f"  {d['nome']:<20} corse {d['corse']:>3} euro {d['euro']:>8,.0f} "
                  f"voto {d['voto']:.1f}")
    analisi_finale(dati)
    return 0




def analisi_finale(dati):
    """Quanto cambierebbe il quadro generale, e quanto il voto segue i guadagni.

    Il voto non e' un numero isolato: da' i gradi della classifica, alimenta il
    punteggio degli stalloni e quindi l'Advisor. Cambiarlo vuol dire rifare
    quei conti, percio' conviene sapere prima quanto si muove.
    """
    import bisect as bs

    def spearman(xs, ys):
        def ranghi(v):
            ordine = sorted(range(len(v)), key=lambda i: v[i])
            r = [0.0] * len(v)
            i = 0
            while i < len(ordine):
                j = i
                while j + 1 < len(ordine) and v[ordine[j + 1]] == v[ordine[i]]:
                    j += 1
                media = (i + j) / 2 + 1
                for k in range(i, j + 1):
                    r[ordine[k]] = media
                i = j + 1
            return r
        rx, ry = ranghi(xs), ranghi(ys)
        n = len(xs)
        mx, my = sum(rx) / n, sum(ry) / n
        num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
        dx = sum((a - mx) ** 2 for a in rx) ** 0.5
        dy = sum((b - my) ** 2 for b in ry) ** 0.5
        return num / (dx * dy) if dx and dy else 0.0

    prove = {
        "ATTUALE": ({"euro": .50, "tempo": .30, "vittorie": .20, "tenuta": 0}, False),
        "E": ({"euro": .50, "tempo": .15, "vittorie": .15, "tenuta": 0,
               "integrita": .20}, True),
        "F": ({"euro": .45, "tempo": .15, "vittorie": .15, "tenuta": .125,
               "integrita": .125}, True),
    }
    print(f"\n{'=' * 78}\nQUANTO IL VOTO SEGUE I GUADAGNI DI CARRIERA (Spearman)\n{'=' * 78}")
    voti = {}
    for nome, (pesi, rich) in prove.items():
        calcola(dati, pesi, rich)
        voti[nome] = {d["nome"]: d["voto"] for d in dati}
        rho = spearman([d["voto"] for d in dati], [d["euro"] for d in dati])
        giovani = [d for d in dati if d["stagioni_possibili"] <= 3]
        veterani = [d for d in dati if d["stagioni_possibili"] >= 7]
        print(f"  {nome:<8} tutti {rho:.3f} | "
              f"voto medio giovani {sum(d['voto'] for d in giovani) / len(giovani):.1f} "
              f"vs veterani {sum(d['voto'] for d in veterani) / len(veterani):.1f}")

    print(f"\n{'=' * 78}\nQUANTI CAVALLI CAMBIANO POSIZIONE IN MODO IMPORTANTE\n{'=' * 78}")
    base = sorted(voti["ATTUALE"].items(), key=lambda kv: -kv[1])
    pos_base = {n: i for i, (n, _) in enumerate(base)}
    for nome in ("E", "F"):
        nuovo = sorted(voti[nome].items(), key=lambda kv: -kv[1])
        pos_new = {n: i for i, (n, _) in enumerate(nuovo)}
        salti = [abs(pos_base[n] - pos_new[n]) for n in pos_base]
        salti.sort()
        grossi = sum(1 for s in salti if s > 1000)
        print(f"  {nome}: spostamento mediano {salti[len(salti) // 2]:,} posizioni | "
              f"{grossi:,} cavalli si spostano di oltre 1.000 ({grossi / len(salti) * 100:.1f}%)")


if __name__ == "__main__":
    raise SystemExit(main())
