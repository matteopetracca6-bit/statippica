import sqlite3, sys, time
sys.path.insert(0, "scripts"); sys.path.insert(0, ".")
import manti_unire as mu, unire_source as u
c = sqlite3.connect("data.db"); mu.crea_tabella(c)
a = mu.senza_manto(c, True); b = mu.senza_manto(c, False)
print("CANDIDATI", len(a), len(b))
for nome, anno, sesso, cid in []:
    t = time.time(); cid = mu.cerca_id(nome, sesso, int(anno)); d = u.fetch_horse(cid) if cid else None
    print("RICERCA", nome, anno, cid, d and d.get("coat"), round(time.time() - t, 1))
t = time.time(); print("LAVORA", mu.lavora(c, 2.0), round(time.time() - t))
