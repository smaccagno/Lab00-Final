public with sharing class PaymentController {
  @AuraEnabled(cacheable=true)
  public static List<PaymentWrapper> getPaymentsWithCapacity(Id budgetId) {
    List<Payment__c> payments = [
      SELECT Id, Name, Amount__c, (SELECT Id, Totale_Fattura__c FROM Fatture__r) // <-- Relazione corretta con "__r"
      FROM Payment__c
      WHERE Budget__c = :budgetId
    ];

    List<PaymentWrapper> paymentList = new List<PaymentWrapper>();

    for (Payment__c payment : payments) {
      Decimal totalInvoices = 0;
      for (Invoice__c invoice : payment.Fatture__r) {
        // <-- Accesso corretto ai record figli
        totalInvoices += invoice.Totale_Fattura__c;
      }
      Decimal capacity = payment.Amount__c - totalInvoices;

      if (capacity > 0) {
        paymentList.add(
          new PaymentWrapper(
            payment.Id,
            payment.Name,
            payment.Amount__c,
            totalInvoices,
            capacity
          )
        );
      }
    }
    return paymentList;
  }

  public class PaymentWrapper {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Decimal amount;
    @AuraEnabled
    public Decimal totalInvoices;
    @AuraEnabled
    public Decimal capacity;

    public PaymentWrapper(
      String id,
      String name,
      Decimal amount,
      Decimal totalInvoices,
      Decimal capacity
    ) {
      this.id = id;
      this.name = name;
      this.amount = amount;
      this.totalInvoices = totalInvoices;
      this.capacity = capacity;
    }
  }
}