# Istruzioni per Completare le Modifiche al Flusso Create_New_Donation

## Modifiche Completate

1. ✅ Componente LWC `donationTableEditor` creato
2. ✅ Screen "Inserisci_Nuova_Donazione" modificato per usare il componente
3. ✅ Variabili aggiunte per gestire più donazioni
4. ✅ Action invocabile per parsare il JSON aggiunta
5. ✅ Decisione per verificare donazioni multiple aggiunta
6. ✅ Loop per creare più donazioni aggiunto
7. ✅ Nuova schermata di chiusura per donazioni multiple aggiunta

## Modifiche da Completare nel Flow Builder

### 1. Configurare i JSON delle Opzioni per il Componente

Il componente LWC ha bisogno dei JSON delle opzioni per i dropdown. Attualmente sono impostati come array vuoti `[]`. Devi:

1. Aprire il flusso nel Flow Builder
2. Trovare lo screen "Inserisci_Nuova_Donazione"
3. Selezionare il componente "Donation_Table_Editor"
4. Configurare i parametri di input:
   - **availableProgramsJson**: Crea una formula o variabile che genera il JSON dei programmi disponibili
   - **availablePaymentMethodsJson**: Crea una formula o variabile che genera il JSON dei metodi di pagamento
   - **availableDonorTypesJson**: Crea una formula o variabile che genera il JSON dei tipi donatore

**Opzione A - Usare Action Invocabile (Consigliato):**
- Aggiungi un'action invocabile "FlowController.getPicklistJSON" prima dello screen
- Configura i parametri per ottenere i JSON delle picklist
- Passa i risultati al componente

**Opzione B - Creare Formule Manuali:**
- Crea formule che costruiscono manualmente i JSON strings con i valori delle picklist

### 2. Completare il Parsing del JSON per Ogni Donazione

Nel loop "Loop_Create_Multiple_Donations", devi:

1. Aggiungere assignments per estrarre i dati dal JSON corrente (`currentDonationJson`)
2. Parsare il JSON e assegnare i valori alle variabili:
   - `Nome_della_Donazione`
   - `Tipo`
   - `Data_di_ricezione`
   - `Trattenuta`
   - `Programma`
   - `Ammontare`
   - `Data_di_Competenza`
   - `Metodo_di_pagamento`

**Nota:** Flow Builder non supporta il parsing JSON nativo. Puoi:
- Usare un metodo Apex invocabile per parsare il JSON
- Oppure creare assignments manuali che estraggono i valori usando formule

### 3. Gestire la Selezione del Donatore per Ogni Donazione

Nel caso di donazioni multiple, ogni donazione richiede la selezione del donatore. Devi:

1. Modificare il flusso per gestire la selezione del donatore nel loop
2. Oppure, se tutte le donazioni hanno lo stesso donatore, selezionare il donatore una volta prima del loop

### 4. Creare le Donazioni nel Loop

Nel loop, devi:

1. Usare l'assignment "generate_donation" esistente (o crearne uno nuovo) per popolare `current_donation`
2. Creare la donazione usando "Create_Donation"
3. Gestire la creazione della transazione per ogni donazione
4. Gestire l'assegnazione del donatore per anno per ogni donazione

### 5. Verificare il Flusso per Donazione Singola

Assicurati che quando c'è una sola donazione (`populatedRowsCount = 1`), il flusso:
1. Segua il percorso normale attraverso "Tipo_Donatore"
2. Permetta la selezione del donatore
3. Crei la donazione
4. Mostri la schermata "Assegna_Budgets" per la distribuzione

### 6. Testare il Flusso

Testa il flusso con:
- Una sola donazione
- Più donazioni (2+)
- Verifica che le donazioni vengano create correttamente
- Verifica che la schermata di chiusura corretta venga mostrata

## Note Importanti

1. Il componente LWC restituisce `donationsDataJson` (stringa JSON) e `populatedRowsCount` (numero)
2. L'action invocabile "Parse_Donations_JSON" converte il JSON in una collection di stringhe JSON (una per donazione)
3. Il loop itera su `parsedDonationsJson` per creare ogni donazione
4. Quando ci sono più donazioni, il flusso salta "Assegna_Budgets" e mostra "Fine_Multiple_Donations"

## Struttura del JSON delle Donazioni

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

Se hai problemi con le modifiche, verifica:
1. Che il componente LWC sia deployato correttamente
2. Che le variabili del flusso siano configurate correttamente
3. Che i connettori tra gli elementi del flusso siano corretti
4. Che le action invocabili siano configurate correttamente
