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

print("EX AURO:", u.fetch_horse("357204"))
for nome in ("EST", "ERI", "EGA", "ERA", "ENT", "ELL", "EAR", "EST", "ESS", "EDI"):
    for s_ in ("M", "F"):
        n, righe = cerca(nome, s_, 2001)
        print(f"soglia: {nome!r} {s_} 2001 -> dice {n}, mostra {len(righe)}")
print("totale nati 2001:", {s_: cerca("", s_, 2001)[0] for s_ in ("M", "F", "C")})
