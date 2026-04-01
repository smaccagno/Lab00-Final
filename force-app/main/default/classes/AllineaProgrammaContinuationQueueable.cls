/**
 *  AllineaProgrammaContinuationQueueable
 *
 *  Esegue AllineaDonatoreAnnoAction e AllineaBudgetAnnoAction DOPO che
 *  InvoiceStaticValuesBatch ha aggiornato le Fattura_Shadow.
 *  Al completamento pubblica Platform Event per mostrare toast all'utente.
 *
 *  API 63.0
 */
public without sharing class AllineaProgrammaContinuationQueueable implements Queueable {
  private final Set<Id> programIds;
  private final Id notifyUserId;
  private final String phase;

  private static final String PHASE_DONATORE = 'DONATORE';
  private static final String PHASE_BUDGET = 'BUDGET';

  public AllineaProgrammaContinuationQueueable(Set<Id> programIds) {
    this(programIds, null);
  }

  public AllineaProgrammaContinuationQueueable(Set<Id> programIds, Id notifyUserId) {
    this(programIds, notifyUserId, PHASE_DONATORE);
  }

  private AllineaProgrammaContinuationQueueable(
    Set<Id> programIds,
    Id notifyUserId,
    String phase
  ) {
    this.programIds = programIds != null ? new Set<Id>(programIds) : new Set<Id>();
    this.notifyUserId = notifyUserId;
    this.phase = String.isBlank(phase) ? PHASE_DONATORE : phase;
  }

  public void execute(QueueableContext ctx) {
    if (programIds.isEmpty()) return;

    if (Test.isRunningTest()) {
      runDonatorePhase();
      runBudgetPhase();
      sendCompletionNotification();
      return;
    }

    if (PHASE_DONATORE.equals(phase)) {
      runDonatorePhase();
      System.enqueueJob(
        new AllineaProgrammaContinuationQueueable(
          programIds,
          notifyUserId,
          PHASE_BUDGET
        )
      );
      return;
    }

    if (PHASE_BUDGET.equals(phase)) {
      runBudgetPhase();
      sendCompletionNotification();
      return;
    }

    sendCompletionNotification();
  }

  private void runDonatorePhase() {
    List<AllineaDonatoreAnnoAction.Input> inOV = new List<AllineaDonatoreAnnoAction.Input>();
    for (Donor_Overview__c ov : [
      SELECT Id FROM Donor_Overview__c WHERE Programma__c IN :programIds
    ]) {
      AllineaDonatoreAnnoAction.Input rec = new AllineaDonatoreAnnoAction.Input();
      rec.overviewDonatoreId = ov.Id;
      inOV.add(rec);
    }
    if (!inOV.isEmpty())
      AllineaDonatoreAnnoAction.execute(inOV);
  }

  private void runBudgetPhase() {
    List<AllineaBudgetAnnoAction.Input> inBD = new List<AllineaBudgetAnnoAction.Input>();
    for (GiftDesignation gd : [
      SELECT Id FROM GiftDesignation WHERE Program__c IN :programIds
    ]) {
      AllineaBudgetAnnoAction.Input rec = new AllineaBudgetAnnoAction.Input();
      rec.budgetId = gd.Id;
      inBD.add(rec);
    }
    if (!inBD.isEmpty())
      AllineaBudgetAnnoAction.execute(inBD);
  }

  private void sendCompletionNotification() {
    AllineamentoProgrammaNotificationService.sendToastNotification(
      notifyUserId,
      null
    );
  }
}