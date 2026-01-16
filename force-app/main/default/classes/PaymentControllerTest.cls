@IsTest(SeeAllData=true)
private class PaymentControllerTest {
  /** 1) getPaymentsWithCapacity con budgetId null ⇒ lista vuota **/
  @IsTest
  static void testGetPaymentsWithCapacity_NullBudget() {
    List<PaymentController.PaymentWrapper> wrappers = PaymentController.getPaymentsWithCapacity(
      null
    );
    System.assertNotEquals(null, wrappers, 'La lista non deve essere null');
    System.assertEquals(
      0,
      wrappers.size(),
      'Con budgetId null, deve essere vuota'
    );
  }

  /** 2) getPaymentsWithCapacity con budgetId inesistente ⇒ lista vuota **/
  @IsTest
  static void testGetPaymentsWithCapacity_InvalidBudget() {
    // Id fittizio che non corrisponde a nessun Budget__c
    Id fakeBudgetId = 'a0Z000000000000AAA';
    List<PaymentController.PaymentWrapper> wrappers = PaymentController.getPaymentsWithCapacity(
      fakeBudgetId
    );
    System.assertNotEquals(null, wrappers, 'La lista non deve essere null');
    System.assertEquals(
      0,
      wrappers.size(),
      'Con budgetId inesistente, deve essere vuota'
    );
  }

  /** 3) getPaymentsWithCapacity con dati esistenti **/
  @IsTest
  static void testGetPaymentsWithCapacity_WithData() {
    // Prelevo un Payment__c di esempio, includendo anche Budget__c
    List<Payment__c> payments = [
      SELECT
        Id,
        Amount__c,
        Budget__c,
        (SELECT Totale_Fattura__c FROM Fatture__r)
      FROM Payment__c
      WHERE Budget__c != NULL
      LIMIT 1
    ];
    if (payments.isEmpty()) {
      // Se non ci sono dati, skipiamo
      return;
    }
    Payment__c sample = payments[0];
    Decimal amount = sample.Amount__c != null ? sample.Amount__c : 0;
    Decimal sumInvoices = 0;
    for (Invoice__c inv : sample.Fatture__r) {
      sumInvoices += inv.Totale_Fattura__c != null ? inv.Totale_Fattura__c : 0;
    }
    Decimal expectedCapacity = amount - sumInvoices;
    Id budgetId = sample.Budget__c;

    List<PaymentController.PaymentWrapper> wrappers = PaymentController.getPaymentsWithCapacity(
      budgetId
    );
    System.assertNotEquals(
      null,
      wrappers,
      'La lista wrappers non deve essere null'
    );

    // Trovo il wrapper corrispondente
    PaymentController.PaymentWrapper found = null;
    for (PaymentController.PaymentWrapper pw : wrappers) {
      if (pw.id == sample.Id) {
        found = pw;
        break;
      }
    }

    if (expectedCapacity > 0) {
      // Se capacity > 0, il wrapper deve esserci
      System.assertNotEquals(
        null,
        found,
        'Il wrapper deve includere il record con capacity > 0'
      );
      System.assertEquals(amount, found.amount, 'Amount deve corrispondere');
      System.assertEquals(
        sumInvoices,
        found.totalInvoices,
        'TotalInvoices deve sommare Totale_Fattura'
      );
      System.assertEquals(
        expectedCapacity,
        found.capacity,
        'Capacity = amount – totalInvoices'
      );
    } else {
      // Se capacity ≤ 0, non deve esserci
      System.assertEquals(
        null,
        found,
        'Il wrapper non deve includere il record con capacity ≤ 0'
      );
    }
  }
}