#!/usr/bin/env bash
#
# Giro del mattino (24/11/2026). La sveglia lo chiama ogni 4 minuti; di
# solito esce subito.
#
#  1. PRONOSTICO DEL MATTINO. La ferratura (e a volte il guidatore) la fonte la
#     scrive solo il giorno della corsa, dopo il lavoro notturno. Fra le 10:30
#     e mezzogiorno (ora italiana), una volta al giorno, rilancia il notturno
#     dei risultati: rilegge i partenti di oggi e rifa' il pronostico con il
#     modello del mattino, che usa la ferratura. Le prime corse partono di
#     solito dopo mezzogiorno.
#  2. RIALLENAMENTO MENSILE. Il 2 di ogni mese, fra le 14 e le 16, lancia
#     riallena-pronostico.yml: rifa' i modelli con i mesi nuovi e li tiene
#     solo se sulle stesse corse di prova sbagliano meno di quelli in uso.
set -uo pipefail
REPO="${GITHUB_REPOSITORY:-matteopetracca6-bit/statippica}"
ORA=$(TZ=Europe/Rome date +%H%M); ORA=$((10#$ORA))
OGGI_UTC=$(date -u +%Y-%m-%d)
GIORNO=$(TZ=Europe/Rome date +%d)

partito_oggi_dopo() {  # $1 workflow, $2 ora UTC HH:MM: c'e' un giro creato oggi dopo quell'ora?
  gh api "repos/$REPO/actions/workflows/$1/runs?per_page=10" \
    -q "[.workflow_runs[] | select(.created_at >= \"${OGGI_UTC}T$2:00Z\")] | length" 2>/dev/null || echo "errore"
}

if [ "$ORA" -ge 1030 ] && [ "$ORA" -lt 1200 ]; then
  N=$(partito_oggi_dopo nightly-results.yml "08:00")
  if [ "$N" = "0" ]; then
    gh workflow run nightly-results.yml --repo "$REPO" --ref main -f reason="giro del mattino: ferratura e guidatori di oggi" \
      && echo "Giro del mattino lanciato." || echo "Giro del mattino: lancio non riuscito, riprovo fra 4 minuti."
  fi
fi

if [ "$GIORNO" = "02" ] && [ "$ORA" -ge 1400 ] && [ "$ORA" -lt 1600 ]; then
  N=$(partito_oggi_dopo riallena-pronostico.yml "00:00")
  if [ "$N" = "0" ]; then
    gh workflow run riallena-pronostico.yml --repo "$REPO" --ref main \
      && echo "Riallenamento mensile lanciato." || echo "Riallenamento mensile: lancio non riuscito."
  fi
fi
exit 0
