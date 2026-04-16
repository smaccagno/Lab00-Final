public with sharing class BudgetSummaryController {
    public class CategorySummary {
        @AuraEnabled public String categoria;
        @AuraEnabled public Decimal effettivo;
        @AuraEnabled public Decimal previsto;
        @AuraEnabled public Decimal totale;
        
        public CategorySummary(String categoria) {
            this.categoria = categoria;
            this.effettivo = 0;
            this.previsto = 0;
            this.totale = 0;
        }
    }

    public class BudgetSummary {
        @AuraEnabled public List<CategorySummary> incassi;
        @AuraEnabled public List<CategorySummary> spese;
        
        public BudgetSummary() {
            this.incassi = new List<CategorySummary>();
            this.spese = new List<CategorySummary>();
        }
    }

    @AuraEnabled(cacheable=true)
    public static BudgetSummary getSummary(Id recordId, Date filterDate) {
        BudgetSummary result = new BudgetSummary();
        
        if (recordId == null) return result;

        // Aggregate Incassi
        Map<String, CategorySummary> incassiMap = new Map<String, CategorySummary>();
        for (Voce_di_Incasso__c vi : [
            SELECT Categoria__c, Stato__c, Ammontare__c, Data__c
            FROM Voce_di_Incasso__c
            WHERE Overview_Budget_per_Anno__c = :recordId
        ]) {
            String cat = vi.Categoria__c;
            if (String.isBlank(cat)) cat = 'Non categorizzato';
            String stato = vi.Stato__c;
            Decimal tot = vi.Ammontare__c;
            if (tot == null) tot = 0;

            if (!incassiMap.containsKey(cat)) {
                incassiMap.put(cat, new CategorySummary(cat));
            }
            
            if (stato == 'Effettiva') {
                if (filterDate == null || vi.Data__c == null || vi.Data__c <= filterDate) {
                    incassiMap.get(cat).effettivo += tot;
                }
            } else if (stato == 'Prevista') {
                incassiMap.get(cat).previsto += tot;
            } else if (stato == 'Annullata') {
                incassiMap.get(cat).previsto -= tot;
            }
        }

        for (CategorySummary cs : incassiMap.values()) {
            if (cs.previsto < 0) {
                cs.effettivo += cs.previsto; // se il previsto va in negativo, intacca l'effettivo
                cs.previsto = 0;
            }
            if (cs.effettivo < 0) cs.effettivo = 0;
            cs.totale = cs.effettivo + cs.previsto;
            
            if (cs.totale > 0) {
                result.incassi.add(cs);
            }
        }

        // Aggregate Spese
        Map<String, CategorySummary> speseMap = new Map<String, CategorySummary>();
        for (Voce_di_Spesa__c vs : [
            SELECT Categoria__c, Stato__c, Ammontare__c, Data__c
            FROM Voce_di_Spesa__c
            WHERE Overview_Budget_per_Anno__c = :recordId
        ]) {
            String cat = vs.Categoria__c;
            if (String.isBlank(cat)) cat = 'Non categorizzato';
            String stato = vs.Stato__c;
            Decimal tot = vs.Ammontare__c;
            if (tot == null) tot = 0;

            if (!speseMap.containsKey(cat)) {
                speseMap.put(cat, new CategorySummary(cat));
            }
            
            if (stato == 'Effettiva') {
                if (filterDate == null || vs.Data__c == null || vs.Data__c <= filterDate) {
                    speseMap.get(cat).effettivo += tot;
                }
            } else if (stato == 'Prevista') {
                speseMap.get(cat).previsto += tot;
            } else if (stato == 'Annullata') {
                // Sottrae il totale alla categoria (dal previsto)
                speseMap.get(cat).previsto -= tot;
            }
        }

        for (CategorySummary cs : speseMap.values()) {
            if (cs.previsto < 0) {
                cs.effettivo += cs.previsto;
                cs.previsto = 0;
            }
            if (cs.effettivo < 0) cs.effettivo = 0;
            cs.totale = cs.effettivo + cs.previsto;
            
            if (cs.totale > 0) {
                result.spese.add(cs);
            }
        }

        return result;
    }
}
