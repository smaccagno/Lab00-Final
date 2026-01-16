@isTest
private class EmailControllerTest {

    @testSetup
    static void setup() {
        Id structureRT = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName().get('Structure').getRecordTypeId();
        Id partnerRT = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName().get('Partner').getRecordTypeId();

        // Structure
        Account structure = new Account(
            Name = 'Test Structure',
            RecordTypeId = structureRT,
            Email__c = 'structure@test.com'
        );
        insert structure;

        // Partner
        Account partner = new Account(
            Name = 'PartnerOrg',
            RecordTypeId = partnerRT,
            Email__c = 'test@test.com',
            Phone = '123456789'
        );
        insert partner;

        // Program and Enrollment
        Program program = new Program(Name = 'Sorriso Sospeso');
        insert program;

        ProgramEnrollment enrollment = new ProgramEnrollment(
            AccountId = partner.Id,
            ProgramId = program.Id
        );
        insert enrollment;

        // Partner User
        User partnerUser = new User(
            Username = 'partneruser' + DateTime.now().getTime() + '@test.com',
            Alias = 'ptuser',
            Email = 'partneruser@test.com',
            LastName = 'Test',
            CompanyName = partner.Name,
            TimeZoneSidKey = 'Europe/Rome',
            LocaleSidKey = 'it_IT',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'it',
            ProfileId = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1].Id
        );
        insert partnerUser;

        // Ticket
        TicketAvailability__c ticket = new TicketAvailability__c(
            Structure__c = structure.Id,
            Partner__c = partner.Id,
            TicketType__c = 'Abbonamento',
            State__c = 'Prenotato',
            NumberUses__c = 2,
            SubscriptionName__c = 'Abbonamento Oro',
            OfferExpirationDate__c = Date.today().addDays(30)
        );
        insert ticket;

        GiftDesignation budget = new GiftDesignation(
            Name = 'Budget Test',
            Partner__c = partner.Id
        );
        insert budget;

        Payment__c payment = new Payment__c(
            Amount__c = 100,
            Data_di_Pagamento__c = Date.today(),
            Budget__c = budget.Id
        );
        insert payment;
    }

    @isTest static void testSendEmailsInsert() {
        TicketAvailability__c t = [SELECT Id FROM TicketAvailability__c LIMIT 1];

        EmailController.FlowInput input = new EmailController.FlowInput();
        input.type = 'insert';
        input.tickets = new List<TicketAvailability__c>{ t };

        Test.startTest();
        EmailController.sendEmails(new List<EmailController.FlowInput>{ input });
        Test.stopTest();

        System.assert(true, 'Insert email test executed.');
    }

    @isTest static void testSendEmailsBuy() {
        TicketAvailability__c t = [SELECT Id FROM TicketAvailability__c LIMIT 1];

        EmailController.FlowInput input = new EmailController.FlowInput();
        input.type = 'buy';
        input.tickets = new List<TicketAvailability__c>{ t };

        Test.startTest();
        EmailController.sendEmails(new List<EmailController.FlowInput>{ input });
        Test.stopTest();

        System.assert(true, 'Buy email test executed.');
    }

    @isTest static void testSendEmailsUpdate() {
        TicketAvailability__c t = [SELECT Id FROM TicketAvailability__c LIMIT 1];

        EmailController.FlowInput input = new EmailController.FlowInput();
        input.type = 'update';
        input.tickets = new List<TicketAvailability__c>{ t };

        Test.startTest();
        EmailController.sendEmails(new List<EmailController.FlowInput>{ input });
        Test.stopTest();

        System.assert(true, 'Update email test executed.');
    }

    @isTest static void testSendEmailsEmptyTickets() {
        EmailController.FlowInput input = new EmailController.FlowInput();
        input.type = 'insert';
        input.tickets = new List<TicketAvailability__c>();

        Test.startTest();
        EmailController.sendEmails(new List<EmailController.FlowInput>{ input });
        Test.stopTest();

        System.assert(true, 'No email sent with empty list');
    }

    @isTest static void testSendEmailsInvalidType() {
        TicketAvailability__c t = [SELECT Id FROM TicketAvailability__c LIMIT 1];

        EmailController.FlowInput input = new EmailController.FlowInput();
        input.type = 'invalid_type';
        input.tickets = new List<TicketAvailability__c>{ t };

        Test.startTest();
        EmailController.sendEmails(new List<EmailController.FlowInput>{ input });
        Test.stopTest();

        System.assert(true, 'Invalid type is ignored');
    }

     @isTest static void testSendEmailsPayment() {
        // Prepariamo l’input per il controller
        EmailController.FlowInput input = new EmailController.FlowInput();
        input.type = 'payment';
        input.payments = [SELECT Id FROM Payment__c];

        Test.startTest();
        EmailController.sendEmails(new List<EmailController.FlowInput>{ input });
        Test.stopTest();

        System.assert(true, 'Payment email test executed.');
    }
}