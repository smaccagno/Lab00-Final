@IsTest
private class ConfigurazioniFlowHelperTest {
    @IsTest
    static void testEvaluatePrestazioneGratuita() {
        Account enabledAccount = new Account(Name = 'Enabled Account');
        insert enabledAccount;

        Account disabledAccount = new Account(Name = 'Disabled Account');
        insert disabledAccount;

        Configurazioni__c disabledConfiguration = new Configurazioni__c(
            Account__c = disabledAccount.Id,
            Attiva__c = true,
            Nome_Configurazione__c = 'Prestazione Gratuita Off',
            Tipo_Configurazione__c = 'Funzionalità on/off',
            Nome_Funzionalita__c = 'Prestazione Gratuita',
            On_Off__c = false
        );
        insert disabledConfiguration;

        Configurazioni__c enabledConfiguration = new Configurazioni__c(
            Account__c = enabledAccount.Id,
            Attiva__c = true,
            Nome_Configurazione__c = 'Prestazione Gratuita On',
            Tipo_Configurazione__c = 'Funzionalità on/off',
            Nome_Funzionalita__c = 'Prestazione Gratuita',
            On_Off__c = true
        );
        insert enabledConfiguration;

        List<Id> accountIds = new List<Id>{ disabledAccount.Id, enabledAccount.Id, null }; // null -> default true

        Test.startTest();
        List<Boolean> responses = ConfigurazioniFlowHelper.evaluatePrestazioneGratuita(accountIds);
        Test.stopTest();

        System.assertEquals(3, responses.size(), 'Three responses expected');
        System.assertEquals(false, responses[0],
            'Disabled configuration should return false');
        System.assertEquals(true, responses[1],
            'Enabled configuration should return true');
        System.assertEquals(true, responses[2],
            'Null account should default to true');
    }
}