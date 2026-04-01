/**
 *  AllineamentoProgrammaNotificationService
 *
 *  Servizio per inviare notifiche al completamento dell'allineamento programma.
 *  Pubblica Platform Event per mostrare toast all'utente (LWC allineamentoProgrammaToastListener).
 *  Classe separata per permettere deploy senza blocchi da job Queueable/Batch in corso.
 *
 *  API 63.0
 */
public without sharing class AllineamentoProgrammaNotificationService {
  private static final String DEFAULT_MESSAGE =
    'Fatture Shadow, Overview Donatore e Budget Anno sono stati aggiornati correttamente.';

  /**
   * Pubblica Platform Event per mostrare toast all'utente indicato.
   * @param userId Id utente destinatario
   * @param message Messaggio (opzionale, usa default se null)
   */
  public static void sendToastNotification(Id userId, String message) {
    if (userId == null) return;
    try {
      Allineamento_Programma_Completato__e evt = new Allineamento_Programma_Completato__e();
      evt.UserId__c = userId;
      evt.Message__c = String.isNotBlank(message) ? message : DEFAULT_MESSAGE;
      Database.SaveResult[] results = EventBus.publish(
        new List<Allineamento_Programma_Completato__e>{ evt }
      );
      if (!results[0].isSuccess()) {
        System.debug(
          'sendToastNotification publish failed: ' +
          results[0].getErrors()[0].getMessage()
        );
      }
    } catch (Exception e) {
      System.debug('sendToastNotification: ' + e.getMessage());
    }
  }
}