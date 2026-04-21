@isTest
private class VoceStatoPrecedenteHandlerTest {

    @isTest
    static void incasso_prevista_a_annullata_popola_stato_precedente() {
        Voce_di_Incasso__c v = new Voce_di_Incasso__c(
            Stato__c = 'Prevista',
            Categoria__c = 'Donazione',
            Ammontare__c = 100
        );
        insert v;
        System.assertEquals(null, [SELECT Stato_Precedente__c FROM Voce_di_Incasso__c WHERE Id = :v.Id].Stato_Precedente__c,
            'Nuovo record non-Annullata non deve avere Stato_Precedente');

        v.Stato__c = 'Annullata';
        Test.startTest();
        update v;
        Test.stopTest();

        Voce_di_Incasso__c reloaded = [SELECT Stato__c, Stato_Precedente__c FROM Voce_di_Incasso__c WHERE Id = :v.Id];
        System.assertEquals('Annullata', reloaded.Stato__c);
        System.assertEquals('Prevista', reloaded.Stato_Precedente__c,
            'Passando da Prevista ad Annullata Stato_Precedente deve essere Prevista');
    }

    @isTest
    static void incasso_effettiva_a_annullata_popola_stato_precedente() {
        Voce_di_Incasso__c v = new Voce_di_Incasso__c(
            Stato__c = 'Effettiva',
            Categoria__c = 'Donazione',
            Ammontare__c = 200
        );
        insert v;

        v.Stato__c = 'Annullata';
        update v;

        Voce_di_Incasso__c reloaded = [SELECT Stato_Precedente__c FROM Voce_di_Incasso__c WHERE Id = :v.Id];
        System.assertEquals('Effettiva', reloaded.Stato_Precedente__c);
    }

    @isTest
    static void incasso_annullata_a_prevista_resetta_stato_precedente() {
        Voce_di_Incasso__c v = new Voce_di_Incasso__c(
            Stato__c = 'Prevista',
            Categoria__c = 'Donazione',
            Ammontare__c = 50
        );
        insert v;
        v.Stato__c = 'Annullata';
        update v;
        System.assertEquals('Prevista',
            [SELECT Stato_Precedente__c FROM Voce_di_Incasso__c WHERE Id = :v.Id].Stato_Precedente__c);

        v.Stato__c = 'Prevista';
        update v;

        Voce_di_Incasso__c reloaded = [SELECT Stato_Precedente__c FROM Voce_di_Incasso__c WHERE Id = :v.Id];
        System.assertEquals(null, reloaded.Stato_Precedente__c,
            'Uscendo da Annullata Stato_Precedente deve essere resettato');
    }

    @isTest
    static void incasso_insert_direttamente_annullata_lascia_blank() {
        Voce_di_Incasso__c v = new Voce_di_Incasso__c(
            Stato__c = 'Annullata',
            Categoria__c = 'Donazione',
            Ammontare__c = 75
        );
        insert v;

        Voce_di_Incasso__c reloaded = [SELECT Stato_Precedente__c FROM Voce_di_Incasso__c WHERE Id = :v.Id];
        System.assertEquals(null, reloaded.Stato_Precedente__c,
            'Insert direttamente ad Annullata senza storia deve lasciare Stato_Precedente blank');
    }

    @isTest
    static void spesa_prevista_a_annullata_popola_stato_precedente() {
        Voce_di_Spesa__c v = new Voce_di_Spesa__c(
            Stato__c = 'Prevista',
            Data__c = Date.today(),
            Ammontare__c = 300
        );
        insert v;

        v.Stato__c = 'Annullata';
        update v;

        Voce_di_Spesa__c reloaded = [SELECT Stato_Precedente__c FROM Voce_di_Spesa__c WHERE Id = :v.Id];
        System.assertEquals('Prevista', reloaded.Stato_Precedente__c);
    }

    @isTest
    static void spesa_effettiva_a_annullata_popola_stato_precedente() {
        Voce_di_Spesa__c v = new Voce_di_Spesa__c(
            Stato__c = 'Effettiva',
            Data__c = Date.today(),
            Ammontare__c = 400
        );
        insert v;

        v.Stato__c = 'Annullata';
        update v;

        Voce_di_Spesa__c reloaded = [SELECT Stato_Precedente__c FROM Voce_di_Spesa__c WHERE Id = :v.Id];
        System.assertEquals('Effettiva', reloaded.Stato_Precedente__c);
    }

    @isTest
    static void spesa_annullata_a_effettiva_resetta_stato_precedente() {
        Voce_di_Spesa__c v = new Voce_di_Spesa__c(
            Stato__c = 'Effettiva',
            Data__c = Date.today(),
            Ammontare__c = 150
        );
        insert v;
        v.Stato__c = 'Annullata';
        update v;

        v.Stato__c = 'Effettiva';
        update v;

        Voce_di_Spesa__c reloaded = [SELECT Stato_Precedente__c FROM Voce_di_Spesa__c WHERE Id = :v.Id];
        System.assertEquals(null, reloaded.Stato_Precedente__c);
    }

    @isTest
    static void bulk_update_misto() {
        List<Voce_di_Spesa__c> spese = new List<Voce_di_Spesa__c>();
        for (Integer i = 0; i < 200; i++) {
            spese.add(new Voce_di_Spesa__c(
                Stato__c = Math.mod(i, 2) == 0 ? 'Prevista' : 'Effettiva',
                Data__c = Date.today(),
                Ammontare__c = i + 1
            ));
        }
        insert spese;

        for (Voce_di_Spesa__c v : spese) {
            v.Stato__c = 'Annullata';
        }
        Test.startTest();
        update spese;
        Test.stopTest();

        Map<Id, Voce_di_Spesa__c> reloaded = new Map<Id, Voce_di_Spesa__c>(
            [SELECT Id, Stato_Precedente__c FROM Voce_di_Spesa__c WHERE Id IN :spese]
        );
        Integer countPrevista = 0;
        Integer countEffettiva = 0;
        for (Voce_di_Spesa__c v : reloaded.values()) {
            if (v.Stato_Precedente__c == 'Prevista') countPrevista++;
            else if (v.Stato_Precedente__c == 'Effettiva') countEffettiva++;
        }
        System.assertEquals(100, countPrevista, 'Metà dei record era Prevista');
        System.assertEquals(100, countEffettiva, 'Metà dei record era Effettiva');
    }
}
