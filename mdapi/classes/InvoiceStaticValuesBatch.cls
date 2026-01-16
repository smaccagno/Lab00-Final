/**
 *  InvoiceStaticValuesBatch
 *
 *  Batch Apex che aggiorna Fattura_Shadow__c per le Invoice__c
 *  collegate ai Programmi indicati.
 *
 *  API 63.0
 */
public with sharing class InvoiceStaticValuesBatch implements Database.Batchable<SObject> {
  /*------------------------------------------------------------------
   *  Costruttore
   *----------------------------------------------------------------*/
  private final Set<Id> programIds;

  public InvoiceStaticValuesBatch(Set<Id> programIds) {
    this.programIds = programIds;
  }

  /*------------------------------------------------------------------
   *  start
   *----------------------------------------------------------------*/
  public Database.QueryLocator start(Database.BatchableContext ctx) {
    return Database.getQueryLocator(
      [
        SELECT
          Id,
          Fattura_Shadow__c,
          Total_Duration_in_minutes__c,
          Totale_Fattura__c,
          Totale_Biglietti__c,
          Total_Number_of_Visits__c,
          Overview_Budget_per_Anno__r.Totali_Budget_Anno__c,
          Reporting_Year__r.Totali_Donatore_Anno__c
        FROM Invoice__c
        WHERE Programma__c IN :programIds AND Fattura_Shadow__c != NULL
      ]
    );
  }

  /*------------------------------------------------------------------
   *  execute
   *----------------------------------------------------------------*/
  public void execute(Database.BatchableContext ctx, List<SObject> scope) {
    Map<Id, Fattura_Shadow__c> shadowUpdates = new Map<Id, Fattura_Shadow__c>();

    for (Invoice__c inv : (List<Invoice__c>) scope) {
      if (inv.Fattura_Shadow__c == null)
        continue;

      Fattura_Shadow__c fs = shadowUpdates.get(inv.Fattura_Shadow__c);
      if (fs == null) {
        fs = new Fattura_Shadow__c(Id = inv.Fattura_Shadow__c);
        shadowUpdates.put(fs.Id, fs);
      }

      /* campi statici */
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
      Database.update(shadowUpdates.values(), /* allOrNone */ false);
  }

  /*------------------------------------------------------------------
   *  finish
   *----------------------------------------------------------------*/
  public void finish(Database.BatchableContext ctx) {
    // eventuali notifiche / logging
  }
}