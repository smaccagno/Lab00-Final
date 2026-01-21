#!/bin/bash

# Script per deployare modifiche selezionate da GitHub
# Uso: ./scripts/deploy-from-github.sh [TARGET_ORG] [BRANCH_SOURCE] [BRANCH_TARGET]

set -e

TARGET_ORG=${1:-PROD}
BRANCH_SOURCE=${2:-versione-con-inserimento-massivo}
BRANCH_TARGET=${3:-main}

echo "=========================================="
echo "Deployment da GitHub"
echo "=========================================="
echo "Target Org: $TARGET_ORG"
echo "Branch Source: $BRANCH_SOURCE"
echo "Branch Target: $BRANCH_TARGET"
echo "=========================================="
echo ""

# Verifica che siamo nel repository corretto
if [ ! -d ".git" ]; then
    echo "Errore: Questo script deve essere eseguito dalla root del repository"
    exit 1
fi

# Mostra le differenze
echo "File modificati tra $BRANCH_TARGET e $BRANCH_SOURCE:"
echo "----------------------------------------"
git diff --name-only $BRANCH_TARGET..$BRANCH_SOURCE
echo ""

# Chiedi conferma
read -p "Vuoi procedere con il deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment annullato"
    exit 1
fi

# Crea un branch temporaneo per il deployment
TEMP_BRANCH="deploy-$(date +%Y%m%d-%H%M%S)"
echo "Creazione branch temporaneo: $TEMP_BRANCH"
git checkout -b $TEMP_BRANCH $BRANCH_SOURCE

# Determina il test level
if [ "$TARGET_ORG" = "PROD" ]; then
    TEST_LEVEL="RunLocalTests"
else
    TEST_LEVEL="NoTestRun"
fi

echo ""
echo "Avvio deployment..."
echo "Test Level: $TEST_LEVEL"
echo ""

# Deploya tutte le modifiche
sf project deploy start \
    --source-dir force-app/main/default \
    --target-org $TARGET_ORG \
    --test-level $TEST_LEVEL \
    --wait 10

DEPLOY_STATUS=$?

if [ $DEPLOY_STATUS -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "Deployment completato con successo!"
    echo "=========================================="
    
    # Chiedi se vuoi mergeare in main
    if [ "$TARGET_ORG" = "PROD" ]; then
        read -p "Vuoi mergeare le modifiche in $BRANCH_TARGET? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git checkout $BRANCH_TARGET
            git merge $BRANCH_SOURCE --no-ff -m "Merge: Deploy da $BRANCH_SOURCE a PROD"
            git push origin $BRANCH_TARGET
            echo "Modifiche mergeate in $BRANCH_TARGET"
        fi
    fi
else
    echo ""
    echo "=========================================="
    echo "Deployment fallito!"
    echo "=========================================="
    exit 1
fi

# Torna al branch originale
git checkout $BRANCH_SOURCE
git branch -d $TEMP_BRANCH

echo ""
echo "Deployment completato!"
