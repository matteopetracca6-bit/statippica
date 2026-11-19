#!/usr/bin/env bash
#
# Regia dei lavori notturni: li fa partire tutti, in fila, dopo l'una di notte
# (ora italiana), in modo che il sito resti tranquillo dalle 9 alle 23.
#
# PERCHE' ESISTE. Gli orari programmati di GitHub arrivano con 6-9 ore di
# ritardo (novembre 2026): il notturno dei risultati, messo alle 01:30
# italiane, partiva fra le 7:30 e le 9:15, la manutenzione fra le 8:30 e le
# 10:30, allenatori e totali mondiali verso mezzogiorno-le due. Ogni lavoro
# finisce con un deploy, quindi il sito ripartiva in pieno giorno. Un ritardo
# cosi' grande e variabile (a settembre era di 4-5 ore) non si puo' compensare
# anticipando l'orario. Il lancio a mano (workflow_dispatch) invece parte
# subito: la regia guarda l'orologio e, dopo l'una, lancia lei i lavori che
# stanotte non sono ancora partiti.
#
# CHI LA CHIAMA. La sveglia, che gira di continuo (ogni 4 minuti), e la
# sentinella, come riserva. Prima dell'una esce subito senza chiamare GitHub.
#
# L'ORDINE. I lavori vengono lanciati a 20 secondi l'uno dall'altro:
# aspetta_turno.sh li fa lavorare sull'archivio uno alla volta, nell'ordine in
# cui sono partiti. Gli storici UNIRE vanno per ultimi e di notte si fermano
# da soli alle 8:00 (vedi archivio-storici-unire.yml).
#
# NESSUN LAVORO SALTA. Ad ogni giro la regia guarda, lavoro per lavoro, se e'
# gia' partito da mezzanotte (ora italiana) e lancia solo quelli che mancano:
# se un lancio non riesce, ci riprova 4 minuti dopo. Se GitHub resta
# irraggiungibile per tutta la notte, i lavori partono appena torna, anche di
# giorno: meglio un deploy di giorno che una notte persa.
#
# Ora legale e ora solare: si ragiona sempre in ora italiana (Europe/Rome).

set -uo pipefail

REPO="${GITHUB_REPOSITORY:-matteopetracca6-bit/statippica}"
INIZIO_FINESTRA="${REGIA_DALLE:-0100}"   # da quando si puo' partire (ora italiana)
# La regia comincia la notte del 19/11/2026: il 18 i lavori erano gia' partiti
# con gli orari vecchi, quelli rimasti girano la notte seguente.
ATTIVA_DAL="2026-11-19"

ORA=$(TZ=Europe/Rome date +%H%M)
OGGI=$(TZ=Europe/Rome date +%Y-%m-%d)
if [ "$((10#$ORA))" -lt "$((10#$INIZIO_FINESTRA))" ] || [[ "$OGGI" < "$ATTIVA_DAL" ]]; then
  [ -z "${REGIA_PROVA:-}" ] && exit 0
fi
if [ -z "${GH_TOKEN:-}" ]; then
  echo "Regia: manca il permesso per lanciare i lavori."
  exit 0
fi

# "Stanotte" comincia a mezzanotte italiana, scritta in UTC per l'API.
MEZZANOTTE_UTC=$(TZ=UTC date -d "$OGGI 00:00 $(TZ=Europe/Rome date +%z)" +%Y-%m-%dT%H:%M:%SZ)

# I lavori gia' partiti stanotte (lanciati dalla regia, a mano o dalla
# sentinella), letti con una sola domanda a GitHub.
PARTITI=$(gh api --paginate "repos/$REPO/actions/runs?per_page=100&created=%3E%3D$MEZZANOTTE_UTC" \
  -q '.workflow_runs[].path' 2>/dev/null) || { echo "Regia: GitHub non risponde, riprovo al prossimo giro."; exit 0; }
[ -n "${REGIA_PROVA:-}" ] && PARTITI=""

GIORNO=$(TZ=Europe/Rome date +%u)   # 1 = lunedi'
LAVORI="nightly-results.yml nightly-maintenance.yml archivio-allenatori.yml totali-mondiali.yml"
[ "$GIORNO" = "1" ] && LAVORI="$LAVORI weekly-stallion-catalog.yml nightly-pedigree.yml gran-premi.yml"
LAVORI="$LAVORI archivio-storici-unire.yml"

MANCANO=""
for f in $LAVORI; do
  echo "$PARTITI" | grep -q "/$f\$" || MANCANO="$MANCANO $f"
done
[ -z "$MANCANO" ] && exit 0

GIORNO=$(TZ=Europe/Rome date +%u)   # 1 = lunedi'
echo "== Regia notturna: $(TZ=Europe/Rome date '+%d/%m %H:%M') ora italiana, lancio:$MANCANO =="

lancia() { # $1 = file del lavoro
  local f=$1 extra=()
  case "$f" in nightly-results.yml|nightly-maintenance.yml) extra=(-f reason="regia notturna");; esac
  if [ -n "${REGIA_PROVA:-}" ]; then echo "  (prova) lancerei $f ${extra[*]}"; return; fi
  if gh workflow run "$f" --repo "$REPO" "${extra[@]}" >/dev/null 2>&1; then
    echo "  lanciato $f"
  else
    echo "::warning::Regia: non sono riuscito a lanciare $f, ci riprovo al prossimo giro"
  fi
  sleep 20
}

for f in $MANCANO; do lancia "$f"; done
echo "== Regia notturna: fatto =="
