public with sharing class SpeseExcelEditorController {

    public class SpesaPayloadRow {
        @AuraEnabled public Integer anno;
        @AuraEnabled public String categoria;
        @AuraEnabled public String sottocategoria;
        @AuraEnabled public String note;
        @AuraEnabled public Date data;
        @AuraEnabled public Decimal ammontare;
        @AuraEnabled public String stato;
        @AuraEnabled public Integer rowNumber;
    }

    public class SpesaResultRow {
        @AuraEnabled public Integer rowNumber;
        @AuraEnabled public Boolean isSuccess;
        @AuraEnabled public Id spesaId;
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

    @AuraEnabled(cacheable=true)
    public static List<String> getStatoValues() {
        List<String> values = new List<String>();
        for (Schema.PicklistEntry e : Voce_di_Spesa__c.Stato__c.getDescribe().getPicklistValues()) {
            values.add(e.getValue());
        }
        return values;
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, List<String>> getSottocategorieByCategoria() {
        // Dependent picklist:
        // - Categoria__c è controlling
        // - Sottocategoria__c è dependent
        List<Schema.PicklistEntry> controllingValues = Voce_di_Spesa__c.Categoria__c.getDescribe().getPicklistValues();
        Schema.DescribeFieldResult dependentDfr = Voce_di_Spesa__c.Sottocategoria__c.getDescribe();
        List<Schema.PicklistEntry> dependentValues = dependentDfr.getPicklistValues();

        // Map: controllingValue -> list of valid dependent values
        Map<String, List<String>> outMap = new Map<String, List<String>>();

        for (Schema.PicklistEntry dep : dependentValues) {
            List<Integer> validFor = dep.getValidFor();
            for (Integer idx : validFor) {
                if (idx == null || idx < 0 || idx >= controllingValues.size()) continue;
                String controlling = controllingValues[idx].getValue();
                String dependent = dep.getValue();
                if (!outMap.containsKey(controlling)) outMap.put(controlling, new List<String>());
                if (!outMap.get(controlling).contains(dependent)) outMap.get(controlling).add(dependent);
            }
        }

        // Ordina in modo stabile per UI
        for (String k : outMap.keySet()) {
            outMap.get(k).sort();
        }
        return outMap;
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
        Set<String> statiAllowed = new Set<String>(getStatoValues());

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
            payloadRows.add(p);
        }

        Map<Integer, Id> budgetByYear = new Map<Integer, Id>();
        if (!years.isEmpty()) {
            List<String> yearStrs = new List<String>();
            for (Integer y : years) yearStrs.add(String.valueOf(y));

            // Anno__c è un Text (lunghezza 4) su Overview_Budget_per_Anno__c
            List<Overview_Budget_per_Anno__c> budgets = [
                SELECT Id, Anno__c, isDefault__c, Budget__c
                FROM Overview_Budget_per_Anno__c
                WHERE isDefault__c = true AND Anno__c IN :yearStrs
            ];

            Map<Integer, List<Overview_Budget_per_Anno__c>> tmp = new Map<Integer, List<Overview_Budget_per_Anno__c>>();
            for (Overview_Budget_per_Anno__c b : budgets) {
                Integer y = toIntegerSafe(b.Anno__c);
                if (y == null) continue;
                if (!tmp.containsKey(y)) tmp.put(y, new List<Overview_Budget_per_Anno__c>());
                tmp.get(y).add(b);
            }

            for (Integer y : years) {
                if (!tmp.containsKey(y) || tmp.get(y).isEmpty()) continue;
                // Correttezza: se esistono più default per anno, blocchiamo.
                if (tmp.get(y).size() != 1) continue;
                budgetByYear.put(y, tmp.get(y)[0].Id);
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

            String err;

            if (p.anno == null) {
                err = 'Anno mancante o non valido';
            } else if (!budgetByYear.containsKey(p.anno)) {
                err = 'Nessun Budget default trovato per l\'anno ' + p.anno + ' (o più di uno)';
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
            } else if (String.isBlank(p.stato) || !statiAllowed.contains(p.stato)) {
                err = 'Stato non valido';
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
            s.Stato__c = p.stato;
            s.Overview_Budget_per_Anno__c = budgetByYear.get(p.anno);

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

