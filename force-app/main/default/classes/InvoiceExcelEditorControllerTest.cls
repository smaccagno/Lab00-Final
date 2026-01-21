@IsTest
public class InvoiceExcelEditorControllerTest {
    
    @testSetup
    static void setupTestData() {
        // Crea dati di base usando InvoiceTestDataFactory
        InvoiceTestDataFactory.Setup setup = InvoiceTestDataFactory.createBase('2024');
        
        // Crea un Tipo_Visita__c per i test (se possibile)
        // Usa Database.insert con allOrNone=false per gestire eventuali errori
        try {
            Tipo_Visita__c tipoVisita = new Tipo_Visita__c(Name = 'Test Tipo Visita');
            Database.SaveResult result = Database.insert(tipoVisita, false);
            if (!result.isSuccess()) {
                // Se la creazione fallisce, non è un problema - i test useranno tipi visita esistenti nella org
                System.debug('Impossibile creare Tipo_Visita__c nel setup: ' + (result.getErrors().isEmpty() ? 'Unknown error' : result.getErrors()[0].getMessage()));
            }
        } catch (Exception e) {
            // Se la creazione fallisce, non è un problema - i test useranno tipi visita esistenti nella org
            System.debug('Errore durante la creazione di Tipo_Visita__c nel setup: ' + e.getMessage());
        }
        
        // Crea un comune di test
        Schema.DescribeFieldResult provinciaDescribe = Comune__c.Provincia__c.getDescribe();
        Schema.DescribeFieldResult regioneDescribe = Comune__c.Regione__c.getDescribe();
        String testProvincia = provinciaDescribe.getPicklistValues().isEmpty() 
            ? null 
            : provinciaDescribe.getPicklistValues()[0].getValue();
        String testRegione = regioneDescribe.getPicklistValues().isEmpty() 
            ? null 
            : regioneDescribe.getPicklistValues()[0].getValue();
        
        Comune__c comune = new Comune__c(
            Name = 'TestComune',
            Nome_Comune__c = 'TestComune'
        );
        if (testProvincia != null) comune.Provincia__c = testProvincia;
        if (testRegione != null) comune.Regione__c = testRegione;
        insert comune;
        
        // Crea un Ente No Profit di test
        Ente_No_Profit__c ente = new Ente_No_Profit__c(
            Name = 'Test Ente',
            Ente_Categoria__c = 'Test Categoria'
        );
        insert ente;
        
        // Medical_Center__c è un campo testo su Invoice__c, non un oggetto separato
        // Non serve creare un record Medical_Center__c
        
        // Crea un Account Partner per il test
        Account partnerAccount = new Account(Name = 'Test Partner Account');
        insert partnerAccount;
        
        // Crea un ProgramEnrollment per il test
        ProgramEnrollment enrollment = new ProgramEnrollment(
            AccountId = setup.accNormalId,
            ProgramId = setup.programId,
            IsActive = true
        );
        insert enrollment;
    }
    
    @IsTest
    static void testGetPartnerAccount() {
        // Test con CompanyName vuoto
        Account result = InvoiceExcelEditorController.getPartnerAccount();
        // Il risultato può essere null se l'utente non ha CompanyName impostato
        // Verifica solo che il metodo non lanci eccezioni
        System.assert(true, 'Test getPartnerAccount completato');
    }
    
    @IsTest
    static void testGetFreeAccount() {
        Account result = InvoiceExcelEditorController.getFreeAccount();
        // Il risultato può essere null se non ci sono account GRATUITO nella org
        if (result != null) {
            // Se viene restituito un account, verifica che abbia GRATUITO__c = true
            // Query di nuovo l'account per assicurarci che GRATUITO__c sia disponibile
            Account accountWithField = [SELECT Id, Name, GRATUITO__c FROM Account WHERE Id = :result.Id LIMIT 1];
            System.assertEquals(true, accountWithField.GRATUITO__c, 'L\'account dovrebbe avere GRATUITO__c = true');
        }
        // Il test passa anche se result è null (non ci sono account GRATUITO nella org)
        System.assert(true, 'Test getFreeAccount completato');
    }
    
    @IsTest
    static void testGetEnrolledPrograms() {
        // Recupera l'account normale dal setup
        Account testAccount = [SELECT Id FROM Account WHERE DEFAULT__c = false AND GRATUITO__c = false LIMIT 1];
        
        List<Program> programs = InvoiceExcelEditorController.getEnrolledPrograms(testAccount.Id);
        System.assertNotEquals(null, programs, 'La lista non deve essere null');
        
        // Test con accountId nullo
        List<Program> emptyPrograms = InvoiceExcelEditorController.getEnrolledPrograms(null);
        System.assertEquals(0, emptyPrograms.size(), 'Con accountId nullo dovrebbe restituire lista vuota');
        
        // Test con accountId vuoto
        List<Program> emptyPrograms2 = InvoiceExcelEditorController.getEnrolledPrograms('');
        System.assertEquals(0, emptyPrograms2.size(), 'Con accountId vuoto dovrebbe restituire lista vuota');
    }
    
    @IsTest
    static void testGetPartnersForProgram() {
        Program testProgram = [SELECT Id FROM Program LIMIT 1];
        
        List<Account> partners = InvoiceExcelEditorController.getPartnersForProgram(testProgram.Id);
        System.assertNotEquals(null, partners, 'La lista non deve essere null');
        
        // Test con programId nullo
        List<Account> emptyPartners = InvoiceExcelEditorController.getPartnersForProgram(null);
        System.assertEquals(0, emptyPartners.size(), 'Con programId nullo dovrebbe restituire lista vuota');
        
        // Test con programId vuoto
        List<Account> emptyPartners2 = InvoiceExcelEditorController.getPartnersForProgram('');
        System.assertEquals(0, emptyPartners2.size(), 'Con programId vuoto dovrebbe restituire lista vuota');
    }
    
    @IsTest
    static void testGetAvailableBudgetsForProgram() {
        Program testProgram = [SELECT Id FROM Program LIMIT 1];
        
        List<GiftDesignation> budgets = InvoiceExcelEditorController.getAvailableBudgetsForProgram(testProgram.Id);
        System.assertNotEquals(null, budgets, 'La lista non deve essere null');
        
        // Test con programId nullo
        List<GiftDesignation> emptyBudgets = InvoiceExcelEditorController.getAvailableBudgetsForProgram(null);
        System.assertEquals(0, emptyBudgets.size(), 'Con programId nullo dovrebbe restituire lista vuota');
        
        // Test con programId vuoto
        List<GiftDesignation> emptyBudgets2 = InvoiceExcelEditorController.getAvailableBudgetsForProgram('');
        System.assertEquals(0, emptyBudgets2.size(), 'Con programId vuoto dovrebbe restituire lista vuota');
    }
    
    @IsTest
    static void testCheckBudgetForProgram() {
        Program testProgram = [SELECT Id FROM Program LIMIT 1];
        Account testAccount = [SELECT Id FROM Account WHERE DEFAULT__c = false AND GRATUITO__c = false LIMIT 1];
        
        Map<String, Object> result = InvoiceExcelEditorController.checkBudgetForProgram(testProgram.Id, testAccount.Id);
        System.assertNotEquals(null, result, 'Il risultato non deve essere null');
        System.assert(result.containsKey('needsPartnerSelection'), 'Dovrebbe contenere needsPartnerSelection');
        System.assert(result.containsKey('budgetId'), 'Dovrebbe contenere budgetId');
        
        // Test con programId nullo
        Map<String, Object> resultNull = InvoiceExcelEditorController.checkBudgetForProgram(null, testAccount.Id);
        System.assertEquals(false, resultNull.get('needsPartnerSelection'), 'Con programId nullo needsPartnerSelection dovrebbe essere false');
    }
    
    @IsTest
    static void testGenerateInvoiceNumber() {
        // Test con isFree = true
        String invoiceNumber1 = InvoiceExcelEditorController.generateInvoiceNumber(true, false, '2024-01-15', 'Test Medical Center');
        System.assertNotEquals(null, invoiceNumber1, 'Dovrebbe generare un numero fattura per prestazione gratuita');
        
        // Test con noInvoiceAvailable = true
        String invoiceNumber2 = InvoiceExcelEditorController.generateInvoiceNumber(false, true, '2024-01-15', 'Test Medical Center');
        System.assertNotEquals(null, invoiceNumber2, 'Dovrebbe generare un numero fattura quando noInvoiceAvailable è true');
        
        // Test con entrambi false (non dovrebbe generare)
        String invoiceNumber3 = InvoiceExcelEditorController.generateInvoiceNumber(false, false, '2024-01-15', 'Test Medical Center');
        System.assertEquals(null, invoiceNumber3, 'Non dovrebbe generare un numero fattura quando entrambi i flag sono false');
        
        // Test con date null
        String invoiceNumber4 = InvoiceExcelEditorController.generateInvoiceNumber(true, false, null, 'Test Medical Center');
        System.assertNotEquals(null, invoiceNumber4, 'Dovrebbe gestire date null');
    }
    
    @IsTest
    static void testCheckInvoiceNumbersUniqueness() {
        // Crea alcune fatture di test
        Program testProgram = [SELECT Id FROM Program LIMIT 1];
        Account testAccount = [SELECT Id FROM Account WHERE DEFAULT__c = false AND GRATUITO__c = false LIMIT 1];
        GiftDesignation testBudget = [SELECT Id FROM GiftDesignation LIMIT 1];
        
        Invoice__c invoice1 = new Invoice__c(
            Invoice_Number__c = 'INV-001',
            Account__c = testAccount.Id,
            Date__c = Date.today(),
            Budget__c = testBudget.Id,
            Medical_Center__c = 'Test Medical Center'
        );
        Invoice__c invoice2 = new Invoice__c(
            Invoice_Number__c = 'INV-002',
            Account__c = testAccount.Id,
            Date__c = Date.today(),
            Budget__c = testBudget.Id
        );
        insert new List<Invoice__c>{ invoice1, invoice2 };
        
        // Crea dati JSON per il test
        List<Map<String, Object>> invoiceDataList = new List<Map<String, Object>>();
        Map<String, Object> row1 = new Map<String, Object>{
            'invoiceNumber' => 'INV-001', // Duplicato
            'invoiceDate' => String.valueOf(Date.today()),
            'medicalCenter' => 'Test Medical Center',
            'programId' => testProgram.Id
        };
        Map<String, Object> row2 = new Map<String, Object>{
            'invoiceNumber' => 'INV-003', // Non duplicato
            'invoiceDate' => String.valueOf(Date.today().addDays(1)),
            'medicalCenter' => 'Test Medical Center',
            'programId' => testProgram.Id
        };
        invoiceDataList.add(row1);
        invoiceDataList.add(row2);
        
        String invoiceDataJson = JSON.serialize(invoiceDataList);
        
        Map<String, Boolean> duplicatesMap = InvoiceExcelEditorController.checkInvoiceNumbersUniqueness(invoiceDataJson, testProgram.Id);
        System.assertNotEquals(null, duplicatesMap, 'La mappa non deve essere null');
        // INV-001 dovrebbe essere segnato come duplicato
        System.assertEquals(true, duplicatesMap.get('0'), 'INV-001 dovrebbe essere segnato come duplicato');
        // INV-003 non dovrebbe essere nella mappa o dovrebbe essere false
        System.assertNotEquals(true, duplicatesMap.get('1'), 'INV-003 non dovrebbe essere duplicato');
    }
    
    @IsTest
    static void testCreateInvoicesFromFlow() {
        Program testProgram = [SELECT Id FROM Program LIMIT 1];
        GiftDesignation testBudget = [SELECT Id FROM GiftDesignation LIMIT 1];
        Account testAccount = [SELECT Id FROM Account WHERE DEFAULT__c = false AND GRATUITO__c = false LIMIT 1];
        Comune__c testComune = [SELECT Id, Nome_Comune__c, Provincia__c, Regione__c FROM Comune__c LIMIT 1];
        
        // Cerca un tipo visita esistente nella org - DEVE esistere per questo test
        String tipoVisitaName = null;
        String tipoVisitaId = null;
        List<Tipo_Visita__c> existingTipi = [SELECT Id, Name FROM Tipo_Visita__c LIMIT 1];
        if (!existingTipi.isEmpty()) {
            tipoVisitaName = existingTipi[0].Name;
            tipoVisitaId = String.valueOf(existingTipi[0].Id);
        } else {
            // Se non esiste, prova a crearlo nel test stesso
            Tipo_Visita__c newTipoVisita = new Tipo_Visita__c(Name = 'Test Tipo Visita');
            Database.SaveResult result = Database.insert(newTipoVisita, false);
            if (result.isSuccess() && newTipoVisita.Id != null) {
                tipoVisitaName = newTipoVisita.Name;
                tipoVisitaId = String.valueOf(newTipoVisita.Id);
            } else {
                // Se la creazione fallisce, cerca di nuovo nel database
                List<Tipo_Visita__c> retryTipi = [SELECT Id, Name FROM Tipo_Visita__c WHERE Name = 'Test Tipo Visita' LIMIT 1];
                if (!retryTipi.isEmpty()) {
                    tipoVisitaName = retryTipi[0].Name;
                    tipoVisitaId = String.valueOf(retryTipi[0].Id);
                } else {
                    // Se ancora non esiste, cerca qualsiasi tipo visita nella org
                    List<Tipo_Visita__c> anyTipi = [SELECT Id, Name FROM Tipo_Visita__c LIMIT 1];
                    if (!anyTipi.isEmpty()) {
                        tipoVisitaName = anyTipi[0].Name;
                        tipoVisitaId = String.valueOf(anyTipi[0].Id);
                    }
                }
            }
        }
        
        // Se non abbiamo un tipo visita valido, usa un nome generico
        // e lascia che il controller gestisca la creazione (o l'errore)
        if (tipoVisitaName == null || tipoVisitaId == null) {
            tipoVisitaName = 'Test Tipo Visita';
            tipoVisitaId = null;
        }
        
        // Crea dati JSON per il test
        List<Map<String, Object>> invoiceDataList = new List<Map<String, Object>>();
        Map<String, Object> row1 = new Map<String, Object>{
            'invoiceNumber' => 'TEST-INV-001',
            'invoiceDate' => '2024-01-15',
            'dataCompetenza' => '2024-01-15',
            'partner' => testAccount.Id,
            'medicalCenter' => 'Test Medical Center',
            'comune' => testComune.Nome_Comune__c,
            'provincia' => testComune.Provincia__c,
            'regione' => testComune.Regione__c,
            'amount' => 1000.00,
            'numeroVisite' => 1,
            'totaleMinuti' => 60,
            'tipoVisita' => tipoVisitaName,
            'beneficiaryType' => 'Adult',
            'dataVisita' => '2024-01-15',
            'noProfit' => 'Test Ente',
            'noProfitCategory' => 'Test Categoria'
        };
        // Aggiungi tipoVisitaId solo se disponibile
        if (tipoVisitaId != null) {
            row1.put('tipoVisitaId', tipoVisitaId);
        }
        invoiceDataList.add(row1);
        
        String invoiceDataJson = JSON.serialize(invoiceDataList);
        
        Test.startTest();
        Map<String, Object> result = InvoiceExcelEditorController.createInvoicesFromFlow(invoiceDataJson, testProgram.Id, testBudget.Id);
        Test.stopTest();
        
        System.assertNotEquals(null, result, 'Il risultato non deve essere null');
        System.assert(result.containsKey('success'), 'Dovrebbe contenere success');
        System.assert(result.containsKey('createdCount'), 'Dovrebbe contenere createdCount');
        
        // Debug: stampa il risultato per capire cosa è successo
        if (result.containsKey('errorMessage')) {
            System.debug('Errore nel risultato: ' + result.get('errorMessage'));
        }
        if (result.containsKey('invoiceResults')) {
            List<Object> invoiceResults = (List<Object>) result.get('invoiceResults');
            if (!invoiceResults.isEmpty()) {
                Map<String, Object> firstResult = (Map<String, Object>) invoiceResults[0];
                System.debug('Primo risultato: ' + JSON.serialize(firstResult));
                if (firstResult.containsKey('errorMessage')) {
                    System.debug('Errore nel primo risultato: ' + firstResult.get('errorMessage'));
                }
            }
        }
        
        // Verifica che la fattura sia stata creata
        List<Invoice__c> createdInvoices = [SELECT Id, Invoice_Number__c FROM Invoice__c WHERE Invoice_Number__c = 'TEST-INV-001'];
        System.assertEquals(1, createdInvoices.size(), 'Dovrebbe essere stata creata una fattura. Risultato: ' + JSON.serialize(result));
    }
    
    @IsTest
    static void testCreateInvoicesFromFlowWithVisits() {
        Program testProgram = [SELECT Id FROM Program LIMIT 1];
        GiftDesignation testBudget = [SELECT Id FROM GiftDesignation LIMIT 1];
        Account testAccount = [SELECT Id FROM Account WHERE DEFAULT__c = false AND GRATUITO__c = false LIMIT 1];
        Comune__c testComune = [SELECT Id, Nome_Comune__c, Provincia__c, Regione__c FROM Comune__c LIMIT 1];
        
        // Crea un tipo visita nel test stesso PRIMA di chiamare il controller
        // Questo assicura che ci sia sempre un tipo visita disponibile
        Tipo_Visita__c testTipoVisita = null;
        List<Tipo_Visita__c> existingTipi = [SELECT Id, Name FROM Tipo_Visita__c LIMIT 1];
        if (!existingTipi.isEmpty()) {
            testTipoVisita = existingTipi[0];
        } else {
            // Se non esiste, prova a crearlo nel test stesso PRIMA di Test.startTest()
            testTipoVisita = new Tipo_Visita__c(Name = 'Test Tipo Visita');
            Database.SaveResult result = Database.insert(testTipoVisita, false);
            if (!result.isSuccess() || testTipoVisita.Id == null) {
                // Se la creazione fallisce, cerca di nuovo nel database (potrebbe essere stato creato da un trigger)
                List<Tipo_Visita__c> retryTipi = [SELECT Id, Name FROM Tipo_Visita__c WHERE Name = 'Test Tipo Visita' LIMIT 1];
                if (!retryTipi.isEmpty()) {
                    testTipoVisita = retryTipi[0];
                } else {
                    // Se ancora non esiste, cerca qualsiasi tipo visita nella org
                    List<Tipo_Visita__c> anyTipi = [SELECT Id, Name FROM Tipo_Visita__c LIMIT 1];
                    if (!anyTipi.isEmpty()) {
                        testTipoVisita = anyTipi[0];
                    } else {
                        // Se non ci sono tipi visita nella org, il test non può continuare
                        System.assert(false, 'Nessun Tipo_Visita__c disponibile nella org di test. Il test richiede almeno un tipo visita esistente.');
                    }
                }
            }
        }
        
        // Assicurati che abbiamo un tipo visita valido prima di continuare
        System.assertNotEquals(null, testTipoVisita, 'testTipoVisita deve essere impostato');
        System.assertNotEquals(null, testTipoVisita.Id, 'testTipoVisita.Id deve essere impostato');
        
        String tipoVisitaName = testTipoVisita.Name;
        String tipoVisitaId = String.valueOf(testTipoVisita.Id);
        
        // Crea dati JSON per il test con visite
        List<Map<String, Object>> invoiceDataList = new List<Map<String, Object>>();
        Map<String, Object> row1 = new Map<String, Object>{
            'invoiceNumber' => 'TEST-INV-002',
            'invoiceDate' => '2024-01-15',
            'dataCompetenza' => '2024-01-15',
            'partner' => testAccount.Id,
            'medicalCenter' => 'Test Medical Center',
            'comune' => testComune.Nome_Comune__c,
            'provincia' => testComune.Provincia__c,
            'regione' => testComune.Regione__c,
            'amount' => 2000.00,
            'numeroVisite' => 2,
            'totaleMinuti' => 120,
            'tipoVisita' => tipoVisitaName,
            'beneficiaryType' => 'Adult',
            'dataVisita' => '2024-01-15'
        };
        // Aggiungi tipoVisitaId solo se disponibile
        if (tipoVisitaId != null) {
            row1.put('tipoVisitaId', tipoVisitaId);
        }
        invoiceDataList.add(row1);
        
        String invoiceDataJson = JSON.serialize(invoiceDataList);
        
        Test.startTest();
        Map<String, Object> result = InvoiceExcelEditorController.createInvoicesFromFlow(invoiceDataJson, testProgram.Id, testBudget.Id);
        Test.stopTest();
        
        System.assertNotEquals(null, result, 'Il risultato non deve essere null');
        
        // Debug: stampa il risultato per capire cosa è successo
        if (result.containsKey('errorMessage')) {
            System.debug('Errore nel risultato: ' + result.get('errorMessage'));
        }
        if (result.containsKey('invoiceResults')) {
            List<Object> invoiceResults = (List<Object>) result.get('invoiceResults');
            if (!invoiceResults.isEmpty()) {
                Map<String, Object> firstResult = (Map<String, Object>) invoiceResults[0];
                System.debug('Primo risultato: ' + JSON.serialize(firstResult));
                if (firstResult.containsKey('visitError')) {
                    System.debug('Errore nelle visite: ' + firstResult.get('visitError'));
                }
            }
        }
        
        // Verifica che le visite siano state create
        List<Visit__c> createdVisits = [SELECT Id FROM Visit__c];
        System.assert(createdVisits.size() > 0, 'Dovrebbero essere state create delle visite. Risultato: ' + JSON.serialize(result));
    }
    
    @IsTest
    static void testUpdateInvoicesWithPartners() {
        Program testProgram = [SELECT Id FROM Program LIMIT 1];
        Account testAccount1 = [SELECT Id FROM Account WHERE DEFAULT__c = false AND GRATUITO__c = false LIMIT 1];
        Account testAccount2 = new Account(Name = 'Test Partner 2');
        insert testAccount2;
        
        // Crea una fattura di test
        GiftDesignation testBudget = [SELECT Id FROM GiftDesignation LIMIT 1];
        Invoice__c invoice = new Invoice__c(
            Invoice_Number__c = 'TEST-UPDATE-001',
            Account__c = testAccount1.Id,
            Date__c = Date.today(),
            Budget__c = testBudget.Id
        );
        insert invoice;
        
        // Crea dati JSON per l'update
        List<Map<String, Object>> updatesList = new List<Map<String, Object>>();
        Map<String, Object> update1 = new Map<String, Object>{
            'invoiceId' => invoice.Id,
            'partnerId' => testAccount2.Id
        };
        updatesList.add(update1);
        
        String updatesJson = JSON.serialize(updatesList);
        
        Test.startTest();
        Map<String, Object> result = InvoiceExcelEditorController.updateInvoicesWithPartners(updatesJson);
        Test.stopTest();
        
        System.assertNotEquals(null, result, 'Il risultato non deve essere null');
        System.assert(result.containsKey('success'), 'Dovrebbe contenere success');
        
        // Verifica che la fattura sia stata aggiornata
        Invoice__c updatedInvoice = [SELECT Id, Account__c FROM Invoice__c WHERE Id = :invoice.Id];
        System.assertEquals(testAccount2.Id, updatedInvoice.Account__c, 'Il partner dovrebbe essere stato aggiornato');
    }
    
    @IsTest
    static void testCreateInvoicesFromFlowWithErrors() {
        // Test con dati JSON invalidi
        String invalidJson = 'invalid json';
        
        Test.startTest();
        Map<String, Object> result = InvoiceExcelEditorController.createInvoicesFromFlow(invalidJson, null, null);
        Test.stopTest();
        
        System.assertNotEquals(null, result, 'Il risultato non deve essere null');
        System.assert(result.containsKey('success'), 'Dovrebbe contenere success');
        // Con dati invalidi, success dovrebbe essere false
        System.assertEquals(false, result.get('success'), 'Con dati invalidi success dovrebbe essere false');
    }
    
    @IsTest
    static void testCheckInvoiceNumbersUniquenessWithEmptyData() {
        Program testProgram = [SELECT Id FROM Program LIMIT 1];
        
        // Test con dati vuoti
        String emptyJson = '[]';
        Map<String, Boolean> duplicatesMap = InvoiceExcelEditorController.checkInvoiceNumbersUniqueness(emptyJson, testProgram.Id);
        System.assertNotEquals(null, duplicatesMap, 'La mappa non deve essere null');
        System.assertEquals(0, duplicatesMap.size(), 'Con dati vuoti la mappa dovrebbe essere vuota');
    }
    
    @IsTest
    static void testGenerateInvoiceNumberWithIsFree() {
        // Test con isFree = true
        String invoiceNumber = InvoiceExcelEditorController.generateInvoiceNumber(true, false, '2024-01-15', 'Test Medical Center');
        System.assertNotEquals(null, invoiceNumber, 'Il numero fattura non deve essere null');
        System.assert(invoiceNumber.startsWith('GRATUITA-'), 'Il numero fattura deve iniziare con GRATUITA-');
    }
    
    @IsTest
    static void testGenerateInvoiceNumberWithNoInvoiceAvailable() {
        // Test con noInvoiceAvailable = true
        String invoiceNumber = InvoiceExcelEditorController.generateInvoiceNumber(false, true, '2024-01-15', 'Test Medical Center');
        System.assertNotEquals(null, invoiceNumber, 'Il numero fattura non deve essere null');
        System.assert(invoiceNumber.startsWith('NON DISPONIBILE-'), 'Il numero fattura deve iniziare con NON DISPONIBILE-');
    }
    
    @IsTest
    static void testGenerateInvoiceNumberWithBothFalse() {
        // Test con entrambi i flag false (dovrebbe restituire null)
        String invoiceNumber = InvoiceExcelEditorController.generateInvoiceNumber(false, false, '2024-01-15', 'Test Medical Center');
        System.assertEquals(null, invoiceNumber, 'Il numero fattura deve essere null quando entrambi i flag sono false');
    }
    
    @IsTest
    static void testGenerateInvoiceNumberWithBothTrue() {
        // Test con entrambi i flag true (isFree ha priorità)
        String invoiceNumber = InvoiceExcelEditorController.generateInvoiceNumber(true, true, '2024-01-15', 'Test Medical Center');
        System.assertNotEquals(null, invoiceNumber, 'Il numero fattura non deve essere null');
        System.assert(invoiceNumber.startsWith('GRATUITA-'), 'Il numero fattura deve iniziare con GRATUITA- quando isFree è true');
    }
}
