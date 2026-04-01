@IsTest
private class DataExportControllersTest {
    @IsTest(SeeAllData=true)
    static void testDataExportControllerReturnsRows() {
        Test.startTest();
        List<DataExportController.TableRow> rows = DataExportController.getAllTableData();
        Test.stopTest();

        System.assertNotEquals(null, rows, 'La lista non deve essere null.');
        System.assert(rows.size() >= 2, 'La lista deve contenere almeno le righe del boolean.');
    }

    @IsTest(SeeAllData=true)
    static void testDataExportSorrisoControllerReturnsRows() {
        Test.startTest();
        List<DataExportSorrisoSospesoController.TableRow> rows = DataExportSorrisoSospesoController.getAllTableData();
        Test.stopTest();

        System.assertNotEquals(null, rows, 'La lista non deve essere null.');
        System.assert(rows.size() >= 2, 'La lista deve contenere almeno le righe del boolean.');
    }
}
