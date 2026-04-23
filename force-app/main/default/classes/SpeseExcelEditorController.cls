public with sharing class SpeseExcelEditorController {

    public class SpesaPayloadRow {
        @AuraEnabled public Integer anno;
        @AuraEnabled public String categoria;
        @AuraEnabled public String sottocategoria;
        @AuraEnabled public String note;
        @AuraEnabled public Date data;
        @AuraEnabled public Decimal ammontare;
        @AuraEnabled public String stato;
        @AuraEnabled public Id programmaId;
        @AuraEnabled public Integer rowNumber;
    }

    public class SpesaResultRow {
        @AuraEnabled public Integer rowNumber;
        @AuraEnabled public Boolean isSuccess;
        @AuraEnabled public Id spesaId;
        @AuraEnabled public String spesaName;
        @AuraEnabled public String status;
        @AuraEnabled public String errorMessage;
    }

    @AuraEnabled(cacheable=true)
    public static List<String> getCategoriaValues() {
        // UI: usiamo i valori reali del picklist Categoria__c
        List<String> values = new List<String>();
        for (Schema.PicklistEntry e : Voce_di_Spesa__c.Categoria__c.getDescribe().getPicklistValues()) {
            values.add(e.getValue());
        }
        return values;
    }

    // REMOVED: getStatoValues() - Excel Editor now forces Stato__c = 'Effettiva' server-side

    /** DTO usato dalla UI per i combo Anno / Programma. */
    public class LabelValue {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        public LabelValue(String l, String v) { this.label = l; this.value = v; }
    }

    /** Anni distinti presi da Anno_Reportistica__c, ordine decrescente. */
    @AuraEnabled(cacheable=true)
    public static List<String> getAnniValues() {
        Set<String> seen = new Set<String>();
        for (Anno_Reportistica__c a : [
            SELECT Name FROM Anno_Reportistica__c WHERE Name != null
        ]) {
            if (String.isNotBlank(a.Name)) seen.add(a.Name.trim());
        }
        List<String> anni = new List<String>(seen);
        anni.sort();
        // Descending.
        List<String> out = new List<String>();
        for (Integer i = anni.size() - 1; i >= 0; i--) out.add(anni[i]);
        return out;
    }

    /** Programmi "Attivo" con label+Id per alimentare il combo in UI. */
    @AuraEnabled(cacheable=true)
    public static List<LabelValue> getProgrammiValues() {
        List<LabelValue> out = new List<LabelValue>();
        for (Program p : [
            SELECT Id, Name FROM Program WHERE Status = 'Attivo' ORDER BY Name
        ]) {
            out.add(new LabelValue(p.Name, p.Id));
        }
        return out;
    }

    /**
     * Costruisce dinamicamente la mappa controlling (Categoria__c) -> dependent (Sottocategoria__c)
     * leggendo i metadata del picklist. Preferito all'hardcode: gli admin possono aggiungere/modificare
     * valori in Setup senza redeploy.
     *
     * Come funziona validFor: per ogni PicklistEntry dependent restituisce un byte array base64 dove
     * il bit i-esimo (MSB-first nel byte ⌊i/8⌋) indica se il controlling value di indice i è valido.
     * Accediamo a validFor via JSON.serialize(entry) (Schema.PicklistEntry.getValidFor() non è esposta
     * pubblicamente ma il campo è presente nella forma serializzata).
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, List<String>> getSottocategorieByCategoria() {
        Map<String, List<String>> outMap = new Map<String, List<String>>();

        List<Schema.PicklistEntry> controllingEntries = Voce_di_Spesa__c.Categoria__c.getDescribe().getPicklistValues();
        List<String> controllingValues = new List<String>();
        for (Schema.PicklistEntry ctrl : controllingEntries) {
            if (ctrl.isActive()) {
                controllingValues.add(ctrl.getValue());
                outMap.put(ctrl.getValue(), new List<String>());
            }
        }

        for (Schema.PicklistEntry dep : Voce_di_Spesa__c.Sottocategoria__c.getDescribe().getPicklistValues()) {
            if (!dep.isActive()) continue;
            Object validForRaw = ((Map<String, Object>) JSON.deserializeUntyped(JSON.serialize(dep))).get('validFor');
            if (validForRaw == null) continue;
            String validForBase64 = String.valueOf(validForRaw);
            if (String.isBlank(validForBase64)) continue;
            List<Integer> validForBytes = decodeBase64ToBytes(validForBase64);
            for (Integer i = 0; i < controllingValues.size(); i++) {
                Integer byteIndex = i / 8;
                Integer bitIndex = 7 - Math.mod(i, 8);
                if (byteIndex < validForBytes.size()
                    && (validForBytes[byteIndex] & (1 << bitIndex)) != 0) {
                    outMap.get(controllingValues.get(i)).add(dep.getValue());
                }
            }
        }

        return outMap;
    }

    private static List<Integer> decodeBase64ToBytes(String b64) {
        Blob b = EncodingUtil.base64Decode(b64);
        String hex = EncodingUtil.convertToHex(b);
        List<Integer> bytes = new List<Integer>();
        for (Integer i = 0; i < hex.length(); i += 2) {
            bytes.add(hexPairToInt(hex.substring(i, i + 2)));
        }
        return bytes;
    }

    private static Integer hexPairToInt(String pair) {
        return hexCharToInt(pair.substring(0, 1)) * 16 + hexCharToInt(pair.substring(1, 2));
    }

    private static Integer hexCharToInt(String c) {
        String lc = c.toLowerCase();
        if (lc == '0') return 0; if (lc == '1') return 1; if (lc == '2') return 2; if (lc == '3') return 3;
        if (lc == '4') return 4; if (lc == '5') return 5; if (lc == '6') return 6; if (lc == '7') return 7;
        if (lc == '8') return 8; if (lc == '9') return 9; if (lc == 'a') return 10; if (lc == 'b') return 11;
        if (lc == 'c') return 12; if (lc == 'd') return 13; if (lc == 'e') return 14; if (lc == 'f') return 15;
        return 0;
    }

    @AuraEnabled
    public static Map<String, Object> createSpeseFromFlow(String speseDataJson) {
        Map<String, Object> result = new Map<String, Object>();
        result.put('success', false);

        List<SpesaResultRow> spesaResults = new List<SpesaResultRow>();
        if (String.isBlank(speseDataJson)) {
            result.put('createdCount', 0);
            result.put('spesaResults', spesaResults);
            result.put('errorMessage', 'Nessun dato fornito');
            return result;
        }

        Object parsedObj = JSON.deserializeUntyped(speseDataJson);
        if (parsedObj == null || !(parsedObj instanceof List<Object>)) {
            result.put('createdCount', 0);
            result.put('spesaResults', spesaResults);
            result.put('errorMessage', 'Formato dati non valido: atteso un array');
            return result;
        }

        List<Object> rows = (List<Object>) parsedObj;

        // Pre-carico picklist info per validazioni client-friendly
        Map<String, List<String>> sottocategorieByCategoria = getSottocategorieByCategoria();
        Set<String> categorieAllowed = new Set<String>(getCategoriaValues());

        // Budget lookup per anno (default)
        Set<Integer> years = new Set<Integer>();
        List<SpesaPayloadRow> payloadRows = new List<SpesaPayloadRow>();
        for (Integer i = 0; i < rows.size(); i++) {
            if (!(rows[i] instanceof Map<String, Object>)) continue;
            Map<String, Object> r = (Map<String, Object>) rows[i];

            Integer anno = toIntegerSafe(r.get('anno'));
            if (anno != null) years.add(anno);

            SpesaPayloadRow p = new SpesaPayloadRow();
            p.rowNumber = toIntegerSafe(r.get('rowNumber'));
            p.anno = anno;
            p.categoria = (String) r.get('categoria');
            p.sottocategoria = (String) r.get('sottocategoria');
            p.note = (String) r.get('note');
            p.data = toDateSafe(r.get('data'));
            p.ammontare = toDecimalSafe(r.get('ammontare'));
            p.stato = (String) r.get('stato');
            String progIdRaw = (String) r.get('programmaId');
            if (String.isNotBlank(progIdRaw)) {
                try { p.programmaId = (Id) progIdRaw; } catch (Exception e) { p.programmaId = null; }
            }
            payloadRows.add(p);
        }

        // Risoluzione Overview_Budget_per_Anno per (Programma, Anno):
        // prendiamo solo i budget legati al programma scelto dall'utente,
        // con DEFAULT_PRG__c = true sul GiftDesignation padre (i.e. budget
        // del partner Default_per_Budgets) e Anno coincidente.
        Set<Id> programmiNecessari = new Set<Id>();
        for (SpesaPayloadRow p : payloadRows) {
            if (p.programmaId != null) programmiNecessari.add(p.programmaId);
        }

        Map<String, Id> budgetByProgYear = new Map<String, Id>();
        if (!years.isEmpty() && !programmiNecessari.isEmpty()) {
            List<String> yearStrs = new List<String>();
            for (Integer y : years) yearStrs.add(String.valueOf(y));

            for (Overview_Budget_per_Anno__c b : [
                SELECT Id, Anno__c, Budget__c, Budget__r.Program__c, Budget__r.DEFAULT_PRG__c
                FROM Overview_Budget_per_Anno__c
                WHERE Anno__c IN :yearStrs
                  AND Budget__r.DEFAULT_PRG__c = true
                  AND Budget__r.Program__c IN :programmiNecessari
            ]) {
                if (b.Budget__r == null || b.Budget__r.Program__c == null) continue;
                String key = b.Budget__r.Program__c + '|' + b.Anno__c;
                // Se dovessero esistere più default per la stessa coppia
                // manteniamo il primo (scenario edge: configurazione errata).
                if (!budgetByProgYear.containsKey(key)) {
                    budgetByProgYear.put(key, b.Id);
                }
            }
        }

        List<Voce_di_Spesa__c> toInsert = new List<Voce_di_Spesa__c>();
        Map<Integer, Integer> rowNumberToInsertIndex = new Map<Integer, Integer>();
        List<String> globalErrors = new List<String>();

        for (SpesaPayloadRow p : payloadRows) {
            SpesaResultRow r = new SpesaResultRow();
            r.rowNumber = p.rowNumber;
            r.isSuccess = false;
            r.status = 'error';
            r.spesaId = null;
            r.spesaName = null;

            String err;

            String progYearKey = (p.programmaId != null && p.anno != null)
                ? (String.valueOf(p.programmaId) + '|' + String.valueOf(p.anno))
                : null;

            if (p.anno == null) {
                err = 'Anno mancante o non valido';
            } else if (p.programmaId == null) {
                err = 'Programma mancante o non valido';
            } else if (!budgetByProgYear.containsKey(progYearKey)) {
                err = 'Nessun Budget default trovato per programma+anno ' + p.anno;
            } else if (String.isBlank(p.categoria) || !categorieAllowed.contains(p.categoria)) {
                err = 'Categoria non valida';
            } else if (String.isBlank(p.sottocategoria)) {
                err = 'Sottocategoria mancante';
            } else if (!sottocategorieByCategoria.containsKey(p.categoria) || !sottocategorieByCategoria.get(p.categoria).contains(p.sottocategoria)) {
                err = 'Sottocategoria non valida per la Categoria selezionata';
            } else if (p.data == null) {
                err = 'Data mancante o non valida';
            } else if (p.ammontare == null) {
                err = 'Ammontare mancante o non valido';
            }

            if (err != null) {
                r.errorMessage = err;
                spesaResults.add(r);
                globalErrors.add('Row ' + p.rowNumber + ': ' + err);
                continue;
            }

            Voce_di_Spesa__c s = new Voce_di_Spesa__c();
            s.Anno__c = p.anno;
            s.Categoria__c = p.categoria;
            s.Sottocategoria__c = p.sottocategoria;
            s.Note__c = p.note;
            s.Data__c = p.data;
            s.Ammontare__c = p.ammontare;
            s.Stato__c = 'Effettiva'; // Task 7: Excel Editor now forces all records to Effettiva
            s.Overview_Budget_per_Anno__c = budgetByProgYear.get(progYearKey);
            s.Programma__c = p.programmaId;

            Integer insertIndex = toInsert.size();
            toInsert.add(s);
            rowNumberToInsertIndex.put(p.rowNumber, insertIndex);

            // placeholder result: verrà riempito dopo insert
            spesaResults.add(r);
        }

        if (toInsert.isEmpty()) {
            result.put('createdCount', 0);
            result.put('spesaResults', spesaResults);
            result.put('errorMessage', 'Nessun record valido da inserire');
            return result;
        }

        List<Database.SaveResult> saveResults = Database.insert(toInsert, false);

        // Popolo spesaResults aggiornando solo i placeholder "rowNumberToInsertIndex"
        for (Integer i = 0; i < saveResults.size(); i++) {
            Database.SaveResult sr = saveResults[i];

            // Trova rowNumber associato
            Integer rowNumberForInsert;
            // reverse lookup: rowNumberToInsertIndex is unique for the created row
            rowNumberForInsert = null;
            for (Integer rn : rowNumberToInsertIndex.keySet()) {
                if (rowNumberToInsertIndex.get(rn) == i) {
                    rowNumberForInsert = rn;
                    break;
                }
            }

            for (SpesaResultRow rr : spesaResults) {
                if (rr.rowNumber != rowNumberForInsert) continue;
                if (sr.isSuccess()) {
                    rr.isSuccess = true;
                    rr.status = 'success';
                    rr.spesaId = sr.getId();
                    rr.errorMessage = null;
                } else {
                    rr.isSuccess = false;
                    rr.status = 'error';
                    rr.spesaId = null;
                    rr.errorMessage = (sr.getErrors() != null && !sr.getErrors().isEmpty())
                        ? sr.getErrors()[0].getMessage()
                        : 'Errore sconosciuto durante l\'inserimento';
                }
                break;
            }
        }

        Integer successCount = 0;
        for (SpesaResultRow rr : spesaResults) {
            if (rr.isSuccess == true) successCount++;
        }

        // Riporta anche il nome del record creato (utile per i link in UI)
        Set<Id> insertedIds = new Set<Id>();
        for (SpesaResultRow rr : spesaResults) {
            if (rr.isSuccess == true && rr.spesaId != null) {
                insertedIds.add(rr.spesaId);
            }
        }
        if (!insertedIds.isEmpty()) {
            Map<Id, Voce_di_Spesa__c> spesaById = new Map<Id, Voce_di_Spesa__c>(
                [SELECT Id, Name FROM Voce_di_Spesa__c WHERE Id IN :insertedIds]
            );
            for (SpesaResultRow rr : spesaResults) {
                if (rr.spesaId != null && spesaById.containsKey(rr.spesaId)) {
                    rr.spesaName = spesaById.get(rr.spesaId).Name;
                }
            }
        }

        result.put('success', successCount > 0);
        result.put('createdCount', successCount);
        result.put('spesaResults', spesaResults);
        result.put('errorMessage', successCount == spesaResults.size() ? null : (globalErrors.isEmpty() ? null : String.join(globalErrors, '; ')));
        return result;
    }

    // ---------------------------
    // Conversion helpers
    // ---------------------------

    private static Integer toIntegerSafe(Object obj) {
        if (obj == null) return null;
        if (obj instanceof Integer) return (Integer) obj;
        if (obj instanceof Decimal) return ((Decimal) obj).intValue();
        String s = String.valueOf(obj);
        if (String.isBlank(s) || s == 'null') return null;
        try {
            return Integer.valueOf(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static Decimal toDecimalSafe(Object obj) {
        if (obj == null) return null;
        if (obj instanceof Decimal) return (Decimal) obj;
        if (obj instanceof Integer) return Decimal.valueOf((Integer) obj);
        String s = String.valueOf(obj);
        if (String.isBlank(s) || s == 'null') return null;
        try {
            return Decimal.valueOf(s.replace(',', '.'));
        } catch (Exception e) {
            return null;
        }
    }

    private static Date toDateSafe(Object obj) {
        if (obj == null) return null;
        if (obj instanceof Date) return (Date) obj;
        String s = String.valueOf(obj);
        if (String.isBlank(s) || s == 'null') return null;

        // Accetta:
        // - yyyy-MM-dd (Date.valueOf)
        // - dd/MM/yyyy
        if (s.contains('/')) {
            List<String> parts = s.split('/');
            if (parts.size() == 3) {
                Integer dd = Integer.valueOf(parts[0]);
                Integer mm = Integer.valueOf(parts[1]);
                Integer yyyy = Integer.valueOf(parts[2]);
                return Date.newInstance(yyyy, mm, dd);
            }
        }
        try {
            return Date.valueOf(s);
        } catch (Exception e) {
            return null;
        }
    }
}

