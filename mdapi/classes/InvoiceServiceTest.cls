@IsTest(SeeAllData=true)
private class InvoiceServiceTest {
  /**
   * Test di getInvoices con intervallo ampio:
   * ci aspettiamo almeno una lista non nulla (potrebbe essere vuota se non ci sono dati).
   */
  @IsTest
  static void testGetInvoicesWholeRange() {
    Date startDate = Date.today().addYears(-10);
    Date endDate = Date.today().addYears(10);

    List<Invoice__c> invs = InvoiceService.getInvoices(startDate, endDate);
    System.assertNotEquals(
      null,
      invs,
      'La lista restituita non deve essere null'
    );
    // Non verifichiamo size specifico, perché dipende dai dati in org
  }

  /**
   * Test di getInvoices con range che non include alcun record:
   * ci aspettiamo lista vuota.
   */
  @IsTest
  static void testGetInvoicesNoMatch() {
    // Intervallo storico in cui presumibilmente non ci sono Invoice__c
    Date startDate = Date.newInstance(1900, 1, 1);
    Date endDate = Date.newInstance(1900, 12, 31);

    List<Invoice__c> invs = InvoiceService.getInvoices(startDate, endDate);
    System.assertNotEquals(
      null,
      invs,
      'La lista restituita non deve essere null'
    );
    System.assertEquals(
      0,
      invs.size(),
      'Non ci devono essere fatture per l’anno 1900'
    );
  }
}