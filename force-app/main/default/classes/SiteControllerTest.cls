@IsTest
private class SiteControllerTest {

    @testSetup
    static void setupData() {
        // Crea account di test
        Account acc = new Account(
            Name = 'Test Account',
            StructureCode__c = 'STRUCT123',
            RecordTypeId = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName().get('Structure').getRecordTypeId()
        );
        insert acc;

        Show__c show = new Show__c(
            Name = 'Spettacolo Test',
            Type__c = 'Concerto',
            Datetime__c = DateTime.now().addDays(1)
        );
        insert show;

        TicketAvailability__c ticket = new TicketAvailability__c(
            Structure__c = acc.Id,
            Show__c = show.Id,
            StartValidity__c = Date.today(),
            EndValidity__c = Date.today().addDays(5),
            State__c = 'Disponibile',
            TicketType__c = 'Biglietto',
            IssuanceType__c = 'Emesso',
            PaymentType__c = 'Da pagare (a prezzo scontato)',
            PriceFull__c = 20.00,
            PriceDiscounted__c = 15.00,
            OfferExpirationDate__c = Date.today().addDays(3),
            NumberUses__c = 1
        );
        insert ticket;
    }

    @IsTest
    static void testGetAccountByStructureCode() {
        Test.startTest();
        Account result = SiteController.getAccountByStructureCode('STRUCT123');
        Test.stopTest();

        System.assertNotEquals(null, result, 'L\'account non dovrebbe essere null');
    }

    @IsTest
    static void testGetTickets() {
        Account acc = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        List<TicketAvailability__c> tickets = SiteController.getTickets(acc.Id);
        Test.stopTest();

        System.assertNotEquals(null, tickets, 'La lista dei ticket non dovrebbe essere null');
    }

    @IsTest
    static void testDeleteTicket() {
        TicketAvailability__c ticket = [SELECT Id FROM TicketAvailability__c LIMIT 1];

        Test.startTest();
        SiteController.deleteTicket(ticket.Id);
        Test.stopTest();

        // Verifica che il record sia stato effettivamente cancellato
        System.assertEquals(true, [SELECT Id FROM TicketAvailability__c].isEmpty(), 'Il ticket dovrebbe essere stato cancellato');
    }

    @IsTest
    static void testGetAccountByStructureCodeNotFound() {
        Test.startTest();
        try {
            SiteController.getAccountByStructureCode('INVALID_CODE');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('Script-thrown exception'), 'Eccezione attesa');
        }
        Test.stopTest();
    }
}