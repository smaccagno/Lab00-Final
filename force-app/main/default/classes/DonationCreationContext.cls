/**
 * Flag per evitare che UpdateTransazioneShadowStaticInvocable accodi un Queueable
 * quando siamo nel contesto di creazione donazioni. Il limite è 1 queueable per transazione
 * quando il flow è record-triggered; altrimenti si supera con "Too many queueable jobs: 2".
 */
public class DonationCreationContext {
    public static Boolean skipTransazioneShadowQueueable = false;
}