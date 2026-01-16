@isTest
private class FlowControllerTest {

    @testSetup
    static void setupData() {
        // Crea Account con StructureCode per simulare esistenza codice (usato in test negativi eventualmente)
        insert new Account(
            Name = 'Test Account',
            StructureCode__c = 'A12345678Z123456',
            RecordTypeId = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName().get('Structure').getRecordTypeId()
        );

        // Crea un record generico per test getRecords
        insert new Account(Name = 'AlphaTest', StructureCode__c = 'TESTCODE123');
    }

    @isTest
    static void testGetRecords() {
        Test.startTest();
        List<SObject> result = FlowController.getRecords('Account', new List<String>{'Id', 'Name'});
        Test.stopTest();

        System.assertNotEquals(null, result, 'La lista dei record non dovrebbe essere null');
        System.assert(result.size() > 0, 'Dovrebbe esserci almeno un record Account');
        System.assert(result[0].get('Name') != null, 'Il campo Name deve essere valorizzato');
    }

    @isTest
    static void testGenerateStructureCode() {
        Test.startTest();
        List<String> result = FlowController.generateStructureCode();
        Test.stopTest();

        System.assertEquals(1, result.size(), 'Deve essere generato un solo codice');
        String code = result[0];

        System.assertEquals(16, code.length(), 'Il codice deve essere lungo 16 caratteri');

        // Controlla che il primo e ultimo carattere siano lettere (A-Z)
        String letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        System.assert(letters.contains(code.substring(0, 1)), 'Il primo carattere deve essere una lettera');
        System.assert(letters.contains(code.substring(code.length() - 1)), 'L\'ultimo carattere deve essere una lettera');
    }

    @isTest
    static void testGenerateStructureCodeUnique() {
        // Genera più codici e assicurati che non siano duplicati
        Set<String> codes = new Set<String>();

        Test.startTest();
        for (Integer i = 0; i < 5; i++) {
            List<String> generated = FlowController.generateStructureCode();
            codes.add(generated[0]);
        }
        Test.stopTest();

        System.assertEquals(5, codes.size(), 'Tutti i codici generati devono essere unici');
    }

    @isTest
    static void testRandomCharFormat() {
        String code = FlowController.generateStructureCode()[0];

        Pattern p = Pattern.compile('^[A-Z][A-Z0-9]{14}[A-Z]$');
        Matcher m = p.matcher(code);
        System.assert(m.matches(), 'Il codice deve seguire il formato con lettere e numeri');
    }

}