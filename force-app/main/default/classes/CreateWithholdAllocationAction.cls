public class CreateWithholdAllocationAction {
    @InvocableMethod(label='Create Withhold Allocation' description='Creates a withhold allocation for a distributed transaction')
    public static void createWithholdAllocation(List<Id> transactionIds) {
        if (transactionIds == null || transactionIds.isEmpty()) return;

        List<GiftTransaction> txs = [
            SELECT Id, Reporting_Year__c, Programma__c, Original_Donation_Amount__c, Withholding__c
            FROM GiftTransaction
            WHERE Id IN :transactionIds AND Programma__c != null
        ];

        if (txs.isEmpty()) return;

        Set<Id> programIds = new Set<Id>();
        for (GiftTransaction tx : txs) {
            programIds.add(tx.Programma__c);
        }

        Map<Id, Id> defaultDesignationByProgram = new Map<Id, Id>();
        for (GiftDesignation gd : [
            SELECT Id, Program__c 
            FROM GiftDesignation 
            WHERE Program__c IN :programIds AND IsDefault = true
        ]) {
            defaultDesignationByProgram.put(gd.Program__c, gd.Id);
        }

        List<GiftTransactionDesignation> allocationsToCreate = new List<GiftTransactionDesignation>();
        for (GiftTransaction tx : txs) {
            Decimal originalAmount = tx.Original_Donation_Amount__c != null ? tx.Original_Donation_Amount__c : 0;
            Decimal withholdPercent = tx.Withholding__c != null ? tx.Withholding__c : 0;
            
            if (withholdPercent > 0 && originalAmount > 0 && defaultDesignationByProgram.containsKey(tx.Programma__c)) {
                Decimal withholdAmount = (originalAmount * (withholdPercent / 100)).setScale(2, RoundingMode.HALF_UP);
                if (withholdAmount > 0) {
                    GiftTransactionDesignation withholdGtd = new GiftTransactionDesignation();
                    withholdGtd.GiftTransactionId = tx.Id;
                    withholdGtd.GiftDesignationId = defaultDesignationByProgram.get(tx.Programma__c);
                    withholdGtd.Amount = withholdAmount;
                    withholdGtd.Percent = (withholdAmount / originalAmount * 100).setScale(3, RoundingMode.HALF_UP);
                    withholdGtd.Status__c = 'Distributed';
                    withholdGtd.Programma__c = tx.Programma__c;
                    withholdGtd.Data_di_Distribuzione__c = Date.today();
                    withholdGtd.Donatore_Anno__c = tx.Reporting_Year__c;
                    allocationsToCreate.add(withholdGtd);
                }
            }
        }

        if (!allocationsToCreate.isEmpty()) {
            Database.SaveResult[] insResults = Database.insert(allocationsToCreate, false);
            List<Id> shadowAllocationIds = new List<Id>();
            for (Integer i = 0; i < insResults.size(); i++) {
                if (insResults[i].isSuccess()) {
                    shadowAllocationIds.add(insResults[i].getId());
                } else {
                    for (Database.Error err : insResults[i].getErrors()) {
                        System.debug(LoggingLevel.ERROR, 'Errore insert withhold GiftTransactionDesignation: ' + err.getMessage());
                    }
                }
            }
            if (!shadowAllocationIds.isEmpty()) {
                try {
                    System.enqueueJob(new CreateDistribuzioneShadowQueueable(shadowAllocationIds));
                } catch (Exception eq) {
                    System.debug('Errore enqueue Crea_Distribuzione_Shadow: ' + eq.getMessage());
                }
            }
        }
    }
}
