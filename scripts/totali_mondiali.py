#!/usr/bin/env python3
"""Totali di carriera in tutto il mondo per i grandi campioni storici.

IL PROBLEMA. Dei cavalli storici (quelli che correvano prima dell'inizio
dell'archivio) il sito conosce solo i totali dell'anagrafe ufficiale italiana,
che contano soltanto le corse disputate in Italia. Per chi ha corso molto
all'estero il conto e' molto piu' basso del vero: VARENNE risulta con 46 corse,
41 vittorie e 2,3 milioni, contro 73 corse, 62 vittorie e 6 milioni.

COSA FA. Per i campioni storici con voto SSS, SS e S, dal piu' alto in giu',
cerca la voce del cavallo su Wikipedia in francese, svedese, inglese e
italiano, ne legge la scheda (corse, vittorie, guadagni, record) e la salva in
totali_mondiali.json insieme all'indirizzo della pagina, cosi' il sito puo'
citare la fonte. Ogni notte ne controlla un gruppo: chi non viene trovato si
ricontrolla dopo 120 giorni, chi e' stato trovato dopo un anno.

LE CAUTELE.
- Il cavallo giusto: si accetta una voce solo se il padre scritto nella scheda
  coincide con quello dell'archivio e, se c'e', anche l'anno di nascita. Molti
  cavalli hanno nomi comuni (PRUSSIA, ORSIA...) e senza questo controllo si
  prenderebbe la pagina sbagliata.
- I numeri devono stare in piedi: il totale mondiale non puo' avere meno corse
  o meno vittorie di quelle gia' contate in Italia (si tollerano 2 di scarto,
  perche' le fonti contano in modo leggermente diverso le squalifiche).
- I guadagni restano nella valuta della fonte. Se la fonte li da' in corone
  svedesi o in dollari non li si converte: un cambio scelto da noi sarebbe un
  numero inventato. Il sito li mostra cosi' come sono, con la valuta.

Uso:
    python3 scripts/totali_mondiali.py --db data.db                # un gruppo
    python3 scripts/totali_mondiali.py --db data.db --quanti 5 --prova
"""
import argparse
import datetime as dt
import json
import os
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILE = os.path.join(RADICE, "totali_mondiali.json")
UA = {"User-Agent": "StatIppica/1.0 (https://statippica.onrender.com; matteopetracca9@gmail.com)"}
VOTI = ("SSS", "SS", "S")
RICONTROLLA_NON_TROVATI = 120   # giorni
RICONTROLLA_TROVATI = 365       # giorni
TOLLERANZA = 2

# Le quattro Wikipedia, nell'ordine in cui le si preferisce: la francese e la
# svedese hanno quasi sempre corse, vittorie e guadagni nella scheda; quella
# inglese le ha in una riga sola; l'italiana di solito solo corse e vittorie.
WIKI = [("fr", "trotteur"), ("sv", "travhäst"), ("en", "trotter"), ("it", "trotto")]


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def api(wiki, **p):
    p.update(format="json", maxlag="5")
    url = f"https://{wiki}.wikipedia.org/w/api.php?" + urllib.parse.urlencode(p)
    for tentativo in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                d = json.load(r)
            if "error" in d and d["error"].get("code") == "maxlag":
                time.sleep(5)
                continue
            return d
        except Exception:
            time.sleep(2 + 3 * tentativo)
    return {}


def pulisci(v):
    """Toglie collegamenti, note e marcature da un valore della scheda."""
    v = re.sub(r"<ref[^>]*/>", "", v)
    v = re.sub(r"<ref.*?</ref>", "", v, flags=re.S)
    v = re.sub(r"<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", v)
    v = re.sub(r"<[^>]+>", " ", v)
    return v.strip()


def scheda(testo):
    """Legge i campi della prima scheda (infobox) della voce."""
    i = testo.find("{{")
    campi = {}
    while i >= 0:
        # Salta i modelli di servizio in testa alla voce ({{F|...}}, {{Short
        # description}}...) e prende il primo che ha dei campi "| nome = valore".
        prof, j = 0, i
        while j < len(testo):
            if testo.startswith("{{", j):
                prof += 1; j += 2; continue
            if testo.startswith("}}", j):
                prof -= 1; j += 2
                if prof == 0:
                    break
                continue
            j += 1
        corpo = testo[i + 2:j - 2]
        if corpo.count("=") >= 5:
            # Divide sui "|" che stanno al primo livello.
            parti, prof, cur, k = [], 0, "", 0
            while k < len(corpo):
                if corpo.startswith("{{", k) or corpo.startswith("[[", k):
                    prof += 1; cur += corpo[k:k + 2]; k += 2; continue
                if corpo.startswith("}}", k) or corpo.startswith("]]", k):
                    prof -= 1; cur += corpo[k:k + 2]; k += 2; continue
                if corpo[k] == "|" and prof == 0:
                    parti.append(cur); cur = ""; k += 1; continue
                cur += corpo[k]; k += 1
            parti.append(cur)
            for p in parti[1:]:
                if "=" in p:
                    a, b = p.split("=", 1)
                    campi[a.strip().lower()] = b.strip()
            return campi
        i = testo.find("{{", j)
    return campi


def intero(v):
    if not v:
        return None
    v = pulisci(v)
    m = re.search(r"\d[\d .\u00a0\u202f,]*", v)
    if not m:
        return None
    n = re.sub(r"[^\d]", "", m.group(0))
    return int(n) if n else None


def importo(v):
    """Guadagni con la loro valuta, senza conversioni."""
    if not v:
        return None
    m = re.search(r"\{\{\s*(?:euro|€)\s*\|\s*([\d .,]+)", v, re.I)
    if m:
        n = intero(m.group(1))
        return {"importo": n, "valuta": "EUR"} if n else None
    t = pulisci(v)
    n = intero(t)
    if not n:
        return None
    if re.search(r"US\$|\$|dollar|USD", t, re.I):
        val = "USD"
    elif re.search(r"SEK|kr\b|kronor|krona", t, re.I):
        val = "SEK"
    elif re.search(r"€|euro|EUR", t, re.I):
        val = "EUR"
    else:
        return None
    return {"importo": n, "valuta": val}


def record(v):
    if not v:
        return None
    m = re.search(r"1\s*['’.:]\s*(\d{2})\s*[\"”.,]\s*(\d)", pulisci(v))
    return f"1.{m.group(1)}.{m.group(2)}" if m else None


def leggi(wiki, campi):
    """Corse, vittorie, guadagni e record dalla scheda, secondo la lingua."""
    c = campi
    if wiki == "fr":
        return {"corse": intero(c.get("nombre de courses")), "vittorie": intero(c.get("nombre de victoires")),
                "guadagni": importo(c.get("gains en courses") or c.get("gains")), "record": record(c.get("record")),
                "padre": c.get("père"), "madre": c.get("mère"), "nascita": c.get("date de naissance")}
    if wiki == "sv":
        g = None
        n = intero(c.get("startprissumma"))
        val = (c.get("valuta") or "").lower()
        if n:
            if "euro" in val:
                g = {"importo": n, "valuta": "EUR"}
            elif "kron" in val or "sek" in val:
                g = {"importo": n, "valuta": "SEK"}
            elif "dollar" in val:
                g = {"importo": n, "valuta": "USD"}
        return {"corse": intero(c.get("starter")), "vittorie": intero(c.get("segrar")), "guadagni": g,
                "record": record(c.get("rekord")), "padre": c.get("efter"), "madre": c.get("under"), "nascita": c.get("född")}
    if wiki == "en":
        corse = vitt = None
        m = re.search(r"(\d+)\s*:\s*(\d+)\s*-", pulisci(c.get("racerecord") or ""))
        if m:
            corse, vitt = int(m.group(1)), int(m.group(2))
        return {"corse": corse, "vittorie": vitt, "guadagni": importo(c.get("raceearnings")),
                "record": None, "padre": c.get("sire"), "madre": c.get("dam"), "nascita": c.get("foaled")}
    if wiki == "it":
        return {"corse": intero(c.get("corse disputate")), "vittorie": intero(c.get("corse vinte")),
                "guadagni": None, "record": None, "padre": c.get("padre"), "madre": c.get("madre"), "nascita": c.get("nato il")}
    return {}


def coincide(a, b):
    a, b = norm(pulisci(a or "")), norm(b or "")
    return bool(a and b) and (a.startswith(b) or b.startswith(a))


def stesso_cavallo(dati, padre, madre, anno):
    """Il padre (o, se l'archivio non lo conosce, la madre) deve coincidere;
    l'anno di nascita, se scritto, pure. Se l'archivio non conosce ne' padre
    ne' madre, basta l'anno di nascita, ma deve essere scritto nella scheda."""
    anni = re.findall(r"(19\d\d|20\d\d)", pulisci(dati.get("nascita") or ""))
    if anni and int(anni[0]) != anno:
        return False
    if padre:
        return coincide(dati.get("padre"), padre)
    if madre:
        return coincide(dati.get("madre"), madre)
    return bool(anni)


def cerca(nome, anno, padre, madre):
    trovate = []
    for wiki, parola in WIKI:
        r = api(wiki, action="query", list="search", srsearch=f'"{nome.title()}" {parola}', srlimit=5)
        for h in (r.get("query") or {}).get("search", []):
            titolo = h["title"]
            base = re.sub(r"\s*\(.*\)$", "", titolo)
            if norm(base) != norm(nome):
                continue
            p = api(wiki, action="query", titles=titolo, prop="revisions", rvprop="content",
                    rvslots="main", redirects=1)
            pagine = list(((p.get("query") or {}).get("pages") or {}).values())
            if not pagine or "revisions" not in pagine[0]:
                continue
            testo = pagine[0]["revisions"][0]["slots"]["main"]["*"]
            dati = leggi(wiki, scheda(testo))
            if not dati or not stesso_cavallo(dati, padre, madre, anno):
                continue
            if dati.get("corse") is None and dati.get("vittorie") is None:
                continue
            titolo_vero = pagine[0].get("title", titolo)
            dati["fonte"] = {"wiki": wiki, "titolo": titolo_vero,
                             "url": f"https://{wiki}.wikipedia.org/wiki/" + urllib.parse.quote(titolo_vero.replace(" ", "_"))}
            trovate.append(dati)
            break
        time.sleep(0.3)
    return trovate


def componi(trovate, it_corse, it_vitt):
    """Mette insieme le fonti: corse e vittorie dalla prima che le ha
    entrambe e che regge il confronto con l'Italia, i guadagni in euro se una
    fonte li ha in euro, se no nella valuta della prima che li ha."""
    buone = [d for d in trovate if d.get("corse") and d.get("vittorie") is not None
             and d["corse"] >= (it_corse or 0) - TOLLERANZA and d["vittorie"] >= (it_vitt or 0) - TOLLERANZA
             and d["vittorie"] <= d["corse"]]
    if not buone:
        return None, ("le schede trovate hanno meno corse o vittorie di quelle gia' contate in Italia"
                      if trovate else None)
    base = buone[0]
    g = next((d["guadagni"] for d in trovate if d.get("guadagni") and d["guadagni"]["valuta"] == "EUR"), None) \
        or next((d["guadagni"] for d in trovate if d.get("guadagni")), None)
    rec = next((d["record"] for d in trovate if d.get("record")), None)
    fonti = []
    for d in [base] + [d for d in trovate if d is not base]:
        if d["fonte"] not in fonti:
            fonti.append(d["fonte"])
    # Le fonti che danno un numero diverso di corse restano annotate: e' il
    # segnale che il dato va guardato con un occhio in piu'.
    discordi = sorted({d["corse"] for d in trovate if d.get("corse")} - {base["corse"]})
    return {"corse": base["corse"], "vittorie": base["vittorie"], "guadagni": g, "record": rec,
            "fonte_corse": base["fonte"]["wiki"], "altre_corse": discordi or None, "fonti": fonti}, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data.db")
    ap.add_argument("--file", default=FILE)
    ap.add_argument("--quanti", type=int, default=60)
    ap.add_argument("--minuti", type=float, default=20)
    ap.add_argument("--prova", action="store_true", help="non scrive il file")
    a = ap.parse_args()

    inizio = time.time()
    try:
        archivio = json.load(open(a.file, encoding="utf-8"))
    except FileNotFoundError:
        archivio = {"spiegazione": "Totali di carriera in tutto il mondo dei campioni storici, letti dalle "
                                   "schede di Wikipedia. Li aggiorna ogni notte scripts/totali_mondiali.py.",
                    "cavalli": {}}
    cav = archivio.setdefault("cavalli", {})
    oggi = dt.date.today()

    db = sqlite3.connect(a.db)
    righe = db.execute(f"""
        SELECT r.name, r.birth_year, h.sire, h.dam, r.career_races, r.career_wins, r.grade
          FROM horse_ratings r JOIN horses h ON h.name = r.name AND h.birth_year = r.birth_year
         WHERE r.rating_mode = 'storico' AND r.grade IN ({",".join("?" * len(VOTI))})
         ORDER BY r.score DESC""", VOTI).fetchall()

    da_fare = []
    for nome, anno, padre, madre, corse, vitt, voto in righe:
        k = f"{nome}|{anno}"
        e = cav.get(k)
        if e:
            giorni = (oggi - dt.date.fromisoformat(e["letto_il"])).days
            if giorni < (RICONTROLLA_TROVATI if e["esito"] == "trovato" else RICONTROLLA_NON_TROVATI):
                continue
        da_fare.append((k, nome, anno, padre, madre, corse, vitt, voto))
    print(f"Campioni storici {'/'.join(VOTI)}: {len(righe)}; da controllare ora: {len(da_fare)}")

    fatti = trovati = 0
    for k, nome, anno, padre, madre, corse, vitt, voto in da_fare[:a.quanti]:
        if time.time() - inizio > a.minuti * 60:
            print("Tempo finito: si riprende la notte dopo.")
            break
        trovate = cerca(nome, anno, padre, madre)
        tot, motivo = componi(trovate, corse, vitt)
        if tot:
            cav[k] = {"nome": nome, "anno": anno, "esito": "trovato", "letto_il": oggi.isoformat(), **tot}
            trovati += 1
            g = tot["guadagni"]
            soldi = f" · {g['importo']:,} {g['valuta']}" if g else ""
            print(f"  {voto:3} {nome} ({anno}): Italia {corse}/{vitt} -> mondo {tot['corse']}/{tot['vittorie']}"
                  f"{soldi} [{', '.join(f['wiki'] for f in tot['fonti'])}]")
        else:
            cav[k] = {"nome": nome, "anno": anno, "esito": "non_trovato", "letto_il": oggi.isoformat(),
                      **({"motivo": motivo} if motivo else {})}
            print(f"  {voto:3} {nome} ({anno}): nessuna scheda affidabile{' (' + motivo + ')' if motivo else ''}")
        fatti += 1

    n_trov = sum(1 for e in cav.values() if e["esito"] == "trovato")
    print(f"Controllati stanotte: {fatti}, trovati: {trovati}. In totale: {n_trov} campioni con i totali mondiali "
          f"su {len(cav)} controllati.")
    if a.prova:
        print("Prova: file non scritto.")
        return
    archivio["aggiornato_il"] = oggi.isoformat()
    archivio["cavalli"] = dict(sorted(cav.items()))
    with open(a.file, "w", encoding="utf-8") as f:
        json.dump(archivio, f, ensure_ascii=False, indent=1)
        f.write("\n")


if __name__ == "__main__":
    sys.exit(main())
