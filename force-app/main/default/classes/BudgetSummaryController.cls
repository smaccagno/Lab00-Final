public with sharing class BudgetSummaryController {
    public class CategorySummary {
        @AuraEnabled public String categoria;
        @AuraEnabled public Decimal totale;
        
        public CategorySummary(String categoria, Decimal totale) {
            this.categoria = categoria;
            this.totale = totale;
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
    public static BudgetSummary getSummary(Id recordId) {
        BudgetSummary result = new BudgetSummary();
        
        if (recordId == null) return result;

        // Aggregate Incassi
        for (AggregateResult ar : [
            SELECT Categoria__c, SUM(Ammontare__c) totale
            FROM Voce_di_Incasso__c
            WHERE Overview_Budget_per_Anno__c = :recordId
            GROUP BY Categoria__c
        ]) {
            String cat = (String) ar.get('Categoria__c');
            if (String.isBlank(cat)) cat = 'Non categorizzato';
            Decimal tot = (Decimal) ar.get('totale');
            result.incassi.add(new CategorySummary(cat, tot != null ? tot : 0));
        }

        // Aggregate Spese
        for (AggregateResult ar : [
            SELECT Categoria__c, SUM(Ammontare__c) totale
            FROM Voce_di_Spesa__c
            WHERE Overview_Budget_per_Anno__c = :recordId
            GROUP BY Categoria__c
        ]) {
            String cat = (String) ar.get('Categoria__c');
            if (String.isBlank(cat)) cat = 'Non categorizzato';
            Decimal tot = (Decimal) ar.get('totale');
            result.spese.add(new CategorySummary(cat, tot != null ? tot : 0));
        }

        return result;
    }
}