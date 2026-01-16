# Sincronizzazione Automatica Git/GitHub dopo Deploy

## Panoramica

Questo progetto è configurato per sincronizzare automaticamente le modifiche su Git e GitHub dopo ogni deploy su DEV.

## Come Funziona

Dopo ogni deploy di successo su DEV, viene eseguito automaticamente:
1. **Commit** delle modifiche con un messaggio descrittivo
2. **Push** su GitHub (branch `main`)

## Utilizzo

### Metodo 1: Script NPM (Consigliato)

```bash
# Deploy e sincronizzazione automatica
npm run deploy:dev:sync

# Solo sincronizzazione Git/GitHub
npm run git:sync "Messaggio personalizzato del commit"
```

### Metodo 2: Script Bash Diretto

```bash
# Con messaggio personalizzato
./scripts/git-sync.sh "Deploy su DEV: Fix validazione celle"

# Con messaggio automatico (data/ora)
./scripts/git-sync.sh
```

### Metodo 3: Manuale

```bash
# Dopo un deploy di successo
git add .
git commit -m "Deploy su DEV: Descrizione modifiche"
git push origin main
```

## Messaggi di Commit

I messaggi di commit seguono questo formato:
- **Automatico**: `Deploy su DEV: YYYY-MM-DD HH:MM:SS`
- **Personalizzato**: Qualsiasi messaggio fornito come parametro

Esempi di messaggi descrittivi:
- `Deploy su DEV: Fix validazione celle invoiceExcelEditor`
- `Deploy su DEV: Aggiunta funzionalità expand/collapse visite`
- `Deploy su DEV: Correzione errore assegnazioneFattureADonatore`

## Note Importanti

- Lo script verifica automaticamente se ci sono modifiche da committare
- Se non ci sono modifiche, lo script termina senza errori
- Il push viene eseguito solo se il commit ha successo
- Assicurati di avere le credenziali GitHub configurate (SSH o HTTPS)

## Configurazione Credenziali GitHub

### SSH (Consigliato)
1. Genera una chiave SSH: `ssh-keygen -t ed25519 -C "tua.email@example.com"`
2. Aggiungi la chiave pubblica su GitHub: Settings → SSH and GPG keys
3. Configura il remote: `git remote set-url origin git@github.com:smaccagno/Lab00-Final.git`

### HTTPS
1. Usa un Personal Access Token invece della password
2. Configura il remote: `git remote set-url origin https://github.com/smaccagno/Lab00-Final.git`

## Troubleshooting

**Errore: "Host key verification failed"**
- Configura le chiavi SSH o usa HTTPS

**Errore: "could not read Username"**
- Configura le credenziali Git: `git config credential.helper store`

**Errore: "Permission denied"**
- Verifica di avere i permessi sul repository GitHub
