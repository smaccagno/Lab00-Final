public with sharing class IncassiExcelEditorController {

    public class IncassoPayloadRow {
        @AuraEnabled public Integer anno;
        @AuraEnabled public String categoria;
        @AuraEnabled public Date data;
        @AuraEnabled public Decimal ammontare;
        @AuraEnabled public String stato;
        @AuraEnabled public Id programmaId;
        @AuraEnabled public Integer rowNumber;
    }

    public class IncassoResultRow {
        @AuraEnabled public Integer rowNumber;
        @AuraEnabled public Boolean isSuccess;
        @AuraEnabled public Id incassoId;
        @AuraEnabled public String incassoName;
        @AuraEnabled public String status;
        @AuraEnabled public String errorMessage;
    }

    @AuraEnabled(cacheable=true)
    public static List<String> getCategoriaValues() {
        List<String> values = new List<String>();
        for (Schema.PicklistEntry e : Voce_di_Incasso__c.Categoria__c.getDescribe().getPicklistValues()) {
            if (e.isActive()) values.add(e.getValue());
        }
        return values;
    }

    // REMOVED: getStatoValues() - Excel Editor now forces Stato__c = 'Effettiva' server-side

    public class LabelValue {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        public LabelValue(String l, String v) { this.label = l; this.value = v; }
    }

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
        List<String> out = new List<String>();
        for (Integer i = anni.size() - 1; i >= 0; i--) out.add(anni[i]);
        return out;
    }

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

    @AuraEnabled
    public static Map<String, Object> createIncassiFromFlow(String incassiDataJson) {
        Map<String, Object> result = new Map<String, Object>();
        result.put('success', false);

        List<IncassoResultRow> incassoResults = new List<IncassoResultRow>();
        if (String.isBlank(incassiDataJson)) {
            result.put('createdCount', 0);
            result.put('incassoResults', incassoResults);
            result.put('errorMessage', 'Nessun dato fornito');
            return result;
        }

        Object parsedObj = JSON.deserializeUntyped(incassiDataJson);
        if (parsedObj == null || !(parsedObj instanceof List<Object>)) {
            result.put('createdCount', 0);
            result.put('incassoResults', incassoResults);
            result.put('errorMessage', 'Formato dati non valido: atteso un array');
            return result;
        }

        List<Object> rows = (List<Object>) parsedObj;

        Set<String> categorieAllowed = new Set<String>(getCategoriaValues());

        Set<Integer> years = new Set<Integer>();
        List<IncassoPayloadRow> payloadRows = new List<IncassoPayloadRow>();
        for (Integer i = 0; i < rows.size(); i++) {
            if (!(rows[i] instanceof Map<String, Object>)) continue;
            Map<String, Object> r = (Map<String, Object>) rows[i];

            Integer anno = toIntegerSafe(r.get('anno'));
            if (anno != null) years.add(anno);

            IncassoPayloadRow p = new IncassoPayloadRow();
            p.rowNumber = toIntegerSafe(r.get('rowNumber'));
            p.anno = anno;
            p.categoria = (String) r.get('categoria');
            p.data = toDateSafe(r.get('data'));
            p.ammontare = toDecimalSafe(r.get('ammontare'));
            p.stato = (String) r.get('stato');
            String progIdRaw = (String) r.get('programmaId');
            if (String.isNotBlank(progIdRaw)) {
                try { p.programmaId = (Id) progIdRaw; } catch (Exception e) { p.programmaId = null; }
            }
            payloadRows.add(p);
        }

        Set<Id> programmiNecessari = new Set<Id>();
        for (IncassoPayloadRow p : payloadRows) {
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
                if (!budgetByProgYear.containsKey(key)) {
                    budgetByProgYear.put(key, b.Id);
                }
            }
        }

        List<Voce_di_Incasso__c> toInsert = new List<Voce_di_Incasso__c>();
        Map<Integer, Integer> rowNumberToInsertIndex = new Map<Integer, Integer>();
        List<String> globalErrors = new List<String>();

        for (IncassoPayloadRow p : payloadRows) {
            IncassoResultRow r = new IncassoResultRow();
            r.rowNumber = p.rowNumber;
            r.isSuccess = false;
            r.status = 'error';
            r.incassoId = null;
            r.incassoName = null;

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
            } else if (p.data == null) {
                err = 'Data mancante o non valida';
            } else if (p.ammontare == null) {
                err = 'Ammontare mancante o non valido';
            }

            if (err != null) {
                r.errorMessage = err;
                incassoResults.add(r);
                globalErrors.add('Row ' + p.rowNumber + ': ' + err);
                continue;
            }

            Voce_di_Incasso__c s = new Voce_di_Incasso__c();
            s.Categoria__c = p.categoria;
            s.Data__c = p.data;
            s.Ammontare__c = p.ammontare;
            s.Stato__c = 'Effettiva'; // Task 7: Excel Editor now forces all records to Effettiva
            s.Overview_Budget_per_Anno__c = budgetByProgYear.get(progYearKey);
            s.Programma__c = p.programmaId;

            Integer insertIndex = toInsert.size();
            toInsert.add(s);
            rowNumberToInsertIndex.put(p.rowNumber, insertIndex);

            incassoResults.add(r);
        }

        if (toInsert.isEmpty()) {
            result.put('createdCount', 0);
            result.put('incassoResults', incassoResults);
            result.put('errorMessage', 'Nessun record valido da inserire');
            return result;
        }

        List<Database.SaveResult> saveResults = Database.insert(toInsert, false);

        for (Integer i = 0; i < saveResults.size(); i++) {
            Database.SaveResult sr = saveResults[i];

            Integer rowNumberForInsert = null;
            for (Integer rn : rowNumberToInsertIndex.keySet()) {
                if (rowNumberToInsertIndex.get(rn) == i) {
                    rowNumberForInsert = rn;
                    break;
                }
            }

            for (IncassoResultRow rr : incassoResults) {
                if (rr.rowNumber != rowNumberForInsert) continue;
                if (sr.isSuccess()) {
                    rr.isSuccess = true;
                    rr.status = 'success';
                    rr.incassoId = sr.getId();
                    rr.errorMessage = null;
                } else {
                    rr.isSuccess = false;
                    rr.status = 'error';
                    rr.incassoId = null;
                    rr.errorMessage = (sr.getErrors() != null && !sr.getErrors().isEmpty())
                        ? sr.getErrors()[0].getMessage()
                        : 'Errore sconosciuto durante l\'inserimento';
                }
                break;
            }
        }

        Integer successCount = 0;
        for (IncassoResultRow rr : incassoResults) {
            if (rr.isSuccess == true) successCount++;
        }

        Set<Id> insertedIds = new Set<Id>();
        for (IncassoResultRow rr : incassoResults) {
            if (rr.isSuccess == true && rr.incassoId != null) {
                insertedIds.add(rr.incassoId);
            }
        }
        if (!insertedIds.isEmpty()) {
            Map<Id, Voce_di_Incasso__c> incassoById = new Map<Id, Voce_di_Incasso__c>(
                [SELECT Id, Name FROM Voce_di_Incasso__c WHERE Id IN :insertedIds]
            );
            for (IncassoResultRow rr : incassoResults) {
                if (rr.incassoId != null && incassoById.containsKey(rr.incassoId)) {
                    rr.incassoName = incassoById.get(rr.incassoId).Name;
                }
            }
        }

        result.put('success', successCount > 0);
        result.put('createdCount', successCount);
        result.put('incassoResults', incassoResults);
        result.put('errorMessage', successCount == incassoResults.size() ? null : (globalErrors.isEmpty() ? null : String.join(globalErrors, '; ')));
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
        try { return Integer.valueOf(s); } catch (Exception e) { return null; }
    }

    private static Decimal toDecimalSafe(Object obj) {
        if (obj == null) return null;
        if (obj instanceof Decimal) return (Decimal) obj;
        if (obj instanceof Integer) return Decimal.valueOf((Integer) obj);
        String s = String.valueOf(obj);
        if (String.isBlank(s) || s == 'null') return null;
        try { return Decimal.valueOf(s.replace(',', '.')); } catch (Exception e) { return null; }
    }

    private static Date toDateSafe(Object obj) {
        if (obj == null) return null;
        if (obj instanceof Date) return (Date) obj;
        String s = String.valueOf(obj);
        if (String.isBlank(s) || s == 'null') return null;
        if (s.contains('/')) {
            List<String> parts = s.split('/');
            if (parts.size() == 3) {
                Integer dd = Integer.valueOf(parts[0]);
                Integer mm = Integer.valueOf(parts[1]);
                Integer yyyy = Integer.valueOf(parts[2]);
                return Date.newInstance(yyyy, mm, dd);
            }
        }
        try { return Date.valueOf(s); } catch (Exception e) { return null; }
    }
}
