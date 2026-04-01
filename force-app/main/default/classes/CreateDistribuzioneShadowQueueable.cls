/**
 * Queueable per chiamare Crea_Distribuzione_Shadow_autolaunched su ogni allocazione.
 * Sposta le query dei flow in transazione separata per evitare "Too many SOQL queries".
 */
public class CreateDistribuzioneShadowQueueable implements Queueable {
    private List<Id> allocationIds;
    
    public CreateDistribuzioneShadowQueueable(List<Id> allocationIds) {
        this.allocationIds = allocationIds;
    }
    
    public void execute(QueueableContext context) {
        if (allocationIds == null || allocationIds.isEmpty()) return;
        for (Id allocId : allocationIds) {
            try {
                Flow.Interview.Crea_Distribuzione_Shadow_autolaunched flowShadow = new Flow.Interview.Crea_Distribuzione_Shadow_autolaunched(
                    new Map<String, Object>{ 'recordId' => allocId }
                );
                flowShadow.start();
            } catch (Exception e) {
                System.debug('Errore Crea_Distribuzione_Shadow per ' + allocId + ': ' + e.getMessage());
            }
        }
    }
}