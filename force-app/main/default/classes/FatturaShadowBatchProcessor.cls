public class FatturaShadowBatchProcessor implements Queueable {
  private List<Id> fatturaIds;
  private Integer startIndex;
  private Integer batchSize = 50; // Regolabile

  public FatturaShadowBatchProcessor() {
    fatturaIds = new List<Id>();
    for (Fattura_Shadow__c f : [SELECT Id FROM Fattura_Shadow__c]) {
      fatturaIds.add(f.Id);
    }
    startIndex = 0;
  }

  public FatturaShadowBatchProcessor(List<Id> fatturaIds, Integer startIndex) {
    this.fatturaIds = fatturaIds;
    this.startIndex = startIndex;
  }

  public void execute(QueueableContext context) {
    List<Id> currentBatch = new List<Id>();
    Integer endIndex = Math.min(startIndex + batchSize, fatturaIds.size());

    for (Integer i = startIndex; i < endIndex; i++) {
      currentBatch.add(fatturaIds[i]);
    }

    Map<Id, Fattura_Shadow__c> shadowById = new Map<Id, Fattura_Shadow__c>([
      SELECT Id,
             Totale_Fattura_Static__c,
             Totale_Durata_Visite_Static__c,
             Totale_Numero_di_Visite_Static__c,
             Totale_Numero_di_Biglietti_Static__c,
             Totali_Budget_Anno__c,
             Totali_Donatore_Anno__c
      FROM Fattura_Shadow__c
      WHERE Id IN :currentBatch
    ]);

    for (Id fatturaId : currentBatch) {
      try {
        Fattura_Shadow__c fs = shadowById.get(fatturaId);
        Map<String, Object> inputVars = new Map<String, Object>{
          'recordId' => fatturaId,
          'input_skip_lookup' => true
        };
        if (fs != null) {
          inputVars.put('input_totale_fattura', fs.Totale_Fattura_Static__c);
          inputVars.put('input_totale_durata', fs.Totale_Durata_Visite_Static__c);
          inputVars.put('input_totale_visite', fs.Totale_Numero_di_Visite_Static__c);
          inputVars.put('input_totale_biglietti', fs.Totale_Numero_di_Biglietti_Static__c);
          inputVars.put('input_totali_budget_id', fs.Totali_Budget_Anno__c);
          inputVars.put('input_totali_donatore_id', fs.Totali_Donatore_Anno__c);
        }
        Flow.Interview.Aggiorna_Valori_Statici_Fattura_Shadow_autolaunched flowInstance = new Flow.Interview.Aggiorna_Valori_Statici_Fattura_Shadow_autolaunched(
          inputVars
        );
        flowInstance.start();
      } catch (Exception ex) {
        System.debug('Errore su ' + fatturaId + ': ' + ex.getMessage());
      }
    }

    if (endIndex < fatturaIds.size()) {
      System.enqueueJob(new FatturaShadowBatchProcessor(fatturaIds, endIndex));
    }
  }
}