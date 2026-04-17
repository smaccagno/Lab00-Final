public with sharing class BudgetSummaryController {
    public class ItemDetail {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String name;
        @AuraEnabled public Decimal amount;
        @AuraEnabled public Date itemDate;
        @AuraEnabled public String category;
        @AuraEnabled public String status;
        @AuraEnabled public Id sourceTransactionId;
        @AuraEnabled public String sourceTransactionName;
        @AuraEnabled public String url;

        public ItemDetail(Id recordId, String name, Decimal amount, Date itemDate, String category, String status, Id sourceTransactionId, String sourceTransactionName) {
            this.recordId = recordId;
            this.name = name;
            this.amount = amount;
            this.itemDate = itemDate;
            this.category = category;
            this.status = status;
            this.sourceTransactionId = sourceTransactionId;
            this.sourceTransactionName = sourceTransactionName;
            this.url = recordId != null ? '/' + recordId : null;
        }
    }

    public class CategorySummary {
        @AuraEnabled public String categoria;
        @AuraEnabled public Decimal effettivo;
        @AuraEnabled public Decimal previsto;
        @AuraEnabled public Decimal totale;
        @AuraEnabled public List<ItemDetail> itemsEffettivi;
        @AuraEnabled public List<ItemDetail> itemsPrevisti;
        
        public CategorySummary(String categoria) {
            this.categoria = categoria;
            this.effettivo = 0;
            this.previsto = 0;
            this.totale = 0;
            this.itemsEffettivi = new List<ItemDetail>();
            this.itemsPrevisti = new List<ItemDetail>();
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

        String sObjName = recordId.getSObjectType().getDescribe().getName();
        
        List<Voce_di_Incasso__c> incassiList = new List<Voce_di_Incasso__c>();
        List<Voce_di_Spesa__c> speseList = new List<Voce_di_Spesa__c>();

        if (sObjName == 'Overview_Budget_per_Anno__c') {
            incassiList = [
                SELECT Id, Name, Categoria__c, Stato__c, Ammontare__c, Data__c, Transazione__c, Transazione__r.Name
                FROM Voce_di_Incasso__c
                WHERE Overview_Budget_per_Anno__c = :recordId
            ];
            speseList = [
                SELECT Id, Name, Categoria__c, Stato__c, Ammontare__c, Data__c
                FROM Voce_di_Spesa__c
                WHERE Overview_Budget_per_Anno__c = :recordId
            ];
        } else if (sObjName == 'GiftDesignation') {
            incassiList = [
                SELECT Id, Name, Categoria__c, Stato__c, Ammontare__c, Data__c, Transazione__c, Transazione__r.Name
                FROM Voce_di_Incasso__c
                WHERE Overview_Budget_per_Anno__r.Budget__c = :recordId
            ];
            speseList = [
                SELECT Id, Name, Categoria__c, Stato__c, Ammontare__c, Data__c
                FROM Voce_di_Spesa__c
                WHERE Overview_Budget_per_Anno__r.Budget__c = :recordId
            ];
        } else if (sObjName == 'Account') {
            incassiList = [
                SELECT Id, Name, Categoria__c, Stato__c, Ammontare__c, Data__c, Transazione__c, Transazione__r.Name
                FROM Voce_di_Incasso__c
                WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :recordId
            ];
            speseList = [
                SELECT Id, Name, Categoria__c, Stato__c, Ammontare__c, Data__c
                FROM Voce_di_Spesa__c
                WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :recordId
            ];
        } else {
            return result;
        }

        // Aggregate Incassi
        Map<String, CategorySummary> incassiMap = new Map<String, CategorySummary>();
        for (Voce_di_Incasso__c vi : incassiList) {
            String cat = vi.Categoria__c;
            if (String.isBlank(cat)) cat = 'Non categorizzato';
            String stato = vi.Stato__c;
            Decimal tot = vi.Ammontare__c;
            if (tot == null) tot = 0;

            if (!incassiMap.containsKey(cat)) {
                incassiMap.put(cat, new CategorySummary(cat));
            }
            
            if (filterDate == null || vi.Data__c == null || vi.Data__c <= filterDate) {
                if (stato == 'Effettiva') {
                    incassiMap.get(cat).effettivo += tot;
                    incassiMap.get(cat).itemsEffettivi.add(new ItemDetail(vi.Id, vi.Name, tot, vi.Data__c, cat, stato, vi.Transazione__c, vi.Transazione__r?.Name));
                } else if (stato == 'Prevista') {
                    incassiMap.get(cat).previsto += tot;
                    incassiMap.get(cat).itemsPrevisti.add(new ItemDetail(vi.Id, vi.Name, tot, vi.Data__c, cat, stato, vi.Transazione__c, vi.Transazione__r?.Name));
                } else if (stato == 'Annullata') {
                    incassiMap.get(cat).previsto -= tot;
                    incassiMap.get(cat).itemsPrevisti.add(new ItemDetail(vi.Id, vi.Name + ' (Annullata)', -tot, vi.Data__c, cat, stato, vi.Transazione__c, vi.Transazione__r?.Name));
                }
            }
        }

        for (CategorySummary cs : incassiMap.values()) {
            if (cs.previsto < 0) {
                cs.effettivo += cs.previsto; // se il previsto va in negativo, intacca l'effettivo
                cs.previsto = 0;
            }
            if (cs.effettivo < 0) cs.effettivo = 0;
            cs.totale = cs.effettivo + cs.previsto;
            
            if (cs.totale >= 0) {
                result.incassi.add(cs);
            }
        }

        // Aggregate Spese
        Map<String, CategorySummary> speseMap = new Map<String, CategorySummary>();
        for (Voce_di_Spesa__c vs : speseList) {
            String cat = vs.Categoria__c;
            if (String.isBlank(cat)) cat = 'Non categorizzato';
            String stato = vs.Stato__c;
            Decimal tot = vs.Ammontare__c;
            if (tot == null) tot = 0;

            if (!speseMap.containsKey(cat)) {
                speseMap.put(cat, new CategorySummary(cat));
            }
            
            if (filterDate == null || vs.Data__c == null || vs.Data__c <= filterDate) {
                if (stato == 'Effettiva') {
                    speseMap.get(cat).effettivo += tot;
                    speseMap.get(cat).itemsEffettivi.add(new ItemDetail(vs.Id, vs.Name, tot, vs.Data__c, cat, stato, null, null));
                } else if (stato == 'Prevista') {
                    speseMap.get(cat).previsto += tot;
                    speseMap.get(cat).itemsPrevisti.add(new ItemDetail(vs.Id, vs.Name, tot, vs.Data__c, cat, stato, null, null));
                } else if (stato == 'Annullata') {
                    // Sottrae il totale alla categoria (dal previsto)
                    speseMap.get(cat).previsto -= tot;
                    speseMap.get(cat).itemsPrevisti.add(new ItemDetail(vs.Id, vs.Name + ' (Annullata)', -tot, vs.Data__c, cat, stato, null, null));
                }
            }
        }

        for (CategorySummary cs : speseMap.values()) {
            if (cs.previsto < 0) {
                cs.effettivo += cs.previsto;
                cs.previsto = 0;
            }
            if (cs.effettivo < 0) cs.effettivo = 0;
            cs.totale = cs.effettivo + cs.previsto;
            
            if (cs.totale >= 0) {
                result.spese.add(cs);
            }
        }

        return result;
    }
}
