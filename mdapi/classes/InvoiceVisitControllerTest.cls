@IsTest
private class InvoiceVisitControllerTest {
  @IsTest
  static void getVisitsByInvoice_null_returnsEmpty() {
    List<Visit__c> res = InvoiceVisitController.getVisitsByInvoice(null);
    System.assertEquals(0, res.size());
  }
}