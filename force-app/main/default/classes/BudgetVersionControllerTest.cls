@IsTest
private class BudgetVersionControllerTest {

    private static Program createProgram(String name) {
        Program p = new Program(Name = name, Status = 'Active', StartDate = Date.today());
        insert p;
        return p;
    }

    @IsTest
    static void createVersion_assegnaNumeroIncrementaleProvvisorio() {
        Id id1 = BudgetVersionController.createVersion(2027, 'Scenario A', 'desc');
        Id id2 = BudgetVersionController.createVersion(2027, 'Scenario B', 'desc');
        Id idY = BudgetVersionController.createVersion(2028, 'Altro anno', null);

        Budget_Version__c v1 = [SELECT Numero_Versione__c, Stato__c FROM Budget_Version__c WHERE Id=:id1];
        Budget_Version__c v2 = [SELECT Numero_Versione__c, Stato__c FROM Budget_Version__c WHERE Id=:id2];
        Budget_Version__c y  = [SELECT Numero_Versione__c FROM Budget_Version__c WHERE Id=:idY];

        System.assertEquals(1, v1.Numero_Versione__c);
        System.assertEquals(2, v2.Numero_Versione__c);
        System.assertEquals('Provvisorio', v1.Stato__c);
        System.assertEquals(1, y.Numero_Versione__c, 'numero resetta per nuovo anno');
    }

    @IsTest
    static void getVersionsByYear_escludeCestinate() {
        Id idA = BudgetVersionController.createVersion(2027, 'A', null);
        Id idB = BudgetVersionController.createVersion(2027, 'B', null);
        BudgetVersionController.trashVersion(idB);

        List<BudgetVersionController.BudgetVersionDTO> versions = BudgetVersionController.getVersionsByYear(2027);

        System.assertEquals(1, versions.size());
        System.assertEquals(idA, versions[0].id);
    }

    @IsTest
    static void upsertItem_rifiutaSuVersioneNonProvvisoria() {
        Id versionId = BudgetVersionController.createVersion(2027, 'A', null);
        Program prog = createProgram('Prog A');
        Id itemId = BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = versionId, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'Donazione',
            Nome__c = 'Donazione test', Ammontare__c = 100
        ));
        BudgetVersionController.promoteVersion(versionId);

        // Prova a fare upsert su versione ora Ufficiale → deve fallire
        Boolean thrown = false;
        try {
            BudgetVersionController.upsertItem(new Budget_Version_Item__c(
                Budget_Version__c = versionId, Tipo__c = 'Incasso',
                Programma__c = prog.Id, Categoria__c = 'Donazione',
                Nome__c = 'Altra', Ammontare__c = 200
            ));
        } catch (AuraHandledException e) { thrown = true; }
        System.assert(thrown, 'upsertItem su Ufficiale deve fallire');
    }

    @IsTest
    static void promoteVersion_materializzaIncassiESpeseStatoPrevista() {
        Id versionId = BudgetVersionController.createVersion(2027, 'A', null);
        Program prog = createProgram('Prog');
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = versionId, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'Donazione',
            Nome__c = 'Donazione', Data__c = Date.newInstance(2027, 6, 1),
            Ammontare__c = 1000
        ));
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = versionId, Tipo__c = 'Spesa',
            Programma__c = prog.Id, Categoria__c = 'Sede e Servizi Generali',
            Sottocategoria__c = 'Sede e domiciliazione legale', Nome__c = 'Affitto',
            Data__c = Date.newInstance(2027, 1, 1), Ammontare__c = 500
        ));

        Test.startTest();
        BudgetVersionController.promoteVersion(versionId);
        Test.stopTest();

        Budget_Version__c v = [SELECT Stato__c, Data_Promozione__c, Promossa_Da__c FROM Budget_Version__c WHERE Id=:versionId];
        System.assertEquals('Ufficiale', v.Stato__c);
        System.assertNotEquals(null, v.Data_Promozione__c);
        System.assertEquals(UserInfo.getUserId(), v.Promossa_Da__c);

        List<Voce_di_Incasso__c> inc = [SELECT Stato__c, Ammontare__c, Nome__c, Budget_Version__c
                                         FROM Voce_di_Incasso__c WHERE Budget_Version__c=:versionId];
        System.assertEquals(1, inc.size());
        System.assertEquals('Prevista', inc[0].Stato__c);
        System.assertEquals(1000, inc[0].Ammontare__c);
        System.assertEquals('Donazione', inc[0].Nome__c);

        List<Voce_di_Spesa__c> spe = [SELECT Stato__c, Ammontare__c, Sottocategoria__c
                                       FROM Voce_di_Spesa__c WHERE Budget_Version__c=:versionId];
        System.assertEquals(1, spe.size());
        System.assertEquals('Prevista', spe[0].Stato__c);
        System.assertEquals('Sede e domiciliazione legale', spe[0].Sottocategoria__c);
    }

    @IsTest
    static void promoteVersion_rimuovePrevisteDelPrecedenteStoricizza() {
        // v1 + promote
        Id v1 = BudgetVersionController.createVersion(2027, 'v1', null);
        Program prog = createProgram('P1');
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = v1, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'Donazione',
            Nome__c = 'D1', Ammontare__c = 100));
        BudgetVersionController.promoteVersion(v1);

        // v2 + promote
        Id v2 = BudgetVersionController.createVersion(2027, 'v2', null);
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = v2, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'Donazione',
            Nome__c = 'D2', Ammontare__c = 200));

        Test.startTest();
        BudgetVersionController.promoteVersion(v2);
        Test.stopTest();

        Budget_Version__c vec = [SELECT Stato__c FROM Budget_Version__c WHERE Id=:v1];
        System.assertEquals('Storicizzata', vec.Stato__c);

        Budget_Version__c nov = [SELECT Stato__c, Sostituisce__c FROM Budget_Version__c WHERE Id=:v2];
        System.assertEquals('Ufficiale', nov.Stato__c);
        System.assertEquals(v1, nov.Sostituisce__c);

        List<Voce_di_Incasso__c> vecchieInc = [SELECT Id FROM Voce_di_Incasso__c WHERE Budget_Version__c=:v1];
        System.assertEquals(0, vecchieInc.size(), 'Le Previste di v1 devono essere cancellate');
        List<Voce_di_Incasso__c> nuoveInc = [SELECT Nome__c FROM Voce_di_Incasso__c WHERE Budget_Version__c=:v2];
        System.assertEquals(1, nuoveInc.size());
        System.assertEquals('D2', nuoveInc[0].Nome__c);
    }

    @IsTest
    static void promoteVersion_nonToccaVociOrfanePrevista() {
        // Voce "orfana" (senza Budget_Version) creata a mano: deve sopravvivere al promote
        Program prog = createProgram('P1');
        Voce_di_Incasso__c orfana = new Voce_di_Incasso__c(
            Programma__c = prog.Id, Categoria__c = 'Donazione',
            Stato__c = 'Prevista', Ammontare__c = 999
        );
        insert orfana;

        Id v1 = BudgetVersionController.createVersion(2027, 'v1', null);
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = v1, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'Donazione',
            Nome__c = 'D1', Ammontare__c = 100));
        Test.startTest();
        BudgetVersionController.promoteVersion(v1);
        Test.stopTest();

        Voce_di_Incasso__c dopo = [SELECT Id FROM Voce_di_Incasso__c WHERE Id=:orfana.Id];
        System.assertNotEquals(null, dopo.Id, 'Orfane non toccate dal promote');
    }

    @IsTest
    static void forkVersion_copiaItemsInNuovaProvvisoria() {
        Id src = BudgetVersionController.createVersion(2027, 'src', null);
        Program prog = createProgram('P');
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = src, Tipo__c = 'Incasso',
            Programma__c = prog.Id, Categoria__c = 'Donazione', Nome__c = 'Uno', Ammontare__c = 1,
            Data__c = Date.today()));
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = src, Tipo__c = 'Spesa',
            Programma__c = prog.Id, Categoria__c = 'Sede e Servizi Generali', Nome__c = 'Due', Ammontare__c = 2,
            Data__c = Date.today()));
        BudgetVersionController.promoteVersion(src);

        Test.startTest();
        Id forkId = BudgetVersionController.forkVersion(src);
        Test.stopTest();

        Budget_Version__c forkRec = [SELECT Stato__c, Numero_Versione__c FROM Budget_Version__c WHERE Id=:forkId];
        System.assertEquals('Provvisorio', forkRec.Stato__c);
        System.assertEquals(2, forkRec.Numero_Versione__c);

        List<Budget_Version_Item__c> items = [SELECT Nome__c FROM Budget_Version_Item__c WHERE Budget_Version__c=:forkId ORDER BY Nome__c];
        System.assertEquals(2, items.size());
        System.assertEquals('Due', items[0].Nome__c);
        System.assertEquals('Uno', items[1].Nome__c);
    }

    @IsTest
    static void trashVersion_rifiutaUfficiale() {
        Id v = BudgetVersionController.createVersion(2027, 'v', null);
        BudgetVersionController.promoteVersion(v);

        Boolean thrown = false;
        try {
            BudgetVersionController.trashVersion(v);
        } catch (AuraHandledException e) { thrown = true; }
        System.assert(thrown, 'trash di Ufficiale deve fallire');
    }

    @IsTest
    static void updateVersionHeader_rifiutaSuNonProvvisoria() {
        Id v = BudgetVersionController.createVersion(2027, 'old', 'd');
        BudgetVersionController.promoteVersion(v);

        Boolean thrown = false;
        try {
            BudgetVersionController.updateVersionHeader(v, 'nuovo nome', 'nuova desc');
        } catch (AuraHandledException e) { thrown = true; }
        System.assert(thrown, 'rename su Ufficiale deve fallire');
    }

    @IsTest
    static void reorderItems_aggiornaSortOrder() {
        Id vId = BudgetVersionController.createVersion(2027, 'v', null);
        Program prog = createProgram('P');
        Id a = BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = vId, Tipo__c='Incasso', Programma__c=prog.Id,
            Categoria__c='X', Nome__c='A', Ammontare__c=1, Sort_Order__c=1));
        Id b = BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = vId, Tipo__c='Incasso', Programma__c=prog.Id,
            Categoria__c='X', Nome__c='B', Ammontare__c=1, Sort_Order__c=2));

        List<BudgetVersionController.ItemOrder> orders = new List<BudgetVersionController.ItemOrder>{
            new BudgetVersionController.ItemOrder(b, 1),
            new BudgetVersionController.ItemOrder(a, 2)
        };
        BudgetVersionController.reorderItems(orders);

        Map<Id, Budget_Version_Item__c> map1 = new Map<Id, Budget_Version_Item__c>(
            [SELECT Sort_Order__c FROM Budget_Version_Item__c WHERE Id IN :new List<Id>{a,b}]);
        System.assertEquals(2, map1.get(a).Sort_Order__c);
        System.assertEquals(1, map1.get(b).Sort_Order__c);
    }

    @IsTest
    static void getVersionDetail_ritornaHeaderEItems() {
        Id v = BudgetVersionController.createVersion(2027, 'det', 'd');
        Program prog = createProgram('P');
        BudgetVersionController.upsertItem(new Budget_Version_Item__c(
            Budget_Version__c = v, Tipo__c='Incasso', Programma__c=prog.Id,
            Categoria__c='X', Nome__c='A', Ammontare__c=1, Sort_Order__c=1));

        BudgetVersionController.BudgetVersionDetailDTO detail =
            BudgetVersionController.getVersionDetail(v);

        System.assertEquals(v, detail.header.id);
        System.assertEquals('Provvisorio', detail.header.stato);
        System.assertEquals(1, detail.items.size());
    }
}
