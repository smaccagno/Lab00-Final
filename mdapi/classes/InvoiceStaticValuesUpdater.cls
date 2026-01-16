/**
 *  InvoiceStaticValuesUpdater v2.1
 *
 *  Avvia un Batch Apex che aggiorna i valori statici delle fatture
 *  collegate a uno o più Programmi.
 *
 *  API 63.0
 */
public with sharing class InvoiceStaticValuesUpdater {
  /*------------------------------------------------------------------
   *  Invocable wrapper (richiamato dal Flow)
   *----------------------------------------------------------------*/
  public class ProgramIdWrapper {
    @InvocableVariable(required=true)
    public Id programId;
  }

  @InvocableMethod(label='Aggiorna valori statici fatture per Program Id')
  public static void invoke(List<ProgramIdWrapper> request) {
    if (request == null || request.isEmpty())
      return;

    Set<Id> ids = new Set<Id>();
    for (ProgramIdWrapper w : request)
      if (w != null && w.programId != null)
        ids.add(w.programId);

    updateStaticValues(ids); // ⬅ mantiene la stessa firma pubblica
  }

  /*------------------------------------------------------------------
   *  Metodo pubblico (chiamato anche da AllineaProgrammaAction)
   *----------------------------------------------------------------*/
  public static void updateStaticValues(Set<Id> programIds) {
    if (programIds == null || programIds.isEmpty())
      return;
    // lancia il batch con scope 200
    Database.executeBatch(new InvoiceStaticValuesBatch(programIds), 200);
  }

  public static void updateStaticValues(Id programId) {
    if (programId != null)
      updateStaticValues(new Set<Id>{ programId });
  }
}