#!/bin/bash
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
curl -s -c /tmp/j -b /tmp/j -A "$UA" -o /dev/null https://www.letrot.com/
python3 -c "import json;[print(x[0]) for x in json.load(open('rest_eu.json'))]" | while read -r nome; do
  base=$(echo "$nome" | sed -E 's/ \([0-9]{4}\)$//')
  q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1].lower()))" "$base")
  s=$(curl -s -c /tmp/j -b /tmp/j -A "$UA" -H "Accept: application/json, text/plain, */*" -H "X-Requested-With: XMLHttpRequest" -H "Referer: https://www.letrot.com/" "https://www.letrot.com/v1/api/search/horse/$q")
  echo "S|$nome|$s"
  sleep 1
done
