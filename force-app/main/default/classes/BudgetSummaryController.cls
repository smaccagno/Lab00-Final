public with sharing class BudgetSummaryController {
    public class ItemDetail {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String name;
        @AuraEnabled public Decimal amount;
        @AuraEnabled public Date itemDate;
        @AuraEnabled public String category;
        @AuraEnabled public String subcategory;
        @AuraEnabled public String note;
        @AuraEnabled public String status;
        @AuraEnabled public Id sourceTransactionId;
        @AuraEnabled public String sourceTransactionName;
        @AuraEnabled public String url;

        public ItemDetail(Id recordId, String name, Decimal amount, Date itemDate, String category, String status, Id sourceTransactionId, String sourceTransactionName) {
            this(recordId, name, amount, itemDate, category, null, null, status, sourceTransactionId, sourceTransactionName);
        }

        public ItemDetail(Id recordId, String name, Decimal amount, Date itemDate, String category, String subcategory, String note, String status, Id sourceTransactionId, String sourceTransactionName) {
            this.recordId = recordId;
            this.name = name;
            this.amount = amount;
            this.itemDate = itemDate;
            this.category = category;
            this.subcategory = subcategory;
            this.note = note;
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
                SELECT Id, Name, Categoria__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c, Transazione__c, Transazione__r.Name
                FROM Voce_di_Incasso__c
                WHERE Overview_Budget_per_Anno__c = :recordId
            ];
            speseList = [
                SELECT Id, Name, Categoria__c, Sottocategoria__c, Note__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c
                FROM Voce_di_Spesa__c
                WHERE Overview_Budget_per_Anno__c = :recordId
            ];
        } else if (sObjName == 'GiftDesignation') {
            incassiList = [
                SELECT Id, Name, Categoria__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c, Transazione__c, Transazione__r.Name
                FROM Voce_di_Incasso__c
                WHERE Overview_Budget_per_Anno__r.Budget__c = :recordId
            ];
            speseList = [
                SELECT Id, Name, Categoria__c, Sottocategoria__c, Note__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c
                FROM Voce_di_Spesa__c
                WHERE Overview_Budget_per_Anno__r.Budget__c = :recordId
            ];
        } else if (sObjName == 'Account') {
            incassiList = [
                SELECT Id, Name, Categoria__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c, Transazione__c, Transazione__r.Name
                FROM Voce_di_Incasso__c
                WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :recordId
            ];
            speseList = [
                SELECT Id, Name, Categoria__c, Sottocategoria__c, Note__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c
                FROM Voce_di_Spesa__c
                WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :recordId
            ];
        } else {
            return result;
        }

        Map<String, CategorySummary> incassiMap = new Map<String, CategorySummary>();
        for (Voce_di_Incasso__c vi : incassiList) {
            if (!BudgetAggregator.isInDateScope(vi.Data__c, filterDate)) continue;

            String cat = BudgetAggregator.normalizeCategoria(vi.Categoria__c);
            if (!incassiMap.containsKey(cat)) incassiMap.put(cat, new CategorySummary(cat));
            CategorySummary cs = incassiMap.get(cat);

            Decimal amount = vi.Ammontare__c == null ? 0 : vi.Ammontare__c;
            String stato = vi.Stato__c;
            String statoPrec = vi.Stato_Precedente__c;

            if (stato == BudgetAggregator.STATO_EFFETTIVA) {
                cs.effettivo += amount;
                cs.itemsEffettivi.add(new ItemDetail(vi.Id, vi.Name, amount, vi.Data__c, cat, stato, vi.Transazione__c, vi.Transazione__r?.Name));
            } else if (stato == BudgetAggregator.STATO_PREVISTA) {
                cs.previsto += amount;
                cs.itemsPrevisti.add(new ItemDetail(vi.Id, vi.Name, amount, vi.Data__c, cat, stato, vi.Transazione__c, vi.Transazione__r?.Name));
            } else if (stato == BudgetAggregator.STATO_ANNULLATA) {
                if (statoPrec == BudgetAggregator.STATO_PREVISTA) {
                    cs.previsto -= amount;
                    cs.itemsPrevisti.add(new ItemDetail(vi.Id, vi.Name + ' (Annullata da Prevista)', -amount, vi.Data__c, cat, stato, vi.Transazione__c, vi.Transazione__r?.Name));
                } else if (statoPrec == BudgetAggregator.STATO_EFFETTIVA) {
                    cs.effettivo -= amount;
                    cs.itemsEffettivi.add(new ItemDetail(vi.Id, vi.Name + ' (Annullata da Effettiva)', -amount, vi.Data__c, cat, stato, vi.Transazione__c, vi.Transazione__r?.Name));
                }
            }
        }

        for (CategorySummary cs : incassiMap.values()) {
            BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
            p.previsto = cs.previsto;
            p.effettivo = cs.effettivo;
            BudgetAggregator.finalizePair(p);
            cs.previsto = p.previsto;
            cs.effettivo = p.effettivo;
            cs.totale = p.totale;
            if (cs.totale >= 0) result.incassi.add(cs);
        }

        Map<String, CategorySummary> speseMap = new Map<String, CategorySummary>();
        for (Voce_di_Spesa__c vs : speseList) {
            if (!BudgetAggregator.isInDateScope(vs.Data__c, filterDate)) continue;

            String cat = BudgetAggregator.normalizeCategoria(vs.Categoria__c);
            if (!speseMap.containsKey(cat)) speseMap.put(cat, new CategorySummary(cat));
            CategorySummary cs = speseMap.get(cat);

            Decimal amount = vs.Ammontare__c == null ? 0 : vs.Ammontare__c;
            String stato = vs.Stato__c;
            String statoPrec = vs.Stato_Precedente__c;

            if (stato == BudgetAggregator.STATO_EFFETTIVA) {
                cs.effettivo += amount;
                cs.itemsEffettivi.add(new ItemDetail(vs.Id, vs.Name, amount, vs.Data__c, cat, vs.Sottocategoria__c, vs.Note__c, stato, null, null));
            } else if (stato == BudgetAggregator.STATO_PREVISTA) {
                cs.previsto += amount;
                cs.itemsPrevisti.add(new ItemDetail(vs.Id, vs.Name, amount, vs.Data__c, cat, vs.Sottocategoria__c, vs.Note__c, stato, null, null));
            } else if (stato == BudgetAggregator.STATO_ANNULLATA) {
                if (statoPrec == BudgetAggregator.STATO_PREVISTA) {
                    cs.previsto -= amount;
                    cs.itemsPrevisti.add(new ItemDetail(vs.Id, vs.Name + ' (Annullata da Prevista)', -amount, vs.Data__c, cat, vs.Sottocategoria__c, vs.Note__c, stato, null, null));
                } else if (statoPrec == BudgetAggregator.STATO_EFFETTIVA) {
                    cs.effettivo -= amount;
                    cs.itemsEffettivi.add(new ItemDetail(vs.Id, vs.Name + ' (Annullata da Effettiva)', -amount, vs.Data__c, cat, vs.Sottocategoria__c, vs.Note__c, stato, null, null));
                }
            }
        }

        for (CategorySummary cs : speseMap.values()) {
            BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
            p.previsto = cs.previsto;
            p.effettivo = cs.effettivo;
            BudgetAggregator.finalizePair(p);
            cs.previsto = p.previsto;
            cs.effettivo = p.effettivo;
            cs.totale = p.totale;
            result.spese.add(cs);
        }

        return result;
    }
}
