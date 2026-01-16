#!/bin/bash

# Script per sincronizzare le modifiche su Git e GitHub dopo un deploy
# Utilizzo: ./scripts/git-sync.sh "Messaggio del commit"

set -e

# Colori per output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verifica che siamo in un repository git
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Errore: Non sei in un repository git${NC}"
    exit 1
fi

# Verifica se ci sono modifiche da committare
if git diff --quiet && git diff --cached --quiet; then
    echo -e "${YELLOW}Nessuna modifica da committare${NC}"
    exit 0
fi

# Messaggio del commit (default se non fornito)
COMMIT_MESSAGE="${1:-Deploy su DEV: $(date '+%Y-%m-%d %H:%M:%S')}"

echo -e "${GREEN}Preparazione commit...${NC}"

# Mostra le modifiche
echo -e "${YELLOW}Modifiche rilevate:${NC}"
git status --short

# Aggiungi tutte le modifiche
git add .

# Crea il commit
echo -e "${GREEN}Creazione commit...${NC}"
git commit -m "$COMMIT_MESSAGE"

# Push su GitHub
echo -e "${GREEN}Push su GitHub...${NC}"
git push origin main

echo -e "${GREEN}✓ Sincronizzazione completata con successo!${NC}"
echo -e "Commit: $(git rev-parse --short HEAD)"
echo -e "Messaggio: $COMMIT_MESSAGE"
