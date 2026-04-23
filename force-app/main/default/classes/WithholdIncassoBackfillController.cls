/**
 *  WithholdIncassoBackfillController
 *
 *  Entry point richiamato dalla utility bar. Per ogni GiftTransaction
 *  con Withholding__c > 0 e Original_Donation_Amount__c > 0, calcola
 *  l'importo della trattenuta e crea una Voce_di_Incasso__c
 *  (Categoria__c = 'Donazione') collegata alla transazione.
 *
 *  Idempotente: se esiste già una Voce_di_Incasso__c con
 *  Transazione__c = tx.Id e Categoria__c = 'Donazione', viene ignorata.
 *
 *  Data del Voce: MIN(Data_di_Distribuzione__c) fra le
 *  GiftTransactionDesignation collegate; fallback su
 *  GiftTransaction.Data_di_Competenza__c.
 *
 *  Limite operativo: elabora fino a BATCH_LIMIT transazioni per chiamata
 *  (default 5000). Se il risultato è troncato, il DTO riporta truncated=true.
 */
public with sharing class WithholdIncassoBackfillController {

    private static final Integer BATCH_LIMIT = 5000;
    private static final String CATEGORIA = 'Donazione';
    private static final String STATO = 'Effettiva';

    public class BackfillResult {
        @AuraEnabled public Integer scanned = 0;
        @AuraEnabled public Integer alreadyPresent = 0;
        @AuraEnabled public Integer created = 0;
        @AuraEnabled public Integer skippedNoBudget = 0;
        @AuraEnabled public Integer skippedNoData = 0;
        @AuraEnabled public Integer failed = 0;
        @AuraEnabled public List<String> failureMessages = new List<String>();
        @AuraEnabled public Boolean truncated = false;
        @AuraEnabled public Integer limitApplied = BATCH_LIMIT;
    }

    @AuraEnabled
    public static BackfillResult runBackfill() {
        BackfillResult result = new BackfillResult();

        // 1. Scan candidate transactions.
        List<GiftTransaction> txs = [
            SELECT Id, Name, Programma__c, Original_Donation_Amount__c,
                   Withholding__c, Data_di_Competenza__c
            FROM GiftTransaction
            WHERE Programma__c != null
              AND Withholding__c != null AND Withholding__c > 0
              AND Original_Donation_Amount__c != null AND Original_Donation_Amount__c > 0
            ORDER BY CreatedDate ASC
            LIMIT :(BATCH_LIMIT + 1)
        ];

        if (txs.size() > BATCH_LIMIT) {
            result.truncated = true;
            // Drop the overflow row so we process exactly BATCH_LIMIT.
            txs.remove(txs.size() - 1);
        }
        result.scanned = txs.size();
        if (txs.isEmpty()) return result;

        Set<Id> txIds = new Set<Id>();
        for (GiftTransaction tx : txs) txIds.add(tx.Id);

        // 2. Idempotency: find transactions that already have a Donazione voce.
        Set<Id> txsWithExistingVoce = new Set<Id>();
        for (Voce_di_Incasso__c existing : [
            SELECT Transazione__c
            FROM Voce_di_Incasso__c
            WHERE Transazione__c IN :txIds
              AND Categoria__c = :CATEGORIA
        ]) {
            if (existing.Transazione__c != null) {
                txsWithExistingVoce.add(existing.Transazione__c);
            }
        }
        result.alreadyPresent = txsWithExistingVoce.size();

        // 3. Earliest allocation distribution date per transaction.
        Map<Id, Date> firstDistributionByTx = new Map<Id, Date>();
        for (GiftTransactionDesignation gtd : [
            SELECT GiftTransactionId, Data_di_Distribuzione__c
            FROM GiftTransactionDesignation
            WHERE GiftTransactionId IN :txIds
              AND Data_di_Distribuzione__c != null
        ]) {
            Date current = firstDistributionByTx.get(gtd.GiftTransactionId);
            if (current == null || gtd.Data_di_Distribuzione__c < current) {
                firstDistributionByTx.put(gtd.GiftTransactionId, gtd.Data_di_Distribuzione__c);
            }
        }

        // 4. Resolve Overview_Budget_per_Anno__c (default budget) per (program, year).
        Set<Id> programIds = new Set<Id>();
        Set<String> years = new Set<String>();
        Map<Id, Date> resolvedDateByTx = new Map<Id, Date>();

        for (GiftTransaction tx : txs) {
            if (txsWithExistingVoce.contains(tx.Id)) continue;
            Date voceDate = firstDistributionByTx.get(tx.Id);
            if (voceDate == null) voceDate = tx.Data_di_Competenza__c;
            if (voceDate == null) continue;
            resolvedDateByTx.put(tx.Id, voceDate);
            programIds.add(tx.Programma__c);
            years.add(String.valueOf(voceDate.year()));
        }

        Map<String, Id> defaultOverviewBudget = new Map<String, Id>();
        if (!programIds.isEmpty() && !years.isEmpty()) {
            for (Overview_Budget_per_Anno__c ob : [
                SELECT Id, Programma__c, Anno__c
                FROM Overview_Budget_per_Anno__c
                WHERE Programma__c IN :programIds
                  AND Anno__c IN :years
                  AND Budget__r.DEFAULT_PRG__c = true
            ]) {
                defaultOverviewBudget.put(ob.Programma__c + '|' + ob.Anno__c, ob.Id);
            }
        }

        // 5. Build inserts.
        List<Voce_di_Incasso__c> toInsert = new List<Voce_di_Incasso__c>();
        for (GiftTransaction tx : txs) {
            if (txsWithExistingVoce.contains(tx.Id)) continue;

            Date voceDate = resolvedDateByTx.get(tx.Id);
            if (voceDate == null) { result.skippedNoData++; continue; }

            Id obaId = defaultOverviewBudget.get(tx.Programma__c + '|' + String.valueOf(voceDate.year()));
            if (obaId == null) { result.skippedNoBudget++; continue; }

            Decimal amount = (tx.Original_Donation_Amount__c * (tx.Withholding__c / 100))
                                .setScale(2, RoundingMode.HALF_UP);
            if (amount <= 0) { result.skippedNoData++; continue; }

            String name = 'Trattenuta ' + (tx.Name != null ? tx.Name : String.valueOf(tx.Id));
            if (name.length() > 80) name = name.substring(0, 80);

            toInsert.add(new Voce_di_Incasso__c(
                Name = name,
                Categoria__c = CATEGORIA,
                Stato__c = STATO,
                Ammontare__c = amount,
                Data__c = voceDate,
                Transazione__c = tx.Id,
                Overview_Budget_per_Anno__c = obaId
            ));
        }

        if (toInsert.isEmpty()) return result;

        // 6. Bulk insert with partial success.
        Database.SaveResult[] saveResults = Database.insert(toInsert, false);
        for (Integer i = 0; i < saveResults.size(); i++) {
            Database.SaveResult sr = saveResults[i];
            if (sr.isSuccess()) {
                result.created++;
            } else {
                result.failed++;
                String msg = 'Voce "' + toInsert[i].Name + '": ';
                if (sr.getErrors() != null && !sr.getErrors().isEmpty()) {
                    msg += sr.getErrors()[0].getMessage();
                }
                // Cap to avoid blowing up the DTO.
                if (result.failureMessages.size() < 20) {
                    result.failureMessages.add(msg);
                }
            }
        }

        return result;
    }
}
