public with sharing class InvoiceVisitController {
  @AuraEnabled
  public static List<Visit__c> getVisitsByInvoice(Id invoiceId) {
    if (invoiceId == null) return new List<Visit__c>();
    return [
      SELECT Id, Name, Visit_Type__c, Tipo_Visita__c, Beneficiary_Type__c,
             Duration_in_minutes__c, Quantity__c, Amount__c, Data_della_Visita__c,
             City__c, Province__c, Region__c, Invoice__c
      FROM Visit__c
      WHERE Invoice__c = :invoiceId
      ORDER BY Data_della_Visita__c DESC NULLS LAST, CreatedDate DESC
    ];
  }
}