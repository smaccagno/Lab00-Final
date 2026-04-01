/**
 * Invocable per differire l'aggiornamento dei campi Static su Transazione_Shadow__c.
 * Chiamato dal flow Crea_Transazione_Shadow quando esiste già una shadow, per evitare
 * UNABLE_TO_LOCK_ROW sull'Account (roll-up Transazione_Shadow → Totali_Donatore_Anno → Account).
 * Con skipTransazioneShadowQueueable=true accumula in lista; il caller deve chiamare flushPendingUpdates().
 * Limite: 1 queueable per transazione con record-triggered flows.
 */
public class UpdateTransazioneShadowStaticInvocable {
    private static List<UpdateTransazioneShadowStaticQueueable.Payload> pendingPayloads = new List<UpdateTransazioneShadowStaticQueueable.Payload>();
    private static Boolean enqueuedThisTransaction = false;

    @InvocableMethod(
        label='Update Transazione Shadow Static (Deferred)'
        description='Enqueues update of Transazione_Shadow__c static fields to avoid lock contention on Account.'
    )
    public static void enqueueUpdate(List<Input> inputs) {
        for (Input inp : inputs) {
            if (inp.recordId == null) continue;
            pendingPayloads.add(new UpdateTransazioneShadowStaticQueueable.Payload(
                inp.recordId, inp.allocabile, inp.allocazioniNonPagate, inp.donatoOriginale,
                inp.numeroAllocazioni, inp.totaleAllocato, inp.totaleAllocatoNonPagato, inp.totaleAllocatoPagato
            ));
        }
        if (DonationCreationContext.skipTransazioneShadowQueueable) return;
        if (enqueuedThisTransaction || pendingPayloads.isEmpty()) return;
        try {
            System.enqueueJob(new UpdateTransazioneShadowStaticQueueable(new List<UpdateTransazioneShadowStaticQueueable.Payload>(pendingPayloads)));
            enqueuedThisTransaction = true;
            pendingPayloads.clear();
        } catch (Exception e) {
            System.debug('UpdateTransazioneShadowStaticInvocable: ' + e.getMessage());
        }
    }

    /** Restituisce i payload pendenti e svuota la lista. */
    public static List<UpdateTransazioneShadowStaticQueueable.Payload> takePendingPayloads() {
        List<UpdateTransazioneShadowStaticQueueable.Payload> copy = new List<UpdateTransazioneShadowStaticQueueable.Payload>(pendingPayloads);
        pendingPayloads.clear();
        return copy;
    }

    /** Aggiorna i campi static in modo sincrono (evita enqueue quando siamo già in queueable). */
    public static void processPayloadsSynchronously(List<UpdateTransazioneShadowStaticQueueable.Payload> toProcess) {
        if (toProcess == null || toProcess.isEmpty()) return;
        Map<Id, Transazione_Shadow__c> updatesById = new Map<Id, Transazione_Shadow__c>();
        for (UpdateTransazioneShadowStaticQueueable.Payload p : toProcess) {
            if (p == null || p.recordId == null) continue;
            Transazione_Shadow__c sh = updatesById.get(p.recordId);
            if (sh == null) {
                sh = new Transazione_Shadow__c(Id = p.recordId);
                updatesById.put(p.recordId, sh);
            }
            if (p.allocabile != null) sh.Allocabile_Static__c = p.allocabile;
            if (p.allocazioniNonPagate != null) sh.Allocazioni_NON_Pagate_Static__c = p.allocazioniNonPagate;
            if (p.donatoOriginale != null) sh.Donato_Originale_Static__c = p.donatoOriginale;
            if (p.numeroAllocazioni != null) sh.Numero_Allocazioni_Static__c = p.numeroAllocazioni;
            if (p.totaleAllocato != null) sh.Totale_Allocato_Static__c = p.totaleAllocato;
            if (p.totaleAllocatoNonPagato != null) sh.Totale_Allocato_NON_Pagato_Static__c = p.totaleAllocatoNonPagato;
            if (p.totaleAllocatoPagato != null) sh.Totale_Allocato_Pagato_Static__c = p.totaleAllocatoPagato;
        }
        if (updatesById.isEmpty()) return;

        List<Transazione_Shadow__c> updates = updatesById.values();
        Database.SaveResult[] results = Database.update(updates, false);
        for (Integer i = 0; i < results.size(); i++) {
            if (results[i].isSuccess()) continue;
            for (Database.Error err : results[i].getErrors()) {
                System.debug(
                    LoggingLevel.ERROR,
                    'UpdateTransazioneShadowStaticInvocable sync failed for ' +
                    updates[i].Id + ': ' + err.getMessage()
                );
            }
        }
    }

    /** Enqueues con i payload forniti (usato quando takePendingPayloads è già stato chiamato). */
    public static void enqueueShadowUpdates(List<UpdateTransazioneShadowStaticQueueable.Payload> toProcess) {
        if (toProcess == null || toProcess.isEmpty()) return;
        try {
            System.enqueueJob(new UpdateTransazioneShadowStaticQueueable(toProcess));
        } catch (Exception e) {
            System.debug('UpdateTransazioneShadowStaticInvocable enqueue: ' + e.getMessage());
        }
    }

    /** Flush: take + enqueue. */
    public static void flushPendingUpdates() {
        enqueueShadowUpdates(takePendingPayloads());
    }

    public class Input {
        @InvocableVariable(required=true label='Transazione Shadow Id')
        public Id recordId;
        @InvocableVariable(label='Allocabile')
        public Decimal allocabile;
        @InvocableVariable(label='Allocazioni NON Pagate')
        public Integer allocazioniNonPagate;
        @InvocableVariable(label='Donato Originale')
        public Decimal donatoOriginale;
        @InvocableVariable(label='Numero Allocazioni')
        public Integer numeroAllocazioni;
        @InvocableVariable(label='Totale Allocato')
        public Decimal totaleAllocato;
        @InvocableVariable(label='Totale Allocato NON Pagato')
        public Decimal totaleAllocatoNonPagato;
        @InvocableVariable(label='Totale Allocato Pagato')
        public Decimal totaleAllocatoPagato;
    }
}