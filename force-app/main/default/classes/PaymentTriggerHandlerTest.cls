/**
 * @description Test class per PaymentTriggerHandler
 * Testa l'invio delle email quando Status__c cambia a "Pagato"
 */
@isTest(SeeAllData=true)
private class PaymentTriggerHandlerTest {
    
    @isTest
    static void testPaymentStatusChangeToPagato() {
        // Crea un pagamento di test con Status__c = "Da Pagare"
        Payment__c payment = new Payment__c();
        payment.Status__c = 'Da Pagare';
        payment.Amount__c = 100.00;
        
        // Cerca un Budget esistente per associarlo al pagamento
        List<GiftDesignation> budgets = [SELECT Id FROM GiftDesignation LIMIT 1];
        if (!budgets.isEmpty()) {
            payment.Budget__c = budgets[0].Id;
        }
        
        // Cerca un Overview_Budget_per_Anno__c esistente
        List<Overview_Budget_per_Anno__c> overviews = [SELECT Id FROM Overview_Budget_per_Anno__c LIMIT 1];
        if (!overviews.isEmpty()) {
            payment.Overview_Budget_per_Anno__c = overviews[0].Id;
        }
        
        insert payment;
        
        // Verifica che il pagamento sia stato creato
        System.assertNotEquals(null, payment.Id, 'Il pagamento dovrebbe essere stato creato');
        
        // Aggiorna il pagamento a "Pagato"
        Test.startTest();
        payment.Status__c = 'Pagato';
        payment.Data_di_Pagamento__c = Date.today();
        update payment;
        Test.stopTest();
        
        // Verifica che il pagamento sia stato aggiornato
        Payment__c updatedPayment = [SELECT Id, Status__c FROM Payment__c WHERE Id = :payment.Id];
        System.assertEquals('Pagato', updatedPayment.Status__c, 'Il pagamento dovrebbe essere stato aggiornato a Pagato');
    }
    
    @isTest
    static void testPaymentStatusNoChange() {
        // Crea un pagamento già con Status__c = "Pagato"
        Payment__c payment = new Payment__c();
        payment.Status__c = 'Pagato';
        payment.Amount__c = 100.00;
        
        // Cerca un Budget esistente per associarlo al pagamento
        List<GiftDesignation> budgets = [SELECT Id FROM GiftDesignation LIMIT 1];
        if (!budgets.isEmpty()) {
            payment.Budget__c = budgets[0].Id;
        }
        
        // Cerca un Overview_Budget_per_Anno__c esistente
        List<Overview_Budget_per_Anno__c> overviews = [SELECT Id FROM Overview_Budget_per_Anno__c LIMIT 1];
        if (!overviews.isEmpty()) {
            payment.Overview_Budget_per_Anno__c = overviews[0].Id;
        }
        
        insert payment;
        
        // Aggiorna il pagamento senza cambiare lo Status__c
        Test.startTest();
        payment.Amount__c = 200.00;
        update payment;
        Test.stopTest();
        
        // Verifica che il pagamento sia stato aggiornato
        Payment__c updatedPayment = [SELECT Id, Status__c, Amount__c FROM Payment__c WHERE Id = :payment.Id];
        System.assertEquals('Pagato', updatedPayment.Status__c, 'Il pagamento dovrebbe rimanere Pagato');
        System.assertEquals(200.00, updatedPayment.Amount__c, 'L\'importo dovrebbe essere stato aggiornato');
    }
    
    @isTest
    static void testBulkPaymentUpdate() {
        // Crea più pagamenti di test
        List<Payment__c> payments = new List<Payment__c>();
        
        // Cerca un Budget esistente
        List<GiftDesignation> budgets = [SELECT Id FROM GiftDesignation LIMIT 1];
        Id budgetId = budgets.isEmpty() ? null : budgets[0].Id;
        
        // Cerca un Overview_Budget_per_Anno__c esistente
        List<Overview_Budget_per_Anno__c> overviews = [SELECT Id FROM Overview_Budget_per_Anno__c LIMIT 1];
        Id overviewId = overviews.isEmpty() ? null : overviews[0].Id;
        
        for (Integer i = 0; i < 5; i++) {
            Payment__c payment = new Payment__c();
            payment.Status__c = 'Da Pagare';
            payment.Amount__c = 100.00 + i;
            if (budgetId != null) {
                payment.Budget__c = budgetId;
            }
            if (overviewId != null) {
                payment.Overview_Budget_per_Anno__c = overviewId;
            }
            payments.add(payment);
        }
        
        insert payments;
        
        // Aggiorna tutti i pagamenti a "Pagato" in bulk
        Test.startTest();
        for (Payment__c payment : payments) {
            payment.Status__c = 'Pagato';
            payment.Data_di_Pagamento__c = Date.today();
        }
        update payments;
        Test.stopTest();
        
        // Verifica che tutti i pagamenti siano stati aggiornati
        List<Payment__c> updatedPayments = [SELECT Id, Status__c FROM Payment__c WHERE Id IN :payments];
        System.assertEquals(5, updatedPayments.size(), 'Dovrebbero esserci 5 pagamenti');
        for (Payment__c payment : updatedPayments) {
            System.assertEquals('Pagato', payment.Status__c, 'Tutti i pagamenti dovrebbero essere stati aggiornati a Pagato');
        }
    }
}