@IsTest(SeeAllData=true)
private class TransazioniTest {
  /** 1) getRelatedRecords senza filtri **/
  @IsTest
  static void testGetRelatedRecords_NoFilters() {
    Map<String, Object> res = Transazioni.getRelatedRecords(null, null, null);
    // Verifico struttura della mappa
    System.assertNotEquals(null, res, 'La mappa non deve essere null');
    System.assert(res.containsKey('records'), 'Deve contenere "records"');
    System.assert(
      res.containsKey('totalOriginalDonation'),
      'Deve contenere "totalOriginalDonation"'
    );
    System.assert(
      res.containsKey('totalAllocations'),
      'Deve contenere "totalAllocations"'
    );
    System.assert(
      res.containsKey('totalAllocated'),
      'Deve contenere "totalAllocated"'
    );
    System.assert(
      res.containsKey('totalAllocatedNotPaid'),
      'Deve contenere "totalAllocatedNotPaid"'
    );
    System.assert(
      res.containsKey('totalAllocatedPaid'),
      'Deve contenere "totalAllocatedPaid"'
    );
    System.assert(
      res.containsKey('totalAllocable'),
      'Deve contenere "totalAllocable"'
    );
    System.assert(res.containsKey('query'), 'Deve contenere "query"');

    // Lista records non null
    List<GiftTransaction> recs = (List<GiftTransaction>) res.get('records');
    System.assertNotEquals(null, recs, 'La lista records non deve essere null');

    // Totali >= 0
    Decimal orig = (Decimal) res.get('totalOriginalDonation');
    Decimal allo = (Decimal) res.get('totalAllocations');
    Decimal allc = (Decimal) res.get('totalAllocated');
    Decimal notp = (Decimal) res.get('totalAllocatedNotPaid');
    Decimal paid = (Decimal) res.get('totalAllocatedPaid');
    Decimal alloc = (Decimal) res.get('totalAllocable');
    System.assert(orig >= 0, 'totalOriginalDonation >= 0');
    System.assert(allo >= 0, 'totalAllocations >= 0');
    System.assert(allc >= 0, 'totalAllocated >= 0');
    System.assert(notp >= 0, 'totalAllocatedNotPaid >= 0');
    System.assert(paid >= 0, 'totalAllocatedPaid >= 0');
    System.assert(alloc >= 0, 'totalAllocable >= 0');

    // La query inizia con SELECT
    String q = (String) res.get('query');
    System.assert(q.startsWith('SELECT'), 'La query deve iniziare con SELECT');
  }

  /** 2) getRelatedRecords con filtri anno, program e status **/
  @IsTest
  static void testGetRelatedRecords_WithFilters() {
    // Prelevo un esempio da GiftTransaction
    List<GiftTransaction> samples = [
      SELECT
        Id,
        TransactionDate,
        Programma__c,
        Status,
        Original_Donation_Amount__c,
        CurrentAmount,
        Total_Allocations__c,
        Totale_Allocato_NON_Pagato__c,
        Totale_Allocato_Pagato__c,
        Totale_Allocato__c
      FROM GiftTransaction
      WHERE Status != NULL AND TransactionDate != NULL AND Programma__c != NULL
      LIMIT 1
    ];
    if (samples.isEmpty()) {
      // Se non ci sono dati, mi aspetto lista vuota
      Map<String, Object> emptyRes = Transazioni.getRelatedRecords(
        '1900',
        '00D000000000001',
        'X'
      );
      List<GiftTransaction> emptyRecs = (List<GiftTransaction>) emptyRes.get(
        'records'
      );
      System.assertEquals(
        0,
        emptyRecs.size(),
        'Senza dati, records resta vuoto'
      );
      return;
    }

    GiftTransaction sample = samples[0];
    String yearStr = String.valueOf(sample.TransactionDate.year());
    String progShort = String.valueOf(sample.Programma__c).substring(0, 15);
    String statusVal = sample.Status;

    // Invoco il metodo con i filtri ottenuti
    Map<String, Object> res = Transazioni.getRelatedRecords(
      yearStr,
      progShort,
      statusVal
    );

    List<GiftTransaction> filtered = (List<GiftTransaction>) res.get('records');
    System.assert(
      filtered.size() > 0,
      'Almeno un record deve superare i filtri'
    );

    // Verifico che ogni record rispetti i filtri
    for (GiftTransaction gt : filtered) {
      System.assertEquals(
        Integer.valueOf(yearStr),
        gt.TransactionDate.year(),
        'Anno di TransactionDate corrisponde'
      );
      String actualProg = String.valueOf(gt.Programma__c).substring(0, 15);
      System.assertEquals(
        progShort,
        actualProg,
        'Programma__c prefix corrisponde'
      );
      System.assertEquals(statusVal, gt.Status, 'Status corrisponde');
    }

    // La query di debug contiene i filtri
    String q = (String) res.get('query');
    System.assert(q.contains('WHERE'), 'La query deve contenere WHERE');
    System.assert(
      q.contains('CALENDAR_YEAR'),
      'La query deve filtrare l\'anno'
    );
    System.assert(
      q.contains('Programma__c'),
      'La query deve filtrare Programma__c'
    );
    System.assert(q.contains('Status'), 'La query deve filtrare Status');
  }

  /** 3) getAvailableYears restituisce anni unici ordinati **/
  @IsTest
  static void testGetAvailableYears() {
    List<String> yrs = Transazioni.getAvailableYears();
    System.assertNotEquals(null, yrs, 'La lista anni non deve essere null');
    if (yrs.size() > 1) {
      for (Integer i = 1; i < yrs.size(); i++) {
        System.assert(
          yrs[i].compareTo(yrs[i - 1]) >= 0,
          'La lista anni deve essere ordinata'
        );
      }
    }
  }

  /** 4) getAvailablePrograms restituisce tutti i Program ordinati **/
  @IsTest
  static void testGetAvailablePrograms() {
    List<Program> progs = Transazioni.getAvailablePrograms();
    System.assertNotEquals(
      null,
      progs,
      'La lista programs non deve essere null'
    );
    Integer expected = [SELECT COUNT() FROM Program];
    System.assertEquals(
      expected,
      progs.size(),
      'Il numero di programmi deve corrispondere al COUNT()'
    );
  }
}