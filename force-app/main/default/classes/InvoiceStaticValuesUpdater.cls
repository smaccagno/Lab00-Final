/**
 *  InvoiceStaticValuesUpdater v2.1
 *
 *  Avvia un Batch Apex che aggiorna i valori statici delle fatture
 *  collegate a uno o più Programmi.
 *  without sharing: necessario per aggiornare Fattura_Shadow collegate
 *  a Totali_Budget_Anno__c/Totali_Donatore_Anno__c che potrebbero
 *  non essere visibili per sharing.
 *
 *  API 63.0
 */
public without sharing class InvoiceStaticValuesUpdater {
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
    if (Test.isRunningTest()) {
      updateStaticValuesSynchronous(programIds);
      return;
    }
    Database.executeBatch(new InvoiceStaticValuesBatch(programIds), 200);
  }

  /**
   * Lancia il batch per aggiornare Fattura_Shadow e, al termine,
   * esegue AllineaDonatoreAnno e AllineaBudgetAnno (via Queueable).
   * Al completamento invia toast all'utente.
   */
  public static void updateStaticValuesWithContinuation(
    Set<Id> programIds,
    Id notifyUserId
  ) {
    if (programIds == null || programIds.isEmpty())
      return;
    if (Test.isRunningTest()) {
      updateStaticValuesSynchronous(programIds);
      if (notifyUserId != null) {
        System.enqueueJob(
          new AllineaProgrammaContinuationQueueable(programIds, notifyUserId)
        );
      }
      return;
    }
    Database.executeBatch(
      new InvoiceStaticValuesBatch(programIds, true, notifyUserId),
      200
    );
  }

  /**
   * Aggiornamento SINCRONO dei valori statici Fattura_Shadow.
   * Usato da AllineaProgrammaAction perché Totali_Budget_Anno__c e
   * Totali_Donatore_Anno__c fanno rollup da Fattura_Shadow: i valori
   * devono essere corretti prima di AllineaBudgetAnnoAction/AllineaDonatoreAnnoAction.
   */
  public static void updateStaticValuesSynchronous(Set<Id> programIds) {
    if (programIds == null || programIds.isEmpty())
      return;

    Set<Id> obIds = new Set<Id>();
    for (Overview_Budget_per_Anno__c ob : [
      SELECT Id FROM Overview_Budget_per_Anno__c WHERE Programma__c IN :programIds
    ]) {
      obIds.add(ob.Id);
    }
    if (obIds.isEmpty()) return;

    List<Invoice__c> invoices = queryInvoicesByOverviewBudgetIds(obIds);
    applyStaticValuesFromInvoices(invoices);
  }

  /**
   * Versione SINCRONA a scope ridotto: aggiorna solo le invoice legate agli Overview_Budget_per_Anno passati.
   * Utile per ridurre il rischio di superare i limiti DML durante allineamenti massivi.
   */
  public static void updateStaticValuesByOverviewBudgetIds(Set<Id> overviewBudgetIds) {
    if (overviewBudgetIds == null || overviewBudgetIds.isEmpty())
      return;
    List<Invoice__c> invoices = queryInvoicesByOverviewBudgetIds(overviewBudgetIds);
    applyStaticValuesFromInvoices(invoices);
  }

  /**
   * Versione SINCRONA a scope ridotto: aggiorna solo le invoice legate ai Reporting_Year passati.
   * Utile per riallineamenti Donatore Anno senza riprocessare l'intero Programma.
   */
  public static void updateStaticValuesByReportingYearIds(Set<Id> reportingYearIds) {
    if (reportingYearIds == null || reportingYearIds.isEmpty())
      return;
    String soql =
      'SELECT Id, Fattura_Shadow__c, Total_Duration_in_minutes__c, Totale_Fattura__c,' +
      ' Totale_Biglietti__c, Total_Number_of_Visits__c,' +
      ' Overview_Budget_per_Anno__r.Totali_Budget_Anno__c, Reporting_Year__r.Totali_Donatore_Anno__c,' +
      ' Fattura_Shadow__r.Bypass_Flow__c, Fattura_Shadow__r.Totale_Durata_Visite_Static__c,' +
      ' Fattura_Shadow__r.Totale_Fattura_Static__c, Fattura_Shadow__r.Totale_Numero_di_Biglietti_Static__c,' +
      ' Fattura_Shadow__r.Totale_Numero_di_Visite_Static__c, Fattura_Shadow__r.Totali_Budget_Anno__c,' +
      ' Fattura_Shadow__r.Totali_Donatore_Anno__c' +
      ' FROM Invoice__c' +
      ' WHERE Reporting_Year__c IN :reportingYearIds AND Fattura_Shadow__c != NULL' +
      (Test.isRunningTest() ? ' LIMIT 100' : '');
    applyStaticValuesFromInvoices(Database.query(soql));
  }

  public static void updateStaticValues(Id programId) {
    if (programId != null)
      updateStaticValues(new Set<Id>{ programId });
  }

  /**
   * Aggiorna TUTTE le Fattura_Shadow collegate a Invoice.
   * Utile per correggere dati esistenti. Chiamare da Execute Anonymous o da un Flow.
   */
  public static void updateAllShadowStaticValues() {
    applyStaticValuesFromInvoices(
      [
        SELECT Id, Fattura_Shadow__c,
               Total_Duration_in_minutes__c, Totale_Fattura__c,
               Totale_Biglietti__c, Total_Number_of_Visits__c,
               Overview_Budget_per_Anno__r.Totali_Budget_Anno__c,
               Reporting_Year__r.Totali_Donatore_Anno__c,
               Fattura_Shadow__r.Bypass_Flow__c,
               Fattura_Shadow__r.Totale_Durata_Visite_Static__c,
               Fattura_Shadow__r.Totale_Fattura_Static__c,
               Fattura_Shadow__r.Totale_Numero_di_Biglietti_Static__c,
               Fattura_Shadow__r.Totale_Numero_di_Visite_Static__c,
               Fattura_Shadow__r.Totali_Budget_Anno__c,
               Fattura_Shadow__r.Totali_Donatore_Anno__c
        FROM Invoice__c
        WHERE Fattura_Shadow__c != NULL
      ]
    );
  }

  private static List<Invoice__c> queryInvoicesByOverviewBudgetIds(Set<Id> overviewBudgetIds) {
    if (overviewBudgetIds == null || overviewBudgetIds.isEmpty()) {
      return new List<Invoice__c>();
    }
    String soql =
      'SELECT Id, Fattura_Shadow__c, Total_Duration_in_minutes__c, Totale_Fattura__c,' +
      ' Totale_Biglietti__c, Total_Number_of_Visits__c,' +
      ' Overview_Budget_per_Anno__r.Totali_Budget_Anno__c, Reporting_Year__r.Totali_Donatore_Anno__c,' +
      ' Fattura_Shadow__r.Bypass_Flow__c, Fattura_Shadow__r.Totale_Durata_Visite_Static__c,' +
      ' Fattura_Shadow__r.Totale_Fattura_Static__c, Fattura_Shadow__r.Totale_Numero_di_Biglietti_Static__c,' +
      ' Fattura_Shadow__r.Totale_Numero_di_Visite_Static__c, Fattura_Shadow__r.Totali_Budget_Anno__c,' +
      ' Fattura_Shadow__r.Totali_Donatore_Anno__c' +
      ' FROM Invoice__c' +
      ' WHERE Overview_Budget_per_Anno__c IN :overviewBudgetIds AND Fattura_Shadow__c != NULL' +
      (Test.isRunningTest() ? ' LIMIT 100' : '');
    return Database.query(soql);
  }

  private static void applyStaticValuesFromInvoices(List<Invoice__c> invoices) {
    if (invoices == null || invoices.isEmpty()) return;

    Map<Id, Fattura_Shadow__c> shadowUpdates = new Map<Id, Fattura_Shadow__c>();
    for (Invoice__c inv : invoices) {
      if (inv.Fattura_Shadow__c == null) continue;
      Fattura_Shadow__c current = inv.Fattura_Shadow__r;
      Boolean needsUpdate = current == null ||
        current.Bypass_Flow__c != true ||
        current.Totale_Durata_Visite_Static__c != inv.Total_Duration_in_minutes__c ||
        current.Totale_Fattura_Static__c != inv.Totale_Fattura__c ||
        current.Totale_Numero_di_Biglietti_Static__c != inv.Totale_Biglietti__c ||
        current.Totale_Numero_di_Visite_Static__c != inv.Total_Number_of_Visits__c ||
        current.Totali_Budget_Anno__c !=
          (inv.Overview_Budget_per_Anno__r != null
            ? inv.Overview_Budget_per_Anno__r.Totali_Budget_Anno__c
            : null) ||
        current.Totali_Donatore_Anno__c !=
          (inv.Reporting_Year__r != null
            ? inv.Reporting_Year__r.Totali_Donatore_Anno__c
            : null);
      if (!needsUpdate) continue;

      Fattura_Shadow__c fs = shadowUpdates.get(inv.Fattura_Shadow__c);
      if (fs == null) {
        fs = new Fattura_Shadow__c(Id = inv.Fattura_Shadow__c);
        shadowUpdates.put(fs.Id, fs);
      }

      fs.Bypass_Flow__c = true; /* evita record-triggered flow → limite DML */
      fs.Totale_Durata_Visite_Static__c = inv.Total_Duration_in_minutes__c;
      fs.Totale_Fattura_Static__c = inv.Totale_Fattura__c;
      fs.Totale_Numero_di_Biglietti_Static__c = inv.Totale_Biglietti__c;
      fs.Totale_Numero_di_Visite_Static__c = inv.Total_Number_of_Visits__c;
      fs.Totali_Budget_Anno__c = (inv.Overview_Budget_per_Anno__r != null)
        ? inv.Overview_Budget_per_Anno__r.Totali_Budget_Anno__c
        : null;
      fs.Totali_Donatore_Anno__c = (inv.Reporting_Year__r != null)
        ? inv.Reporting_Year__r.Totali_Donatore_Anno__c
        : null;
    }

    if (!shadowUpdates.isEmpty())
      Database.update(shadowUpdates.values(), false);
  }
}