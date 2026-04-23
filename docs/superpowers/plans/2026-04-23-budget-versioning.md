# Budget Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere ciclo di vita delle versioni di budget (Provvisorio → Ufficiale → Storicizzata → Cestinata) al `budgetDesigner`, con materializzazione controllata verso `Voce_di_Incasso__c` / `Voce_di_Spesa__c` e vincolo di una sola versione Ufficiale per Anno.

**Architecture:** Due nuovi custom objects (`Budget_Version__c` container, `Budget_Version_Item__c` righe pre-materializzate). Nuovo controller Apex `BudgetVersionController` con endpoint CRUD + `promoteVersion` atomico. Rework completo dell'hero e delle tabelle del `budgetDesigner` LWC (View/Edit mode per riga, combobox Versione, banner colorati per stato). Gli Excel Editor vengono ristretti a creare solo `Effettiva`.

**Tech Stack:** Salesforce DX, Apex API 65.0, LWC, SLDS. Deploy target: `smaccagno@lab00.dev`.

---

## Pre-flight: allineamento repo

- [ ] **Step 0.1: Verifica stato git pulito e sincronizzato**

Run:
```bash
cd /Users/smaccagno/Claude/Lab00-Final
git status -sb
git fetch --all --prune
git log --oneline --decorate --graph --left-right HEAD...@{u}
```
Expected: working tree clean, `HEAD` allineato a `origin/main`. Se non lo è, fermati e chiedi all'utente come procedere (CLAUDE.md §Critical Deployment Rules).

---

## Task 1: Oggetto `Budget_Version__c` + campi

**Files:**
- Create: `force-app/main/default/objects/Budget_Version__c/Budget_Version__c.object-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version__c/fields/Anno__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version__c/fields/Nome__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version__c/fields/Descrizione__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version__c/fields/Stato__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version__c/fields/Numero_Versione__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version__c/fields/Data_Promozione__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version__c/fields/Promossa_Da__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version__c/fields/Sostituisce__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version__c/fields/Anno_Se_Ufficiale__c.field-meta.xml`

- [ ] **Step 1.1: Crea `Budget_Version__c.object-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <allowInChatterGroups>false</allowInChatterGroups>
    <compactLayoutAssignment>SYSTEM</compactLayoutAssignment>
    <deploymentStatus>Deployed</deploymentStatus>
    <enableActivities>false</enableActivities>
    <enableBulkApi>true</enableBulkApi>
    <enableFeeds>false</enableFeeds>
    <enableHistory>true</enableHistory>
    <enableLicensing>false</enableLicensing>
    <enableReports>true</enableReports>
    <enableSearch>true</enableSearch>
    <enableSharing>true</enableSharing>
    <enableStreamingApi>true</enableStreamingApi>
    <externalSharingModel>Private</externalSharingModel>
    <label>Budget Version</label>
    <nameField>
        <displayFormat>BV-{00000}</displayFormat>
        <label>Codice</label>
        <trackFeedHistory>false</trackFeedHistory>
        <trackHistory>false</trackHistory>
        <type>AutoNumber</type>
    </nameField>
    <pluralLabel>Budget Versions</pluralLabel>
    <searchLayouts></searchLayouts>
    <sharingModel>ReadWrite</sharingModel>
    <visibility>Public</visibility>
</CustomObject>
```

- [ ] **Step 1.2: Crea `Anno__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Anno__c</fullName>
    <label>Anno</label>
    <precision>4</precision>
    <scale>0</scale>
    <required>true</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Number</type>
    <unique>false</unique>
</CustomField>
```

- [ ] **Step 1.3: Crea `Nome__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Nome__c</fullName>
    <label>Nome scenario</label>
    <length>80</length>
    <required>false</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>false</unique>
</CustomField>
```

- [ ] **Step 1.4: Crea `Descrizione__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Descrizione__c</fullName>
    <label>Descrizione</label>
    <length>1000</length>
    <required>false</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>LongTextArea</type>
    <visibleLines>3</visibleLines>
</CustomField>
```

- [ ] **Step 1.5: Crea `Stato__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Stato__c</fullName>
    <label>Stato</label>
    <required>true</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Picklist</type>
    <valueSet>
        <restricted>true</restricted>
        <valueSetDefinition>
            <sorted>false</sorted>
            <value>
                <fullName>Provvisorio</fullName>
                <default>true</default>
                <label>Provvisorio</label>
            </value>
            <value>
                <fullName>Ufficiale</fullName>
                <default>false</default>
                <label>Ufficiale</label>
            </value>
            <value>
                <fullName>Storicizzata</fullName>
                <default>false</default>
                <label>Storicizzata</label>
            </value>
            <value>
                <fullName>Cestinata</fullName>
                <default>false</default>
                <label>Cestinata</label>
            </value>
        </valueSetDefinition>
    </valueSet>
</CustomField>
```

- [ ] **Step 1.6: Crea `Numero_Versione__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Numero_Versione__c</fullName>
    <label>Numero Versione</label>
    <precision>3</precision>
    <scale>0</scale>
    <required>true</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Number</type>
    <unique>false</unique>
</CustomField>
```

- [ ] **Step 1.7: Crea `Data_Promozione__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Data_Promozione__c</fullName>
    <label>Data Promozione</label>
    <required>false</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>DateTime</type>
</CustomField>
```

- [ ] **Step 1.8: Crea `Promossa_Da__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Promossa_Da__c</fullName>
    <deleteConstraint>SetNull</deleteConstraint>
    <label>Promossa Da</label>
    <referenceTo>User</referenceTo>
    <relationshipLabel>Budget Versions Promosse</relationshipLabel>
    <relationshipName>Budget_Versions_Promosse</relationshipName>
    <required>false</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Lookup</type>
</CustomField>
```

- [ ] **Step 1.9: Crea `Sostituisce__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Sostituisce__c</fullName>
    <deleteConstraint>SetNull</deleteConstraint>
    <label>Sostituisce</label>
    <referenceTo>Budget_Version__c</referenceTo>
    <relationshipLabel>Versione Successiva</relationshipLabel>
    <relationshipName>Successiva</relationshipName>
    <required>false</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>Lookup</type>
</CustomField>
```

- [ ] **Step 1.10: Crea `Anno_Se_Ufficiale__c.field-meta.xml` (formula, External ID unique)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Anno_Se_Ufficiale__c</fullName>
    <externalId>true</externalId>
    <formula>IF(ISPICKVAL(Stato__c, "Ufficiale"), TEXT(Anno__c), "")</formula>
    <formulaTreatBlanksAs>BlankAsZero</formulaTreatBlanksAs>
    <label>Anno Se Ufficiale</label>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>true</unique>
</CustomField>
```

Nota: i campi formula in Salesforce non accettano `<unique>` con `<externalId>` in alcune API; se il deploy fallisce con errore "formula field cannot be external ID unique", lo trasformeremo in campo Text normale popolato da trigger — ma proviamo prima la strada formula che è supportata dal 2021.

- [ ] **Step 1.11: Deploy Budget_Version__c su DEV**

Run:
```bash
sf project deploy start \
  -d force-app/main/default/objects/Budget_Version__c \
  --target-org smaccagno@lab00.dev --wait 15
```
Expected: `Status: Succeeded`.

Se lo step fallisce per il campo formula unique, sostituire `Anno_Se_Ufficiale__c.field-meta.xml` con un campo Text(10) normale:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Anno_Se_Ufficiale__c</fullName>
    <externalId>true</externalId>
    <label>Anno Se Ufficiale</label>
    <length>10</length>
    <required>false</required>
    <type>Text</type>
    <unique>true</unique>
</CustomField>
```
e rimandare la popolazione a un futuro trigger (che sarà `BudgetVersionTrigger` nel Task 7).

- [ ] **Step 1.12: Commit**

```bash
git add force-app/main/default/objects/Budget_Version__c
git commit -m "$(cat <<'EOF'
feat(budget): oggetto Budget_Version__c con ciclo di vita a 4 stati

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Oggetto `Budget_Version_Item__c` + campi

**Files:**
- Create: `force-app/main/default/objects/Budget_Version_Item__c/Budget_Version_Item__c.object-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version_Item__c/fields/Budget_Version__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version_Item__c/fields/Tipo__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version_Item__c/fields/Programma__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version_Item__c/fields/Categoria__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version_Item__c/fields/Sottocategoria__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version_Item__c/fields/Nome__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version_Item__c/fields/Data__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version_Item__c/fields/Ammontare__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version_Item__c/fields/Note__c.field-meta.xml`
- Create: `force-app/main/default/objects/Budget_Version_Item__c/fields/Sort_Order__c.field-meta.xml`

- [ ] **Step 2.1: Crea `Budget_Version_Item__c.object-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <allowInChatterGroups>false</allowInChatterGroups>
    <compactLayoutAssignment>SYSTEM</compactLayoutAssignment>
    <deploymentStatus>Deployed</deploymentStatus>
    <enableActivities>false</enableActivities>
    <enableBulkApi>true</enableBulkApi>
    <enableFeeds>false</enableFeeds>
    <enableHistory>false</enableHistory>
    <enableLicensing>false</enableLicensing>
    <enableReports>true</enableReports>
    <enableSearch>false</enableSearch>
    <enableSharing>true</enableSharing>
    <enableStreamingApi>true</enableStreamingApi>
    <externalSharingModel>ControlledByParent</externalSharingModel>
    <label>Budget Version Item</label>
    <nameField>
        <displayFormat>BVI-{000000}</displayFormat>
        <label>Codice</label>
        <trackFeedHistory>false</trackFeedHistory>
        <trackHistory>false</trackHistory>
        <type>AutoNumber</type>
    </nameField>
    <pluralLabel>Budget Version Items</pluralLabel>
    <searchLayouts></searchLayouts>
    <sharingModel>ControlledByParent</sharingModel>
    <visibility>Public</visibility>
</CustomObject>
```

- [ ] **Step 2.2: Crea `Budget_Version__c.field-meta.xml` (MD-lookup)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Budget_Version__c</fullName>
    <label>Budget Version</label>
    <referenceTo>Budget_Version__c</referenceTo>
    <relationshipLabel>Items</relationshipLabel>
    <relationshipName>Items</relationshipName>
    <relationshipOrder>0</relationshipOrder>
    <reparentableMasterDetail>false</reparentableMasterDetail>
    <required>false</required>
    <trackFeedHistory>false</trackFeedHistory>
    <trackHistory>false</trackHistory>
    <trackTrending>false</trackTrending>
    <type>MasterDetail</type>
    <writeRequiresMasterRead>false</writeRequiresMasterRead>
</CustomField>
```

- [ ] **Step 2.3: Crea `Tipo__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Tipo__c</fullName>
    <label>Tipo</label>
    <required>true</required>
    <trackTrending>false</trackTrending>
    <type>Picklist</type>
    <valueSet>
        <restricted>true</restricted>
        <valueSetDefinition>
            <sorted>false</sorted>
            <value>
                <fullName>Incasso</fullName>
                <default>true</default>
                <label>Incasso</label>
            </value>
            <value>
                <fullName>Spesa</fullName>
                <default>false</default>
                <label>Spesa</label>
            </value>
        </valueSetDefinition>
    </valueSet>
</CustomField>
```

- [ ] **Step 2.4: Crea `Programma__c.field-meta.xml`** (referenzia `Program` come su `Voce_di_Spesa__c.Programma__c`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Programma__c</fullName>
    <deleteConstraint>SetNull</deleteConstraint>
    <label>Programma</label>
    <referenceTo>Program</referenceTo>
    <relationshipLabel>Budget Version Items</relationshipLabel>
    <relationshipName>Budget_Version_Items</relationshipName>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Lookup</type>
</CustomField>
```

- [ ] **Step 2.5: Crea `Categoria__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Categoria__c</fullName>
    <label>Categoria</label>
    <length>40</length>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>false</unique>
</CustomField>
```

- [ ] **Step 2.6: Crea `Sottocategoria__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Sottocategoria__c</fullName>
    <label>Sottocategoria</label>
    <length>40</length>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>false</unique>
</CustomField>
```

- [ ] **Step 2.7: Crea `Nome__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Nome__c</fullName>
    <label>Nome voce</label>
    <length>80</length>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>false</unique>
</CustomField>
```

- [ ] **Step 2.8: Crea `Data__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Data__c</fullName>
    <label>Data</label>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Date</type>
</CustomField>
```

- [ ] **Step 2.9: Crea `Ammontare__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Ammontare__c</fullName>
    <label>Ammontare</label>
    <precision>14</precision>
    <scale>2</scale>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Currency</type>
</CustomField>
```

- [ ] **Step 2.10: Crea `Note__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Note__c</fullName>
    <label>Note</label>
    <length>255</length>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>false</unique>
</CustomField>
```

- [ ] **Step 2.11: Crea `Sort_Order__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Sort_Order__c</fullName>
    <label>Sort Order</label>
    <precision>6</precision>
    <scale>0</scale>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Number</type>
    <unique>false</unique>
</CustomField>
```

- [ ] **Step 2.12: Deploy Budget_Version_Item__c**

Run:
```bash
sf project deploy start \
  -d force-app/main/default/objects/Budget_Version_Item__c \
  --target-org smaccagno@lab00.dev --wait 15
```
Expected: `Status: Succeeded`.

- [ ] **Step 2.13: Commit**

```bash
git add force-app/main/default/objects/Budget_Version_Item__c
git commit -m "$(cat <<'EOF'
feat(budget): oggetto Budget_Version_Item__c (figlio MD della versione)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Campi aggiunti alle Voci

**Files:**
- Create: `force-app/main/default/objects/Voce_di_Incasso__c/fields/Budget_Version__c.field-meta.xml`
- Create: `force-app/main/default/objects/Voce_di_Incasso__c/fields/Nome__c.field-meta.xml`
- Create: `force-app/main/default/objects/Voce_di_Spesa__c/fields/Budget_Version__c.field-meta.xml`
- Create: `force-app/main/default/objects/Voce_di_Spesa__c/fields/Nome__c.field-meta.xml`

- [ ] **Step 3.1: Crea `Voce_di_Incasso__c/fields/Budget_Version__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Budget_Version__c</fullName>
    <deleteConstraint>SetNull</deleteConstraint>
    <label>Budget Version</label>
    <referenceTo>Budget_Version__c</referenceTo>
    <relationshipLabel>Voci di Incasso</relationshipLabel>
    <relationshipName>Voci_di_Incasso</relationshipName>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Lookup</type>
</CustomField>
```

- [ ] **Step 3.2: Crea `Voce_di_Incasso__c/fields/Nome__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Nome__c</fullName>
    <label>Nome voce</label>
    <length>80</length>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>false</unique>
</CustomField>
```

- [ ] **Step 3.3: Crea `Voce_di_Spesa__c/fields/Budget_Version__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Budget_Version__c</fullName>
    <deleteConstraint>SetNull</deleteConstraint>
    <label>Budget Version</label>
    <referenceTo>Budget_Version__c</referenceTo>
    <relationshipLabel>Voci di Spesa</relationshipLabel>
    <relationshipName>Voci_di_Spesa</relationshipName>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Lookup</type>
</CustomField>
```

- [ ] **Step 3.4: Crea `Voce_di_Spesa__c/fields/Nome__c.field-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Nome__c</fullName>
    <label>Nome voce</label>
    <length>80</length>
    <required>false</required>
    <trackTrending>false</trackTrending>
    <type>Text</type>
    <unique>false</unique>
</CustomField>
```

- [ ] **Step 3.5: Deploy**

Run:
```bash
sf project deploy start \
  -d force-app/main/default/objects/Voce_di_Incasso__c/fields/Budget_Version__c.field-meta.xml \
  -d force-app/main/default/objects/Voce_di_Incasso__c/fields/Nome__c.field-meta.xml \
  -d force-app/main/default/objects/Voce_di_Spesa__c/fields/Budget_Version__c.field-meta.xml \
  -d force-app/main/default/objects/Voce_di_Spesa__c/fields/Nome__c.field-meta.xml \
  --target-org smaccagno@lab00.dev --wait 15
```
Expected: `Status: Succeeded`.

- [ ] **Step 3.6: Commit**

```bash
git add force-app/main/default/objects/Voce_di_Incasso__c/fields/Budget_Version__c.field-meta.xml \
        force-app/main/default/objects/Voce_di_Incasso__c/fields/Nome__c.field-meta.xml \
        force-app/main/default/objects/Voce_di_Spesa__c/fields/Budget_Version__c.field-meta.xml \
        force-app/main/default/objects/Voce_di_Spesa__c/fields/Nome__c.field-meta.xml
git commit -m "$(cat <<'EOF'
feat(voci): lookup Budget_Version__c e campo Nome__c su Incassi/Spese

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Permessi sul Profilo Admin

**Files:**
- Modify: `force-app/main/default/profiles/Admin.profile-meta.xml`

- [ ] **Step 4.1: Identifica la sezione `<fieldPermissions>` nell'Admin.profile-meta.xml**

Run:
```bash
grep -n "Voce_di_Spesa__c.Programma__c" force-app/main/default/profiles/Admin.profile-meta.xml | head -5
```
Expected: almeno una riga di riferimento per orientarsi alla sezione.

- [ ] **Step 4.2: Aggiungi le fieldPermissions per Budget_Version__c, Budget_Version_Item__c, Voci.Budget_Version__c, Voci.Nome__c**

Usa l'Edit tool per inserire i seguenti blocchi nella sezione `<fieldPermissions>` mantenendo l'ordinamento alfabetico:

```xml
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version__c.Anno__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Budget_Version__c.Anno_Se_Ufficiale__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version__c.Data_Promozione__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version__c.Descrizione__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version__c.Nome__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version__c.Numero_Versione__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version__c.Promossa_Da__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version__c.Sostituisce__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version__c.Stato__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version_Item__c.Ammontare__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version_Item__c.Categoria__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version_Item__c.Data__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version_Item__c.Nome__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version_Item__c.Note__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version_Item__c.Programma__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version_Item__c.Sort_Order__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version_Item__c.Sottocategoria__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Budget_Version_Item__c.Tipo__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Voce_di_Incasso__c.Budget_Version__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Voce_di_Incasso__c.Nome__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Voce_di_Spesa__c.Budget_Version__c</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>true</editable>
        <field>Voce_di_Spesa__c.Nome__c</field>
        <readable>true</readable>
    </fieldPermissions>
```

E nella sezione `<objectPermissions>` aggiungi:

```xml
    <objectPermissions>
        <allowCreate>true</allowCreate>
        <allowDelete>true</allowDelete>
        <allowEdit>true</allowEdit>
        <allowRead>true</allowRead>
        <modifyAllRecords>true</modifyAllRecords>
        <object>Budget_Version__c</object>
        <viewAllRecords>true</viewAllRecords>
    </objectPermissions>
    <objectPermissions>
        <allowCreate>true</allowCreate>
        <allowDelete>true</allowDelete>
        <allowEdit>true</allowEdit>
        <allowRead>true</allowRead>
        <modifyAllRecords>true</modifyAllRecords>
        <object>Budget_Version_Item__c</object>
        <viewAllRecords>true</viewAllRecords>
    </objectPermissions>
```

- [ ] **Step 4.3: Deploy del profilo**

Run:
```bash
sf project deploy start -d force-app/main/default/profiles/Admin.profile-meta.xml \
  --target-org smaccagno@lab00.dev --wait 15
```
Expected: `Status: Succeeded`.

- [ ] **Step 4.4: Commit**

```bash
git add force-app/main/default/profiles/Admin.profile-meta.xml
git commit -m "$(cat <<'EOF'
feat(profile): permessi Admin per Budget_Version e campi nuovi delle Voci

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Test Apex per `BudgetVersionController` (RED)

**Files:**
- Create: `force-app/main/default/classes/BudgetVersionControllerTest.cls`
- Create: `force-app/main/default/classes/BudgetVersionControllerTest.cls-meta.xml`

Scriviamo prima i test per guidare il controller. Ogni test rappresenta una parte del contratto della spec §4.

- [ ] **Step 5.1: Crea il file `.cls-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>65.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

- [ ] **Step 5.2: Crea il file di test `BudgetVersionControllerTest.cls` con tutti i test**

```apex
@IsTest
private class BudgetVersionControllerTest {

    private static Program createProgram(String name) {
        Program p = new Program(Name = name, Status__c = 'Active');
        insert p;
        return p;
    }

    @IsTest
    static void createVersion_assegnaNumeroIncrementaleProvvisorio() {
        Id id1 = BudgetVersionController.createVersion(2027, 'Scenario A', 'desc');
        Id id2 = BudgetVersionController.createVersion(2027, 'Scenario B', 'desc');
        Id idY = BudgetVersionController.createVersion(2028, 'Altro anno', null);

        Budget_Version__c v1 = [SELECT Numero_Versione__c, Stato__c FROM Budget_Version__c WHERE Id=:id1];
        Budget_Version__c v2 = [SELECT Numero_Versione__c, Stato__c FROM Budget_Version__c WHERE Id=:id2];
        Budget_Version__c y  = [SELECT Numero_Versione__c FROM Budget_Version__c WHERE Id=:idY];

        System.assertEquals(1, v1.Numero_Versione__c);
        System.assertEquals(2, v2.Numero_Versione__c);
        System.assertEquals('Provvisorio', v1.Stato__c);
        System.assertEquals(1, y.Numero_Versione__c, 'numero resetta per nuovo anno');
    }

    @IsTest
    static void getVersionsByYear_escludeCestinate() {
        Id idA = BudgetVersionController.createVersion(2027, 'A', null);
        Id idB = BudgetVersionController.createVersion(2027, 'B', null);
        BudgetVersionController.trashVersion(idB);

        List<BudgetVersionController.BudgetVersionDTO> list = BudgetVersionController.getVersionsByYear(2027);

        System.assertEquals(1, list.size());
        System.assertEquals(idA, list[0].id);
    }

    @IsTest
    static void upsertItem_rifiutaSuVersioneNonProvvisoria() {
        Id versionId = BudgetVersionController.createVersion(2027, 'A', null);
        Program prog = createProgram('Prog A');
        Id itemId = BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = versionId, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'Donazioni',
            Nome__c = 'Donazione test', Ammontare__c = 100
        ));
        BudgetVersionController.promoteVersion(versionId);

        // Prova a fare upsert su versione ora Ufficiale → deve fallire
        Boolean thrown = false;
        try {
            BudgetVersionController.upsertItem(new Budget_Version_Item__c(
                Budget_Version__c = versionId, Tipo__c = 'Incasso',
                Programma__c = prog.Id, Categoria__c = 'Donazioni',
                Nome__c = 'Altra', Ammontare__c = 200
            ));
        } catch (AuraHandledException e) { thrown = true; }
        System.assert(thrown, 'upsertItem su Ufficiale deve fallire');
    }

    @IsTest
    static void promoteVersion_materializzaIncassiESpeseStatoPrevista() {
        Id versionId = BudgetVersionController.createVersion(2027, 'A', null);
        Program prog = createProgram('Prog');
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = versionId, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'Donazioni',
            Nome__c = 'Donazione', Data__c = Date.newInstance(2027, 6, 1),
            Ammontare__c = 1000
        ));
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = versionId, Tipo__c = 'Spesa',
            Programma__c = prog.Id, Categoria__c = 'Affitti',
            Sottocategoria__c = 'Sede', Nome__c = 'Affitto',
            Data__c = Date.newInstance(2027, 1, 1), Ammontare__c = 500
        ));

        Test.startTest();
        BudgetVersionController.promoteVersion(versionId);
        Test.stopTest();

        Budget_Version__c v = [SELECT Stato__c, Data_Promozione__c, Promossa_Da__c FROM Budget_Version__c WHERE Id=:versionId];
        System.assertEquals('Ufficiale', v.Stato__c);
        System.assertNotEquals(null, v.Data_Promozione__c);
        System.assertEquals(UserInfo.getUserId(), v.Promossa_Da__c);

        List<Voce_di_Incasso__c> inc = [SELECT Stato__c, Ammontare__c, Nome__c, Budget_Version__c
                                         FROM Voce_di_Incasso__c WHERE Budget_Version__c=:versionId];
        System.assertEquals(1, inc.size());
        System.assertEquals('Prevista', inc[0].Stato__c);
        System.assertEquals(1000, inc[0].Ammontare__c);
        System.assertEquals('Donazione', inc[0].Nome__c);

        List<Voce_di_Spesa__c> spe = [SELECT Stato__c, Ammontare__c, Sottocategoria__c
                                       FROM Voce_di_Spesa__c WHERE Budget_Version__c=:versionId];
        System.assertEquals(1, spe.size());
        System.assertEquals('Prevista', spe[0].Stato__c);
        System.assertEquals('Sede', spe[0].Sottocategoria__c);
    }

    @IsTest
    static void promoteVersion_rimuovePrevisteDelPrecedenteStoricizza() {
        // v1 + promote
        Id v1 = BudgetVersionController.createVersion(2027, 'v1', null);
        Program prog = createProgram('P1');
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = v1, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'Donazioni',
            Nome__c = 'D1', Ammontare__c = 100));
        BudgetVersionController.promoteVersion(v1);

        // v2 + promote
        Id v2 = BudgetVersionController.createVersion(2027, 'v2', null);
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = v2, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'Donazioni',
            Nome__c = 'D2', Ammontare__c = 200));

        Test.startTest();
        BudgetVersionController.promoteVersion(v2);
        Test.stopTest();

        Budget_Version__c vec = [SELECT Stato__c FROM Budget_Version__c WHERE Id=:v1];
        System.assertEquals('Storicizzata', vec.Stato__c);

        Budget_Version__c nov = [SELECT Stato__c, Sostituisce__c FROM Budget_Version__c WHERE Id=:v2];
        System.assertEquals('Ufficiale', nov.Stato__c);
        System.assertEquals(v1, nov.Sostituisce__c);

        List<Voce_di_Incasso__c> vecchieInc = [SELECT Id FROM Voce_di_Incasso__c WHERE Budget_Version__c=:v1];
        System.assertEquals(0, vecchieInc.size(), 'Le Previste di v1 devono essere cancellate');
        List<Voce_di_Incasso__c> nuoveInc = [SELECT Nome__c FROM Voce_di_Incasso__c WHERE Budget_Version__c=:v2];
        System.assertEquals(1, nuoveInc.size());
        System.assertEquals('D2', nuoveInc[0].Nome__c);
    }

    @IsTest
    static void promoteVersion_nonToccaVociOrfanePrevista() {
        // Voce "orfana" (senza Budget_Version) creata a mano: deve sopravvivere al promote
        Program prog = createProgram('P1');
        Voce_di_Incasso__c orfana = new Voce_di_Incasso__c(
            Programma__c = prog.Id, Categoria__c = 'Donazioni',
            Stato__c = 'Prevista', Ammontare__c = 999
        );
        insert orfana;

        Id v1 = BudgetVersionController.createVersion(2027, 'v1', null);
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = v1, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'Donazioni',
            Nome__c = 'D1', Ammontare__c = 100));
        Test.startTest();
        BudgetVersionController.promoteVersion(v1);
        Test.stopTest();

        Voce_di_Incasso__c dopo = [SELECT Id FROM Voce_di_Incasso__c WHERE Id=:orfana.Id];
        System.assertNotEquals(null, dopo.Id, 'Orfane non toccate dal promote');
    }

    @IsTest
    static void forkVersion_copiaItemsInNuovaProvvisoria() {
        Id src = BudgetVersionController.createVersion(2027, 'src', null);
        Program prog = createProgram('P');
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = src, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'X', Nome__c = 'Uno', Ammontare__c = 1));
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = src, Tipo__c = 'Spesa',
            Programma__c = prog.Id, Categoria__c = 'Y', Nome__c = 'Due', Ammontare__c = 2));
        BudgetVersionController.promoteVersion(src);

        Test.startTest();
        Id forkId = BudgetVersionController.forkVersion(src);
        Test.stopTest();

        Budget_Version__c forkRec = [SELECT Stato__c, Numero_Versione__c FROM Budget_Version__c WHERE Id=:forkId];
        System.assertEquals('Provvisorio', forkRec.Stato__c);
        System.assertEquals(2, forkRec.Numero_Versione__c);

        List<Budget_Version_Item__c> items = [SELECT Nome__c FROM Budget_Version_Item__c WHERE Budget_Version__c=:forkId ORDER BY Nome__c];
        System.assertEquals(2, items.size());
        System.assertEquals('Due', items[0].Nome__c);
        System.assertEquals('Uno', items[1].Nome__c);
    }

    @IsTest
    static void trashVersion_rifiutaUfficiale() {
        Id v = BudgetVersionController.createVersion(2027, 'v', null);
        BudgetVersionController.promoteVersion(v);

        Boolean thrown = false;
        try {
            BudgetVersionController.trashVersion(v);
        } catch (AuraHandledException e) { thrown = true; }
        System.assert(thrown, 'trash di Ufficiale deve fallire');
    }

    @IsTest
    static void updateVersionHeader_rifiutaSuNonProvvisoria() {
        Id v = BudgetVersionController.createVersion(2027, 'old', 'd');
        BudgetVersionController.promoteVersion(v);

        Boolean thrown = false;
        try {
            BudgetVersionController.updateVersionHeader(v, 'nuovo nome', 'nuova desc');
        } catch (AuraHandledException e) { thrown = true; }
        System.assert(thrown, 'rename su Ufficiale deve fallire');
    }

    @IsTest
    static void reorderItems_aggiornaSortOrder() {
        Id vId = BudgetVersionController.createVersion(2027, 'v', null);
        Program prog = createProgram('P');
        Id a = BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = vId, Tipo__c='Incasso', Programma__c=prog.Id,
            Categoria__c='X', Nome__c='A', Ammontare__c=1, Sort_Order__c=1));
        Id b = BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = vId, Tipo__c='Incasso', Programma__c=prog.Id,
            Categoria__c='X', Nome__c='B', Ammontare__c=1, Sort_Order__c=2));

        List<BudgetVersionController.ItemOrder> orders = new List<BudgetVersionController.ItemOrder>{
            new BudgetVersionController.ItemOrder(b, 1),
            new BudgetVersionController.ItemOrder(a, 2)
        };
        BudgetVersionController.reorderItems(orders);

        Map<Id, Budget_Version_Item__c> map1 = new Map<Id, Budget_Version_Item__c>(
            [SELECT Sort_Order__c FROM Budget_Version_Item__c WHERE Id IN :new List<Id>{a,b}]);
        System.assertEquals(2, map1.get(a).Sort_Order__c);
        System.assertEquals(1, map1.get(b).Sort_Order__c);
    }

    @IsTest
    static void getVersionDetail_ritornaHeaderEItems() {
        Id v = BudgetVersionController.createVersion(2027, 'det', 'd');
        Program prog = createProgram('P');
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = v, Tipo__c='Incasso', Programma__c=prog.Id,
            Categoria__c='X', Nome__c='A', Ammontare__c=1, Sort_Order__c=1));

        BudgetVersionController.BudgetVersionDetailDTO detail =
            BudgetVersionController.getVersionDetail(v);

        System.assertEquals(v, detail.header.id);
        System.assertEquals('Provvisorio', detail.header.stato);
        System.assertEquals(1, detail.items.size());
    }
}
```

- [ ] **Step 5.3: Commit (test falliranno: BudgetVersionController non esiste ancora)**

```bash
git add force-app/main/default/classes/BudgetVersionControllerTest.cls \
        force-app/main/default/classes/BudgetVersionControllerTest.cls-meta.xml
git commit -m "$(cat <<'EOF'
test(budget): test per BudgetVersionController (red)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Implementa `BudgetVersionController` (GREEN)

**Files:**
- Create: `force-app/main/default/classes/BudgetVersionController.cls`
- Create: `force-app/main/default/classes/BudgetVersionController.cls-meta.xml`

- [ ] **Step 6.1: Crea `BudgetVersionController.cls-meta.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>65.0</apiVersion>
    <status>Active</status>
</ApexClass>
```

- [ ] **Step 6.2: Crea `BudgetVersionController.cls`**

```apex
public with sharing class BudgetVersionController {

    // --- DTOs ---
    public class BudgetVersionDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public Integer anno;
        @AuraEnabled public Integer numeroVersione;
        @AuraEnabled public String nome;
        @AuraEnabled public String descrizione;
        @AuraEnabled public String stato;
        @AuraEnabled public DateTime dataPromozione;
        @AuraEnabled public String promossaDaName;
        @AuraEnabled public Id sostituisceId;
    }

    public class BudgetVersionDetailDTO {
        @AuraEnabled public BudgetVersionDTO header;
        @AuraEnabled public List<Budget_Version_Item__c> items;
    }

    public class ItemOrder {
        @AuraEnabled public Id itemId;
        @AuraEnabled public Integer sortOrder;

        public ItemOrder() {}
        public ItemOrder(Id itemId, Integer sortOrder) {
            this.itemId = itemId;
            this.sortOrder = sortOrder;
        }
    }

    // --- Reads ---
    @AuraEnabled(cacheable=true)
    public static List<BudgetVersionDTO> getVersionsByYear(Integer anno) {
        List<BudgetVersionDTO> out = new List<BudgetVersionDTO>();
        for (Budget_Version__c v : [
            SELECT Id, Anno__c, Numero_Versione__c, Nome__c, Descrizione__c, Stato__c,
                   Data_Promozione__c, Promossa_Da__r.Name, Sostituisce__c
              FROM Budget_Version__c
             WHERE Anno__c = :anno AND Stato__c != 'Cestinata'
             ORDER BY Numero_Versione__c DESC
        ]) {
            out.add(toDTO(v));
        }
        return out;
    }

    @AuraEnabled(cacheable=true)
    public static BudgetVersionDetailDTO getVersionDetail(Id versionId) {
        Budget_Version__c v = [
            SELECT Id, Anno__c, Numero_Versione__c, Nome__c, Descrizione__c, Stato__c,
                   Data_Promozione__c, Promossa_Da__r.Name, Sostituisce__c
              FROM Budget_Version__c WHERE Id = :versionId
        ];
        BudgetVersionDetailDTO d = new BudgetVersionDetailDTO();
        d.header = toDTO(v);
        d.items = [
            SELECT Id, Budget_Version__c, Tipo__c, Programma__c, Programma__r.Name,
                   Categoria__c, Sottocategoria__c, Nome__c, Data__c, Ammontare__c,
                   Note__c, Sort_Order__c
              FROM Budget_Version_Item__c
             WHERE Budget_Version__c = :versionId
             ORDER BY Tipo__c, Sort_Order__c NULLS LAST, Categoria__c, Nome__c
        ];
        return d;
    }

    // --- Version mutations ---
    @AuraEnabled
    public static Id createVersion(Integer anno, String nome, String descrizione) {
        AggregateResult ar = [
            SELECT MAX(Numero_Versione__c) maxN
              FROM Budget_Version__c WHERE Anno__c = :anno
        ];
        Decimal maxN = (Decimal) ar.get('maxN');
        Integer nextN = (maxN == null) ? 1 : maxN.intValue() + 1;

        Budget_Version__c v = new Budget_Version__c(
            Anno__c = anno,
            Nome__c = nome,
            Descrizione__c = descrizione,
            Stato__c = 'Provvisorio',
            Numero_Versione__c = nextN
        );
        insert v;
        return v.Id;
    }

    @AuraEnabled
    public static Id forkVersion(Id sourceVersionId) {
        Budget_Version__c src = [
            SELECT Id, Anno__c, Nome__c, Descrizione__c FROM Budget_Version__c WHERE Id = :sourceVersionId
        ];
        Id newId = createVersion(
            (src.Anno__c == null) ? null : src.Anno__c.intValue(),
            buildForkName(src.Nome__c),
            src.Descrizione__c
        );
        List<Budget_Version_Item__c> items = [
            SELECT Tipo__c, Programma__c, Categoria__c, Sottocategoria__c, Nome__c,
                   Data__c, Ammontare__c, Note__c, Sort_Order__c
              FROM Budget_Version_Item__c WHERE Budget_Version__c = :sourceVersionId
        ];
        List<Budget_Version_Item__c> clones = new List<Budget_Version_Item__c>();
        for (Budget_Version_Item__c it : items) {
            Budget_Version_Item__c c = it.clone(false, true, false, false);
            c.Budget_Version__c = newId;
            clones.add(c);
        }
        if (!clones.isEmpty()) insert clones;
        return newId;
    }

    @AuraEnabled
    public static void updateVersionHeader(Id versionId, String nome, String descrizione) {
        Budget_Version__c v = [SELECT Stato__c FROM Budget_Version__c WHERE Id = :versionId];
        if (v.Stato__c != 'Provvisorio') {
            throw new AuraHandledException('Solo le versioni Provvisorio sono modificabili.');
        }
        v.Nome__c = nome;
        v.Descrizione__c = descrizione;
        update v;
    }

    @AuraEnabled
    public static void trashVersion(Id versionId) {
        Budget_Version__c v = [SELECT Stato__c FROM Budget_Version__c WHERE Id = :versionId];
        if (v.Stato__c == 'Ufficiale') {
            throw new AuraHandledException('Impossibile cestinare una versione Ufficiale.');
        }
        v.Stato__c = 'Cestinata';
        update v;
    }

    @AuraEnabled
    public static void promoteVersion(Id versionId) {
        Budget_Version__c nuova = [
            SELECT Id, Anno__c, Stato__c FROM Budget_Version__c WHERE Id = :versionId FOR UPDATE
        ];
        if (nuova.Stato__c != 'Provvisorio') {
            throw new AuraHandledException('Solo le versioni Provvisorio possono essere promosse.');
        }

        List<Budget_Version__c> attuali = [
            SELECT Id FROM Budget_Version__c
             WHERE Anno__c = :nuova.Anno__c AND Stato__c = 'Ufficiale' FOR UPDATE
        ];
        Id ufficialePrecId = attuali.isEmpty() ? null : attuali[0].Id;

        Savepoint sp = Database.setSavepoint();
        try {
            if (ufficialePrecId != null) {
                delete [SELECT Id FROM Voce_di_Incasso__c
                         WHERE Budget_Version__c = :ufficialePrecId AND Stato__c = 'Prevista'];
                delete [SELECT Id FROM Voce_di_Spesa__c
                         WHERE Budget_Version__c = :ufficialePrecId AND Stato__c = 'Prevista'];

                Budget_Version__c old = new Budget_Version__c(
                    Id = ufficialePrecId, Stato__c = 'Storicizzata'
                );
                update old;
                nuova.Sostituisce__c = ufficialePrecId;
            }

            List<Budget_Version_Item__c> items = [
                SELECT Id, Tipo__c, Programma__c, Categoria__c, Sottocategoria__c,
                       Nome__c, Data__c, Ammontare__c, Note__c, Sort_Order__c
                  FROM Budget_Version_Item__c WHERE Budget_Version__c = :versionId
            ];
            List<Voce_di_Incasso__c> incassi = new List<Voce_di_Incasso__c>();
            List<Voce_di_Spesa__c> spese = new List<Voce_di_Spesa__c>();
            for (Budget_Version_Item__c it : items) {
                if (it.Tipo__c == 'Incasso') {
                    incassi.add(new Voce_di_Incasso__c(
                        Budget_Version__c = versionId,
                        Programma__c = it.Programma__c,
                        Categoria__c = it.Categoria__c,
                        Nome__c = it.Nome__c,
                        Data__c = it.Data__c,
                        Ammontare__c = it.Ammontare__c,
                        Stato__c = 'Prevista'
                    ));
                } else {
                    spese.add(new Voce_di_Spesa__c(
                        Budget_Version__c = versionId,
                        Programma__c = it.Programma__c,
                        Categoria__c = it.Categoria__c,
                        Sottocategoria__c = it.Sottocategoria__c,
                        Nome__c = it.Nome__c,
                        Data__c = it.Data__c,
                        Ammontare__c = it.Ammontare__c,
                        Note__c = it.Note__c,
                        Stato__c = 'Prevista'
                    ));
                }
            }
            if (!incassi.isEmpty()) insert incassi;
            if (!spese.isEmpty()) insert spese;

            nuova.Stato__c = 'Ufficiale';
            nuova.Data_Promozione__c = System.now();
            nuova.Promossa_Da__c = UserInfo.getUserId();
            update nuova;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException('Promozione fallita: ' + e.getMessage());
        }
    }

    // --- Item mutations ---
    @AuraEnabled
    public static Id upsertItem(Budget_Version_Item__c item) {
        assertParentProvvisorio(item.Budget_Version__c);
        upsert item;
        return item.Id;
    }

    @AuraEnabled
    public static void deleteItem(Id itemId) {
        Budget_Version_Item__c it = [SELECT Budget_Version__c FROM Budget_Version_Item__c WHERE Id = :itemId];
        assertParentProvvisorio(it.Budget_Version__c);
        delete it;
    }

    @AuraEnabled
    public static void reorderItems(List<ItemOrder> orders) {
        if (orders == null || orders.isEmpty()) return;
        Map<Id, Integer> byId = new Map<Id, Integer>();
        for (ItemOrder o : orders) byId.put(o.itemId, o.sortOrder);

        List<Budget_Version_Item__c> toUpdate = new List<Budget_Version_Item__c>();
        Set<Id> versionIds = new Set<Id>();
        for (Budget_Version_Item__c it : [
            SELECT Id, Budget_Version__c FROM Budget_Version_Item__c WHERE Id IN :byId.keySet()
        ]) {
            versionIds.add(it.Budget_Version__c);
            toUpdate.add(new Budget_Version_Item__c(Id = it.Id, Sort_Order__c = byId.get(it.Id)));
        }
        for (Id vId : versionIds) assertParentProvvisorio(vId);
        if (!toUpdate.isEmpty()) update toUpdate;
    }

    // --- Private helpers ---
    private static void assertParentProvvisorio(Id versionId) {
        Budget_Version__c v = [SELECT Stato__c FROM Budget_Version__c WHERE Id = :versionId];
        if (v.Stato__c != 'Provvisorio') {
            throw new AuraHandledException('La versione non è modificabile (stato: ' + v.Stato__c + ').');
        }
    }

    private static BudgetVersionDTO toDTO(Budget_Version__c v) {
        BudgetVersionDTO d = new BudgetVersionDTO();
        d.id = v.Id;
        d.anno = (v.Anno__c == null) ? null : v.Anno__c.intValue();
        d.numeroVersione = (v.Numero_Versione__c == null) ? null : v.Numero_Versione__c.intValue();
        d.nome = v.Nome__c;
        d.descrizione = v.Descrizione__c;
        d.stato = v.Stato__c;
        d.dataPromozione = v.Data_Promozione__c;
        d.promossaDaName = v.Promossa_Da__r == null ? null : v.Promossa_Da__r.Name;
        d.sostituisceId = v.Sostituisce__c;
        return d;
    }

    private static String buildForkName(String sourceName) {
        if (String.isBlank(sourceName)) return 'Fork';
        return sourceName + ' (copia)';
    }
}
```

- [ ] **Step 6.3: Deploy controller + test**

Run:
```bash
sf project deploy start \
  -d force-app/main/default/classes/BudgetVersionController.cls \
  -d force-app/main/default/classes/BudgetVersionController.cls-meta.xml \
  -d force-app/main/default/classes/BudgetVersionControllerTest.cls \
  -d force-app/main/default/classes/BudgetVersionControllerTest.cls-meta.xml \
  --target-org smaccagno@lab00.dev --wait 15
```
Expected: `Status: Succeeded`.

- [ ] **Step 6.4: Esegui i test**

Run:
```bash
sf apex run test --class-names BudgetVersionControllerTest \
  --target-org smaccagno@lab00.dev --code-coverage --result-format human --wait 10
```
Expected: tutti PASS. Se un test fallisce per `Status__c` richiesto su Program, modifica `createProgram` nel test aggiungendo i campi NPC richiesti (l'errore del test indicherà il campo mancante).

- [ ] **Step 6.5: Commit**

```bash
git add force-app/main/default/classes/BudgetVersionController.cls \
        force-app/main/default/classes/BudgetVersionController.cls-meta.xml
git commit -m "$(cat <<'EOF'
feat(budget): BudgetVersionController con CRUD + promote atomico

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Excel Editor → forzatura Effettiva

**Files:**
- Modify: `force-app/main/default/classes/SpeseExcelEditorController.cls`
- Modify: `force-app/main/default/classes/IncassiExcelEditorController.cls`
- Modify: `force-app/main/default/lwc/speseExcelEditor/speseExcelEditor.js`
- Modify: `force-app/main/default/lwc/speseExcelEditor/speseExcelEditor.html`
- Modify: `force-app/main/default/lwc/incassiExcelEditor/incassiExcelEditor.js`
- Modify: `force-app/main/default/lwc/incassiExcelEditor/incassiExcelEditor.html`

- [ ] **Step 7.1: Ispeziona `SpeseExcelEditorController.cls` per trovare dove viene impostato `Stato__c`**

Run:
```bash
grep -n "Stato__c" force-app/main/default/classes/SpeseExcelEditorController.cls
grep -n "Stato__c" force-app/main/default/classes/IncassiExcelEditorController.cls
```
Expected: righe con assegnamenti o letture di Stato__c.

- [ ] **Step 7.2: In `SpeseExcelEditorController.cls` forza `Stato__c = 'Effettiva'`**

Individua il(i) metodo(i) che crea(no) nuovi `Voce_di_Spesa__c` (solitamente un `createSpese` / `upsertSpese` o simile). Sostituisci qualsiasi linea `s.Stato__c = <dal client>` con `s.Stato__c = 'Effettiva'`. Se il metodo prende un DTO dal client con `stato`, **ignora** quel campo e scrivi sempre `'Effettiva'`. Non introdurre rami condizionali.

Esempio di pattern sostitutivo (adatta ai nomi reali del file):

```apex
// PRIMA:
// s.Stato__c = dto.stato == null ? 'Prevista' : dto.stato;
// DOPO:
s.Stato__c = 'Effettiva';
```

Se il file ha più punti di insert (es. in metodi di import massivo), applica la forzatura in **ogni** punto.

- [ ] **Step 7.3: Idem per `IncassiExcelEditorController.cls`**

Stessa modifica: ovunque venga creato un nuovo `Voce_di_Incasso__c`, forzare `Stato__c = 'Effettiva'`.

- [ ] **Step 7.4: Rimuovi la colonna Stato dai file LWC**

Per entrambi `speseExcelEditor.html` e `incassiExcelEditor.html`:
- Rimuovi la `<th>` relativa allo Stato nella thead.
- Rimuovi la cella `<td>` relativa allo Stato nel tbody (sia per le righe esistenti che per la riga draft).
- Se c'è un `colgroup`, rimuovi anche la `<col>` corrispondente.

Per entrambi `speseExcelEditor.js` e `incassiExcelEditor.js`:
- Rimuovi qualsiasi getter che restituisca `statoOptions` o simile.
- Rimuovi il campo `stato` dai default di nuova riga (`createEmptyRow`, `cloneRow`, ecc.).
- Se il componente chiama `getPicklistValues` per `Stato__c`, rimuovi la `@wire`/import.
- Rimuovi gli handler relativi al change della cella Stato.

**Nota importante:** non puoi rimuovere un campo dal payload server se questo è già stato rimosso server-side. Il server ignorerà sempre il campo. Quindi il JS può continuare a mandare anche un payload senza `stato` e sarà comunque corretto.

- [ ] **Step 7.5: Deploy**

Run:
```bash
sf project deploy start \
  -d force-app/main/default/classes/SpeseExcelEditorController.cls \
  -d force-app/main/default/classes/IncassiExcelEditorController.cls \
  -d force-app/main/default/lwc/speseExcelEditor \
  -d force-app/main/default/lwc/incassiExcelEditor \
  --target-org smaccagno@lab00.dev --wait 15
```
Expected: `Status: Succeeded`.

- [ ] **Step 7.6: Test manuale in DEV**

1. Apri l'app Excel Editor Spese in DEV.
2. Verifica che **non ci sia** la colonna Stato.
3. Crea una riga e salva. Apri il record in Salesforce (Setup → Object Manager → Voce di Spesa → Records) e verifica `Stato__c = Effettiva`.
4. Ripeti per Incassi.

- [ ] **Step 7.7: Aggiorna test esistenti se falliscono**

Run:
```bash
sf apex run test --class-names SpeseExcelEditorControllerTest \
  --target-org smaccagno@lab00.dev --result-format human --wait 10
```
Expected: PASS. Se un test asseriva `Stato__c = 'Prevista'` sul record creato, cambialo in `'Effettiva'` — era un comportamento che voleva essere corretto.

- [ ] **Step 7.8: Commit**

```bash
git add force-app/main/default/classes/SpeseExcelEditorController.cls \
        force-app/main/default/classes/IncassiExcelEditorController.cls \
        force-app/main/default/classes/SpeseExcelEditorControllerTest.cls \
        force-app/main/default/lwc/speseExcelEditor \
        force-app/main/default/lwc/incassiExcelEditor
git commit -m "$(cat <<'EOF'
feat(excel-editors): forza Stato=Effettiva, rimuove colonna Stato

Gli Excel Editor non devono più creare Previste — quelle sono di
dominio esclusivo del Budget Version Ufficiale.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `budgetDesigner` JS — stato e wire di versione

**Files:**
- Modify: `force-app/main/default/lwc/budgetDesigner/budgetDesigner.js`

Questo e i successivi task sul designer sono i più grossi. Procediamo a strati (stato → UI → dialog).

- [ ] **Step 8.1: Aggiungi gli import Apex e le nuove proprietà tracked**

In cima al file, dopo gli import esistenti, aggiungi:

```javascript
import getVersionsByYear from '@salesforce/apex/BudgetVersionController.getVersionsByYear';
import getVersionDetail from '@salesforce/apex/BudgetVersionController.getVersionDetail';
import createVersion from '@salesforce/apex/BudgetVersionController.createVersion';
import forkVersion from '@salesforce/apex/BudgetVersionController.forkVersion';
import updateVersionHeader from '@salesforce/apex/BudgetVersionController.updateVersionHeader';
import trashVersion from '@salesforce/apex/BudgetVersionController.trashVersion';
import promoteVersion from '@salesforce/apex/BudgetVersionController.promoteVersion';
import upsertItem from '@salesforce/apex/BudgetVersionController.upsertItem';
import deleteItem from '@salesforce/apex/BudgetVersionController.deleteItem';
import reorderItems from '@salesforce/apex/BudgetVersionController.reorderItems';
import { refreshApex } from '@salesforce/apex';
```

Nello stato della classe, **aggiungi** (non rimuovere ancora niente):

```javascript
@track selectedVersionId = null;
@track versionOptions = [];         // [{label, value}]
@track currentVersion = null;       // DTO header
@track editingRowIds = new Set();   // ids Budget_Version_Item__c attualmente in Edit
@track pendingRowEdits = new Map(); // Map<Id, {field: value, ...}>
@track showCreateVersionDialog = false;
@track showRenameVersionDialog = false;
@track showTrashVersionDialog = false;
@track showConfirmBudgetDialog = false;
@track showForkConfirmDialog = false;
@track dialogNome = '';
@track dialogDescrizione = '';
_wiredVersions;
_wiredDetail;
```

- [ ] **Step 8.2: Aggiungi il wire per le versioni dell'anno**

Nel corpo della classe aggiungi:

```javascript
@wire(getVersionsByYear, { anno: '$annoInt' })
wiredVersions(result) {
    this._wiredVersions = result;
    if (result.data) {
        this.versionOptions = result.data.map(v => ({
            label: this.formatVersionLabel(v),
            value: v.id
        }));
        // Autoselezione: Ufficiale > ultima Provvisorio > prima
        if (!this.selectedVersionId && result.data.length > 0) {
            const ufficiale = result.data.find(v => v.stato === 'Ufficiale');
            const defaultV = ufficiale || result.data[0];
            this.selectedVersionId = defaultV.id;
        } else if (this.selectedVersionId && !result.data.find(v => v.id === this.selectedVersionId)) {
            this.selectedVersionId = result.data[0] ? result.data[0].id : null;
        }
    } else if (result.error) {
        this.currentVersion = null;
        this.versionOptions = [];
    }
}

get annoInt() {
    const n = parseInt(this.anno, 10);
    return Number.isFinite(n) ? n : null;
}

formatVersionLabel(v) {
    const prefix = `v${v.numeroVersione} — ${v.stato}`;
    if (v.nome) return `${prefix} — ${v.nome}`;
    return prefix;
}
```

- [ ] **Step 8.3: Aggiungi il wire per il dettaglio versione**

```javascript
@wire(getVersionDetail, { versionId: '$selectedVersionId' })
wiredDetail(result) {
    this._wiredDetail = result;
    if (result.data) {
        this.currentVersion = result.data.header;
        const items = result.data.items || [];
        this.incassi = items.filter(i => i.Tipo__c === 'Incasso')
            .map(this.itemToIncassoRow.bind(this));
        this.spese = items.filter(i => i.Tipo__c === 'Spesa')
            .map(this.itemToSpesaRow.bind(this));
    } else if (result.error) {
        this.currentVersion = null;
        this.incassi = [];
        this.spese = [];
    }
}

itemToIncassoRow(it) {
    return {
        id: it.Id,
        programmaId: it.Programma__c || null,
        programmaName: (it.Programma__r && it.Programma__r.Name) || '',
        categoria: it.Categoria__c || '',
        name: it.Nome__c || '',
        data: it.Data__c || null,
        ammontare: it.Ammontare__c,
        sortOrder: it.Sort_Order__c
    };
}

itemToSpesaRow(it) {
    return {
        id: it.Id,
        programmaId: it.Programma__c || null,
        programmaName: (it.Programma__r && it.Programma__r.Name) || '',
        categoria: it.Categoria__c || '',
        sottocategoria: it.Sottocategoria__c || '',
        name: it.Nome__c || '',
        data: it.Data__c || null,
        ammontare: it.Ammontare__c,
        note: it.Note__c || '',
        sortOrder: it.Sort_Order__c
    };
}
```

- [ ] **Step 8.4: Getter per la combobox Versione e stato visuale**

```javascript
get versionBannerClass() {
    if (!this.currentVersion) return 'designer-hero designer-hero--empty';
    const map = {
        'Provvisorio': 'designer-hero designer-hero--provvisorio',
        'Ufficiale': 'designer-hero designer-hero--ufficiale',
        'Storicizzata': 'designer-hero designer-hero--storicizzata'
    };
    return map[this.currentVersion.stato] || 'designer-hero';
}

get isVersionEditable() {
    return this.currentVersion && this.currentVersion.stato === 'Provvisorio';
}

get isVersionUfficiale() {
    return this.currentVersion && this.currentVersion.stato === 'Ufficiale';
}

get versionHeadline() {
    if (!this.annoInt) return 'Budget Designer';
    const base = `Definizione Budget per l'Anno ${this.annoInt}`;
    if (this.currentVersion) return `${base} — Versione ${this.currentVersion.numeroVersione}`;
    return base;
}

get confirmBudgetDisabled() {
    return !this.isVersionEditable || this.editingRowIds.size > 0;
}
```

- [ ] **Step 8.5: Handler per cambio versione**

```javascript
handleVersionChange(e) {
    const val = e.detail.value;
    if (val === '__new__') {
        this.dialogNome = '';
        this.dialogDescrizione = '';
        this.showCreateVersionDialog = true;
        return;
    }
    if (this.editingRowIds.size > 0) {
        if (!confirm('Hai modifiche non salvate. Cambiando versione le perderai. Continuare?')) {
            return;
        }
        this.editingRowIds = new Set();
        this.pendingRowEdits = new Map();
    }
    this.selectedVersionId = val;
}
```

- [ ] **Step 8.6: Handler per dialog Crea / Rinomina / Cestina / Conferma / Fork**

```javascript
async handleConfirmCreateVersion() {
    try {
        const id = await createVersion({
            anno: this.annoInt,
            nome: this.dialogNome || null,
            descrizione: this.dialogDescrizione || null
        });
        this.showCreateVersionDialog = false;
        this.selectedVersionId = id;
        await refreshApex(this._wiredVersions);
    } catch (e) { this.showError(e); }
}

handleCancelCreateVersion() { this.showCreateVersionDialog = false; }

handleOpenRename() {
    this.dialogNome = this.currentVersion ? (this.currentVersion.nome || '') : '';
    this.dialogDescrizione = this.currentVersion ? (this.currentVersion.descrizione || '') : '';
    this.showRenameVersionDialog = true;
}

async handleConfirmRename() {
    try {
        await updateVersionHeader({
            versionId: this.selectedVersionId,
            nome: this.dialogNome,
            descrizione: this.dialogDescrizione
        });
        this.showRenameVersionDialog = false;
        await refreshApex(this._wiredDetail);
        await refreshApex(this._wiredVersions);
    } catch (e) { this.showError(e); }
}

handleCancelRename() { this.showRenameVersionDialog = false; }

handleOpenTrash() { this.showTrashVersionDialog = true; }
async handleConfirmTrash() {
    try {
        await trashVersion({ versionId: this.selectedVersionId });
        this.showTrashVersionDialog = false;
        this.selectedVersionId = null;
        await refreshApex(this._wiredVersions);
    } catch (e) { this.showError(e); }
}
handleCancelTrash() { this.showTrashVersionDialog = false; }

handleOpenConfirmBudget() { this.showConfirmBudgetDialog = true; }
async handleConfirmPromote() {
    try {
        await promoteVersion({ versionId: this.selectedVersionId });
        this.showConfirmBudgetDialog = false;
        await refreshApex(this._wiredVersions);
        await refreshApex(this._wiredDetail);
    } catch (e) { this.showError(e); }
}
handleCancelPromote() { this.showConfirmBudgetDialog = false; }

handleOpenForkConfirm() { this.showForkConfirmDialog = true; }
async handleConfirmFork() {
    try {
        const newId = await forkVersion({ sourceVersionId: this.selectedVersionId });
        this.showForkConfirmDialog = false;
        this.selectedVersionId = newId;
        await refreshApex(this._wiredVersions);
    } catch (e) { this.showError(e); }
}
handleCancelFork() { this.showForkConfirmDialog = false; }

handleDialogNomeChange(e) { this.dialogNome = e.detail.value; }
handleDialogDescChange(e) { this.dialogDescrizione = e.detail.value; }
showError(e) {
    const msg = (e && e.body && e.body.message) || (e && e.message) || 'Errore sconosciuto';
    // eslint-disable-next-line no-alert
    alert(msg);
}
```

- [ ] **Step 8.7: Handler View/Edit riga + Conferma/Annulla**

```javascript
handleRowBeginEdit(e) {
    if (!this.isVersionEditable) {
        this.handleOpenForkConfirm();
        return;
    }
    const id = e.currentTarget.dataset.id;
    const kind = e.currentTarget.dataset.kind;
    this._snapshotRow(id, kind);
    const set = new Set(this.editingRowIds);
    set.add(id);
    this.editingRowIds = set;
}

_snapshotRow(id, kind) {
    const row = this._findRow(id, kind);
    if (!row) return;
    const snap = { ...row };
    const m = new Map(this.pendingRowEdits);
    m.set(id, { original: snap, current: { ...row } });
    this.pendingRowEdits = m;
}

_findRow(id, kind) {
    const list = kind === 'incasso' ? this.incassi : this.spese;
    return list.find(r => r.id === id);
}

handleRowCellChange(e) {
    const id = e.currentTarget.dataset.id;
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const m = new Map(this.pendingRowEdits);
    const entry = m.get(id);
    if (!entry) return;
    entry.current = { ...entry.current, [field]: value };
    m.set(id, entry);
    this.pendingRowEdits = m;
}

async handleRowConfirm(e) {
    const id = e.currentTarget.dataset.id;
    const kind = e.currentTarget.dataset.kind;
    const entry = this.pendingRowEdits.get(id);
    if (!entry) return;
    const cur = entry.current;
    const payload = {
        Id: id,
        Budget_Version__c: this.selectedVersionId,
        Tipo__c: kind === 'incasso' ? 'Incasso' : 'Spesa',
        Programma__c: cur.programmaId || null,
        Categoria__c: cur.categoria || null,
        Sottocategoria__c: kind === 'spesa' ? (cur.sottocategoria || null) : null,
        Nome__c: cur.name || null,
        Data__c: cur.data || null,
        Ammontare__c: cur.ammontare || 0,
        Note__c: kind === 'spesa' ? (cur.note || null) : null,
        Sort_Order__c: cur.sortOrder || null
    };
    try {
        await upsertItem({ item: payload });
        const s = new Set(this.editingRowIds); s.delete(id); this.editingRowIds = s;
        const m = new Map(this.pendingRowEdits); m.delete(id); this.pendingRowEdits = m;
        await refreshApex(this._wiredDetail);
    } catch (err) { this.showError(err); }
}

handleRowCancelEdit(e) {
    const id = e.currentTarget.dataset.id;
    const s = new Set(this.editingRowIds); s.delete(id); this.editingRowIds = s;
    const m = new Map(this.pendingRowEdits); m.delete(id); this.pendingRowEdits = m;
}

async handleRowDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!confirm('Rimuovere la riga?')) return;
    try {
        await deleteItem({ itemId: id });
        await refreshApex(this._wiredDetail);
    } catch (err) { this.showError(err); }
}
```

- [ ] **Step 8.8: Sostituisci la logica di aggiunta nuova riga (draft) con upsertItem**

Trova gli handler esistenti `handleDraftIncassoSubmit` / `handleDraftSpesaSubmit` (già presenti nel file) e sostituisci il corpo con una chiamata `upsertItem`:

```javascript
async handleDraftIncassoSubmit() {
    if (!this.isVersionEditable) return;
    const d = this.draftIncasso;
    const payload = {
        Budget_Version__c: this.selectedVersionId,
        Tipo__c: 'Incasso',
        Programma__c: d.programmaId || null,
        Categoria__c: d.categoria || null,
        Nome__c: d.name || null,
        Data__c: d.data || this.dataTarget || null,
        Ammontare__c: d.ammontare || 0,
        Sort_Order__c: (this.incassi.length + 1)
    };
    try {
        await upsertItem({ item: payload });
        this.draftIncasso = this.emptyDraftIncasso();
        await refreshApex(this._wiredDetail);
    } catch (e) { this.showError(e); }
}

async handleDraftSpesaSubmit() {
    if (!this.isVersionEditable) return;
    const d = this.draftSpesa;
    const payload = {
        Budget_Version__c: this.selectedVersionId,
        Tipo__c: 'Spesa',
        Programma__c: d.programmaId || null,
        Categoria__c: d.categoria || null,
        Sottocategoria__c: d.sottocategoria || null,
        Nome__c: d.name || null,
        Data__c: d.data || this.dataTarget || null,
        Ammontare__c: d.ammontare || 0,
        Note__c: d.note || null,
        Sort_Order__c: (this.spese.length + 1)
    };
    try {
        await upsertItem({ item: payload });
        this.draftSpesa = this.emptyDraftSpesa();
        await refreshApex(this._wiredDetail);
    } catch (e) { this.showError(e); }
}
```

Aggiungi anche `programmaId` al draft vuoto (`emptyDraftIncasso` / `emptyDraftSpesa` se esistono, o inline dove vengono inizializzati).

- [ ] **Step 8.9: Rimuovi persistenza localStorage**

Cerca nel file ogni riferimento a `STORAGE_KEY`, `localStorage.setItem`, `localStorage.getItem`, `buildDraftPayload`, `restoreDraft` e rimuovi le relative funzioni e le chiamate che le invocano. Gli Item vivono ora su Salesforce, non serve la copia locale.

Run:
```bash
grep -n "localStorage\|STORAGE_KEY\|buildDraftPayload\|restoreDraft" force-app/main/default/lwc/budgetDesigner/budgetDesigner.js
```
Expected: zero risultati dopo la pulizia.

- [ ] **Step 8.10: Rimuovi handler e stato per "Esporta JSON" e "Svuota progetto"**

Rimuovi `handleExportJson`, `handleResetClick`, `handleResetCancel`, `handleResetConfirm` e lo stato `confirmReset`, `saveToast`.

- [ ] **Step 8.11: Adatta il drag & drop per chiamare `reorderItems`**

Trova `handleRowDragEnd` e dopo aver aggiornato lo stato locale, chiama l'Apex:

```javascript
async _persistReorder(kind) {
    const list = kind === 'incasso' ? this.incassi : this.spese;
    const orders = list.map((r, i) => ({ itemId: r.id, sortOrder: i + 1 }));
    try {
        await reorderItems({ orders });
    } catch (e) { this.showError(e); }
}
```

E chiama `this._persistReorder('incasso')` o `('spesa')` a fine `handleRowDrop` subito dopo l'update dello stato locale.

- [ ] **Step 8.12: Commit**

```bash
git add force-app/main/default/lwc/budgetDesigner/budgetDesigner.js
git commit -m "$(cat <<'EOF'
feat(budgetDesigner): integra BudgetVersionController (stato, CRUD, promote)

Sostituisce il draft localStorage con persistenza server per versione.
Aggiunge handler dialog (crea/rinomina/cestina/promote/fork) e
ciclo View/Edit per riga.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `budgetDesigner` HTML — hero rivisitato + righe View/Edit

**Files:**
- Modify: `force-app/main/default/lwc/budgetDesigner/budgetDesigner.html`

- [ ] **Step 9.1: Sostituisci l'header `<header class="designer-hero">` con il nuovo banner**

Trova l'elemento attualmente con classe `designer-hero` e sostituiscilo con:

```html
<header class={versionBannerClass}>
    <div class="designer-hero-main">
        <div class="designer-hero-title">
            <lightning-icon icon-name="utility:table" size="small" class="designer-hero-icon"></lightning-icon>
            <h1>{versionHeadline}</h1>
        </div>
        <div class="designer-hero-selectors">
            <lightning-combobox
                label="Anno"
                value={anno}
                options={annoOptions}
                onchange={handleAnnoChange}>
            </lightning-combobox>
            <lightning-combobox
                label="Versione"
                value={selectedVersionId}
                options={versionOptionsWithNew}
                onchange={handleVersionChange}
                placeholder="— Seleziona —">
            </lightning-combobox>
        </div>
    </div>

    <template if:true={currentVersion}>
        <div class="designer-hero-meta">
            <span class="designer-version-badge">{currentVersion.stato}</span>
            <template if:true={currentVersion.nome}>
                <span class="designer-version-nome">"{currentVersion.nome}"</span>
            </template>
            <template if:true={currentVersion.descrizione}>
                <span class="designer-version-desc">{currentVersion.descrizione}</span>
            </template>
        </div>

        <div class="designer-hero-actions">
            <template if:true={isVersionEditable}>
                <lightning-button label="Rinomina" icon-name="utility:edit" onclick={handleOpenRename}></lightning-button>
                <lightning-button label="Cestina" icon-name="utility:delete" variant="destructive-text" onclick={handleOpenTrash}></lightning-button>
                <lightning-button label="Conferma Budget" icon-name="utility:check" variant="brand"
                    disabled={confirmBudgetDisabled} onclick={handleOpenConfirmBudget}></lightning-button>
            </template>
        </div>
    </template>

    <template if:false={currentVersion}>
        <div class="designer-hero-empty">
            <p>Nessun budget ancora per l'anno {annoInt}.</p>
            <lightning-button label="Crea prima versione" icon-name="utility:add"
                variant="brand" onclick={handleOpenCreateVersion}></lightning-button>
        </div>
    </template>
</header>
```

Aggiungi in JS un getter `versionOptionsWithNew`:

```javascript
get versionOptionsWithNew() {
    return [
        ...this.versionOptions,
        { label: '+ Nuova versione per questo anno', value: '__new__' }
    ];
}

handleOpenCreateVersion() {
    this.dialogNome = '';
    this.dialogDescrizione = '';
    this.showCreateVersionDialog = true;
}
```

- [ ] **Step 9.2: Rimuovi la sidebar sinistra "Impostazioni / Azioni progetto / Toast"**

Trova `<aside class="designer-sidebar" ...>` e cancella tutto il blocco. Le impostazioni sono ora nell'header.

- [ ] **Step 9.3: Aggiungi colonna Programma nelle tabelle Incassi e Spese**

Nel `<colgroup>` di Incassi, dopo `<col class="col-handle"/>` aggiungi:

```html
<col class="col-prog"/>
```

Nella `<thead>` dopo `<th aria-label="Trascina"></th>` aggiungi:

```html
<th scope="col">Programma</th>
```

Nella riga View mode (template rendered quando id in editingRowIds NON c'è) la cella Programma mostra `row.programmaName`. Nella riga Edit mode mostra un `lightning-combobox` con le opzioni programmi.

Per gestire i due stati, avvolgi il `<tr>` riga in due template:

```html
<template for:each={grp.children} for:item="row">
    <template if:false={row.isEditing}>
        <tr key={row.id} class="sheet-row sheet-row--view" data-id={row.id} data-kind="incasso"
            ondragover={handleRowDragOver} ondrop={handleRowDrop}>
            <td class="col-handle sheet-row-handle" draggable="true"
                data-id={row.id} data-kind="incasso"
                ondragstart={handleRowDragStart} ondragend={handleRowDragEnd}
                title="Trascina per riordinare">
                <lightning-icon icon-name="utility:drag_and_drop" size="xx-small" alternative-text="Trascina"></lightning-icon>
            </td>
            <td class="col-prog">{row.programmaName}</td>
            <td>{row.categoria}</td>
            <td>{row.name}</td>
            <td>{row.data}</td>
            <td class="col-amount">{row.ammontareFmt}</td>
            <td class="col-actions">
                <template if:true={isVersionEditable}>
                    <button class="sheet-row-action-btn" title="Modifica"
                        data-id={row.id} data-kind="incasso" onclick={handleRowBeginEdit}>
                        <lightning-icon icon-name="utility:edit" size="xx-small"></lightning-icon>
                    </button>
                    <button class="sheet-row-remove" title="Rimuovi"
                        data-id={row.id} data-kind="incasso" onclick={handleRowDelete}>
                        <lightning-icon icon-name="utility:close" size="xx-small"></lightning-icon>
                    </button>
                </template>
                <template if:true={isVersionUfficiale}>
                    <button class="sheet-row-action-btn" title="Modifica (crea copia provvisoria)"
                        data-id={row.id} data-kind="incasso" onclick={handleRowBeginEdit}>
                        <lightning-icon icon-name="utility:unlock" size="xx-small"></lightning-icon>
                    </button>
                </template>
            </td>
        </tr>
    </template>
    <template if:true={row.isEditing}>
        <tr key={row.id} class="sheet-row sheet-row--edit" data-id={row.id} data-kind="incasso">
            <td class="col-handle"></td>
            <td class="col-prog">
                <lightning-combobox variant="label-hidden" value={row.programmaId}
                    options={programmaOptions} data-id={row.id} data-field="programmaId"
                    onchange={handleRowCellChange}></lightning-combobox>
            </td>
            <td>
                <lightning-combobox variant="label-hidden" value={row.categoria}
                    options={row.categoriaOptions} data-id={row.id} data-field="categoria"
                    onchange={handleRowCellChange}></lightning-combobox>
            </td>
            <td>
                <lightning-input type="text" variant="label-hidden" value={row.name}
                    data-id={row.id} data-field="name" onchange={handleRowCellChange}></lightning-input>
            </td>
            <td>
                <lightning-input type="date" variant="label-hidden" value={row.data}
                    data-id={row.id} data-field="data" onchange={handleRowCellChange}></lightning-input>
            </td>
            <td class="col-amount">
                <lightning-input type="number" variant="label-hidden" value={row.ammontare}
                    step="0.01" min="0" formatter="currency"
                    data-id={row.id} data-field="ammontare" onchange={handleRowCellChange}></lightning-input>
            </td>
            <td class="col-actions">
                <button class="sheet-row-action-btn" title="Conferma"
                    data-id={row.id} data-kind="incasso" onclick={handleRowConfirm}>
                    <lightning-icon icon-name="utility:check" size="xx-small"></lightning-icon>
                </button>
                <button class="sheet-row-action-btn" title="Annulla"
                    data-id={row.id} data-kind="incasso" onclick={handleRowCancelEdit}>
                    <lightning-icon icon-name="utility:undo" size="xx-small"></lightning-icon>
                </button>
            </td>
        </tr>
    </template>
</template>
```

Per le **Spese** replica con la colonna Sottocategoria tra Categoria e Nome (come oggi) e Note prima delle Actions (come oggi), aggiungendo la colonna Programma subito dopo il drag handle.

- [ ] **Step 9.4: Rendi `row.isEditing` disponibile**

Nel JS, aggiungi un getter nel `wiredDetail` mapper che valorizza `isEditing`:

```javascript
itemToIncassoRow(it) {
    return {
        id: it.Id,
        programmaId: it.Programma__c || null,
        programmaName: (it.Programma__r && it.Programma__r.Name) || '',
        categoria: it.Categoria__c || '',
        name: it.Nome__c || '',
        data: it.Data__c || null,
        ammontare: it.Ammontare__c,
        ammontareFmt: this.formatCurrency(it.Ammontare__c),
        sortOrder: it.Sort_Order__c,
        isEditing: this.editingRowIds.has(it.Id),
        categoriaOptions: this.incassoCategoriaOptions || []
    };
}
```

e analogo per `itemToSpesaRow`.

Problema: `isEditing` è calcolato al momento del wire, quindi se `editingRowIds` cambia (modifica via handleRowBeginEdit), i wired data non cambiano e la riga non si re-renderizza.

Soluzione: dopo ogni modifica a `editingRowIds`, rimappa manualmente incassi/spese:

```javascript
_remapRowsFromCache() {
    if (!this._wiredDetail || !this._wiredDetail.data) return;
    const items = this._wiredDetail.data.items || [];
    this.incassi = items.filter(i => i.Tipo__c === 'Incasso').map(this.itemToIncassoRow.bind(this));
    this.spese = items.filter(i => i.Tipo__c === 'Spesa').map(this.itemToSpesaRow.bind(this));
}
```

E chiama `this._remapRowsFromCache()` ogni volta che modifichi `editingRowIds`.

- [ ] **Step 9.5: Aggiungi getter `programmaOptions` e carica i programmi**

Aggiungi un import + @wire per caricare i programmi dalla SOQL standard. Puoi farlo esponendo un nuovo endpoint nel controller `getActivePrograms`:

Aggiungi a `BudgetVersionController.cls`:

```apex
@AuraEnabled(cacheable=true)
public static List<Program> getActivePrograms() {
    return [SELECT Id, Name FROM Program WHERE Status__c = 'Active' ORDER BY Name LIMIT 500];
}
```

E in `BudgetVersionControllerTest.cls` aggiungi un test rapido:

```apex
@IsTest
static void getActivePrograms_ritornaAttivi() {
    Program p = new Program(Name='Attivo', Status__c='Active');
    insert p;
    List<Program> list = BudgetVersionController.getActivePrograms();
    System.assert(list.size() >= 1);
}
```

Nel JS aggiungi:

```javascript
import getActivePrograms from '@salesforce/apex/BudgetVersionController.getActivePrograms';
// ...
@wire(getActivePrograms)
wiredPrograms({ data }) {
    if (data) {
        this.programmaOptions = data.map(p => ({ label: p.Name, value: p.Id }));
        this._remapRowsFromCache();
    }
}
@track programmaOptions = [];
```

- [ ] **Step 9.6: Aggiungi le dialog in fondo al template**

Sostituisci il modale esistente `<template if:true={confirmReset}>` (rimosso nello step 8.10 lato JS ma probabilmente ancora presente in HTML — rimuovilo se c'è) con le nuove dialog:

```html
<template if:true={showCreateVersionDialog}>
    <section role="dialog" aria-modal="true" class="slds-modal slds-fade-in-open">
        <div class="slds-modal__container">
            <header class="slds-modal__header"><h2 class="slds-modal__title">Crea versione</h2></header>
            <div class="slds-modal__content slds-p-around_medium">
                <lightning-input label="Nome" value={dialogNome} onchange={handleDialogNomeChange}></lightning-input>
                <lightning-textarea label="Descrizione" value={dialogDescrizione} onchange={handleDialogDescChange}></lightning-textarea>
            </div>
            <footer class="slds-modal__footer">
                <lightning-button label="Annulla" onclick={handleCancelCreateVersion}></lightning-button>
                <lightning-button label="Crea" variant="brand" onclick={handleConfirmCreateVersion} class="slds-m-left_small"></lightning-button>
            </footer>
        </div>
    </section>
    <div class="slds-backdrop slds-backdrop_open"></div>
</template>

<template if:true={showRenameVersionDialog}>
    <section role="dialog" aria-modal="true" class="slds-modal slds-fade-in-open">
        <div class="slds-modal__container">
            <header class="slds-modal__header"><h2 class="slds-modal__title">Rinomina versione</h2></header>
            <div class="slds-modal__content slds-p-around_medium">
                <lightning-input label="Nome" value={dialogNome} onchange={handleDialogNomeChange}></lightning-input>
                <lightning-textarea label="Descrizione" value={dialogDescrizione} onchange={handleDialogDescChange}></lightning-textarea>
            </div>
            <footer class="slds-modal__footer">
                <lightning-button label="Annulla" onclick={handleCancelRename}></lightning-button>
                <lightning-button label="Salva" variant="brand" onclick={handleConfirmRename} class="slds-m-left_small"></lightning-button>
            </footer>
        </div>
    </section>
    <div class="slds-backdrop slds-backdrop_open"></div>
</template>

<template if:true={showTrashVersionDialog}>
    <section role="dialog" aria-modal="true" class="slds-modal slds-fade-in-open">
        <div class="slds-modal__container">
            <header class="slds-modal__header"><h2 class="slds-modal__title">Cestinare questa versione?</h2></header>
            <div class="slds-modal__content slds-p-around_medium">
                <p>La versione sarà spostata nel cestino (soft delete) e non comparirà più nell'elenco.</p>
            </div>
            <footer class="slds-modal__footer">
                <lightning-button label="Annulla" onclick={handleCancelTrash}></lightning-button>
                <lightning-button label="Cestina" variant="destructive" onclick={handleConfirmTrash} class="slds-m-left_small"></lightning-button>
            </footer>
        </div>
    </section>
    <div class="slds-backdrop slds-backdrop_open"></div>
</template>

<template if:true={showConfirmBudgetDialog}>
    <section role="dialog" aria-modal="true" class="slds-modal slds-fade-in-open">
        <div class="slds-modal__container">
            <header class="slds-modal__header"><h2 class="slds-modal__title">Promuovere a Ufficiale?</h2></header>
            <div class="slds-modal__content slds-p-around_medium">
                <p>Saranno create le voci Previste per l'anno e rimosse quelle dell'eventuale versione Ufficiale precedente.</p>
            </div>
            <footer class="slds-modal__footer">
                <lightning-button label="Annulla" onclick={handleCancelPromote}></lightning-button>
                <lightning-button label="Conferma Budget" variant="brand" onclick={handleConfirmPromote} class="slds-m-left_small"></lightning-button>
            </footer>
        </div>
    </section>
    <div class="slds-backdrop slds-backdrop_open"></div>
</template>

<template if:true={showForkConfirmDialog}>
    <section role="dialog" aria-modal="true" class="slds-modal slds-fade-in-open">
        <div class="slds-modal__container">
            <header class="slds-modal__header"><h2 class="slds-modal__title">Modificare la versione Ufficiale?</h2></header>
            <div class="slds-modal__content slds-p-around_medium">
                <p>Verrà creata una copia Provvisoria. Modifica la copia e poi promuovila a Ufficiale con "Conferma Budget".</p>
            </div>
            <footer class="slds-modal__footer">
                <lightning-button label="Annulla" onclick={handleCancelFork}></lightning-button>
                <lightning-button label="Crea copia e apri" variant="brand" onclick={handleConfirmFork} class="slds-m-left_small"></lightning-button>
            </footer>
        </div>
    </section>
    <div class="slds-backdrop slds-backdrop_open"></div>
</template>
```

- [ ] **Step 9.7: Commit**

```bash
git add force-app/main/default/lwc/budgetDesigner/budgetDesigner.html \
        force-app/main/default/lwc/budgetDesigner/budgetDesigner.js \
        force-app/main/default/classes/BudgetVersionController.cls \
        force-app/main/default/classes/BudgetVersionControllerTest.cls
git commit -m "$(cat <<'EOF'
feat(budgetDesigner): hero con Anno/Versione, righe View/Edit, dialog lifecycle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `budgetDesigner` CSS — banner colorati + layout riorganizzato

**Files:**
- Modify: `force-app/main/default/lwc/budgetDesigner/budgetDesigner.css`

- [ ] **Step 10.1: Sostituisci lo stile del hero con varianti per-stato**

Trova la classe `.designer-hero` e sostituisci con:

```css
.designer-hero {
    border-radius: 0.5rem;
    padding: 1rem 1.25rem;
    margin-bottom: 1rem;
    border: 1px solid #d3dbe8;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    box-shadow: 0 2px 6px rgba(22, 50, 92, 0.06);
}

.designer-hero--empty {
    background: linear-gradient(135deg, #f4f6fb 0%, #e8eef7 100%);
}

.designer-hero--provvisorio {
    background: linear-gradient(135deg, #fff7ec 0%, #ffe7c2 100%);
    border-color: #f3c27a;
}

.designer-hero--ufficiale {
    background: linear-gradient(135deg, #eaf4fd 0%, #d2e7fa 100%);
    border-color: #9ec6f0;
}

.designer-hero--storicizzata {
    background: linear-gradient(135deg, #f4f6fb 0%, #e8eef7 100%);
    border-color: #c6d1e3;
    opacity: 0.92;
}

.designer-hero-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
}

.designer-hero-selectors {
    display: flex;
    gap: 0.75rem;
    min-width: 320px;
}

.designer-hero-selectors lightning-combobox {
    min-width: 150px;
}

.designer-hero-title h1 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 700;
    color: #16325c;
    letter-spacing: -0.01em;
}

.designer-hero-meta {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.85rem;
    color: #547190;
    flex-wrap: wrap;
}

.designer-version-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.65rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(255, 255, 255, 0.75);
    border: 1px solid currentColor;
}

.designer-hero--provvisorio .designer-version-badge { color: #a05a00; }
.designer-hero--ufficiale .designer-version-badge { color: #014f8e; }
.designer-hero--storicizzata .designer-version-badge { color: #547190; }

.designer-version-nome {
    font-weight: 600;
    color: #16325c;
}

.designer-hero-actions {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
}

.designer-hero-empty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    color: #547190;
}
```

- [ ] **Step 10.2: Rimuovi gli stili orfani della vecchia sidebar**

Cerca e cancella le regole per `.designer-sidebar`, `.designer-actions-card`, `.designer-toast`, `.designer-action`, `.designer-hint` se esistono.

Run:
```bash
grep -n "designer-sidebar\|designer-actions-card\|designer-toast\|designer-hint" force-app/main/default/lwc/budgetDesigner/budgetDesigner.css
```
Expected: zero righe dopo la pulizia.

- [ ] **Step 10.3: Riorganizza il layout a 2 colonne (tabelle a sx, pannello dx con overview)**

Trova `.designer-layout` e modifica:

```css
.designer-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 1rem;
    align-items: start;
}

@media (max-width: 1100px) {
    .designer-layout { grid-template-columns: 1fr; }
    .designer-overview { position: static; }
}

.designer-overview {
    position: sticky;
    top: 1rem;
}
```

- [ ] **Step 10.4: Stile per la colonna Programma**

Aggiungi:

```css
.sheet .col-prog { width: 18%; }
.sheet td.col-prog { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

Poi **riduci le larghezze** di `col-cat`/`col-name` se l'aggiunta fa uscire la tabella, es:

```css
.sheet .col-cat { width: 18%; }
.sheet .col-name { width: 16%; }
```

- [ ] **Step 10.5: Deploy LWC**

Run:
```bash
sf project deploy start -d force-app/main/default/lwc/budgetDesigner \
  -d force-app/main/default/classes/BudgetVersionController.cls \
  --target-org smaccagno@lab00.dev --wait 15
```
Expected: `Status: Succeeded`.

- [ ] **Step 10.6: Test manuale end-to-end in DEV**

1. Apri la pagina dove vive `budgetDesigner`.
2. Seleziona Anno 2027 → banner vuoto con "Nessun budget…" + tasto `Crea prima versione`.
3. Crea v1 "Scenario A" → banner arancione "Provvisorio".
4. Aggiungi 2 righe Incasso (una programma A, una B) e 1 Spesa (con sottocategoria).
5. Clicca Modifica su una riga → diventa Edit. Cambia valore, Conferma → torna View, valore aggiornato.
6. Clicca "Conferma Budget" → dialog → Conferma → banner diventa azzurro "Ufficiale". Tasti Rinomina/Cestina/Conferma spariscono.
7. Verifica in Salesforce: esistono 2 `Voce_di_Incasso__c` + 1 `Voce_di_Spesa__c` stato Prevista, con `Budget_Version__c` popolato.
8. Clicca una riga → popup fork → Conferma → nuova v2 Provvisorio con le stesse righe.
9. Modifica ammontare, Conferma riga, poi "Conferma Budget" v2.
10. Verifica: v1 ora è Storicizzata; i suoi record Previsti sono stati cancellati; nuovi record legati a v2.

- [ ] **Step 10.7: Commit**

```bash
git add force-app/main/default/lwc/budgetDesigner/budgetDesigner.css
git commit -m "$(cat <<'EOF'
feat(budgetDesigner): banner per-stato (provvisorio/ufficiale/storicizzata)
+ layout 2 colonne

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Coverage finale e push

- [ ] **Step 11.1: Esegui tutti i test Apex pertinenti**

Run:
```bash
sf apex run test --class-names BudgetVersionControllerTest,SpeseExcelEditorControllerTest \
  --target-org smaccagno@lab00.dev --code-coverage --result-format human --wait 10
```
Expected: tutti PASS, coverage `BudgetVersionController` ≥ 75%.

- [ ] **Step 11.2: Lint / prettier**

Run:
```bash
npm run prettier
npm run lint
```
Expected: nessun errore. Se il linter segnala `no-alert` nel designer (`showError` usa `alert`), accetta il warning (è un caso di fallback volutamente semplice) o sostituisci con `showToast` importando da `lightning/platformShowToastEvent` — preferibile se già usato altrove nel progetto.

- [ ] **Step 11.3: Verifica allineamento git + push**

Run:
```bash
git status -sb
git log --oneline -15
git push origin main
```
Expected: push riuscito. Su GitHub la branch main mostra i nuovi commit.

- [ ] **Step 11.4: Sync check (CLAUDE.md)**

Run:
```bash
git fetch --all --prune
git status -sb
```
Expected: `main...origin/main` allineato, nessun `ahead`/`behind`.

---

## Note finali

- **Scope check**: spec e plan coprono lo stesso scope (un singolo feature coerente: versioning del budget). Nessun decomposition necessario.
- **Non-goal** esclusi esplicitamente dal plan: hard-delete automatico, migrazione Previste orfane, export JSON, template cross-year, approval process (coerenti con §9 della spec).
- **Rischio trigger validation su Anno_Se_Ufficiale__c formula unique**: se la formula non viene accettata come unique, il fallback testuale del Task 1 Step 1.11 lascia il campo Text ma senza popolamento automatico — creare in quel caso un mini trigger `BudgetVersionTrigger` before-insert/update che scriva il valore. Lo aggiungo qui come stub opzionale se serve:

  ```apex
  trigger BudgetVersionTrigger on Budget_Version__c (before insert, before update) {
      for (Budget_Version__c v : Trigger.new) {
          v.Anno_Se_Ufficiale__c = (v.Stato__c == 'Ufficiale' && v.Anno__c != null)
              ? String.valueOf(v.Anno__c.intValue()) : null;
      }
  }
  ```
