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

    @IsTest
    static void getSottocategorieByCategoria_contiene_solo_chiavi_valide() {
        // La mappa dinamica deve avere come chiavi esattamente le Categoria__c attive.
        Set<String> activeCategorie = new Set<String>();
        for (Schema.PicklistEntry e : Voce_di_Spesa__c.Categoria__c.getDescribe().getPicklistValues()) {
            if (e.isActive()) activeCategorie.add(e.getValue());
        }

        Map<String, List<String>> map1 = SpeseExcelEditorController.getSottocategorieByCategoria();

        System.assertEquals(activeCategorie, map1.keySet(),
            'Le chiavi della mappa devono corrispondere ai Categoria__c attivi');
    }

    @IsTest
    static void getSottocategorieByCategoria_valori_sono_sottocategorie_attive() {
        // Ogni valore nella mappa deve essere una Sottocategoria__c attiva.
        Set<String> activeSotto = new Set<String>();
        for (Schema.PicklistEntry e : Voce_di_Spesa__c.Sottocategoria__c.getDescribe().getPicklistValues()) {
            if (e.isActive()) activeSotto.add(e.getValue());
        }

        Map<String, List<String>> m = SpeseExcelEditorController.getSottocategorieByCategoria();
        for (String cat : m.keySet()) {
            for (String sub : m.get(cat)) {
                System.assert(activeSotto.contains(sub),
                    'Sottocategoria "' + sub + '" sotto "' + cat + '" non è attiva nel picklist');
            }
        }
    }

    @IsTest
    static void getSottocategorieByCategoria_almeno_una_categoria_popolata() {
        // Smoke test: se le picklist esistono come da metadata, almeno una categoria deve avere sotto-voci.
        Map<String, List<String>> m = SpeseExcelEditorController.getSottocategorieByCategoria();
        Integer totalSubs = 0;
        for (List<String> subs : m.values()) totalSubs += subs.size();
        System.assert(totalSubs > 0, 'Almeno una categoria deve avere sottocategorie dipendenti');
    }
}

