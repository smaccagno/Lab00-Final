/**
 * Queueable per creare le allocazioni (GiftTransactionDesignation) in transazione separata.
 * Esegue dopo il commit della transazione principale, quando eventuali designazioni di default
 * NPSP (es. Sorriso Sospeso) sono già state create. Elimina le esistenti e inserisce le nostre
 * per evitare l'errore "Designations can't exceed 100%".
 * Gestisce anche l'aggiornamento Description sulle transazioni (un solo Queueable per evitare limite).
 * Quando transactionIdsForShadowBatch è fornito, avvia un batch per creare Transazione_Shadow
 * in transazioni separate (evita UNABLE_TO_LOCK_ROW su Totali_Donatore_Anno__c).
 */
public class CreateAllocationsQueueable implements Queueable {
    private List<Map<String, Object>> payloads;
    private List<Id> descUpdateTxIds;
    private List<String> descUpdateTitles;
    private List<UpdateTransazioneShadowStaticQueueable.Payload> shadowPayloads;
    private List<Id> transactionIdsForShadowBatch;

    public CreateAllocationsQueueable(List<Map<String, Object>> payloads) {
        this(payloads, new List<Id>(), new List<String>(), null, null);
    }

    public CreateAllocationsQueueable(List<Map<String, Object>> payloads, List<Id> descUpdateTxIds, List<String> descUpdateTitles) {
        this(payloads, descUpdateTxIds, descUpdateTitles, null, null);
    }

    public CreateAllocationsQueueable(List<Map<String, Object>> payloads, List<Id> descUpdateTxIds, List<String> descUpdateTitles, List<UpdateTransazioneShadowStaticQueueable.Payload> shadowPayloads) {
        this(payloads, descUpdateTxIds, descUpdateTitles, shadowPayloads, null);
    }

    public CreateAllocationsQueueable(List<Map<String, Object>> payloads, List<Id> descUpdateTxIds, List<String> descUpdateTitles, List<UpdateTransazioneShadowStaticQueueable.Payload> shadowPayloads, List<Id> transactionIdsForShadowBatch) {
        this.payloads = payloads != null ? payloads : new List<Map<String, Object>>();
        this.descUpdateTxIds = descUpdateTxIds != null ? descUpdateTxIds : new List<Id>();
        this.descUpdateTitles = descUpdateTitles != null ? descUpdateTitles : new List<String>();
        this.shadowPayloads = shadowPayloads;
        this.transactionIdsForShadowBatch = transactionIdsForShadowBatch != null ? transactionIdsForShadowBatch : new List<Id>();
    }

    public void execute(QueueableContext context) {
        Boolean hadShadowBatch = transactionIdsForShadowBatch != null && !transactionIdsForShadowBatch.isEmpty();
        if (hadShadowBatch) {
            DonationCreationContext.skipTransazioneShadowQueueable = true;
        }
        try {
        if (hadShadowBatch) {
            try {
                Database.executeBatch(new CreateTransazioneShadowBatch(transactionIdsForShadowBatch), 1);
            } catch (Exception eb) {
                System.debug('Errore avvio CreateTransazioneShadowBatch: ' + eb.getMessage());
            }
        }
        if (shadowPayloads != null && !shadowPayloads.isEmpty()) {
            UpdateTransazioneShadowStaticInvocable.processPayloadsSynchronously(shadowPayloads);
        }
        if (descUpdateTxIds != null && descUpdateTitles != null && descUpdateTxIds.size() == descUpdateTitles.size() && !descUpdateTxIds.isEmpty()) {
            List<GiftTransaction> toUpdateDesc = new List<GiftTransaction>();
            for (Integer i = 0; i < descUpdateTxIds.size(); i++) {
                if (descUpdateTxIds[i] != null && String.isNotBlank(descUpdateTitles[i])) {
                    toUpdateDesc.add(new GiftTransaction(Id = descUpdateTxIds[i], Description = descUpdateTitles[i]));
                }
            }
            if (!toUpdateDesc.isEmpty()) update toUpdateDesc;
        }
        
        if (payloads == null || payloads.isEmpty()) return;
        Set<Id> transactionIds = new Set<Id>();
        for (Map<String, Object> p : payloads) {
            Id txId = parseId(p != null ? p.get('transactionId') : null);
            if (txId != null) {
                transactionIds.add(txId);
            }
        }
        if (transactionIds.isEmpty()) return;

        // Elimina designazioni esistenti in bulk (default NPSP o flow)
        List<GiftTransactionDesignation> existingGtds = [
            SELECT Id
            FROM GiftTransactionDesignation
            WHERE GiftTransactionId IN :transactionIds
        ];
        if (!existingGtds.isEmpty()) {
            Database.delete(existingGtds, false);
        }

        Map<Id, GiftTransaction> txById = new Map<Id, GiftTransaction>([
            SELECT Id, Reporting_Year__c, CurrentAmount, Donation__r.GiftAmount
            FROM GiftTransaction
            WHERE Id IN :transactionIds
        ]);

        List<GiftTransactionDesignation> allocationsToCreate = new List<GiftTransactionDesignation>();
        for (Map<String, Object> p : payloads) {
            try {
                Id transactionId = parseId(p != null ? p.get('transactionId') : null);
                Id programId = parseId(p != null ? p.get('programId') : null);
                Date dataDistribuzione = parseDate(p != null ? p.get('dataDistribuzione') : null, Date.today());
                List<Object> allocList = (List<Object>) p.get('allocazioni');

                if (transactionId == null || allocList == null || allocList.isEmpty()) continue;
                GiftTransaction tx = txById.get(transactionId);
                if (tx == null) continue;

                Decimal baseAmount = tx.CurrentAmount != null
                    ? tx.CurrentAmount
                    : (tx.Donation__r != null ? tx.Donation__r.GiftAmount : 0);

                for (Object allocObj : allocList) {
                    Map<String, Object> alloc = (Map<String, Object>) allocObj;
                    Id partnerId = parseId(alloc != null ? alloc.get('Partner') : null);
                    Decimal percentuale = parseDecimal(alloc != null ? alloc.get('Percentuale') : null);
                    if (partnerId == null || percentuale == null || percentuale <= 0) continue;

                    Decimal amountCalc = (baseAmount * (percentuale / 100)).setScale(2, RoundingMode.HALF_UP);
                    GiftTransactionDesignation gtd = new GiftTransactionDesignation();
                    gtd.GiftTransactionId = transactionId;
                    gtd.GiftDesignationId = partnerId;
                    gtd.Amount = amountCalc;
                    gtd.Percent = baseAmount != 0
                        ? (amountCalc / baseAmount * 100).setScale(3, RoundingMode.HALF_UP)
                        : percentuale;
                    gtd.Status__c = 'Distributed';
                    gtd.Programma__c = programId;
                    gtd.Data_di_Distribuzione__c = dataDistribuzione;
                    gtd.Donatore_Anno__c = tx.Reporting_Year__c;
                    allocationsToCreate.add(gtd);
                }
            } catch (Exception e) {
                System.debug('Errore parsing payload CreateAllocationsQueueable: ' + e.getMessage());
            }
        }

        List<Id> shadowAllocationIds = new List<Id>();
        Set<Id> transactionIdsToUpdate = new Set<Id>();
        if (!allocationsToCreate.isEmpty()) {
            Database.SaveResult[] insResults = Database.insert(allocationsToCreate, false);
            for (Integer i = 0; i < insResults.size(); i++) {
                if (insResults[i].isSuccess()) {
                    shadowAllocationIds.add(insResults[i].getId());
                    transactionIdsToUpdate.add(allocationsToCreate[i].GiftTransactionId);
                    continue;
                }
                for (Database.Error err : insResults[i].getErrors()) {
                    System.debug(
                        LoggingLevel.ERROR,
                        'Errore insert GiftTransactionDesignation (tx=' +
                        allocationsToCreate[i].GiftTransactionId + '): ' + err.getMessage()
                    );
                }
            }
        }

        if (!transactionIdsToUpdate.isEmpty()) {
            List<GiftTransaction> toUpdate = new List<GiftTransaction>();
            for (Id txId : transactionIdsToUpdate) {
                toUpdate.add(new GiftTransaction(Id = txId, Status = 'Distributed'));
            }
            Database.update(toUpdate, false);
            UpdateTransazioneShadowStaticInvocable.processPayloadsSynchronously(
                UpdateTransazioneShadowStaticInvocable.takePendingPayloads()
            );
        }

        if (!shadowAllocationIds.isEmpty()) {
            try {
                System.enqueueJob(new CreateDistribuzioneShadowQueueable(shadowAllocationIds));
            } catch (Exception eq) {
                System.debug('Errore enqueue Crea_Distribuzione_Shadow: ' + eq.getMessage());
            }
        }
        } finally {
            if (hadShadowBatch) {
                DonationCreationContext.skipTransazioneShadowQueueable = false;
            }
        }
    }

    private static Id parseId(Object raw) {
        if (raw == null) return null;
        try {
            return (Id) String.valueOf(raw);
        } catch (Exception ex) {
            return null;
        }
    }

    private static Decimal parseDecimal(Object raw) {
        if (raw == null) return null;
        try {
            if (raw instanceof Decimal) return (Decimal) raw;
            return Decimal.valueOf(String.valueOf(raw));
        } catch (Exception ex) {
            return null;
        }
    }

    private static Date parseDate(Object raw, Date fallbackDate) {
        if (raw == null) return fallbackDate;
        try {
            String txt = String.valueOf(raw);
            return String.isNotBlank(txt) ? Date.valueOf(txt) : fallbackDate;
        } catch (Exception ex) {
            return fallbackDate;
        }
    }
}