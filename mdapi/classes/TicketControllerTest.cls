@IsTest(SeeAllData=true)
private class TicketControllerTest {
  /*──────────────────────── UTIL ────────────────────────*/
  /** Restituisce il primo valore di pick-list (o null). */
  private static String pickFirst(Schema.SObjectField f) {
    List<Schema.PicklistEntry> vals = f.getDescribe().getPicklistValues();
    return vals.isEmpty() ? null : vals[0].getValue();
  }

  /*──────────────── 1) getBudgetId ──────────────────────*/
  @IsTest
  static void testGetBudgetId() {
    Test.startTest();
    TicketController.BudgetWrapper bw = TicketController.getBudgetId();
    Test.stopTest();

    if (bw != null) {
      System.assertEquals(
        18,
        bw.value.length(),
        'value deve contenere Id Salesforce di 18 char'
      );
      Id bid = (Id) bw.value;
      System.assertEquals(
        GiftDesignation.sObjectType,
        bid.getSObjectType(),
        'value deve riferirsi a GiftDesignation'
      );
      System.assertNotEquals(null, bw.isDefault);
    }
  }

  /*────────────── 2) getRelatedRecords – no filtri ──────*/
  @IsTest
  static void testGetRelatedRecords_NoFilters() {
    Map<String, Object> res = TicketController.getRelatedRecords(
      null,
      null,
      null,
      null, // year, month, invoice, budget
      5,
      0, // limit, offset
      null,
      null,
      null, // city, province, region
      null // 👉 nuovo parametro: type
    );

    for (
      String k : new List<String>{
        'records',
        'totalUses',
        'totalAmount',
        'query'
      }
    )
      System.assert(res.containsKey(k));

    System.assertNotEquals(null, res.get('records'));
    System.assert(((Decimal) res.get('totalUses')) >= 0);
    System.assert(((Decimal) res.get('totalAmount')) >= 0);
    System.assert(((String) res.get('query')).contains('LIMIT 5'));
  }

  @IsTest
  static void testGetRelatedRecords_WithFilters() {
    List<Ticket__c> tks = [
      SELECT
        Id,
        Invoice__r.Invoice_Number__c,
        Invoice__r.Budget__c,
        Show__r.Datetime__c,
        City__c,
        Province__c,
        Region__c,
        Type__c
      FROM Ticket__c
      WHERE Invoice__c != NULL
      LIMIT 1
    ];
    if (tks.isEmpty())
      return;

    Ticket__c t = tks[0];
    DateTime dt = t.Show__r.Datetime__c;
    String year = String.valueOf(dt.year());
    String month = String.valueOf(dt.month());
    String invNo = t.Invoice__r.Invoice_Number__c;
    String budId = (String) t.Invoice__r.Budget__c;
    String city = t.City__c;
    String prov = t.Province__c;
    String reg = t.Region__c;
    String typ = t.Type__c;

    Map<String, Object> res = TicketController.getRelatedRecords(
      year,
      month,
      invNo,
      budId,
      2,
      0,
      city,
      prov,
      reg,
      typ // 👉 nuovo parametro: type
    );

    String q = (String) res.get('query');
    System.assert(q.contains('CALENDAR_YEAR'));
    System.assert(q.contains('CALENDAR_MONTH'));
    System.assert(q.contains('Invoice_Number__c LIKE'));
    System.assert(q.contains('Budget__c'));
    System.assert(q.contains('City__c'));
    System.assert(q.contains('Province__c'));
    System.assert(q.contains('Region__c'));
    System.assert(q.contains('Type__c')); // 👉 nuovo check
  }

  /*──────────────── 4) getAvailableYears ─────────────────*/
  @IsTest
  static void testGetAvailableYears() {
    List<String> yrs = TicketController.getAvailableYears();
    System.assertNotEquals(null, yrs, 'La lista non deve essere null');

    /* rimuovi eventuali null */
    List<String> clean = new List<String>();
    for (String y : yrs)
      if (y != null)
        clean.add(y);

    /* verifica ordinamento crescente solo sui valori non-null */
    if (clean.size() > 1) {
      for (Integer i = 1; i < clean.size(); i++) {
        System.assert(
          clean[i].compareTo(clean[i - 1]) >= 0,
          'Anni non ordinati: ' + clean
        );
      }
    }
  }

  /*──────────────── 5) getAvailableBudgets ───────────────*/
  @IsTest
  static void testGetAvailableBudgets() {
    List<TicketController.IdLabelPair> buds = TicketController.getAvailableBudgets();
    System.assertNotEquals(null, buds);
    if (!buds.isEmpty()) {
      System.assertNotEquals(null, buds[0].value);
      System.assertNotEquals(null, buds[0].label);
    }
  }

  /*──────────────── 6) getAllComuni ──────────────────────*/
  @IsTest
  static void testGetAllComuni() {
    List<TicketController.ComuneWrapper> comuni = TicketController.getAllComuni();
    System.assertNotEquals(null, comuni);
    if (!comuni.isEmpty()) {
      TicketController.ComuneWrapper c = comuni[0];
      System.assertNotEquals(null, c.id);
      System.assertNotEquals(null, c.name);
    }
  }
}