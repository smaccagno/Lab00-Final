/**
 * AlignActiveProgramsQueueable
 * 04-lug-2025
 */
public with sharing class AlignActiveProgramsQueueable implements Queueable {
  // Adatta questa costante al tuo org se usi una picklist
  private static final String ACTIVE_STATUS = 'Attivo';

  public void execute(QueueableContext qc) {
    /* 1) Programmi attivi
         - se hai un checkbox “Active__c” usa: WHERE Active__c = TRUE
         - se usi una picklist, tieni “Status__c = :ACTIVE_STATUS”          */
    List<Program> programs = [
      SELECT Id
      FROM Program
      WHERE Status = :ACTIVE_STATUS
      // oppure:  WHERE Active__c = TRUE
    ];

    if (programs.isEmpty()) {
      System.debug(LoggingLevel.INFO, '⏩ Nessun Program attivo trovato');
      return;
    }

    /* 2) Input per l’invocabile */
    List<AllineaProgrammaAction.Input> inputs = new List<AllineaProgrammaAction.Input>();
    for (Program p : programs) {
      AllineaProgrammaAction.Input rec = new AllineaProgrammaAction.Input();
      rec.programId = (String) p.Id;
      inputs.add(rec);
    }

    /* 3) Bulk allineamento */
    List<AllineaProgrammaAction.Output> res = AllineaProgrammaAction.run(
      inputs
    );

    /* 4) Log */
    if (!res.isEmpty()) {
      System.debug(
        LoggingLevel.INFO,
        '✅ Allineamento completato: ' + res[0].message
      );
    }
  }
}