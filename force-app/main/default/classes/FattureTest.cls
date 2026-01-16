@IsTest(SeeAllData=true)
private class FattureTest {
  /*──────────────────── 1. getRelatedRecords ───────────────────*/

  @IsTest
  static void testGetRelatedRecordsNoProgram() {
    Map<String, Object> res = Fatture.getRelatedRecords(
      null, // year
      null, // budgetId
      null, // month
      '', // programId
      null, // donorId
      null, // invoiceNumber
      10,
      0 // limit, offset
    );

    System.assert(res.containsKey('records'));
    System.assert(res.containsKey('dynamicColumnsMeta'));
    System.assert(res.containsKey('totalsByField'));

    System.assertNotEquals(null, res.get('records'));
    System.assertNotEquals(null, res.get('dynamicColumnsMeta'));
    System.assertNotEquals(null, res.get('totalsByField'));
  }

  @IsTest
  static void testGetRelatedRecordsWithProgram() {
    List<Program> ps = [SELECT Id FROM Program LIMIT 1];
    if (ps.isEmpty()) {
      testGetRelatedRecordsNoProgram();
      return;
    }

    Map<String, Object> res = Fatture.getRelatedRecords(
      null, // year
      null, // budgetId
      null, // month
      ps[0].Id, // programId
      null, // donorId
      null, // invoiceNumber
      10,
      0
    );

    List<Invoice__c> rows = (List<Invoice__c>) res.get('records');
    List<Fatture.FieldConf> meta = (List<Fatture.FieldConf>) res.get(
      'dynamicColumnsMeta'
    );
    Map<String, Decimal> totals = (Map<String, Decimal>) res.get(
      'totalsByField'
    );

    System.assertNotEquals(null, rows);
    System.assertNotEquals(null, meta);
    System.assertNotEquals(null, totals);

    /* Se almeno un record ha Totale_Fattura__c valorizzato
     la mappa dei totali DEVE contenere la chiave corrispondente. */
    Boolean hasValue = false;
    for (Invoice__c r : rows)
      if (r.Totale_Fattura__c != null) {
        hasValue = true;
        break;
      }

    if (hasValue) {
      System.assert(
        totals.containsKey('Totale_Fattura__c'),
        'totalsByField deve includere Totale_Fattura__c'
      );
    }
  }

  @IsTest
  static void testGetRelatedRecordsWithRefreshKey() {
    List<Program> ps = [SELECT Id FROM Program LIMIT 1];
    if (ps.isEmpty()) {
      testGetRelatedRecordsNoProgram();
      return;
    }

    // Usa la versione a 9 parametri (con refreshKey)
    Map<String, Object> res = Fatture.getRelatedRecords(
      null, // year
      null, // budgetId
      null, // month
      ps[0].Id, // programId
      null, // donorId
      null, // invoiceNumber
      5,
      0,
      'rk'
    );

    System.assertNotEquals(null, res);
    System.assert(res.containsKey('records'));
  }

  /*──────────────────── 2. lookup services ────────────────────*/

  @IsTest
  static void testGetAvailableYears() {
    List<String> anni = Fatture.getAvailableYears();
    System.assertNotEquals(null, anni);

    if (anni.size() > 1)
      for (Integer i = 1; i < anni.size(); i++)
        System.assert(
          anni[i].compareTo(anni[i - 1]) >= 0,
          'Anni non in ordine crescente'
        );
  }

  @IsTest
  static void testGetAvailableBudgets() {
    List<Fatture.IdNameWrapper> all = Fatture.getAvailableBudgets(null);
    System.assertNotEquals(null, all);
  }

  @IsTest
  static void testGetAvailablePrograms() {
    List<Fatture.IdNameWrapper> progs = Fatture.getAvailablePrograms();
    System.assertNotEquals(null, progs);
  }

  @IsTest
  static void testGetProgramsForBudget() {
    List<GiftDesignation> gds = [SELECT Id FROM GiftDesignation LIMIT 1];

    List<Fatture.IdNameWrapper> res = Fatture.getProgramsForBudget(
      gds.isEmpty() ? null : gds[0].Id
    );

    System.assertNotEquals(null, res);
  }

  @IsTest
  static void testGetAvailableDonors() {
    List<Fatture.IdNameWrapper> d = Fatture.getAvailableDonors();
    System.assertNotEquals(null, d);
  }

  /*──────────────────── 3. user budget ───────────────────────*/

  @IsTest
  static void testGetUserBudget() {
    Test.startTest();
    Fatture.BudgetWrapper bw = Fatture.getUserBudget();
    Test.stopTest();
    // nessuna ulteriore assert: basta che non lanci eccezioni
  }

  /*──────────────────── 4. deleteInvoice ─────────────────────*/

  @IsTest
  static void testDeleteInvoiceNull() {
    Boolean thrown = false;
    try {
      Fatture.deleteInvoice(null);
    } catch (AuraHandledException e) {
      thrown = true;
    }
    System.assertEquals(true, thrown, 'deleteInvoice(null) deve lanciare errore');
  }

  @IsTest
  static void testDeleteInvoiceInvalidIdType() {
    // Passa un Id di altro oggetto per forzare DmlException e coprire il catch
    Boolean thrown = false;
    try {
      Fatture.deleteInvoice(UserInfo.getUserId());
    } catch (AuraHandledException e) {
      thrown = true;
    }
    System.assertEquals(true, thrown, 'deleteInvoice con Id non valido deve lanciare errore');
  }
}