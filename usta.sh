#!/bin/bash
sudo apt-get install -y poppler-utils >/dev/null 2>&1
python3 -c "import json;[print(x[0]) for x in json.load(open('rest.json'))]" | while read -r nome; do
  t=$(python3 -c "import sys;print(' '.join(w.capitalize() if not w.startswith(\"'\") else w for w in sys.argv[1].lower().split()))" "$nome")
  for v in "$nome" "$t"; do
    u="https://stars.ustrotting.com/documents/pedigree/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$v").pdf"
    code=$(curl -s -o /tmp/p.pdf -w "%{http_code}" "$u")
    if [ "$code" = "200" ] && head -c 4 /tmp/p.pdf | grep -q "%PDF"; then
      txt=$(pdftotext -layout /tmp/p.pdf - 2>/dev/null | head -60 | tr -s ' ' | tr '\n' '~' | cut -c1-2500)
      echo "U|$nome|$u|$txt"; break
    fi
  done
  sleep 0.5
done
