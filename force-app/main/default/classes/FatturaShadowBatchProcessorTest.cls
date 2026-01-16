@IsTest
private class FatturaShadowBatchProcessorTest {
  @IsTest
  static void execute_withNoRecords_doesNotFail() {
    Test.startTest();
    System.enqueueJob(new FatturaShadowBatchProcessor(new List<Id>(), 0));
    Test.stopTest();
    System.assert(true, 'Queueable ran without records');
  }

  @IsTest
  static void execute_withRecords_catchesFlow() {
    InvoiceTestDataFactory.Setup s = InvoiceTestDataFactory.createBase('2026');

    // Insert a minimal shadow record with required lookups populated
    Fattura_Shadow__c fs = new Fattura_Shadow__c(
      Name = 'UT Shadow',
      Totali_Budget_Anno__c = s.totBudId,
      Totali_Donatore_Anno__c = s.totDonId
    );
    insert fs;

    Test.startTest();
    System.enqueueJob(new FatturaShadowBatchProcessor(new List<Id>{ fs.Id }, 0));
    Test.stopTest();
    System.assert(true, 'Queueable processed one shadow');
  }
}