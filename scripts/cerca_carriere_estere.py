#!/usr/bin/env python3
"""
Cerca le carriere complete degli stalloni nati o cresciuti all'estero
(21/11/2026), per dati/carriere_complete.csv.

Per ogni stallone straniero con figli in archivio: la voce di Wikipedia (fr,
sv, en, it) con lo stesso controllo di scripts/totali_mondiali.py (stesso
padre, stesso anno di nascita); se la voce francese porta alla scheda
ufficiale LeTrot, i totali si leggono da li' (fonte ufficiale). Stampa una
riga JSON per cavallo: e' una PROPOSTA, che si controlla prima di metterla
nel file. Stampa anche i cambi medi annui della BCE per le valute non in
euro (per convertire i guadagni, scrivendolo).
Uso (con la rete): python3 scripts/cerca_carriere_estere.py --db data.db
"""
import argparse, json, re, sqlite3, sys, time, urllib.request
sys.path.insert(0, __import__("os").path.dirname(__file__))
import totali_mondiali as tm

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}


def get(url, timeout=25):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
            return r.read().decode("utf-8", "ignore")
    except Exception:
        return ""


def letrot(url):
    s = get(url)
    if not s:
        return None
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t)).replace("&#039;", "'")
    num = lambda pat: (int(m.group(1)) if (m := re.search(pat, t)) else None)
    out = {"guadagni": num(r"Gains Totaux (\d+)"), "corse": num(r"Total courses (\d+)"),
           "vittorie": num(r"Victoires (\d+)"), "primi_tre": num(r"3 premiers (\d+)"),
           "anno": num(r"Année de nais\. (\d{4})"),
           "padre": (m.group(1).strip() if (m := re.search(r"Père ([A-Z][A-Z' .\-]+?) Mère", t)) else None)}
    m = re.search(r"Record attelé (1'\d{2}\"\d) - (\d{2}/\d{2}/\d{4}) - (\d+m [A-Z' \-]+?) (PRIX|GRAND|CRITERIUM|[A-Z])", t)
    if m:
        out.update(record=m.group(1), record_data=m.group(2), record_luogo=m.group(3).strip())
    else:
        m = re.search(r"Record absolu (1'\d{2}'*\"?'*\d)", t)
        out["record"] = m.group(1).replace("''", '"') if m else None
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--db", default="data.db"); a = ap.parse_args()
    db = sqlite3.connect(a.db)
    righe = db.execute("""
        SELECT s.sire, COALESCE(h.birth_year, st.catalog_birth_year), COALESCE(h.sire, st.catalog_sire), COALESCE(h.dam, st.catalog_dam),
               COALESCE(h.country, st.country), COALESCE(h.career_races, 0), COALESCE(h.career_wins, 0), s.n_figli_totali
          FROM stallion_rating_stats s
          LEFT JOIN horses h ON h.name = s.sire
          LEFT JOIN stallions st ON st.name = s.sire
         WHERE COALESCE(h.country, st.country, '') NOT IN ('ITA', '') AND s.n_figli_totali >= 5
         ORDER BY s.n_figli_totali DESC""").fetchall()
    print(f"[ESTERI] {len(righe)} stalloni", file=sys.stderr)
    for nome, anno, padre, madre, paese, it_c, it_v, figli in righe:
        base = re.sub(r"\s*\(\d{4}\)$", "", nome)
        try:
            anno_i = int(anno) if anno else None
            if anno_i is None:
                orig = tm.stesso_cavallo
                tm.stesso_cavallo = lambda d, p, m, y: (tm.coincide(d.get("padre"), p) if p else False)
            trovate = tm.cerca(base, anno_i, padre, madre)
            if anno_i is None:
                tm.stesso_cavallo = orig
            dati, motivo = tm.componi(trovate, it_c, it_v)
        except Exception as e:
            print(json.dumps({"nome": nome, "errore": str(e)}), flush=True); continue
        lt = None
        for d in trovate:
            if d["fonte"]["wiki"] != "fr":
                continue
            raw = get("https://fr.wikipedia.org/w/index.php?title=" + urllib.parse.quote(d["fonte"]["titolo"]) + "&action=raw")
            m = re.search(r"https?://www\.letrot\.com/stats/(?:chevaux|fiche-cheval)/([a-z0-9\-]+)/([A-Za-z0-9]+)", raw)
            if m:
                url = f"https://www.letrot.com/stats/chevaux/{m.group(1)}/{m.group(2)}/courses"
                lt = letrot(url)
                if lt:
                    lt["url"] = url
        print(json.dumps({"nome": nome, "anno": anno, "padre": padre, "paese": paese, "figli": figli, "it_corse": it_c,
                          "wiki": dati, "motivo": motivo, "letrot": lt}, ensure_ascii=False), flush=True)
        time.sleep(0.5)
    # Cambi medi annui BCE (unita' di valuta per 1 euro)
    for v in ("SEK", "USD", "NOK", "DKK", "CAD"):
        csvt = get(f"https://data-api.ecb.europa.eu/service/data/EXR/A.{v}.EUR.SP00.A?format=csvdata")
        anni = {int(l.split(",")[7][:4]): float(l.split(",")[8]) for l in csvt.splitlines()[1:]
                if l.count(",") >= 8 and re.match(r"\d{4}", l.split(",")[7] or "")}
        print(json.dumps({"cambio": v, "anni": anni}), flush=True)


if __name__ == "__main__":
    import urllib.parse
    main()
