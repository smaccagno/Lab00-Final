public with sharing class BudgetVersionController {

    // --- DTOs ---
    public class BudgetVersionDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public Integer anno;
        @AuraEnabled public Integer numeroVersione;
        @AuraEnabled public String nome;
        @AuraEnabled public String descrizione;
        @AuraEnabled public String stato;
        @AuraEnabled public DateTime dataPromozione;
        @AuraEnabled public String promossaDaName;
        @AuraEnabled public Id sostituisceId;
    }

    public class BudgetVersionDetailDTO {
        @AuraEnabled public BudgetVersionDTO header;
        @AuraEnabled public List<Budget_Version_Item__c> items;
    }

    public class ItemOrder {
        @AuraEnabled public Id itemId;
        @AuraEnabled public Integer sortOrder;

        public ItemOrder() {}
        public ItemOrder(Id itemId, Integer sortOrder) {
            this.itemId = itemId;
            this.sortOrder = sortOrder;
        }
    }

    // --- Reads ---
    @AuraEnabled(cacheable=true)
    public static List<Program> getActivePrograms() {
        return [
            SELECT Id, Name
              FROM Program
             WHERE Status = 'Attivo'
          ORDER BY Name
             LIMIT 500
        ];
    }

    @AuraEnabled(cacheable=true)
    public static List<BudgetVersionDTO> getVersionsByYear(Integer anno) {
        List<BudgetVersionDTO> out = new List<BudgetVersionDTO>();
        for (Budget_Version__c v : [
            SELECT Id, Anno__c, Numero_Versione__c, Nome__c, Descrizione__c, Stato__c,
                   Data_Promozione__c, Promossa_Da__r.Name, Sostituisce__c
              FROM Budget_Version__c
             WHERE Anno__c = :anno AND Stato__c != 'Cestinata'
             ORDER BY Numero_Versione__c DESC
        ]) {
            out.add(toDTO(v));
        }
        return out;
    }

    @AuraEnabled(cacheable=true)
    public static BudgetVersionDetailDTO getVersionDetail(Id versionId) {
        Budget_Version__c v = [
            SELECT Id, Anno__c, Numero_Versione__c, Nome__c, Descrizione__c, Stato__c,
                   Data_Promozione__c, Promossa_Da__r.Name, Sostituisce__c
              FROM Budget_Version__c WHERE Id = :versionId
        ];
        BudgetVersionDetailDTO d = new BudgetVersionDetailDTO();
        d.header = toDTO(v);
        d.items = [
            SELECT Id, Budget_Version__c, Tipo__c, Programma__c, Programma__r.Name,
                   Categoria__c, Sottocategoria__c, Nome__c, Data__c, Ammontare__c,
                   Note__c, Sort_Order__c
              FROM Budget_Version_Item__c
             WHERE Budget_Version__c = :versionId
             ORDER BY Tipo__c, Sort_Order__c NULLS LAST, Categoria__c, Nome__c
        ];
        return d;
    }

    // --- Version mutations ---
    @AuraEnabled
    public static Id createVersion(Integer anno, String nome, String descrizione) {
        AggregateResult ar = [
            SELECT MAX(Numero_Versione__c) maxN
              FROM Budget_Version__c WHERE Anno__c = :anno
        ];
        Decimal maxN = (Decimal) ar.get('maxN');
        Integer nextN = (maxN == null) ? 1 : maxN.intValue() + 1;

        Budget_Version__c v = new Budget_Version__c(
            Anno__c = anno,
            Nome__c = nome,
            Descrizione__c = descrizione,
            Stato__c = 'Provvisorio',
            Numero_Versione__c = nextN
        );
        insert v;
        return v.Id;
    }

    @AuraEnabled
    public static Id forkVersion(Id sourceVersionId) {
        Budget_Version__c src = [
            SELECT Id, Anno__c, Nome__c, Descrizione__c FROM Budget_Version__c WHERE Id = :sourceVersionId
        ];
        Id newId = createVersion(
            (src.Anno__c == null) ? null : src.Anno__c.intValue(),
            buildForkName(src.Nome__c),
            src.Descrizione__c
        );
        List<Budget_Version_Item__c> items = [
            SELECT Tipo__c, Programma__c, Categoria__c, Sottocategoria__c, Nome__c,
                   Data__c, Ammontare__c, Note__c, Sort_Order__c
              FROM Budget_Version_Item__c WHERE Budget_Version__c = :sourceVersionId
        ];
        List<Budget_Version_Item__c> clones = new List<Budget_Version_Item__c>();
        for (Budget_Version_Item__c it : items) {
            Budget_Version_Item__c c = it.clone(false, true, false, false);
            c.Budget_Version__c = newId;
            clones.add(c);
        }
        if (!clones.isEmpty()) insert clones;
        return newId;
    }

    @AuraEnabled
    public static void updateVersionHeader(Id versionId, String nome, String descrizione) {
        Budget_Version__c v = [SELECT Stato__c FROM Budget_Version__c WHERE Id = :versionId];
        if (v.Stato__c != 'Provvisorio') {
            throw new AuraHandledException('Solo le versioni Provvisorio sono modificabili.');
        }
        v.Nome__c = nome;
        v.Descrizione__c = descrizione;
        update v;
    }

    @AuraEnabled
    public static void trashVersion(Id versionId) {
        Budget_Version__c v = [SELECT Stato__c FROM Budget_Version__c WHERE Id = :versionId];
        if (v.Stato__c == 'Ufficiale') {
            throw new AuraHandledException('Impossibile cestinare una versione Ufficiale.');
        }
        v.Stato__c = 'Cestinata';
        update v;
    }

    @AuraEnabled
    public static void promoteVersion(Id versionId) {
        Budget_Version__c nuova = [
            SELECT Id, Anno__c, Stato__c FROM Budget_Version__c WHERE Id = :versionId FOR UPDATE
        ];
        if (nuova.Stato__c != 'Provvisorio') {
            throw new AuraHandledException('Solo le versioni Provvisorio possono essere promosse.');
        }

        List<Budget_Version__c> attuali = [
            SELECT Id FROM Budget_Version__c
             WHERE Anno__c = :nuova.Anno__c AND Stato__c = 'Ufficiale' FOR UPDATE
        ];
        Id ufficialePrecId = attuali.isEmpty() ? null : attuali[0].Id;

        Savepoint sp = Database.setSavepoint();
        try {
            if (ufficialePrecId != null) {
                delete [SELECT Id FROM Voce_di_Incasso__c
                         WHERE Budget_Version__c = :ufficialePrecId AND Stato__c = 'Prevista'];
                delete [SELECT Id FROM Voce_di_Spesa__c
                         WHERE Budget_Version__c = :ufficialePrecId AND Stato__c = 'Prevista'];

                Budget_Version__c old = new Budget_Version__c(
                    Id = ufficialePrecId, Stato__c = 'Storicizzata'
                );
                update old;
                nuova.Sostituisce__c = ufficialePrecId;
            }

            List<Budget_Version_Item__c> items = [
                SELECT Id, Tipo__c, Programma__c, Categoria__c, Sottocategoria__c,
                       Nome__c, Data__c, Ammontare__c, Note__c, Sort_Order__c
                  FROM Budget_Version_Item__c WHERE Budget_Version__c = :versionId
            ];

            // Resolve Overview_Budget_per_Anno__c per ogni (Programma, Anno)
            // usando il budget "default" (DEFAULT_PRG__c = true sul parent GiftDesignation).
            // Gli endpoint della dashboard filtrano le Voci via questo lookup, quindi
            // dobbiamo popolarlo al promote per far comparire le voci nei report.
            String annoStr = (nuova.Anno__c == null) ? null : String.valueOf(nuova.Anno__c.intValue());
            Set<Id> programmiNecessari = new Set<Id>();
            for (Budget_Version_Item__c it : items) {
                if (it.Programma__c != null) programmiNecessari.add(it.Programma__c);
            }
            Map<Id, Id> overviewByProgram = new Map<Id, Id>();
            if (annoStr != null && !programmiNecessari.isEmpty()) {
                for (Overview_Budget_per_Anno__c b : [
                    SELECT Id, Budget__r.Program__c
                      FROM Overview_Budget_per_Anno__c
                     WHERE Anno__c = :annoStr
                       AND Budget__r.DEFAULT_PRG__c = true
                       AND Budget__r.Program__c IN :programmiNecessari
                ]) {
                    if (b.Budget__r == null || b.Budget__r.Program__c == null) continue;
                    if (!overviewByProgram.containsKey(b.Budget__r.Program__c)) {
                        overviewByProgram.put(b.Budget__r.Program__c, b.Id);
                    }
                }
            }

            List<Voce_di_Incasso__c> incassi = new List<Voce_di_Incasso__c>();
            List<Voce_di_Spesa__c> spese = new List<Voce_di_Spesa__c>();
            List<String> unresolved = new List<String>();
            for (Budget_Version_Item__c it : items) {
                Id overviewId = it.Programma__c == null ? null : overviewByProgram.get(it.Programma__c);
                if (overviewId == null) {
                    unresolved.add((it.Nome__c == null ? it.Id : it.Nome__c)
                        + ' (Programma mancante o senza Budget default per ' + annoStr + ')');
                    continue;
                }
                if (it.Tipo__c == 'Incasso') {
                    incassi.add(new Voce_di_Incasso__c(
                        Name = String.isBlank(it.Nome__c) ? 'Voce senza titolo' : it.Nome__c,
                        Budget_Version__c = versionId,
                        Programma__c = it.Programma__c,
                        Overview_Budget_per_Anno__c = overviewId,
                        Categoria__c = it.Categoria__c,
                        Nome__c = it.Nome__c,
                        Data__c = it.Data__c,
                        Ammontare__c = it.Ammontare__c,
                        Note__c = it.Note__c,
                        Stato__c = 'Prevista'
                    ));
                } else {
                    spese.add(new Voce_di_Spesa__c(
                        Name = String.isBlank(it.Nome__c) ? 'Voce senza titolo' : it.Nome__c,
                        Budget_Version__c = versionId,
                        Programma__c = it.Programma__c,
                        Overview_Budget_per_Anno__c = overviewId,
                        Anno__c = nuova.Anno__c,
                        Categoria__c = it.Categoria__c,
                        Sottocategoria__c = it.Sottocategoria__c,
                        Nome__c = it.Nome__c,
                        Data__c = it.Data__c,
                        Ammontare__c = it.Ammontare__c,
                        Note__c = it.Note__c,
                        Stato__c = 'Prevista'
                    ));
                }
            }
            if (!unresolved.isEmpty()) {
                throw new AuraHandledException(
                    'Impossibile promuovere: ' + unresolved.size() + ' voce/i non hanno un Budget default per l\'anno '
                    + annoStr + '. Dettagli: ' + String.join(unresolved, '; ')
                );
            }
            if (!incassi.isEmpty()) insert incassi;
            if (!spese.isEmpty()) insert spese;

            nuova.Stato__c = 'Ufficiale';
            nuova.Data_Promozione__c = System.now();
            nuova.Promossa_Da__c = UserInfo.getUserId();
            update nuova;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException('Promozione fallita: ' + e.getMessage());
        }
    }

    // --- Item mutations ---
    @AuraEnabled
    public static Id upsertItem(Budget_Version_Item__c item) {
        assertParentProvvisorio(item.Budget_Version__c);
        upsert item;
        return item.Id;
    }

    @AuraEnabled
    public static void deleteItem(Id itemId) {
        Budget_Version_Item__c it = [SELECT Budget_Version__c FROM Budget_Version_Item__c WHERE Id = :itemId];
        assertParentProvvisorio(it.Budget_Version__c);
        delete it;
    }

    @AuraEnabled
    public static void reorderItems(List<ItemOrder> orders) {
        if (orders == null || orders.isEmpty()) return;
        Map<Id, Integer> byId = new Map<Id, Integer>();
        for (ItemOrder o : orders) byId.put(o.itemId, o.sortOrder);

        List<Budget_Version_Item__c> toUpdate = new List<Budget_Version_Item__c>();
        Set<Id> versionIds = new Set<Id>();
        for (Budget_Version_Item__c it : [
            SELECT Id, Budget_Version__c FROM Budget_Version_Item__c WHERE Id IN :byId.keySet()
        ]) {
            versionIds.add(it.Budget_Version__c);
            toUpdate.add(new Budget_Version_Item__c(Id = it.Id, Sort_Order__c = byId.get(it.Id)));
        }
        if (!versionIds.isEmpty()) {
            for (Budget_Version__c v : [SELECT Id, Stato__c FROM Budget_Version__c WHERE Id IN :versionIds]) {
                if (v.Stato__c != 'Provvisorio') {
                    throw new AuraHandledException('La versione non è modificabile (stato: ' + v.Stato__c + ').');
                }
            }
        }
        if (!toUpdate.isEmpty()) update toUpdate;
    }

    // --- Private helpers ---
    private static void assertParentProvvisorio(Id versionId) {
        Budget_Version__c v = [SELECT Stato__c FROM Budget_Version__c WHERE Id = :versionId];
        if (v.Stato__c != 'Provvisorio') {
            throw new AuraHandledException('La versione non è modificabile (stato: ' + v.Stato__c + ').');
        }
    }

    private static BudgetVersionDTO toDTO(Budget_Version__c v) {
        BudgetVersionDTO d = new BudgetVersionDTO();
        d.id = v.Id;
        d.anno = (v.Anno__c == null) ? null : v.Anno__c.intValue();
        d.numeroVersione = (v.Numero_Versione__c == null) ? null : v.Numero_Versione__c.intValue();
        d.nome = v.Nome__c;
        d.descrizione = v.Descrizione__c;
        d.stato = v.Stato__c;
        d.dataPromozione = v.Data_Promozione__c;
        d.promossaDaName = v.Promossa_Da__r == null ? null : v.Promossa_Da__r.Name;
        d.sostituisceId = v.Sostituisce__c;
        return d;
    }

    private static String buildForkName(String sourceName) {
        if (String.isBlank(sourceName)) return 'Fork';
        return sourceName + ' (copia)';
    }
}
