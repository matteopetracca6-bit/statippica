"""Prova: UNIRE trova i cavalli storici per nome e anno? E una ricerca larga
restituisce un'annata intera? Non scrive niente."""
import re, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import unire_source as u
from bs4 import BeautifulSoup

def cerca(nome, sesso, anno):
    r = u._get(u.UNIRE_LIST, method="POST", data={"name": nome, "sex": sesso, "year": str(anno)})
    soup = BeautifulSoup(r.text, "html.parser")
    testo = soup.get_text(" ", strip=True)
    m = re.search(r"Ho trovato\s+(\d+)", testo)
    righe = []
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) >= 7:
            link = tr.find("a", href=True)
            righe.append(([t.get_text(" ", strip=True) for t in tds[:7]], link["href"] if link else None))
    pag = [a.get("href") for a in soup.find_all("a", href=True) if "page" in a.get("href", "").lower() or "start" in a.get("href", "").lower()]
    return (m.group(1) if m else "?"), righe, pag[:5]

for nome, anni in (("EXAURO", (2001, 2000, 2002)), ("GIL DEL ROERO", (2003, 2002, 2004))):
    for anno in anni:
        for s in ("M", "F", "C"):
            n, righe, _ = cerca(nome, s, anno)
            if righe:
                print(nome, anno, s, "trovati", n, righe[:3])
                for _, href in righe[:1]:
                    if href and "id_cav=" in href:
                        print("   scheda:", u.fetch_horse(href.split("id_cav=")[-1]))
for nome in ("E", "A", ""):
    n, righe, pag = cerca(nome, "M", 2001)
    print(f"ricerca larga name={nome!r} M 2001: dice {n}, righe nella pagina {len(righe)}, link pagine {pag}")
    print("   prime:", [r[0][0] for r in righe[:5]], "ultime:", [r[0][0] for r in righe[-3:]])
