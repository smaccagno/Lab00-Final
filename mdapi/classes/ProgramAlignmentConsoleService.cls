/**
 * ProgramAlignmentConsoleService
 *
 * Servizio esposto a LWC/Aura che accoda il job Queueable.
 */
public with sharing class ProgramAlignmentConsoleService {
  @AuraEnabled
  public static void startAlignment() {
    System.enqueueJob(new AlignActiveProgramsQueueable());
  }
}