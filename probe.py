import json, re, time, urllib.parse, urllib.request, http.cookiejar
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def get(u, h=None):
    try:
        r = op.open(urllib.request.Request(u, headers={"User-Agent": UA, **(h or {})}), timeout=25); return r.read().decode("utf-8", "ignore")
    except Exception as e:
        return ""
get("https://www.letrot.com/")
rest = json.load(open("rest.json"))
for nome, anno, padre, paese, itc in rest:
    out = {"nome": nome, "anno": anno, "padre": padre, "paese": paese}
    base = re.sub(r"\s*\(\d{4}\)$", "", nome)
    s = get("https://www.letrot.com/v1/api/search/horse/" + urllib.parse.quote(base.lower()), {"Accept": "application/json", "X-Requested-With": "XMLHttpRequest", "Referer": "https://www.letrot.com/"})
    try:
        it = json.loads(s)["horse"]["items"]
    except Exception:
        it = []
    out["letrot"] = [(x["id"], x["horseName"], x.get("ANNEE_NAISSANCE"), x.get("GAIN_TOTAL")) for x in it[:4]]
    for x in it:
        if anno and x.get("ANNEE_NAISSANCE") == anno and re.sub(r"\s*\[\d+\]$", "", x["horseName"]).strip() == base:
            slug = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")
            url = f"https://www.letrot.com/stats/chevaux/{slug}/{x['id']}/courses"
            t = get(url); t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
            t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t)).replace("&#039;", "'")
            i = t.find("Sexe"); out["letrot_testo"] = t[i:i+700]; out["letrot_url"] = url
            break
    wiki = {}
    for w, suff in (("en", ["", " (horse)"]), ("sv", ["", " (häst)"]), ("fr", ["", " (cheval)"]), ("de", ["", " (Pferd)"])):
        for sf in suff:
            t = base.title() + sf
            raw = get(f"https://{w}.wikipedia.org/w/index.php?title={urllib.parse.quote(t)}&action=raw")
            if raw and ("{{Infobox" in raw or "{{infobox" in raw or "Faktaruta" in raw or "{{Infobox Cheval" in raw) and len(raw) > 300:
                lines = [l.strip() for l in raw.splitlines() if re.match(r"\s*\|\s*(sire|dam|foaled|record|racerecord|earnings|raceearnings|starter|segrar|startprissumma|valuta|efter|under|född|rekord|nombre de courses|nombre de victoires|gains|père|date de naissance|Vater|Geboren|Starts|Siege|Gewinnsumme)\b", l, re.I)]
                if lines:
                    wiki[w + ":" + t] = lines[:14]; break
        time.sleep(0.2)
    out["wiki"] = wiki
    print(json.dumps(out, ensure_ascii=False), flush=True)
    time.sleep(0.5)
