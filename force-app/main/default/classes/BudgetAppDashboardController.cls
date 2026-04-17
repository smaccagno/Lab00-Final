public with sharing class BudgetAppDashboardController {
    public class DashboardData {
        @AuraEnabled public Id accountId;
        @AuraEnabled public List<GiftDesignation> programs;
    }

    @AuraEnabled(cacheable=true)
    public static DashboardData getDashboardData() {
        DashboardData data = new DashboardData();
        List<Account> accs = [SELECT Id FROM Account WHERE Name = 'Lab00' LIMIT 1];
        if (!accs.isEmpty()) {
            data.accountId = accs[0].Id;
            data.programs = [SELECT Id, Name, Program__r.Name FROM GiftDesignation WHERE Partner__c = :data.accountId ORDER BY Program__r.Name];
        }
        return data;
    }

    public class YearSummary {
        @AuraEnabled public String anno;
        @AuraEnabled public String tipo;
        @AuraEnabled public String categoria;
        @AuraEnabled public Decimal previsto;
        @AuraEnabled public Decimal effettivo;
        
        public YearSummary(String anno, String tipo, String categoria) {
            this.anno = anno;
            this.tipo = tipo;
            this.categoria = categoria;
            this.previsto = 0;
            this.effettivo = 0;
        }
    }

    public class ProgramItem {
        @AuraEnabled public Id budgetYearId;
        @AuraEnabled public String anno;
        @AuraEnabled public String tipo;
        @AuraEnabled public String categoria;
        @AuraEnabled public String stato;
        @AuraEnabled public Decimal ammontare;
        @AuraEnabled public Date itemDate;

        public ProgramItem(Id budgetYearId, String anno, String tipo, String categoria, String stato, Decimal ammontare, Date itemDate) {
            this.budgetYearId = budgetYearId;
            this.anno = anno;
            this.tipo = tipo;
            this.categoria = categoria;
            this.stato = stato;
            this.ammontare = ammontare;
            this.itemDate = itemDate;
        }
    }

    public class ScaleValues {
        @AuraEnabled public Decimal maxIncassiVal;
        @AuraEnabled public Decimal maxSpeseVal;
        @AuraEnabled public Decimal maxCashFlowVal;
        @AuraEnabled public Decimal maxGlobalVal;

        public ScaleValues() {
            this.maxIncassiVal = 0;
            this.maxSpeseVal = 0;
            this.maxCashFlowVal = 0;
            this.maxGlobalVal = 0;
        }
    }

    private class AmountPair {
        public Decimal previsto = 0;
        public Decimal effettivo = 0;
    }

    @AuraEnabled(cacheable=true)
    public static ScaleValues getProgramsScaleValues(Id accountId, String selectedDateStr) {
        ScaleValues result = new ScaleValues();
        if (accountId == null) return result;

        Date filterDate = null;
        if (String.isNotBlank(selectedDateStr)) {
            try {
                filterDate = Date.valueOf(selectedDateStr);
            } catch (Exception e) {
                // Keep null filterDate if parsing fails.
            }
        }

        Map<String, AmountPair> incassiByProgramCategory = new Map<String, AmountPair>();
        Map<String, AmountPair> speseByProgramCategory = new Map<String, AmountPair>();
        Map<Id, AmountPair> incassiTotalsByProgram = new Map<Id, AmountPair>();
        Map<Id, AmountPair> speseTotalsByProgram = new Map<Id, AmountPair>();

        for (Voce_di_Incasso__c vi : [
            SELECT Categoria__c, Stato__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__r.Budget__c
            FROM Voce_di_Incasso__c
            WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :accountId
        ]) {
            Id programId = vi.Overview_Budget_per_Anno__r.Budget__c;
            if (programId == null) continue;
            String categoria = String.isBlank(vi.Categoria__c) ? 'Non categorizzato' : vi.Categoria__c;
            String stato = vi.Stato__c;
            Decimal amount = vi.Ammontare__c == null ? 0 : vi.Ammontare__c;

            String key = String.valueOf(programId) + '::' + categoria;
            if (!incassiByProgramCategory.containsKey(key)) {
                incassiByProgramCategory.put(key, new AmountPair());
            }
            if (!incassiTotalsByProgram.containsKey(programId)) {
                incassiTotalsByProgram.put(programId, new AmountPair());
            }

            AmountPair pair = incassiByProgramCategory.get(key);
            AmountPair totalPair = incassiTotalsByProgram.get(programId);

            Boolean includeEffettivo = filterDate == null || vi.Data__c == null || vi.Data__c <= filterDate;
            if (stato == 'Effettiva') {
                if (includeEffettivo) {
                    pair.effettivo += amount;
                    totalPair.effettivo += amount;
                }
            } else if (stato == 'Prevista') {
                pair.previsto += amount;
                totalPair.previsto += amount;
            } else if (stato == 'Annullata') {
                pair.previsto -= amount;
                totalPair.previsto -= amount;
            }
        }

        for (Voce_di_Spesa__c vs : [
            SELECT Stato__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__r.Budget__c
            FROM Voce_di_Spesa__c
            WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :accountId
        ]) {
            Id programId = vs.Overview_Budget_per_Anno__r.Budget__c;
            if (programId == null) continue;
            String categoria = 'Non categorizzato';
            String stato = vs.Stato__c;
            Decimal amount = vs.Ammontare__c == null ? 0 : vs.Ammontare__c;

            String key = String.valueOf(programId) + '::' + categoria;
            if (!speseByProgramCategory.containsKey(key)) {
                speseByProgramCategory.put(key, new AmountPair());
            }
            if (!speseTotalsByProgram.containsKey(programId)) {
                speseTotalsByProgram.put(programId, new AmountPair());
            }

            AmountPair pair = speseByProgramCategory.get(key);
            AmountPair totalPair = speseTotalsByProgram.get(programId);

            Boolean includeEffettivo = filterDate == null || vs.Data__c == null || vs.Data__c <= filterDate;
            if (stato == 'Effettiva') {
                if (includeEffettivo) {
                    pair.effettivo += amount;
                    totalPair.effettivo += amount;
                }
            } else if (stato == 'Prevista') {
                pair.previsto += amount;
                totalPair.previsto += amount;
            } else if (stato == 'Annullata') {
                pair.previsto -= amount;
                totalPair.previsto -= amount;
            }
        }

        for (AmountPair pair : incassiByProgramCategory.values()) {
            if (pair.previsto < 0) {
                pair.effettivo += pair.previsto;
                pair.previsto = 0;
            }
            if (pair.effettivo < 0) pair.effettivo = 0;
            result.maxIncassiVal = Math.max(result.maxIncassiVal, Math.max(pair.effettivo, pair.previsto));
        }

        for (AmountPair pair : speseByProgramCategory.values()) {
            if (pair.previsto < 0) {
                pair.effettivo += pair.previsto;
                pair.previsto = 0;
            }
            if (pair.effettivo < 0) pair.effettivo = 0;
            result.maxSpeseVal = Math.max(result.maxSpeseVal, Math.max(pair.effettivo, pair.previsto));
        }

        Set<Id> programIds = new Set<Id>();
        programIds.addAll(incassiTotalsByProgram.keySet());
        programIds.addAll(speseTotalsByProgram.keySet());
        for (Id programId : programIds) {
            AmountPair inc = incassiTotalsByProgram.containsKey(programId) ? incassiTotalsByProgram.get(programId) : new AmountPair();
            AmountPair spe = speseTotalsByProgram.containsKey(programId) ? speseTotalsByProgram.get(programId) : new AmountPair();

            if (inc.previsto < 0) {
                inc.effettivo += inc.previsto;
                inc.previsto = 0;
            }
            if (inc.effettivo < 0) inc.effettivo = 0;
            if (spe.previsto < 0) {
                spe.effettivo += spe.previsto;
                spe.previsto = 0;
            }
            if (spe.effettivo < 0) spe.effettivo = 0;

            Decimal dispEff = inc.effettivo - spe.effettivo;
            Decimal dispPrev = inc.previsto - spe.previsto;
            Decimal maxCashForProgram = Math.max(
                Math.max(inc.effettivo, inc.previsto),
                Math.max(Math.max(spe.effettivo, spe.previsto), Math.max(Math.abs(dispEff), Math.abs(dispPrev)))
            );
            result.maxCashFlowVal = Math.max(result.maxCashFlowVal, maxCashForProgram);
        }

        result.maxGlobalVal = Math.max(result.maxIncassiVal, Math.max(result.maxSpeseVal, result.maxCashFlowVal));

        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<ProgramItem> getProgramItems(Id programId) {
        List<ProgramItem> items = new List<ProgramItem>();
        if (programId == null) return items;

        for (Voce_di_Incasso__c vi : [
            SELECT Categoria__c, Stato__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__c, Overview_Budget_per_Anno__r.Anno__c
            FROM Voce_di_Incasso__c
            WHERE Overview_Budget_per_Anno__r.Budget__c = :programId
        ]) {
            String anno = vi.Overview_Budget_per_Anno__r.Anno__c;
            if (String.isBlank(anno)) anno = 'N/A';
            String categoria = vi.Categoria__c;
            if (String.isBlank(categoria)) categoria = 'Non categorizzato';
            String stato = vi.Stato__c;
            Decimal ammontare = vi.Ammontare__c != null ? vi.Ammontare__c : 0;
            items.add(new ProgramItem(vi.Overview_Budget_per_Anno__c, anno, 'Incasso', categoria, stato, ammontare, vi.Data__c));
        }

        for (Voce_di_Spesa__c vs : [
            SELECT Stato__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__c, Overview_Budget_per_Anno__r.Anno__c
            FROM Voce_di_Spesa__c
            WHERE Overview_Budget_per_Anno__r.Budget__c = :programId
        ]) {
            String anno = vs.Overview_Budget_per_Anno__r.Anno__c;
            if (String.isBlank(anno)) anno = 'N/A';
            String stato = vs.Stato__c;
            Decimal ammontare = vs.Ammontare__c != null ? vs.Ammontare__c : 0;
            items.add(new ProgramItem(vs.Overview_Budget_per_Anno__c, anno, 'Spesa', 'Non categorizzato', stato, ammontare, vs.Data__c));
        }

        return items;
    }

    @AuraEnabled(cacheable=true)
    public static List<YearSummary> getProgramDetailsData(Id programId, String selectedDateStr) {
        List<YearSummary> results = new List<YearSummary>();
        if (programId == null) return results;

        Date filterDate = null;
        if (String.isNotBlank(selectedDateStr)) {
            try {
                filterDate = Date.valueOf(selectedDateStr);
            } catch (Exception e) {
                System.debug('Error parsing date: ' + e.getMessage());
            }
        }

        Map<String, YearSummary> yearToTypeToCatToSummary = new Map<String, YearSummary>();

        for (Voce_di_Incasso__c vi : [
            SELECT Categoria__c, Stato__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__r.Anno__c
            FROM Voce_di_Incasso__c
            WHERE Overview_Budget_per_Anno__r.Budget__c = :programId
        ]) {
            String anno = vi.Overview_Budget_per_Anno__r.Anno__c;
            if (String.isBlank(anno)) anno = 'N/A';
            String cat = vi.Categoria__c;
            if (String.isBlank(cat)) cat = 'Non categorizzato';
            String stato = vi.Stato__c;
            Decimal tot = vi.Ammontare__c != null ? vi.Ammontare__c : 0;

            String key = anno + '_Incasso_' + cat;
            if (!yearToTypeToCatToSummary.containsKey(key)) {
                yearToTypeToCatToSummary.put(key, new YearSummary(anno, 'Incasso', cat));
            }
            YearSummary ys = yearToTypeToCatToSummary.get(key);

            if (filterDate == null || vi.Data__c == null || vi.Data__c <= filterDate) {
                if (stato == 'Effettiva') {
                    ys.effettivo += tot;
                } else if (stato == 'Prevista') {
                    ys.previsto += tot;
                } else if (stato == 'Annullata') {
                    ys.previsto -= tot;
                }
            } else {
                if (stato == 'Prevista') {
                    ys.previsto += tot;
                } else if (stato == 'Annullata') {
                    ys.previsto -= tot;
                }
            }
        }

        for (Voce_di_Spesa__c vs : [
            SELECT Categoria__c, Stato__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__r.Anno__c
            FROM Voce_di_Spesa__c
            WHERE Overview_Budget_per_Anno__r.Budget__c = :programId
        ]) {
            String anno = vs.Overview_Budget_per_Anno__r.Anno__c;
            if (String.isBlank(anno)) anno = 'N/A';
            String cat = vs.Categoria__c;
            if (String.isBlank(cat)) cat = 'Non categorizzato';
            String stato = vs.Stato__c;
            Decimal tot = vs.Ammontare__c != null ? vs.Ammontare__c : 0;

            String key = anno + '_Spesa_' + cat;
            if (!yearToTypeToCatToSummary.containsKey(key)) {
                yearToTypeToCatToSummary.put(key, new YearSummary(anno, 'Spesa', cat));
            }
            YearSummary ys = yearToTypeToCatToSummary.get(key);

            if (filterDate == null || vs.Data__c == null || vs.Data__c <= filterDate) {
                if (stato == 'Effettiva') {
                    ys.effettivo += tot;
                } else if (stato == 'Prevista') {
                    ys.previsto += tot;
                } else if (stato == 'Annullata') {
                    ys.previsto -= tot;
                }
            } else {
                if (stato == 'Prevista') {
                    ys.previsto += tot;
                } else if (stato == 'Annullata') {
                    ys.previsto -= tot;
                }
            }
        }

        // Adjust negative previsto and calculate totale
        for (YearSummary ys : yearToTypeToCatToSummary.values()) {
            if (ys.previsto < 0) {
                ys.effettivo += ys.previsto;
                ys.previsto = 0;
            }
            if (ys.effettivo < 0) ys.effettivo = 0;
            
            if (ys.effettivo != 0 || ys.previsto != 0) {
                results.add(ys);
            }
        }

        // Sort by year descending, then type, then category
        // We can just return and let LWC sort or sort here.
        // Let's sort in LWC for simplicity, or just return as is.
        return results;
    }
}
