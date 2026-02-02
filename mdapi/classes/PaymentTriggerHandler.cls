/**
 * @description Handler per il trigger Payment__c
 * Gestisce l'invio delle email quando Status__c cambia a "Pagato"
 * Ottimizzato per gestire bulk updates: processa tutti i pagamenti in una sola esecuzione
 * Sostituisce il flusso "Payment Trigger - After" che causava troppe query SOQL
 */
public without sharing class PaymentTriggerHandler {
    
    /**
     * @description Metodo principale chiamato dal trigger
     * @param newPayments Lista dei nuovi record Payment__c
     * @param oldMap Mappa dei vecchi record Payment__c
     */
    public static void run(List<Payment__c> newPayments, Map<Id, Payment__c> oldMap) {
        if (newPayments == null || newPayments.isEmpty()) {
            return;
        }
        
        // Filtra solo i pagamenti che sono stati aggiornati a "Pagato"
        List<Payment__c> paymentsToEmail = new List<Payment__c>();
        
        for (Payment__c newPayment : newPayments) {
            Payment__c oldPayment = oldMap != null ? oldMap.get(newPayment.Id) : null;
            
            // Verifica se Status__c è cambiato a "Pagato"
            if (newPayment.Status__c == 'Pagato' && 
                (oldPayment == null || oldPayment.Status__c != 'Pagato')) {
                paymentsToEmail.add(newPayment);
            }
        }
        
        // Invia le email solo se ci sono pagamenti da notificare
        if (!paymentsToEmail.isEmpty()) {
            sendPaymentEmails(paymentsToEmail);
        }
    }
    
    /**
     * @description Invia le email per i pagamenti usando EmailController
     * @param payments Lista dei pagamenti per cui inviare le email
     */
    private static void sendPaymentEmails(List<Payment__c> payments) {
        try {
            // Prepara l'input per EmailController
            EmailController.FlowInput input = new EmailController.FlowInput();
            input.type = 'payment';
            input.payments = payments;
            
            // Chiama EmailController che gestirà l'invio delle email
            // Con un trigger Apex, tutti i pagamenti vengono processati in bulk in una sola esecuzione
            EmailController.sendEmails(new List<EmailController.FlowInput>{ input });
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, '[PaymentTriggerHandler]::[sendPaymentEmails]::[Error]: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, '[PaymentTriggerHandler]::[sendPaymentEmails]::[Stack]: ' + e.getStackTraceString());
            // Non bloccare l'esecuzione del trigger se l'invio email fallisce
        }
    }
}
