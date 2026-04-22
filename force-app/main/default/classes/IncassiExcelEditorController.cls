public with sharing class IncassiExcelEditorController {

    public class IncassoPayloadRow {
        @AuraEnabled public Integer anno;
        @AuraEnabled public String categoria;
        @AuraEnabled public Date data;
        @AuraEnabled public Decimal ammontare;
        @AuraEnabled public String stato;
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

    @AuraEnabled(cacheable=true)
    public static List<String> getStatoValues() {
        List<String> values = new List<String>();
        for (Schema.PicklistEntry e : Voce_di_Incasso__c.Stato__c.getDescribe().getPicklistValues()) {
            if (e.isActive()) values.add(e.getValue());
        }
        return values;
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
        Set<String> statiAllowed = new Set<String>(getStatoValues());

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
            payloadRows.add(p);
        }

        Map<Integer, Id> budgetByYear = new Map<Integer, Id>();
        if (!years.isEmpty()) {
            List<String> yearStrs = new List<String>();
            for (Integer y : years) yearStrs.add(String.valueOf(y));

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
                if (tmp.get(y).size() != 1) continue;
                budgetByYear.put(y, tmp.get(y)[0].Id);
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

            if (p.anno == null) {
                err = 'Anno mancante o non valido';
            } else if (!budgetByYear.containsKey(p.anno)) {
                err = 'Nessun Budget default trovato per l\'anno ' + p.anno + ' (o più di uno)';
            } else if (String.isBlank(p.categoria) || !categorieAllowed.contains(p.categoria)) {
                err = 'Categoria non valida';
            } else if (p.data == null) {
                err = 'Data mancante o non valida';
            } else if (p.ammontare == null) {
                err = 'Ammontare mancante o non valido';
            } else if (String.isBlank(p.stato) || !statiAllowed.contains(p.stato)) {
                err = 'Stato non valido';
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
            s.Stato__c = p.stato;
            s.Overview_Budget_per_Anno__c = budgetByYear.get(p.anno);

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
