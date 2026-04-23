# Budget Designer — Versioning & Lifecycle

Spec del 2026-04-23.

## 1. Contesto e obiettivo

Oggi `budgetDesigner` è uno scratchpad: l'utente compila righe Incassi e Spese per un anno, il draft vive in `localStorage` e non c'è alcun concetto di "salvataggio in studio" né di "trasformazione in record di Budget reali".

Obiettivo: trasformare il Designer in uno strumento di **studio del budget annuale** con versioni multiple, ciclo di vita (Provvisorio → Ufficiale → Storicizzato), auto-recupero tra sessioni e materializzazione controllata verso i record `Voce_di_Incasso__c` / `Voce_di_Spesa__c`. Un solo utente lavora sull'app.

Vincolo di business chiave: **un solo Budget Ufficiale per Anno**. La Ufficiale è l'unica fonte di verità per le Previste di quell'anno. Le voci Effettive caricate dagli Excel Editor non sono governate dal Budget.

## 2. Cambi al data model

### 2.1 Nuovi oggetti

**`Budget_Version__c`** — contenitore di una versione di budget per un anno.

| Campo | Tipo | Note |
|---|---|---|
| `Anno__c` | Number(4,0) | es. 2026 |
| `Nome__c` | Text(80) | Nome scenario, editabile via dialog Rinomina |
| `Descrizione__c` | LongTextArea(1000) | |
| `Stato__c` | Picklist | `Provvisorio`, `Ufficiale`, `Storicizzata`, `Cestinata` |
| `Numero_Versione__c` | Number(3,0) | Progressivo per Anno; calcolato a `createVersion` come `max+1` |
| `Data_Promozione__c` | DateTime | Valorizzato alla promozione a Ufficiale |
| `Promossa_Da__c` | Lookup(User) | Idem |
| `Sostituisce__c` | Lookup(Budget_Version__c) | Puntatore alla Storicizzata precedente (audit) |
| `Anno_Se_Ufficiale__c` | Formula(Text) | `IF(ISPICKVAL(Stato__c,'Ufficiale'), TEXT(Anno__c), null)` — usato come External ID Unique per garantire 1 sola Ufficiale per anno |

**`Budget_Version_Item__c`** — riga del Designer in pre-materializzazione. Vive solo finché la versione è Provvisorio (e resta anche dopo la promozione come traccia storica della versione, ma non viene più modificato).

| Campo | Tipo | Note |
|---|---|---|
| `Budget_Version__c` | MD Lookup(Budget_Version__c) | Cascade delete |
| `Tipo__c` | Picklist | `Incasso`, `Spesa` |
| `Programma__c` | Lookup(Program) | Richiesto — allineato con `Voce_di_Spesa__c.Programma__c` che referenzia `Program` |
| `Categoria__c` | Text(40) | |
| `Sottocategoria__c` | Text(40) | Solo `Tipo__c = Spesa` |
| `Nome__c` | Text(80) | |
| `Data__c` | Date | |
| `Ammontare__c` | Currency(14,2) | |
| `Note__c` | Text(255) | Solo Spesa |
| `Sort_Order__c` | Number(6,0) | Per il drag-reorder; per-versione, per-tipo |

### 2.2 Campi aggiunti ai record esistenti

- `Voce_di_Incasso__c.Budget_Version__c` → Lookup(`Budget_Version__c`), **nullable**.
- `Voce_di_Spesa__c.Budget_Version__c`   → Lookup(`Budget_Version__c`), **nullable**.
- `Voce_di_Incasso__c.Nome__c` → Text(80), **nullable** (nuovo, serve al Designer per distinguere voci con stessi campi).
- `Voce_di_Spesa__c.Nome__c`   → Text(80), **nullable** (già desiderato, oggi non presente).

`Budget_Version__c` è nullable perché le voci **Effettive** caricate dagli Excel Editor non appartengono ad alcuna versione.

### 2.3 Validation rules

Su `Budget_Version__c`:
- `Cannot rename Ufficiale`: `AND(ISPICKVAL(Stato__c,'Ufficiale'), ISCHANGED(Nome__c))` → errore.
- `Cannot trash Ufficiale`: `AND(ISPICKVAL(Stato__c,'Cestinata'), ISPICKVAL(PRIORVALUE(Stato__c),'Ufficiale'))` → errore.
- Unique: `Anno_Se_Ufficiale__c` marcato External ID Unique (case-sensitive ininfluente perché è solo cifre).

Su `Budget_Version_Item__c`:
- Nessuna validation rule dichiarativa. I vincoli sono nel controller (vedi 4.3).

### 2.4 Cambi collaterali agli Excel Editor

`SpeseExcelEditorController` / `IncassiExcelEditorController` e relativi LWC:
- **Rimuovere** la colonna/picklist `Stato` dall'UI.
- Nel controller server: **forzare** `Stato__c = 'Effettiva'` all'insert (ignorare eventuale valore dal client come difesa in profondità).
- Nessun filtro su `Budget_Version__c`: resta null.

## 3. Ciclo di vita

```
           CREATE           FORK (da Ufficiale)
              │                 │
              ▼                 ▼
      ┌───────────────┐   ┌───────────────┐
      │  Provvisorio  │◀──│  Provvisorio  │ (copia degli Item)
      │   (editabile) │   │   (editabile) │
      └───────┬───────┘   └───────┬───────┘
              │ PROMOTE           │ PROMOTE
              ▼                   ▼
      ┌───────────────┐
      │   Ufficiale   │◀── la precedente Ufficiale (se esiste) va in Storicizzata,
      │  (read-only)  │    le sue Voci Previste vengono hard-deleted,
      └───────┬───────┘    le Voci della nuova vengono inserite.
              │ CESTINA non permesso
              │ MODIFICA riga → fork automatico (popup conferma)
              ▼
        altro PROMOTE di un fork

      ┌───────────────┐
      │ Storicizzata  │  (read-only, sola consultazione)
      └───────────────┘

      ┌───────────────┐
      │   Cestinata   │  (soft delete; invisibile nelle combobox)
      └───────────────┘
```

### 3.1 Azioni

- **CREATE**: crea `Budget_Version__c` con `Stato='Provvisorio'`, `Numero_Versione__c = max+1` per l'anno, nessun Item.
- **FORK**: crea una nuova Provvisorio copiando tutti gli `Budget_Version_Item__c` della sorgente (Ufficiale). La sorgente resta intatta.
- **PROMOTE**: transazione atomica descritta in 4.2. Una sola Ufficiale per Anno.
- **TRASH**: soft delete (`Stato='Cestinata'`). Rifiutato sulle Ufficiali. Le Cestinate scompaiono dalla combobox. Hard-delete possibile in futuro via job manuale (non in scope).
- **MODIFICA riga su Ufficiale**: popup "Stai per modificare la Ufficiale. Verrà creata una copia Provvisoria v{N+1}. Procedere?" → se OK, fork + passaggio alla nuova versione con la riga cliccata già in Edit mode.

## 4. API Apex

Nuovo controller: `BudgetVersionController`. Tutti i metodi `@AuraEnabled`. `cacheable=true` solo sulle letture.

### 4.1 DTO

```apex
public class BudgetVersionDTO {
    @AuraEnabled public Id id;
    @AuraEnabled public Integer anno;
    @AuraEnabled public Integer numeroVersione;
    @AuraEnabled public String nome;
    @AuraEnabled public String descrizione;
    @AuraEnabled public String stato;          // 'Provvisorio' | 'Ufficiale' | 'Storicizzata'
    @AuraEnabled public Datetime dataPromozione;
    @AuraEnabled public String promossaDaName;
    @AuraEnabled public Id sostituisceId;
}

public class BudgetVersionDetailDTO {
    @AuraEnabled public BudgetVersionDTO header;
    @AuraEnabled public List<Budget_Version_Item__c> items;  // ordinati per Tipo,SortOrder
}

public class ItemOrder {
    @AuraEnabled public Id itemId;
    @AuraEnabled public Integer sortOrder;
}
```

### 4.2 Letture (cacheable=true)

- `getVersionsByYear(Integer anno) : List<BudgetVersionDTO>`
  - Esclude `Stato__c = 'Cestinata'`. Ordina per `Numero_Versione__c DESC`.
- `getVersionDetail(Id versionId) : BudgetVersionDetailDTO`
  - Include tutti gli Item. Usato al cambio versione per popolare le tabelle.

### 4.3 Mutazioni versione

- `createVersion(Integer anno, String nome, String descrizione) : Id`
  - Calcola `Numero_Versione__c` via `SELECT MAX(Numero_Versione__c) FROM Budget_Version__c WHERE Anno__c=:anno`.
- `forkVersion(Id sourceVersionId) : Id`
  - Legge source (qualsiasi stato), crea nuova Provvisorio, copia gli Item (clone, rimuove Id, reimposta Budget_Version__c).
- `updateVersionHeader(Id versionId, String nome, String descrizione) : void`
  - Rifiuta se la versione non è `Provvisorio`.
- `trashVersion(Id versionId) : void`
  - Set `Stato__c='Cestinata'`. Rifiuta se era Ufficiale (validation rule lo blocca anche a DB).
- `promoteVersion(Id versionId) : void` → vedi 4.4.

### 4.4 `promoteVersion` — transazione atomica

```
1. SELECT ... FROM Budget_Version__c WHERE Id=:versionId FOR UPDATE
   -- verifica Stato='Provvisorio', altrimenti throw.
2. SELECT Id FROM Budget_Version__c WHERE Anno__c=:nuova.Anno__c AND Stato__c='Ufficiale' FOR UPDATE
   -- ufficialePrec (0 o 1 record).
3. Savepoint sp;
   try:
     3a. Se ufficialePrec != null:
         delete [... Voce_di_Incasso__c WHERE Budget_Version__c=:ufficialePrec.Id];
         delete [... Voce_di_Spesa__c   WHERE Budget_Version__c=:ufficialePrec.Id];
         ufficialePrec.Stato__c = 'Storicizzata'; update ufficialePrec;
         nuova.Sostituisce__c = ufficialePrec.Id;
     3b. items = [SELECT ... FROM Budget_Version_Item__c WHERE Budget_Version__c=:versionId ORDER BY Sort_Order__c];
         materializza in due liste Voce_di_Incasso__c / Voce_di_Spesa__c
         (Stato__c='Prevista', Budget_Version__c=versionId, copia Nome/Categoria/...)
         insert incassi; insert spese;
     3c. nuova.Stato__c = 'Ufficiale';
         nuova.Data_Promozione__c = System.now();
         nuova.Promossa_Da__c = UserInfo.getUserId();
         update nuova;
   catch Exception e:
     Database.rollback(sp);
     throw new AuraHandledException('Promozione fallita: ' + e.getMessage());
```

**Limiti governor noti e non coperti**: >10.000 Item → DML limit; >50.000 Previste preesistenti → SOQL row limit. Realisticamente fuori scope per Lab00 (budget annuale con <500 voci).

**Concorrenza**: non coperta (scenario mono-utente dichiarato). `FOR UPDATE` sui tre SELECT come rete minima contro race al promote se in futuro cambiasse.

### 4.5 Mutazioni riga

- `upsertItem(Budget_Version_Item__c item) : Id`
  - Verifica che la versione referenziata sia Provvisorio. Upsert singolo (1 chiamata per riga confermata o aggiunta).
- `deleteItem(Id itemId) : void`
  - Verifica stato Provvisorio sulla versione parent.
- `reorderItems(List<ItemOrder> orders) : void`
  - Aggiornamento bulk del `Sort_Order__c`. Usato a fine drag & drop.

## 5. UI/UX `budgetDesigner`

### 5.1 Nuovo header

Sopra le tabelle, un hero con:

```
┌─────────────────────────────────────────────────────────────┐
│ 🗂 Budget Designer                                           │
│                                                             │
│ Anno ▼ [ 2026 ]    Versione ▼ [ v2 — Provvisorio ]          │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Definizione Budget per l'Anno 2026 — Versione 2         │ │
│ │ "Scenario ottimistico"                                   │ │
│ │ Nota: scenario con +20% donazioni da campagna natale    │ │
│ │ [🏷 Rinomina]  [🗑 Cestina]  [✅ Conferma Budget]         │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Sfondo del banner** cambia in base allo Stato della versione attiva:
- `Provvisorio` → gradient `#fff7ec → #ffe7c2` (arancione chiaro)
- `Ufficiale` → gradient `#eaf4fd → #d2e7fa` (azzurro)
- `Storicizzata` → gradient `#f4f6fb → #e8eef7` (grigio) + badge "Sostituita il DD/MM/YYYY"

**Visibilità tasti**:
- `Rinomina`: solo su Provvisorio (apre dialog Nome+Descrizione).
- `Cestina`: su Provvisorio e Storicizzata (ma Storicizzata è comunque raro cestinarla).
- `Conferma Budget`: solo su Provvisorio; disabilitato se ci sono righe in Edit mode non confermate.

### 5.2 Combobox Anno e Versione

- **Anno**: lista statica `currentYear-2 .. currentYear+3` (come oggi).
- **Versione**: popolata da `getVersionsByYear(anno)`. Formato opzione: `"v{N} — {Stato} ({data_promozione se Ufficiale, o data_creazione altrimenti}) — {nome_se_presente}"`.
- In fondo alla combobox, una voce speciale:
  - `+ Nuova versione per questo anno` → apre dialog "Crea versione: Nome + Descrizione + [Crea]". Crea via `createVersion`, seleziona la nuova.
- **Cambio versione**: se ci sono righe in Edit con modifiche → popup "Hai modifiche non salvate. [Conferma tutte] [Annulla tutte] [Resta qui]". Il popup **non** viene mostrato se tutte le righe sono in View mode.

### 5.3 Prima apertura di un Anno senza versioni

Banner centrale: "Nessun budget ancora per il 2026" + tasto `[Crea prima versione]` che apre la stessa dialog. Nessun auto-create silenzioso.

### 5.4 Tabelle Incassi e Spese

Rispetto all'attuale:
- **Nuova colonna Programma** subito dopo la maniglia drag, come `lightning-combobox` (popolata con i GiftDesignation attivi via `getProgrammi` — endpoint già esistente se no nuovo). Obbligatoria.
- Ogni riga ha 2 stati:

  **View mode** (default):
  - Celle render come testo read-only.
  - A fine riga: `[✏ Modifica]` `[📋 Copia]` `[⧉ Duplica]` `[✕ Rimuovi]`.

  **Edit mode** (dopo click su Modifica, o riga appena aggiunta):
  - Celle diventano `lightning-input` / `lightning-combobox`.
  - Sfondo riga: giallo chiaro (`#fffdf2` come già esiste per draft).
  - A fine riga: `[✅ Conferma] [↩ Annulla]` (niente altri tasti).
  - `Conferma` chiama `upsertItem`. `Annulla` ripristina i valori originali (cached client-side) e torna View mode.
  - Il tasto Conferma è **disabilitato** se non c'è alcuna modifica rispetto al valore originale.

- **Draft row in fondo** (sempre in Edit implicito): come oggi, ma alla conferma il Programma è obbligatorio. Tasto `[+ Aggiungi]` chiama `upsertItem` e la riga diventa View mode in tabella.

- **Drag & drop**: come oggi. `ondragend` → `reorderItems`.

### 5.5 Righe Ufficiale / Storicizzata

Su versioni non Provvisorie il set di tasti a fine riga cambia:
- **Ufficiale**: le righe mostrano `[🔓 Modifica]` con icona di fork. Al click → popup "Stai per modificare la versione Ufficiale. Verrà creata una copia Provvisoria v{N+1}. Procedere?" → Se OK: fork + apertura in Edit sulla nuova versione, con la riga cliccata già in Edit. Se Annulla: niente.
- **Storicizzata**: nessun tasto riga, solo consultazione.

### 5.6 Sidebar sinistra ora sopra la sidebar destra

Layout corrente: tre colonne (sidebar sx, tabelle, overview dx). Cambio:
- Una colonna principale con **sidebar sx in alto sopra overview dx** (riorganizzazione verticale della colonna laterale).
- Le tabelle restano nella colonna centrale più larga.
- La sidebar sx diventa una **banda laterale superiore** nella colonna destra, sotto di essa la Vista Omnicomprensiva.

Concretamente in CSS: grid-template cambiato da 3-col a 2-col; colonna destra diventa un flex-column con pannello Impostazioni in alto e Overview sotto.

### 5.7 Rimozioni dall'UI corrente

- Pulsante **Esporta JSON** → rimosso.
- Pulsante **Svuota progetto** → rimosso (il cestinamento versione lo sostituisce).
- Pulsante **Trasforma in record** → rinominato **Conferma Budget** (ora è `promoteVersion`).
- **localStorage draft** → rimosso: la verità è server-side, gli Item sono autoritativi.

### 5.8 Dialog "Rinomina versione"

`lightning-modal` custom o template inline: due `lightning-input` (Nome, Descrizione) + `[Annulla] [Salva]`. Al salva → `updateVersionHeader`.

### 5.9 Dialog "Cestina versione"

Conferma "Cestinare la versione v{N} '{nome}'? Potrà essere recuperata manualmente da Salesforce ma non comparirà più nella lista." → `trashVersion`.

### 5.10 Dialog "Conferma Budget"

Conferma "Promuovere v{N} a Ufficiale per l'anno {anno}? {se esiste prec: Verranno rimosse le {N} voci Previste dell'attuale Ufficiale v{P}.}" → `promoteVersion`. Mostra spinner durante la transazione (può durare se ci sono molte voci).

## 6. Impatti su altri componenti

- **`budgetAppDashboard`**: nessun cambio. Continua a leggere le Voci con i filtri esistenti. Le Previste ora vengono solo dal Budget Ufficiale (invariante garantita dal promote).
- **`BudgetSummaryController`**, **`BudgetAggregator`**: nessun cambio. Il concetto di `Budget_Version__c` è interno al flusso di promozione.
- **`SpeseExcelEditor` / `IncassiExcelEditor`**: modifiche descritte in 2.4 (rimuovere colonna Stato, forzare Effettiva).
- **Profile Admin**: nuove field permissions su `Budget_Version__c.*`, `Budget_Version_Item__c.*`, `Voce_di_*.Budget_Version__c`, `Voce_di_*.Nome__c`.

## 7. Migrazione dati esistenti

Alla deploy ci saranno:
- Voci `Stato__c='Prevista'` esistenti con `Budget_Version__c = null` (create prima del versioning).
- Voci `Stato__c='Effettiva'` o `Annullata` con `Budget_Version__c = null` (legittime, restano così).

**Trattamento delle Previste orfane**: nessuna azione automatica. Restano visibili in dashboard fino a che l'utente non promuove una nuova Ufficiale per quell'anno (che **non** le toccherà, perché il promote cancella solo le Previste della Ufficiale precedente, non quelle orfane).

**Responsabilità utente**: l'utente è consapevole che quelle voci orfane sono "fuori budget" e non saranno rimpiazzate. Se vuole pulirle, lo fa manualmente da Salesforce (o con una lista view + mass delete). Nessun tool di migrazione fornito in questo spec.

## 8. File toccati (preview)

**Nuovi**:
- `force-app/main/default/objects/Budget_Version__c/*` + fields + validationRules
- `force-app/main/default/objects/Budget_Version_Item__c/*` + fields
- `force-app/main/default/objects/Voce_di_Incasso__c/fields/Budget_Version__c.field-meta.xml`
- `force-app/main/default/objects/Voce_di_Incasso__c/fields/Nome__c.field-meta.xml`
- `force-app/main/default/objects/Voce_di_Spesa__c/fields/Budget_Version__c.field-meta.xml`
- `force-app/main/default/objects/Voce_di_Spesa__c/fields/Nome__c.field-meta.xml`
- `force-app/main/default/classes/BudgetVersionController.cls` + test
- `force-app/main/default/profiles/Admin.profile-meta.xml` (field permissions)

**Modificati**:
- `force-app/main/default/lwc/budgetDesigner/*` (js+html+css): hero, selettori, modalità View/Edit riga, dialog Rinomina/Cestina/Conferma, rimozione Esporta JSON/Svuota/localStorage, colonna Programma
- `force-app/main/default/classes/SpeseExcelEditorController.cls` (forza Effettiva)
- `force-app/main/default/classes/IncassiExcelEditorController.cls` (forza Effettiva)
- `force-app/main/default/lwc/speseExcelEditor/*` (rimuove colonna Stato)
- `force-app/main/default/lwc/incassiExcelEditor/*` (rimuove colonna Stato) — verificare esatto nome componente

## 9. Non-goal

- Gestione concorrente/multi-utente (lock, heartbeat, notifiche real-time).
- Hard-delete automatico delle versioni Cestinate dopo N giorni.
- Migrazione automatica delle Previste orfane.
- Esportazione JSON del budget (rimosso).
- Template di budget (copia da un anno precedente): il fork permette di copiare tra versioni nello **stesso** anno, non tra anni. Cross-year copy fuori scope.
- Approval process formale (es. revisore → approvatore): il promote è un gesto singolo dell'utente.
