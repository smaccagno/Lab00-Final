@IsTest(SeeAllData=true)
private class DistribuzioniTest {
  /*──────────────────────────── 1) getRelatedRecords senza filtri ───────────────────────────*/
  @IsTest
  static void testGetRelatedRecordsNoFilters() {
    Map<String, Object> res = Distribuzioni.getRelatedRecords(
      null,
      null,
      null,
      null
    );

    System.assertNotEquals(null, res, 'La mappa non è null');
    System.assert(res.containsKey('records'), 'records presente');
    System.assert(res.containsKey('totalPaid'), 'totalPaid presente');
    System.assert(
      res.containsKey('totalDistributed'),
      'totalDistributed presente'
    );
    System.assert(res.containsKey('query'), 'query presente');

    List<Map<String, Object>> recs = (List<Map<String, Object>>) res.get(
      'records'
    );
    System.assertNotEquals(null, recs, 'records non null');

    /* se esistono righe, devono avere lo StatusLabel calcolato */
    if (!recs.isEmpty()) {
      System.assert(
        recs[0].containsKey('StatusLabel'),
        'Ogni riga deve contenere StatusLabel'
      );
    }

    Decimal paid = (Decimal) res.get('totalPaid');
    Decimal dist = (Decimal) res.get('totalDistributed');
    System.assert(paid >= 0, 'totalPaid ≥ 0');
    System.assert(dist >= 0, 'totalDistributed ≥ 0');

    String q = (String) res.get('query');
    System.assert(q.startsWith('SELECT'), 'La query inizia con SELECT');
  }

  /*──────────────────────────── 2) getRelatedRecords con filtri ─────────────────────────────*/
  @IsTest
  static void testGetRelatedRecordsWithFilters() {
    /* §1 – cerco un GTD esistente per ricavare i filtri */
    List<GiftTransactionDesignation> gtds = [
      SELECT
        Id,
        Anno_Distribuzione__c,
        Programma__c,
        Status__c,
        GiftDesignationId
      FROM GiftTransactionDesignation
      WHERE Status__c != NULL
      LIMIT 1
    ];

    /* §1-bis – org senza dati: il metodo deve comunque funzionare */
    if (gtds.isEmpty()) {
      Map<String, Object> vuoto = Distribuzioni.getRelatedRecords(
        '2020',
        '00D000000000001',
        'X',
        '000000000000001'
      );
      List<Map<String, Object>> rows = (List<Map<String, Object>>) vuoto.get(
        'records'
      );
      System.assertEquals(0, rows.size(), 'Senza dati la lista è vuota');
      return;
    }

    /* §2 – filtri reali */
    GiftTransactionDesignation g = gtds[0];
    String year = g.Anno_Distribuzione__c;
    String prog15 = String.valueOf(g.Programma__c).substring(0, 15);
    String status = g.Status__c;
    String budget = (String) g.GiftDesignationId;

    /* §3 – invocazione metodo */
    Map<String, Object> res = Distribuzioni.getRelatedRecords(
      year,
      prog15,
      status,
      budget
    );

    /* §4 – verifica risultati */
    List<Map<String, Object>> rows = (List<Map<String, Object>>) res.get(
      'records'
    );
    System.assert(rows.size() > 0, 'Almeno un record atteso');

    for (Map<String, Object> row : rows) {
      System.assertEquals(
        prog15,
        String.valueOf(row.get('Programma__c')).substring(0, 15),
        'Programma conforme'
      );
      System.assertEquals(status, row.get('Status__c'), 'Status conforme');
    }

    /* §5 – controlli sulla query per debug */
    String q = (String) res.get('query');
    System.assert(q.contains('WHERE'), 'Presenza WHERE');
    System.assert(q.contains('Anno_Distribuzione__c'), 'Filtro anno');
    System.assert(q.contains('Programma__c'), 'Filtro programma');
    System.assert(q.contains('Status__c'), 'Filtro status');
    System.assert(q.contains('GiftDesignationId'), 'Filtro budget');
  }

  /*──────────────────────────── 3) getBudgetIdForCurrentUser ───────────────────────────────*/
  @IsTest
  static void testGetBudgetIdForCurrentUser() {
    /* Deve restituire null o un BudgetWrapper, ma mai lanciare eccezioni. */
    Test.startTest();
    Distribuzioni.BudgetWrapper bw = Distribuzioni.getBudgetIdForCurrentUser();
    Test.stopTest();
    /* nessuna assert: interessa solo che non esploda */
  }

  /*──────────────────────────── 4) getAvailableYears ───────────────────────────────────────*/
  @IsTest
  static void testGetAvailableYears() {
    List<String> yrs = Distribuzioni.getAvailableYears();
    System.assertNotEquals(null, yrs, 'Lista anni non null');

    /* verifica ordinamento crescente */
    if (yrs.size() > 1) {
      for (Integer i = 1; i < yrs.size(); i++) {
        System.assert(
          yrs[i].compareTo(yrs[i - 1]) >= 0,
          'Anni in ordine crescente'
        );
      }
    }
  }

  /*──────────────────────────── 5) getAvailablePrograms ───────────────────────────────────*/
  @IsTest
  static void testGetAvailablePrograms() {
    /* a) budgetId null → tutti i Program */
    Map<String, Object> allMap = Distribuzioni.getAvailablePrograms(null);
    List<Program> allProg = (List<Program>) allMap.get('records');
    Integer total = [SELECT COUNT() FROM Program];
    System.assertEquals(
      total,
      allProg.size(),
      'Con budgetId null ottengo tutti i Program'
    );

    /* b) budgetId inesistente → lista vuota */
    Map<String, Object> emptyMap = Distribuzioni.getAvailablePrograms(
      '000000000000001'
    );
    List<Program> emptyProg = (List<Program>) emptyMap.get('records');
    System.assertEquals(
      0,
      emptyProg.size(),
      'Con budgetId fittizio la lista è vuota'
    );
  }

  /*──────────────────────────── 6) getAvailableStatuses ───────────────────────────────────*/
  @IsTest
  static void testGetAvailableStatuses() {
    List<Distribuzioni.PicklistItem> sts = Distribuzioni.getAvailableStatuses();
    System.assertNotEquals(null, sts, 'Lista status non null');

    Integer expected = GiftTransactionDesignation.Status__c
      .getDescribe()
      .getPicklistValues()
      .size();
    System.assertEquals(expected, sts.size(), 'Numero status corretto');

    /* ogni item deve avere value e label non blank */
    for (Distribuzioni.PicklistItem it : sts) {
      System.assert(!String.isBlank(it.value), 'value non blank');
      System.assert(!String.isBlank(it.label), 'label non blank');
    }
  }
}