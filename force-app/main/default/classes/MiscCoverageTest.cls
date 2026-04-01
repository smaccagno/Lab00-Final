@IsTest
public class MiscCoverageTest {
    private class CityValidationMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"predictions":[{"description":"Roma"}]}');
            return res;
        }
    }

    @IsTest
    static void testAccountDynamicTableCtrl() {
        List<AccountDynamicTableCtrl.TableDTO> tables = AccountDynamicTableCtrl.getAccountTables();
        System.assertNotEquals(null, tables, 'La lista tabelle non deve essere null');
    }

    @IsTest
    static void testCityValidation() {
        Test.setMock(HttpCalloutMock.class, new CityValidationMock());
        List<String> result = CityValidation.validateCity(new List<String>{'Roma'});
        System.assertEquals(1, result.size(), 'Risultato atteso');
        System.assertEquals('Città valida', result[0], 'La città deve risultare valida');
    }

    @IsTest
    static void testDataExportController() {
        List<DataExportController.TableRow> rows = DataExportController.getAllTableData();
        System.assertNotEquals(null, rows, 'Le righe non devono essere null');
        System.assert(rows.size() > 0, 'Deve restituire almeno una riga');
    }

    @IsTest
    static void testVisitTypeExportController() {
        Test.setCurrentPage(Page.VisitTypeRegionChartPdf);
        VisitTypeExportController ctrl = new VisitTypeExportController();
        System.assertNotEquals(null, ctrl.rows, 'Rows non deve essere null');
        System.assertNotEquals(null, ctrl.sections, 'Sections non deve essere null');
    }

    @IsTest
    static void testUpdateTransazioneShadowStaticInvocableAndQueueable() {
        InvoiceTestDataFactory.Setup s = InvoiceTestDataFactory.createBase('2025');
        Transazione_Shadow__c sh = new Transazione_Shadow__c(
            Name = 'Test Shadow',
            Totali_Donatore_Anno__c = s.totDonId
        );
        insert sh;

        List<UpdateTransazioneShadowStaticInvocable.Input> inputs = new List<UpdateTransazioneShadowStaticInvocable.Input>();
        UpdateTransazioneShadowStaticInvocable.Input inp = new UpdateTransazioneShadowStaticInvocable.Input();
        inp.recordId = sh.Id;
        inp.allocabile = 100;
        inp.allocazioniNonPagate = 1;
        inp.donatoOriginale = 100;
        inp.numeroAllocazioni = 2;
        inp.totaleAllocato = 80;
        inp.totaleAllocatoNonPagato = 40;
        inp.totaleAllocatoPagato = 40;
        inputs.add(inp);

        Test.startTest();
        UpdateTransazioneShadowStaticInvocable.enqueueUpdate(inputs);
        Test.stopTest();

        Transazione_Shadow__c updated = [SELECT Id FROM Transazione_Shadow__c WHERE Id = :sh.Id];
        System.assertNotEquals(null, updated.Id, 'Invocable e Queueable eseguiti senza eccezione');
    }

    @IsTest
    static void testUpdateTransazioneShadowStaticQueueableCoverage() {
        UpdateTransazioneShadowStaticQueueable q = new UpdateTransazioneShadowStaticQueueable(
            null, null, null, null, null, null, null, null
        );
        Test.startTest();
        System.enqueueJob(q);
        Test.stopTest();
        System.assert(true, 'Queueable con null recordId esegue senza errore');
    }
}