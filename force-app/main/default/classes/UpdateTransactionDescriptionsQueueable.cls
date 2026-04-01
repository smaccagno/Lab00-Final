/**
 * Queueable per aggiornare Description sulle GiftTransaction in transazione separata.
 * Evita di attivare Crea_Transazione_Shadow nella stessa transazione della creazione donazioni,
 * riducendo il consumo di SOQL (limite 100 per transazione).
 */
public class UpdateTransactionDescriptionsQueueable implements Queueable {
    private List<Id> transactionIds;
    private List<String> descriptions;
    
    public UpdateTransactionDescriptionsQueueable(List<Id> transactionIds, List<String> descriptions) {
        this.transactionIds = transactionIds;
        this.descriptions = descriptions;
    }
    
    public void execute(QueueableContext context) {
        if (transactionIds == null || descriptions == null || transactionIds.size() != descriptions.size()) {
            return;
        }
        List<GiftTransaction> toUpdate = new List<GiftTransaction>();
        for (Integer i = 0; i < transactionIds.size(); i++) {
            if (String.isNotBlank(transactionIds[i]) && String.isNotBlank(descriptions[i])) {
                toUpdate.add(new GiftTransaction(Id = transactionIds[i], Description = descriptions[i]));
            }
        }
        if (!toUpdate.isEmpty()) {
            update toUpdate;
        }
    }
}