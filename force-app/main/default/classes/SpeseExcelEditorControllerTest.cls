@IsTest
private class SpeseExcelEditorControllerTest {

    @IsTest
    static void createSpeseFromFlow_returnsErrorOnInvalidPayload() {
        // Payload volutamente incompleto: deve fallire prima del lookup Budget
        List<Object> payload = new List<Object>{
            new Map<String, Object>{
                'rowNumber' => 1,
                'anno' => null,
                'categoria' => null,
                'sottocategoria' => null,
                'note' => 'x',
                'data' => '2026-04-01',
                'ammontare' => 10,
                'stato' => 'Prevista'
            }
        };

        Test.startTest();
        Map<String, Object> res = SpeseExcelEditorController.createSpeseFromFlow(JSON.serialize(payload));
        Test.stopTest();

        System.assertNotEquals(null, res, 'Risultato non deve essere null');
        System.assertEquals(false, (Boolean)res.get('success'), 'success deve essere false con payload invalido');
        System.assert(res.containsKey('spesaResults'), 'Deve contenere spesaResults');
    }

    @IsTest
    static void picklistHelpers_areCallable() {
        Test.startTest();
        List<String> cats = SpeseExcelEditorController.getCategoriaValues();
        List<String> st = SpeseExcelEditorController.getStatoValues();
        String sottosMapJson = JSON.serialize(SpeseExcelEditorController.getSottocategorieByCategoria());
        Test.stopTest();

        // Non facciamo assunzioni su quantita' esatte, ma assicuriamo che le chiamate non esplodano.
        System.assertNotEquals(null, cats);
        System.assertNotEquals(null, st);
        System.assertNotEquals(null, sottosMapJson);
    }
}

