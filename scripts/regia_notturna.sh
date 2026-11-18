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
# subito: la regia guarda l'orologio e, se e' notte e stanotte non e' ancora
# partito niente, lancia i lavori lei.
#
# CHI LA CHIAMA. La sveglia, che gira di continuo (ogni 4 minuti), e la
# sentinella, come riserva. Fuori dalla finestra esce subito senza chiamare
# GitHub.
#
# L'ORDINE. I lavori vengono lanciati a 20 secondi l'uno dall'altro:
# aspetta_turno.sh li fa lavorare sull'archivio uno alla volta, nell'ordine in
# cui sono partiti. Gli storici UNIRE vanno per ultimi e si fermano da soli
# alle 8:00 (vedi archivio-storici-unire.yml), cosi' alle 9 e' tutto finito.
#
# Ora legale e ora solare: si ragiona sempre in ora italiana (Europe/Rome).

set -uo pipefail

REPO="${GITHUB_REPOSITORY:-matteopetracca6-bit/statippica}"
INIZIO_FINESTRA="${REGIA_DALLE:-0100}"   # da quando si puo' partire (ora italiana)
FINE_FINESTRA="${REGIA_ENTRO:-0600}"     # dopo, si salta la notte: finirebbe di giorno

ORA=$(TZ=Europe/Rome date +%H%M)
if [ "$((10#$ORA))" -lt "$((10#$INIZIO_FINESTRA))" ] || [ "$((10#$ORA))" -ge "$((10#$FINE_FINESTRA))" ]; then
  exit 0
fi
if [ -z "${GH_TOKEN:-}" ]; then
  echo "Regia: manca il permesso per lanciare i lavori."
  exit 0
fi

# "Stanotte" comincia a mezzanotte italiana, scritta in UTC per l'API.
MEZZANOTTE_UTC=$(TZ=UTC date -d "$(TZ=Europe/Rome date +%Y-%m-%d) 00:00 $(TZ=Europe/Rome date +%z)" +%Y-%m-%dT%H:%M:%SZ)

# Se il notturno dei risultati e' gia' partito stanotte (anche lanciato a mano
# o dalla sentinella), la regia ha gia' fatto il suo lavoro.
GIA=$(gh api "repos/$REPO/actions/workflows/nightly-results.yml/runs?per_page=10" \
  -q "[.workflow_runs[] | select(.created_at >= \"$MEZZANOTTE_UTC\")] | length" 2>/dev/null) || { echo "Regia: GitHub non risponde, riprovo al prossimo giro."; exit 0; }
if [ "${GIA:-0}" -gt 0 ] && [ -z "${REGIA_PROVA:-}" ]; then
  exit 0
fi

GIORNO=$(TZ=Europe/Rome date +%u)   # 1 = lunedi'
echo "== Regia notturna: $(TZ=Europe/Rome date '+%d/%m %H:%M') ora italiana, lancio i lavori della notte =="

lancia() { # $1 = file del lavoro, poi gli input -f chiave=valore
  local f=$1; shift
  if [ -n "${REGIA_PROVA:-}" ]; then echo "  (prova) lancerei $f $*"; return; fi
  if gh workflow run "$f" --repo "$REPO" "$@" >/dev/null 2>&1; then
    echo "  lanciato $f"
  else
    sleep 15
    gh workflow run "$f" --repo "$REPO" "$@" >/dev/null 2>&1 \
      && echo "  lanciato $f (al secondo tentativo)" \
      || echo "::warning::Regia: non sono riuscito a lanciare $f"
  fi
  sleep 20
}

lancia nightly-results.yml -f reason="regia notturna"
lancia nightly-maintenance.yml -f reason="regia notturna"
lancia archivio-allenatori.yml
lancia totali-mondiali.yml
if [ "$GIORNO" = "1" ]; then
  lancia weekly-stallion-catalog.yml
  lancia nightly-pedigree.yml
fi
lancia archivio-storici-unire.yml
echo "== Regia notturna: fatto =="
