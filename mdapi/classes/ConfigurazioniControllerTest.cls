@IsTest
private class ConfigurazioniControllerTest {
    @IsTest
    static void testGetPartnerAccounts() {
        Schema.DescribeSObjectResult accountDescribe = Account.SObjectType.getDescribe();
        Map<String, Schema.RecordTypeInfo> infosByDeveloperName = accountDescribe.getRecordTypeInfosByDeveloperName();
        Schema.RecordTypeInfo targetInfo;

        if (infosByDeveloperName.containsKey('Partner')) {
            targetInfo = infosByDeveloperName.get('Partner');
        } else {
            targetInfo = null;
            for (Schema.RecordTypeInfo info : accountDescribe.getRecordTypeInfos()) {
                if (!info.isMaster() && info.getRecordTypeId() != null && info.isAvailable()) {
                    targetInfo = info;
                    break;
                }
            }
        }

        if (targetInfo == null || targetInfo.getRecordTypeId() == null) {
            Test.startTest();
            List<Account> results = ConfigurazioniController.getPartnerAccounts();
            Test.stopTest();
            System.assertEquals(0, results.size(), 'Expected no partner accounts when no record type is available');
            return;
        }

        ConfigurazioniController.recordTypeDeveloperNameOverride = targetInfo.getDeveloperName();
        try {
            Account partnerAccount = new Account(Name = 'Partner Account', RecordTypeId = targetInfo.getRecordTypeId());
            insert partnerAccount;

            Account standardAccount = new Account(Name = 'Standard Account');
            insert standardAccount;

            Test.startTest();
            List<Account> results = ConfigurazioniController.getPartnerAccounts();
            Test.stopTest();

            System.assertEquals(1, results.size(), 'Should return only accounts with the selected record type');
            System.assertEquals(partnerAccount.Id, results[0].Id, 'Returned account should match the partner account');
        } finally {
            ConfigurazioniController.recordTypeDeveloperNameOverride = null;
        }
    }

    @IsTest
    static void testGetFieldValuesInvoice() {
        InvoiceTestDataFactory.Setup setup = InvoiceTestDataFactory.createBase('2024');

        Account partnerAccount = new Account(Name = 'Partner Config Account');
        insert partnerAccount;

        Account otherAccount = new Account(Name = 'Other Config Account');
        insert otherAccount;

        GiftDesignation partnerBudget = [SELECT Id, Partner__c FROM GiftDesignation WHERE Id = :setup.budgetId];
        partnerBudget.Partner__c = partnerAccount.Id;
        update partnerBudget;

        GiftDesignation otherBudget = new GiftDesignation(Name = 'Other Budget', Partner__c = otherAccount.Id);
        try { otherBudget.put('Program__c', setup.programId); } catch (Exception ignore) {}
        insert otherBudget;

        List<Invoice__c> invoices = new List<Invoice__c>{
            new Invoice__c(
                Budget__c = partnerBudget.Id,
                Invoice_Number__c = 'INV-001',
                Account__c = partnerAccount.Id,
                Medical_Center__c = 'Centro A'
            ),
            new Invoice__c(
                Budget__c = partnerBudget.Id,
                Invoice_Number__c = 'INV-002',
                Account__c = partnerAccount.Id,
                Medical_Center__c = 'Centro B'
            ),
            new Invoice__c(
                Budget__c = otherBudget.Id,
                Invoice_Number__c = 'INV-003',
                Account__c = otherAccount.Id,
                Medical_Center__c = 'Centro A'
            )
        };
        insert invoices;

        Test.startTest();
        ConfigurazioniController.FieldValueResponse response = ConfigurazioniController.getFieldValues('Invoice__c', 'Medical_Center__c', partnerAccount.Id);
        Test.stopTest();

        System.assertNotEquals(null, response, 'Response should not be null');
        System.assertEquals(2, response.values.size(), 'Should return distinct medical centers for the partner account');
        Set<String> actualValues = new Set<String>(response.values);
        System.assertEquals(new Set<String>{ 'Centro A', 'Centro B' }, actualValues,
            'Returned values should match the partner medical centers');
        System.assert(response.query != null && response.query.contains('SELECT Medical_Center__c'),
            'Returned query should include the selected field');
    }

    @IsTest
    static void testGetConfigurationsByAccount() {
        Account targetAccount = new Account(Name = 'Account Configurazioni');
        insert targetAccount;

        Account otherAccount = new Account(Name = 'Account Secondario');
        insert otherAccount;

        Configurazioni__c firstConfiguration = new Configurazioni__c(
            Account__c = targetAccount.Id,
            Attiva__c = true,
            Nome_Configurazione__c = 'Configurazione A',
            Tipo_Configurazione__c = 'Funzionalità on/off',
            Nome_Funzionalita__c = 'Prestazione Gratuita',
            On_Off__c = true,
            Object_Name__c = 'Invoice__c',
            Field_Name__c = 'Medical_Center__c',
            Valore__c = 'Centro A'
        );

        Configurazioni__c secondConfiguration = new Configurazioni__c(
            Account__c = targetAccount.Id,
            Attiva__c = false,
            Nome_Configurazione__c = 'Configurazione B',
            Tipo_Configurazione__c = 'Valore di Default',
            On_Off__c = false,
            Object_Name__c = 'Invoice__c',
            Field_Name__c = 'Medical_Center__c',
            Valore__c = 'Centro B'
        );

        Configurazioni__c otherConfiguration = new Configurazioni__c(
            Account__c = otherAccount.Id,
            Nome_Configurazione__c = 'Configurazione C'
        );

        insert new List<Configurazioni__c>{ firstConfiguration, secondConfiguration, otherConfiguration };

        Test.startTest();
        List<Configurazioni__c> results = ConfigurazioniController.getConfigurationsByAccount(targetAccount.Id);
        Test.stopTest();

        System.assertEquals(2, results.size(), 'Expected only configurations linked to the target account');

        Set<Id> configurationIds = new Set<Id>();
        for (Configurazioni__c configuration : results) {
            configurationIds.add(configuration.Id);
            System.assertEquals(targetAccount.Id, configuration.Account__c,
                'Returned configuration must belong to the target account');
            System.assertNotEquals(null, configuration.CreatedDate,
                'CreatedDate should be populated on returned configurations');
            System.assertNotEquals(null, configuration.Account__r,
                'Account relationship should be loaded');
            System.assertEquals(targetAccount.Name, configuration.Account__r.Name,
                'Account name should match the target account');
        }

        System.assert(configurationIds.contains(firstConfiguration.Id),
            'First configuration should be included in the result');
        System.assert(configurationIds.contains(secondConfiguration.Id),
            'Second configuration should be included in the result');
    }

    @IsTest
    static void testGetConfigurationsByAccountWithNull() {
        Test.startTest();
        List<Configurazioni__c> results = ConfigurazioniController.getConfigurationsByAccount(null);
        Test.stopTest();

        System.assertEquals(0, results.size(), 'Expected no configurations when account id is null');
    }

    @IsTest
    static void testCreateConfigurationDeactivatesExisting() {
        Account account = new Account(Name = 'Account Funzionalità');
        insert account;

        Configurazioni__c existingConfiguration = new Configurazioni__c(
            Account__c = account.Id,
            Attiva__c = true,
            Nome_Configurazione__c = 'Configurazione Funzionalità',
            Tipo_Configurazione__c = 'Funzionalità on/off',
            Nome_Funzionalita__c = 'Prestazione Gratuita',
            On_Off__c = true
        );
        insert existingConfiguration;

        Test.startTest();
        Configurazioni__c created = ConfigurazioniController.createConfiguration(
            account.Id,
            'Funzionalità on/off',
            'Configurazione Funzionalità - Nuova',
            'Prestazione Gratuita',
            null,
            null,
            null,
            true
        );
        Test.stopTest();

        Configurazioni__c reloadedExisting = [
            SELECT Attiva__c
            FROM Configurazioni__c
            WHERE Id = :existingConfiguration.Id
        ];
        System.assertEquals(false, reloadedExisting.Attiva__c,
            'Existing configuration should be deactivated');

        Configurazioni__c reloadedCreated = [
            SELECT Account__c, Attiva__c, Nome_Funzionalita__c, On_Off__c
            FROM Configurazioni__c
            WHERE Id = :created.Id
        ];
        System.assertEquals(account.Id, reloadedCreated.Account__c,
            'Created configuration should reference the provided account');
        System.assertEquals(true, reloadedCreated.Attiva__c,
            'Created configuration must be active');
        System.assertEquals('Prestazione Gratuita', reloadedCreated.Nome_Funzionalita__c,
            'Functionality name should be stored');
        System.assertEquals(true, reloadedCreated.On_Off__c,
            'On/Off flag should be stored');
    }

    @IsTest
    static void testCreateConfigurationDeactivatesWithDifferentOnOff() {
        Account account = new Account(Name = 'Account Funzionalità 2');
        insert account;

        Configurazioni__c existingConfiguration = new Configurazioni__c(
            Account__c = account.Id,
            Attiva__c = true,
            Nome_Configurazione__c = 'Configurazione Funzionalità',
            Tipo_Configurazione__c = 'Funzionalità on/off',
            Nome_Funzionalita__c = 'Prestazione Gratuita',
            On_Off__c = true
        );
        insert existingConfiguration;

        Test.startTest();
        Configurazioni__c created = ConfigurazioniController.createConfiguration(
            account.Id,
            'Funzionalità on/off',
            'Configurazione Funzionalità - Off',
            'Prestazione Gratuita',
            null,
            null,
            null,
            false
        );
        Test.stopTest();

        Configurazioni__c reloadedExisting = [
            SELECT Attiva__c
            FROM Configurazioni__c
            WHERE Id = :existingConfiguration.Id
        ];
        System.assertEquals(false, reloadedExisting.Attiva__c,
            'Existing configuration should be deactivated even if On/Off differs');

        Configurazioni__c newest = [
            SELECT Attiva__c, On_Off__c
            FROM Configurazioni__c
            WHERE Id = :created.Id
        ];
        System.assertEquals(false, newest.On_Off__c,
            'New configuration should preserve requested On/Off value');
    }

    @IsTest
    static void testCreateConfigurationDeactivatesWithDifferentValue() {
        Account account = new Account(Name = 'Account Funzionalità 3');
        insert account;

        Configurazioni__c existingConfiguration = new Configurazioni__c(
            Account__c = account.Id,
            Attiva__c = true,
            Nome_Configurazione__c = 'Configurazione Funzionalità',
            Tipo_Configurazione__c = 'Funzionalità on/off',
            Nome_Funzionalita__c = 'Prestazione Gratuita',
            Object_Name__c = 'Invoice__c',
            Field_Name__c = 'Medical_Center__c',
            Valore__c = 'Vecchio Valore',
            On_Off__c = true
        );
        insert existingConfiguration;

        Test.startTest();
        ConfigurazioniController.createConfiguration(
            account.Id,
            'Funzionalità on/off',
            'Configurazione Funzionalità - Nuovo Valore',
            'Prestazione Gratuita',
            'Invoice__c',
            'Medical_Center__c',
            'Nuovo Valore',
            true
        );
        Test.stopTest();

        Configurazioni__c reloadedExisting = [
            SELECT Attiva__c
            FROM Configurazioni__c
            WHERE Id = :existingConfiguration.Id
        ];
        System.assertEquals(false, reloadedExisting.Attiva__c,
            'Existing configuration should be deactivated even if value differs');
    }

    @IsTest
    static void testUpdateConfigurationDeactivatesMatching() {
        Account account = new Account(Name = 'Account Funzionalità 4');
        insert account;

        Configurazioni__c firstConfiguration = new Configurazioni__c(
            Account__c = account.Id,
            Attiva__c = true,
            Nome_Configurazione__c = 'Configurazione Funzionalità 1',
            Tipo_Configurazione__c = 'Funzionalità on/off',
            Nome_Funzionalita__c = 'Prestazione Gratuita',
            On_Off__c = false
        );

        Configurazioni__c secondConfiguration = new Configurazioni__c(
            Account__c = account.Id,
            Attiva__c = true,
            Nome_Configurazione__c = 'Configurazione Funzionalità 2',
            Tipo_Configurazione__c = 'Funzionalità on/off',
            Nome_Funzionalita__c = 'Prestazione Gratuita',
            On_Off__c = true
        );

        insert new List<Configurazioni__c>{ firstConfiguration, secondConfiguration };

        Test.startTest();
        Configurazioni__c updated = ConfigurazioniController.updateConfiguration(
            secondConfiguration.Id,
            account.Id,
            'Funzionalità on/off',
            'Configurazione Funzionalità 2 Updated',
            'Prestazione Gratuita',
            null,
            null,
            null,
            true,
            true
        );
        Test.stopTest();

        Configurazioni__c reloadedFirst = [
            SELECT Attiva__c
            FROM Configurazioni__c
            WHERE Id = :firstConfiguration.Id
        ];
        System.assertEquals(false, reloadedFirst.Attiva__c,
            'First configuration should be deactivated by update');

        Configurazioni__c reloadedSecond = [
            SELECT Nome_Configurazione__c, On_Off__c
            FROM Configurazioni__c
            WHERE Id = :secondConfiguration.Id
        ];
        System.assertEquals('Configurazione Funzionalità 2 Updated', reloadedSecond.Nome_Configurazione__c,
            'Updated configuration should persist the provided name');
        System.assertEquals(true, reloadedSecond.On_Off__c,
            'Updated configuration should persist the provided On/Off value');
        System.assertNotEquals(null, updated,
            'Update method should return the updated configuration');
    }

    @IsTest
    static void testDeleteConfiguration() {
        Account account = new Account(Name = 'Account Funzionalità 5');
        insert account;

        Configurazioni__c configuration = new Configurazioni__c(
            Account__c = account.Id,
            Attiva__c = true,
            Nome_Configurazione__c = 'Configurazione da Eliminare',
            Tipo_Configurazione__c = 'Funzionalità on/off',
            Nome_Funzionalita__c = 'Prestazione Gratuita',
            On_Off__c = true
        );
        insert configuration;

        Test.startTest();
        ConfigurazioniController.deleteConfiguration(configuration.Id);
        Test.stopTest();

        Integer remaining = [
            SELECT COUNT()
            FROM Configurazioni__c
            WHERE Id = :configuration.Id
        ];
        System.assertEquals(0, remaining, 'Configuration should be deleted');
    }

    @IsTest
    static void testUpdateConfigurationCanDeactivate() {
        Account account = new Account(Name = 'Account Funzionalità 6');
        insert account;

        Configurazioni__c configuration = new Configurazioni__c(
            Account__c = account.Id,
            Attiva__c = true,
            Nome_Configurazione__c = 'Configurazione Funzionalità',
            Tipo_Configurazione__c = 'Funzionalità on/off',
            Nome_Funzionalita__c = 'Prestazione Gratuita',
            On_Off__c = true
        );
        insert configuration;

        Test.startTest();
        ConfigurazioniController.updateConfiguration(
            configuration.Id,
            account.Id,
            'Funzionalità on/off',
            'Configurazione Funzionalità',
            'Prestazione Gratuita',
            null,
            null,
            null,
            true,
            false
        );
        Test.stopTest();

        Configurazioni__c reloaded = [
            SELECT Attiva__c
            FROM Configurazioni__c
            WHERE Id = :configuration.Id
        ];

        System.assertEquals(false, reloaded.Attiva__c,
            'Update should allow disabling the configuration');
    }
}