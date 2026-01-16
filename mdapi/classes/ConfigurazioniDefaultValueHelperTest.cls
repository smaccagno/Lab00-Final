@IsTest
private class ConfigurazioniDefaultValueHelperTest {
    @IsTest
    static void testRetrieveMedicalCenterDefaults() {
        Account partner = new Account(Name = 'Partner Default');
        insert partner;

        Account otherPartner = new Account(Name = 'Partner Secondario');
        insert otherPartner;

        Configurazioni__c initialConfiguration = new Configurazioni__c(
            Account__c = partner.Id,
            Attiva__c = true,
            Tipo_Configurazione__c = 'Valore di Default',
            Object_Name__c = 'Invoice__c',
            Field_Name__c = 'Medical_Center__c',
            Valore__c = ' Centro Originale '
        );
        insert initialConfiguration;

        Configurazioni__c latestConfiguration = new Configurazioni__c(
            Account__c = partner.Id,
            Attiva__c = true,
            Tipo_Configurazione__c = 'Valore di Default',
            Object_Name__c = 'Invoice__c',
            Field_Name__c = 'Medical_Center__c',
            Valore__c = ' Nuovo Centro '
        );
        insert latestConfiguration;

        Configurazioni__c inactiveConfiguration = new Configurazioni__c(
            Account__c = partner.Id,
            Attiva__c = false,
            Tipo_Configurazione__c = 'Valore di Default',
            Object_Name__c = 'Invoice__c',
            Field_Name__c = 'Medical_Center__c',
            Valore__c = 'Non utilizzato'
        );
        insert inactiveConfiguration;

        Configurazioni__c otherFieldConfiguration = new Configurazioni__c(
            Account__c = partner.Id,
            Attiva__c = true,
            Tipo_Configurazione__c = 'Valore di Default',
            Object_Name__c = 'Invoice__c',
            Field_Name__c = 'Another_Field__c',
            Valore__c = 'Non rilevante'
        );
        insert otherFieldConfiguration;

        Configurazioni__c otherPartnerConfiguration = new Configurazioni__c(
            Account__c = otherPartner.Id,
            Attiva__c = true,
            Tipo_Configurazione__c = 'Valore di Default',
            Object_Name__c = 'Invoice__c',
            Field_Name__c = 'Medical_Center__c',
            Valore__c = 'Altro Centro'
        );
        insert otherPartnerConfiguration;

        Test.startTest();
        List<String> defaults = ConfigurazioniDefaultValueHelper.retrieveMedicalCenterDefaults(
            new List<Id>{ partner.Id, otherPartner.Id, null }
        );
        Test.stopTest();

        System.assertEquals(3, defaults.size(), 'Deve essere restituito un valore per ogni input.');
        System.assertEquals('Nuovo Centro', defaults[0], 'Il valore più recente e attivo deve essere utilizzato.');
        System.assertEquals('Altro Centro', defaults[1], 'Il valore dell\'altro partner deve essere restituito.');
        System.assertEquals(null, defaults[2], 'Gli account null devono produrre un risultato nullo.');
    }
}