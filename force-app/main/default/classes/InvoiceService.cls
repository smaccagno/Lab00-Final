public with sharing class InvoiceService {
  @AuraEnabled(cacheable=true)
  public static List<Invoice__c> getInvoices(
    Date campaignStartDate,
    Date campaignEndDate
  ) {
    try {
      // Query per recuperare i record Invoice__c con i campi necessari
      return [
        SELECT
          Id,
          Name,
          Campaign__c,
          Campaign__r.Name,
          Date__c,
          Data_di_Competenza__c,
          Medical_Center__c,
          Nome_Donatore__c,
          Invoice_Number__c,
          Totale_Fattura__c
        FROM Invoice__c
        WHERE
          Data_di_Competenza__c >= :campaignStartDate
          AND Data_di_Competenza__c <= :campaignEndDate
      ];
    } catch (Exception e) {
      throw new AuraHandledException(
        'Errore nel recupero delle fatture: ' + e.getMessage()
      );
    }
  }
}