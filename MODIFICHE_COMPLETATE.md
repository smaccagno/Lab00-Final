# Modifiche Completate - Flusso Creazione Donazioni Semplificato

## Riepilogo

Il flusso di creazione donazioni è stato semplificato spostando tutta la logica di creazione all'interno del componente LWC `donationTableEditor`. Il componente ora gestisce:

1. ✅ Inserimento dati donazioni in una tabella editabile
2. ✅ Selezione del donatore
3. ✅ Creazione delle donazioni e transazioni tramite Apex
4. ✅ Chiamata al subflow "Assegna_Donatore_Anno" per ogni donazione

## Componenti Modificati/Creati

### 1. Componente LWC `donationTableEditor`
**File:** `force-app/main/default/lwc/donationTableEditor/`

- **donationTableEditor.js**: Gestisce la tabella editabile, selezione donatore, e creazione donazioni
- **donationTableEditor.html**: UI con tabella e selezione donatore
- **donationTableEditor.js-meta.xml**: Metadata del componente

**Funzionalità:**
- Tabella editabile con righe aggiungibili/rimovibili
- Validazione campi obbligatori
- Selezione donatore integrata
- Chiamata metodo Apex per creare donazioni
- Navigazione automatica al prossimo step del Flow

### 2. Classe Apex `DonationCreationController`
**File:** `force-app/main/default/classes/DonationCreationController.cls`

**Metodi:**
- `createDonations()`: Crea donazioni e transazioni, chiama subflow per assegnazione donatore
- `getDonorsForProgram()`: Ottiene lista donatori per un programma
- `createDonationsFromFlow()`: Metodo invocabile per Flow

**Funzionalità:**
- Parsing JSON donazioni
- Validazione dati
- Creazione donazioni (GiftEntry)
- Creazione transazioni (GiftTransaction)
- Chiamata subflow "Assegna_Donatore_Anno" per ogni donazione
- Gestione errori

### 3. Flusso `Create_New_Donation`
**File:** `force-app/main/default/flows/Create_New_Donation.flow-meta.xml`

**Modifiche:**
- Screen "Inserisci_Nuova_Donazione" ora usa il componente LWC
- Rimossa logica complessa di parsing JSON e loop
- Rimossa selezione donatore (ora gestita nel componente)
- Rimossa creazione donazioni (ora gestita nel componente)
- Aggiunta decisione "Check_Multiple_Donations" per verificare se ci sono più donazioni
- Aggiunta schermata "Fine_Multiple_Donations" per donazioni multiple
- Per donazione singola: mostra schermata "Assegna_Budgets" per distribuzione
- Per donazioni multiple: mostra schermata di chiusura con istruzioni

## Flusso Semplificato

### Donazione Singola
1. Screen con componente LWC → inserimento dati
2. Componente crea donazione → naviga al prossimo step
3. Flow verifica: `populatedRowsCount = 1`
4. Ottiene donazione creata
5. Mostra schermata "Assegna_Budgets" per distribuzione

### Donazioni Multiple
1. Screen con componente LWC → inserimento dati multiple
2. Componente crea tutte le donazioni → naviga al prossimo step
3. Flow verifica: `populatedRowsCount > 1`
4. Mostra schermata "Fine_Multiple_Donations" con istruzioni

## Variabili Flow

### Nuove Variabili
- `populatedRowsCount` (Number): Numero di righe popolate
- `createdDonationIds` (String Collection): ID delle donazioni create
- `donationsCreated` (Boolean): Flag che indica se le donazioni sono state create
- `firstCreatedDonationId` (String): ID della prima donazione creata (per donazione singola)

### Variabili Rimosse
- `donationsDataJson`: Non più necessaria (gestita nel componente)
- `parsedDonationsJson`: Non più necessaria
- `currentDonationJson`: Non più necessaria
- `donations_list`: Non più necessaria
- `current_donation`: Non più necessaria

## Note Importanti

1. **Nome Flusso Apex**: Il metodo Apex chiama il subflow "Assegna_Donatore_Anno". Se il nome del flusso cambia, aggiornare il metodo `createDonations()` in `DonationCreationController.cls`.

2. **JSON Opzioni**: Il componente riceve i JSON delle opzioni (programmi, metodi pagamento, tipi donatore) come parametri. Questi devono essere configurati nel Flow Builder passando le stringhe JSON corrette.

3. **Program ID**: Il componente può ricevere un `programId` opzionale. Se fornito, carica automaticamente i donatori per quel programma.

4. **Record Type**: Il componente può ricevere un `recordTypeId` opzionale per filtrare i donatori per record type.

5. **Gestione Errori**: Il componente mostra toast per errori e successi. Gli errori vengono anche restituiti nel risultato del metodo Apex.

## Prossimi Passi

1. **Configurare JSON Opzioni nel Flow**: Nel Flow Builder, configurare i parametri del componente:
   - `availableProgramsJson`: JSON array con `[{label: "...", value: "..."}]`
   - `availablePaymentMethodsJson`: JSON array con opzioni metodi pagamento
   - `availableDonorTypesJson`: JSON array con opzioni tipi donatore

2. **Testare il Flusso**:
   - Test con una donazione singola
   - Test con più donazioni
   - Verificare che le donazioni vengano create correttamente
   - Verificare che le transazioni vengano create
   - Verificare che il subflow "Assegna_Donatore_Anno" venga chiamato

3. **Verificare Nome Flusso**: Se il nome del flusso "Assegna_Donatore_Anno" non corrisponde al nome API, aggiornare il metodo Apex.

## Struttura JSON Donazioni

Ogni donazione nel JSON ha questa struttura:
```json
{
  "Nome_della_Donazione": "string",
  "Tipo": "string",
  "Data_di_ricezione": "YYYY-MM-DD",
  "Trattenuta": number,
  "Programma": "string (ID)",
  "Ammontare": number,
  "Data_di_Competenza": "YYYY-MM-DD",
  "Metodo_di_pagamento": "string"
}
```

## Supporto

Per problemi o domande:
1. Verificare i log di debug in Apex
2. Verificare i toast nel componente LWC
3. Verificare che le variabili del Flow siano configurate correttamente
4. Verificare che i connettori tra gli elementi del Flow siano corretti
