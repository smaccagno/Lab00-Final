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

    /* 2. Query bulk Donor Overview e Budgets */
    List<Donor_Overview__c> overviews = [
      SELECT Id
      FROM Donor_Overview__c
      WHERE Programma__c IN :programIds
    ];
    List<GiftDesignation> budgets = [
      SELECT Id
      FROM GiftDesignation
      WHERE Program__c IN :programIds
    ];

    /* 3. Prepara input per gli action */
    List<AllineaDonatoreAnnoAction.Input> inOV = new List<AllineaDonatoreAnnoAction.Input>();
    for (Donor_Overview__c ov : overviews) {
      AllineaDonatoreAnnoAction.Input rec = new AllineaDonatoreAnnoAction.Input();
      rec.overviewDonatoreId = ov.Id;
      inOV.add(rec);
    }

    List<AllineaBudgetAnnoAction.Input> inBD = new List<AllineaBudgetAnnoAction.Input>();
    for (GiftDesignation gd : budgets) {
      AllineaBudgetAnnoAction.Input rec = new AllineaBudgetAnnoAction.Input();
      rec.budgetId = gd.Id;
      inBD.add(rec);
    }

    /* 4. Invoca in bulk gli action già ottimizzati */
    if (!inOV.isEmpty())
      AllineaDonatoreAnnoAction.execute(inOV);
    if (!inBD.isEmpty())
      AllineaBudgetAnnoAction.execute(inBD);

    /* 4-bis. Aggiorna le fatture collegate ai Program               // ► NEW
     (una sola query + DML bulk gestiti internamente)              */
    InvoiceStaticValuesUpdater.updateStaticValues(programIds); // ► NEW

    /* 5. Riepilogo */
    return wrap(
      'Overview allineati: ' +
        inOV.size() +
        ' | Budget allineati: ' +
        inBD.size() +
        ' | Fatture aggiornate per ' +
        programIds.size() +
        ' programma/i' // ► NEW
    );
  }

  /*---------------- HELPERS ------------------------*/
  private static List<Output> wrap(String msg) {
    return new List<Output>{ new Output(msg) };
  }
}