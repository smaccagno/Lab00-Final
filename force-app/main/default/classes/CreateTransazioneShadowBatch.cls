/**
 * Batch per creare Transazione_Shadow__c una alla volta (batch size 1) per evitare
 * UNABLE_TO_LOCK_ROW su Totali_Donatore_Anno__c quando più transazioni condividono lo stesso parent.
 */
public class CreateTransazioneShadowBatch implements Database.Batchable<Id> {
    private List<Id> transactionIds;

    public CreateTransazioneShadowBatch(List<Id> transactionIds) {
        this.transactionIds = transactionIds != null ? transactionIds : new List<Id>();
    }

    public Iterable<Id> start(Database.BatchableContext bc) {
        return transactionIds;
    }

    public void execute(Database.BatchableContext bc, List<Id> scope) {
        if (scope.isEmpty()) return;
        Id txId = scope[0];
        List<GiftTransaction> txs = [
            SELECT Id, Name, Reporting_Year__c, Reporting_Year__r.Totali_Donatore_Anno__c,
                CurrentAmount, Allocation_not_paid__c, Original_Donation_Amount__c,
                Total_Allocations__c, Totale_Allocato__c, Totale_Allocato_NON_Pagato__c, Totale_Allocato_Pagato__c
            FROM GiftTransaction
            WHERE Id = :txId AND Transazione_Shadow__c = null
            LIMIT 1
        ];
        if (txs.isEmpty()) return;
        GiftTransaction tx = txs[0];
        Id totaliId = tx.Reporting_Year__r != null ? tx.Reporting_Year__r.Totali_Donatore_Anno__c : null;
        if (totaliId == null) return;
        Transazione_Shadow__c sh = new Transazione_Shadow__c(
            Name = tx.Name + ' - Shadow',
            Totali_Donatore_Anno__c = totaliId,
            Transazione__c = tx.Id
        );
        insert sh;
        GiftTransaction toUpdate = new GiftTransaction(Id = tx.Id, Transazione_Shadow__c = sh.Id);
        update toUpdate;
        UpdateTransazioneShadowStaticInvocable.processPayloadsSynchronously(new List<UpdateTransazioneShadowStaticQueueable.Payload>{
            new UpdateTransazioneShadowStaticQueueable.Payload(
                sh.Id, tx.CurrentAmount, tx.Allocation_not_paid__c != null ? tx.Allocation_not_paid__c.intValue() : null,
                tx.Original_Donation_Amount__c, tx.Total_Allocations__c != null ? tx.Total_Allocations__c.intValue() : null,
                tx.Totale_Allocato__c, tx.Totale_Allocato_NON_Pagato__c, tx.Totale_Allocato_Pagato__c
            )
        });
    }

    public void finish(Database.BatchableContext bc) { }
}