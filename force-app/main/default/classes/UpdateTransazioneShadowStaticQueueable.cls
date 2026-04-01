/**
 * Queueable per aggiornare i campi Static su Transazione_Shadow__c in transazione separata.
 * Evita UNABLE_TO_LOCK_ROW sull'Account quando l'aggiornamento è triggerato da
 * GiftTransactionDesignation (es. Close Payment): la catena di roll-up
 * Transazione_Shadow → Totali_Donatore_Anno → Account causa lock contention.
 */
public class UpdateTransazioneShadowStaticQueueable implements Queueable {
    private List<Payload> payloads;

    public UpdateTransazioneShadowStaticQueueable(
        Id transazioneShadowId,
        Decimal allocabile,
        Integer allocazioniNonPagate,
        Decimal donatoOriginale,
        Integer numeroAllocazioni,
        Decimal totaleAllocato,
        Decimal totaleAllocatoNonPagato,
        Decimal totaleAllocatoPagato
    ) {
        this.payloads = new List<Payload>{ new Payload(
            transazioneShadowId, allocabile, allocazioniNonPagate, donatoOriginale,
            numeroAllocazioni, totaleAllocato, totaleAllocatoNonPagato, totaleAllocatoPagato
        )};
    }

    public UpdateTransazioneShadowStaticQueueable(List<Payload> payloads) {
        this.payloads = payloads != null ? payloads : new List<Payload>();
    }

    public void execute(QueueableContext context) {
        if (payloads == null || payloads.isEmpty()) return;

        Map<Id, Transazione_Shadow__c> updatesById = new Map<Id, Transazione_Shadow__c>();
        for (Payload p : payloads) {
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

        List<Transazione_Shadow__c> updateList = updatesById.values();
        Database.SaveResult[] results = Database.update(updateList, false);
        for (Integer i = 0; i < results.size(); i++) {
            if (results[i].isSuccess()) continue;
            for (Database.Error err : results[i].getErrors()) {
                System.debug(
                    LoggingLevel.ERROR,
                    'UpdateTransazioneShadowStaticQueueable failed for ' +
                    updateList[i].Id + ': ' + err.getMessage()
                );
            }
        }
    }

    public class Payload {
        public Id recordId;
        public Decimal allocabile;
        public Integer allocazioniNonPagate;
        public Decimal donatoOriginale;
        public Integer numeroAllocazioni;
        public Decimal totaleAllocato;
        public Decimal totaleAllocatoNonPagato;
        public Decimal totaleAllocatoPagato;
        public Payload(Id recordId, Decimal allocabile, Integer allocazioniNonPagate, Decimal donatoOriginale,
                Integer numeroAllocazioni, Decimal totaleAllocato, Decimal totaleAllocatoNonPagato, Decimal totaleAllocatoPagato) {
            this.recordId = recordId;
            this.allocabile = allocabile;
            this.allocazioniNonPagate = allocazioniNonPagate;
            this.donatoOriginale = donatoOriginale;
            this.numeroAllocazioni = numeroAllocazioni;
            this.totaleAllocato = totaleAllocato;
            this.totaleAllocatoNonPagato = totaleAllocatoNonPagato;
            this.totaleAllocatoPagato = totaleAllocatoPagato;
        }
    }
}