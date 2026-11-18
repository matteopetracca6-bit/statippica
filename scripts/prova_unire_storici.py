"""Prova: UNIRE trova i cavalli storici per nome e anno? Non scrive niente."""
import re, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import unire_source as u
from bs4 import BeautifulSoup

def cerca(nome, sesso, anno):
    r = u._get(u.UNIRE_LIST, method="POST", data={"name": nome, "sex": sesso, "year": str(anno)})
    soup = BeautifulSoup(r.text, "html.parser")
    m = re.search(r"Ho trovato\s+(\d+)", soup.get_text(" ", strip=True))
    righe = []
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) >= 7 and tds[0].get_text(strip=True) not in ("", "Nome"):
            a = tds[0].find("a", href=True)
            righe.append((tds[0].get_text(" ", strip=True), a["href"] if a else None))
    return int(m.group(1)) if m else -1, righe

print("GIL DEL ROERO:", u.fetch_horse("365154"))
for nome in ("XAUR", "EXAUR", "EXAU", "ESAURO", "EX AURO"):
    for anno in (2001, 1981, 2021):
        for s in ("M", "F", "C"):
            n, righe = cerca(nome, s, anno)
            if n > 0:
                print(nome, anno, s, n, righe[:5])
# soglia dell'elenco: ricerche via via piu' strette
for nome in ("ER", "ERO", "ROS", "EGO", "EL", "EN", "EST"):
    n, righe = cerca(nome, "M", 2001)
    print(f"soglia: {nome!r} M 2001 -> dice {n}, mostra {len(righe)}")
