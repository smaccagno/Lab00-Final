/**
 *  AllineaProgrammaAction
 *
 *  Unifica il flow “Allinea Programma”:
 *    • chiama in bulk AllineaDonatoreAnnoAction per tutti i Donor Overview
 *    • chiama in bulk AllineaBudgetAnnoAction   per tutti i Budgets
 *
 *  API ≥ 62.0
 */
public without sharing class AllineaProgrammaAction {
  @TestVisible
  static Set<Id> lastAlignedProgramIds = new Set<Id>();
  /*---------------- INVOCABLE TYPES ----------------*/
  public class Input {
    @InvocableVariable(required=true)
    public String programId; // Id del Program da allineare

    @InvocableVariable(required=false)
    public String anno; // lasciato solo per compatibilità (non usato)
  }
  public class Output {
    @InvocableVariable
    public String message;
    public Output(String m) {
      message = m;
    }
  }

  /*---------------- ENTRY POINT --------------------*/
  @InvocableMethod
  public static List<Output> run(List<Input> inputs) {
    lastAlignedProgramIds = new Set<Id>();
    /* 1. Validazione */
    if (inputs == null || inputs.isEmpty())
      return wrap('Nessun ProgramId fornito');

    Set<Id> programIds = new Set<Id>();
    for (Input i : inputs)
      if (!String.isBlank(i.programId))
        programIds.add((Id) i.programId);

    if (programIds.isEmpty())
      return wrap('ProgramId vuoti o non validi');

    lastAlignedProgramIds.addAll(programIds);

    /* 2. Batch: aggiorna Fattura_Shadow, poi in finish() lancia Queueable
     *    che esegue AllineaDonatoreAnno e AllineaBudgetAnno.
     *    Riceverai una notifica verde al completamento.
     */
    InvoiceStaticValuesUpdater.updateStaticValuesWithContinuation(
      programIds,
      UserInfo.getUserId()
    );

    return wrap(
      'Allineamento avviato in background. Riceverai un messaggio al completamento.'
    );
  }

  /*---------------- HELPERS ------------------------*/
  private static List<Output> wrap(String msg) {
    return new List<Output>{ new Output(msg) };
  }
}