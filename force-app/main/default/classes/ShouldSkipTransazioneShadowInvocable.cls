/**
 * Invocable usato dal flow Crea_Transazione_Shadow per saltare la creazione
 * quando siamo in contesto bulk (DonationCreationController). Evita UNABLE_TO_LOCK_ROW
 * su Totali_Donatore_Anno__c quando più transazioni condividono lo stesso parent.
 */
public class ShouldSkipTransazioneShadowInvocable {
    @InvocableMethod(label='Should Skip Transazione Shadow' description='Returns true when in bulk donation creation to avoid lock contention.')
    public static List<Output> execute(List<Input> inputs) {
        Boolean skip = DonationCreationContext.skipTransazioneShadowQueueable;
        return new List<Output>{ new Output(skip) };
    }

    public class Input {
        @InvocableVariable(label='Record Id' description='Optional, used to satisfy flow requirement for one input.')
        public Id recordId;
    }

    public class Output {
        @InvocableVariable(label='Should Skip')
        public Boolean shouldSkip;
        public Output(Boolean shouldSkip) {
            this.shouldSkip = shouldSkip;
        }
    }
}