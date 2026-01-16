@IsTest(SeeAllData=true)
private class DonazioniTest {
  /**
   * 1) getRelatedRecords con anno vuoto: usa l’anno corrente,
   *    verifica che i totali corrispondano alle somme effettive.
   */
  @IsTest
  static void testGetRelatedRecordsDefaultYear() {
    String currentYear = String.valueOf(Date.today().year());
    // Chiamo con stringa vuota per innescare l’uso di currentYear
    Map<String, Object> res = Donazioni.getRelatedRecords('');

    // Recupero i record restituiti
    List<GiftEntry> recs = (List<GiftEntry>) res.get('records');
    System.assertNotEquals(null, recs, 'La lista records non deve essere null');

    // Calcolo in test le somme attese
    Decimal expectedOriginal = 0;
    Decimal expectedGift = 0;
    for (GiftEntry ge : recs) {
      expectedOriginal += ge.Original_Donation_Amount__c;
      expectedGift += ge.GiftAmount;
    }

    // Verifico che i totali restituiti combacino
    System.assertEquals(
      expectedOriginal,
      (Decimal) res.get('totalPaid'),
      'totalPaid deve sommare Original_Donation_Amount__c'
    );
    System.assertEquals(
      expectedGift,
      (Decimal) res.get('totalDistributed'),
      'totalDistributed deve sommare GiftAmount'
    );
  }

  /**
   * 2) getRelatedRecords con anno che non esiste → lista vuota e totali zero
   */
  @IsTest
  static void testGetRelatedRecordsNoMatchYear() {
    // Un anno improbabile
    Map<String, Object> res = Donazioni.getRelatedRecords('1900');

    List<GiftEntry> recs = (List<GiftEntry>) res.get('records');
    System.assertNotEquals(null, recs, 'La lista records non deve essere null');
    System.assertEquals(0, recs.size(), 'Nessun record per anno 1900');

    System.assertEquals(
      0,
      (Decimal) res.get('totalPaid'),
      'totalPaid deve essere 0 se non ci sono record'
    );
    System.assertEquals(
      0,
      (Decimal) res.get('totalDistributed'),
      'totalDistributed deve essere 0 se non ci sono record'
    );
  }

  /**
   * 3) getAvailableYears: restituisce lista (anche vuota) di anni
   */
  @IsTest
  static void testGetAvailableYears() {
    List<String> yrs = Donazioni.getAvailableYears();
    System.assertNotEquals(null, yrs, 'La lista years non può essere null');
    // Se ci sono più anni, verifico che siano ordinati
    if (yrs.size() > 1) {
      for (Integer i = 1; i < yrs.size(); i++) {
        System.assert(
          yrs[i].compareTo(yrs[i - 1]) >= 0,
          'Gli anni devono essere ordinati in modo crescente'
        );
      }
    }
  }
}