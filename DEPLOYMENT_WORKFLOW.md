# Workflow di Deployment con GitHub

## Struttura dei Branch

- **`main`**: Branch principale che rappresenta lo stato di PROD
- **`versione-con-inserimento-massivo`**: Branch di sviluppo che contiene tutte le funzionalità di inserimento massivo fatture

## Organizzazioni Salesforce

- **DEV**: Allineata al branch `versione-con-inserimento-massivo`
- **PROD**: Allineata al branch `main` (o al branch specifico se diverso)

## Processo di Deployment da GitHub

### 1. Identificare le Differenze

Per vedere le differenze tra il branch di sviluppo e PROD:

```bash
# Confronta il branch di sviluppo con main (PROD)
git diff main..versione-con-inserimento-massivo --name-only

# Vedi le differenze dettagliate
git diff main..versione-con-inserimento-massivo
```

### 2. Selezionare i File da Deployare

Usa GitHub per:
- Creare un Pull Request da `versione-con-inserimento-massivo` a `main`
- Esaminare i file modificati nella PR
- Selezionare solo i file che vuoi deployare in PROD

### 3. Deployare le Modifiche Selezionate

#### Opzione A: Deploy da File Specifici

```bash
# Deploy di file specifici
sf project deploy start \
  --source-dir force-app/main/default/lwc/invoiceExcelEditor \
  --source-dir force-app/main/default/classes/InvoiceExcelEditorController.cls \
  --target-org PROD \
  --test-level RunLocalTests \
  --wait 10
```

#### Opzione B: Deploy da Branch Git (Differenze)

```bash
# 1. Assicurati di essere sul branch corretto
git checkout versione-con-inserimento-massivo

# 2. Crea un branch temporaneo con solo le modifiche selezionate
git checkout -b deploy-selected-changes

# 3. Seleziona i file da includere (esempio)
git checkout main -- force-app/main/default/classes/SomeOtherClass.cls  # Escludi questo
# I file che vuoi deployare sono già nel branch

# 4. Deploya tutto il contenuto del branch corrente
sf project deploy start \
  --source-dir force-app/main/default \
  --target-org PROD \
  --test-level RunLocalTests \
  --wait 10 \
  --manifest manifest/package.xml  # Opzionale: usa un manifest specifico
```

#### Opzione C: Usare un Manifest Package.xml

1. Crea un `manifest/package.xml` con solo i componenti che vuoi deployare:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>invoiceExcelEditor</members>
        <name>LightningComponentBundle</name>
    </types>
    <types>
        <members>InvoiceExcelEditorController</members>
        <name>ApexClass</name>
    </types>
    <!-- Aggiungi altri componenti necessari -->
    <version>65.0</version>
</Package>
```

2. Deploya usando il manifest:

```bash
sf project deploy start \
  --manifest manifest/package.xml \
  --target-org PROD \
  --test-level RunLocalTests \
  --wait 10
```

### 4. Verificare il Deployment

```bash
# Verifica lo stato del deployment
sf project deploy report --job-id <DEPLOY_ID>

# Verifica che i componenti siano stati deployati correttamente
sf org list metadata --metadata-type LightningComponentBundle --target-org PROD | grep invoiceExcelEditor
```

### 5. Aggiornare il Branch PROD (opzionale)

Dopo un deployment riuscito, puoi mergeare le modifiche in `main`:

```bash
# Mergea le modifiche deployate in main
git checkout main
git merge versione-con-inserimento-massivo --no-ff -m "Merge: Deploy inserimento massivo fatture in PROD"
git push origin main
```

## Best Practices

1. **Sempre testare in DEV prima di PROD**: Assicurati che tutto funzioni in DEV prima di deployare in PROD
2. **Usa Pull Requests**: Crea sempre una PR per rivedere le modifiche prima del merge
3. **Documenta le modifiche**: Usa commit message chiari e descrittivi
4. **Verifica i test**: Assicurati che tutti i test passino prima del deployment
5. **Backup**: Prima di deployare modifiche significative, considera di fare un backup

## Script Helper

È disponibile uno script helper per semplificare il deployment:

```bash
# Deploy da versione-con-inserimento-massivo a PROD
./scripts/deploy-from-github.sh PROD

# Deploy da versione-con-inserimento-massivo a DEV
./scripts/deploy-from-github.sh DEV

# Deploy da un branch specifico
./scripts/deploy-from-github.sh PROD feature-branch main
```

Lo script:
1. Mostra le differenze tra i branch
2. Chiede conferma prima di procedere
3. Crea un branch temporaneo
4. Esegue il deployment
5. Offre di mergeare in main se il deployment a PROD è riuscito

## Comandi Utili

```bash
# Vedi lo stato corrente
git status

# Vedi i branch disponibili
git branch -a

# Vedi le differenze tra branch
git diff main..versione-con-inserimento-massivo

# Vedi i commit su un branch
git log main..versione-con-inserimento-massivo

# Crea un manifest da un branch
sf project generate manifest --source-dir force-app/main/default --name package-from-branch

# Vedi solo i file modificati (senza contenuto)
git diff --name-only main..versione-con-inserimento-massivo

# Vedi le differenze per tipo di componente
git diff --name-only main..versione-con-inserimento-massivo | grep "\.cls$"
git diff --name-only main..versione-con-inserimento-massivo | grep "lwc/"
```

## Note Importanti

- Il branch `versione-con-inserimento-massivo` contiene tutte le modifiche per l'inserimento massivo
- PROD dovrebbe essere sempre allineata a `main` o al branch di produzione designato
- Usa GitHub PR per rivedere e selezionare le modifiche prima del deployment
- Mantieni sempre sincronizzati DEV e il branch di sviluppo
