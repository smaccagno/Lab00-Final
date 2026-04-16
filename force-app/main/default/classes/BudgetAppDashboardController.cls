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

    @AuraEnabled
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
