/**
 * @description Handler per il trigger Payment__c
 * Gestisce:
 * - Creazione e aggiornamento dei Pagamento_Shadow__c (bulkificato)
 * - Invio delle email quando Status__c cambia a "Pagato"
 * Ottimizzato per gestire bulk operations: processa tutti i pagamenti in una sola esecuzione
 * Sostituisce i flow "Crea_Pagamento_Shadow_autolaunched" e "Aggiorna_Valori_Statici_Pagamento_Shadow_autolaunched"
 * che causavano troppe query SOQL (101+ con 12 pagamenti)
 */
public without sharing class PaymentTriggerHandler {
    
    /**
     * @description Gestisce after insert: crea gli shadow per i pagamenti senza shadow
     * @param newPayments Lista dei nuovi record Payment__c
     */
    public static void handleAfterInsert(List<Payment__c> newPayments) {
        if (newPayments == null || newPayments.isEmpty()) {
            return;
        }
        
        // Filtra i pagamenti che non hanno già uno shadow
        List<Payment__c> paymentsNeedingShadow = new List<Payment__c>();
        Set<Id> paymentIds = new Set<Id>();
        
        for (Payment__c payment : newPayments) {
            if (payment.Pagamento_Shadow__c == null) {
                paymentsNeedingShadow.add(payment);
                paymentIds.add(payment.Id);
            }
        }
        
        if (paymentsNeedingShadow.isEmpty()) {
            return;
        }
        
        // Recupera i pagamenti con le relazioni necessarie in una sola query
        List<Payment__c> paymentsWithRelations = [
            SELECT Id, Name, Amount__c, Status__c, Pagamento_Shadow__c,
                   Overview_Budget_per_Anno__c,
                   Overview_Budget_per_Anno__r.Totali_Budget_Anno__c,
                   Overview_Budget_per_Anno__r.Totali_Budget_Anno__r.Id
            FROM Payment__c
            WHERE Id IN :paymentIds
        ];
        
        // Crea gli shadow in bulk
        createPaymentShadows(paymentsWithRelations);
    }
    
    /**
     * @description Gestisce after update: aggiorna gli shadow e invia email se necessario
     * @param newPayments Lista dei nuovi record Payment__c
     * @param oldMap Mappa dei vecchi record Payment__c
     */
    public static void handleAfterUpdate(List<Payment__c> newPayments, Map<Id, Payment__c> oldMap) {
        if (newPayments == null || newPayments.isEmpty()) {
            return;
        }
        
        // Filtra i pagamenti che necessitano aggiornamento shadow o email
        List<Payment__c> paymentsToUpdateShadow = new List<Payment__c>();
        List<Payment__c> paymentsToEmail = new List<Payment__c>();
        Set<Id> paymentIds = new Set<Id>();
        
        for (Payment__c newPayment : newPayments) {
            Payment__c oldPayment = oldMap != null ? oldMap.get(newPayment.Id) : null;
            
            // Verifica se Status__c è cambiato a "Pagato"
            if (newPayment.Status__c == 'Pagato' && 
                (oldPayment == null || oldPayment.Status__c != 'Pagato')) {
                paymentsToEmail.add(newPayment);
            }
            
            // Verifica se i campi rilevanti per lo shadow sono cambiati
            if (oldPayment != null && (
                newPayment.Amount__c != oldPayment.Amount__c ||
                newPayment.Status__c != oldPayment.Status__c ||
                newPayment.Overview_Budget_per_Anno__c != oldPayment.Overview_Budget_per_Anno__c ||
                newPayment.Pagamento_Shadow__c == null
            )) {
                paymentsToUpdateShadow.add(newPayment);
                paymentIds.add(newPayment.Id);
            }
        }
        
        // Aggiorna gli shadow in bulk se necessario
        if (!paymentsToUpdateShadow.isEmpty()) {
            List<Payment__c> paymentsWithRelations = [
                SELECT Id, Name, Amount__c, Status__c, Pagamento_Shadow__c,
                       Overview_Budget_per_Anno__c,
                       Overview_Budget_per_Anno__r.Totali_Budget_Anno__c,
                       Overview_Budget_per_Anno__r.Totali_Budget_Anno__r.Id
                FROM Payment__c
                WHERE Id IN :paymentIds
            ];
            
            updatePaymentShadows(paymentsWithRelations);
        }
        
        // Invia le email solo se ci sono pagamenti da notificare
        if (!paymentsToEmail.isEmpty()) {
            sendPaymentEmails(paymentsToEmail);
        }
    }
    
    /**
     * @description Crea gli shadow per i pagamenti in bulk
     * @param payments Lista dei pagamenti con le relazioni caricate
     */
    private static void createPaymentShadows(List<Payment__c> payments) {
        List<Pagamento_Shadow__c> shadowsToCreate = new List<Pagamento_Shadow__c>();
        Map<Id, Payment__c> paymentMap = new Map<Id, Payment__c>();
        
        for (Payment__c payment : payments) {
            if (payment.Pagamento_Shadow__c == null && 
                payment.Overview_Budget_per_Anno__r != null &&
                payment.Overview_Budget_per_Anno__r.Totali_Budget_Anno__r != null) {
                
                Pagamento_Shadow__c shadow = new Pagamento_Shadow__c();
                shadow.Name = payment.Name + ' - Shadow';
                shadow.Payment__c = payment.Id;
                shadow.Amount_Static__c = payment.Amount__c;
                shadow.Status_Static__c = payment.Status__c;
                shadow.Totali_Budget_Anno__c = payment.Overview_Budget_per_Anno__r.Totali_Budget_Anno__r.Id;
                
                shadowsToCreate.add(shadow);
                paymentMap.put(payment.Id, payment);
            }
        }
        
        if (shadowsToCreate.isEmpty()) {
            return;
        }
        
        // Inserisci gli shadow in bulk
        insert shadowsToCreate;
        
        // Aggiorna i pagamenti con il riferimento allo shadow
        List<Payment__c> paymentsToUpdate = new List<Payment__c>();
        for (Integer i = 0; i < shadowsToCreate.size(); i++) {
            Pagamento_Shadow__c shadow = shadowsToCreate[i];
            Payment__c payment = paymentMap.get(shadow.Payment__c);
            if (payment != null) {
                paymentsToUpdate.add(new Payment__c(
                    Id = payment.Id,
                    Pagamento_Shadow__c = shadow.Id
                ));
            }
        }
        
        if (!paymentsToUpdate.isEmpty()) {
            update paymentsToUpdate;
        }
    }
    
    /**
     * @description Aggiorna gli shadow per i pagamenti in bulk
     * @param payments Lista dei pagamenti con le relazioni caricate
     */
    private static void updatePaymentShadows(List<Payment__c> payments) {
        // Raggruppa per shadow esistente o crea nuovi
        List<Pagamento_Shadow__c> shadowsToCreate = new List<Pagamento_Shadow__c>();
        List<Pagamento_Shadow__c> shadowsToUpdate = new List<Pagamento_Shadow__c>();
        Map<Id, Payment__c> paymentMap = new Map<Id, Payment__c>();
        
        for (Payment__c payment : payments) {
            paymentMap.put(payment.Id, payment);
            
            if (payment.Pagamento_Shadow__c == null) {
                // Crea nuovo shadow se non esiste
                if (payment.Overview_Budget_per_Anno__r != null &&
                    payment.Overview_Budget_per_Anno__r.Totali_Budget_Anno__r != null) {
                    
                    Pagamento_Shadow__c shadow = new Pagamento_Shadow__c();
                    shadow.Name = payment.Name + ' - Shadow';
                    shadow.Payment__c = payment.Id;
                    shadow.Amount_Static__c = payment.Amount__c;
                    shadow.Status_Static__c = payment.Status__c;
                    shadow.Totali_Budget_Anno__c = payment.Overview_Budget_per_Anno__r.Totali_Budget_Anno__r.Id;
                    
                    shadowsToCreate.add(shadow);
                }
            } else {
                // Aggiorna shadow esistente
                Pagamento_Shadow__c shadow = new Pagamento_Shadow__c();
                shadow.Id = payment.Pagamento_Shadow__c;
                shadow.Amount_Static__c = payment.Amount__c;
                shadow.Status_Static__c = payment.Status__c;
                
                if (payment.Overview_Budget_per_Anno__r != null &&
                    payment.Overview_Budget_per_Anno__r.Totali_Budget_Anno__r != null) {
                    shadow.Totali_Budget_Anno__c = payment.Overview_Budget_per_Anno__r.Totali_Budget_Anno__r.Id;
                }
                
                shadowsToUpdate.add(shadow);
            }
        }
        
        // Esegui operazioni in bulk
        if (!shadowsToCreate.isEmpty()) {
            insert shadowsToCreate;
            
            // Aggiorna i pagamenti con il riferimento allo shadow creato
            List<Payment__c> paymentsToUpdate = new List<Payment__c>();
            for (Integer i = 0; i < shadowsToCreate.size(); i++) {
                Pagamento_Shadow__c shadow = shadowsToCreate[i];
                Payment__c payment = paymentMap.get(shadow.Payment__c);
                if (payment != null) {
                    paymentsToUpdate.add(new Payment__c(
                        Id = payment.Id,
                        Pagamento_Shadow__c = shadow.Id
                    ));
                }
            }
            
            if (!paymentsToUpdate.isEmpty()) {
                update paymentsToUpdate;
            }
        }
        
        if (!shadowsToUpdate.isEmpty()) {
            update shadowsToUpdate;
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
