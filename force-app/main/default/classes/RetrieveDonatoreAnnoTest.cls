@IsTest(SeeAllData=true)
private class RetrieveDonatoreAnnoTest {
  @IsTest
  static void testGetRecords() {
    /*───────────────────────────────────────────
     * 1) cerco un Reporting_Year__c con Programma__c valorizzato
     *───────────────────────────────────────────*/
    List<Reporting_Year__c> sample = [
      SELECT Id
      FROM Reporting_Year__c
      WHERE Programma__c != NULL
      LIMIT 1
    ];

    /*───────────────────────────────────────────
     * 2) ramo “id nullo”  (nessun dato in org)
     *───────────────────────────────────────────*/
    if (sample.isEmpty()) {
      RetrieveDonatoreAnno.ResultWrapper emptyRes = RetrieveDonatoreAnno.getRecords(
        null
      );

      System.assertNotEquals(
        null,
        emptyRes,
        'Wrapper non deve essere null con id nullo'
      );
      System.assertEquals(
        null,
        emptyRes.rawRecords,
        'rawRecords deve essere null con id nullo'
      );
      return; // copertura già ottenuta
    }

    /*───────────────────────────────────────────
     * 3) ramo “id valido”  (dati presenti)
     *───────────────────────────────────────────*/
    Id ryId = sample[0].Id;

    Test.startTest();
    RetrieveDonatoreAnno.ResultWrapper res = RetrieveDonatoreAnno.getRecords(
      ryId
    );
    Test.stopTest();

    /* ---------- asserzioni base ---------- */
    System.assertNotEquals(null, res, 'Wrapper non null');
    System.assertNotEquals(null, res.rawRecords, 'rawRecords non null');
    // almeno 1 record e nessun accesso a campi non selezionati
    System.assert(
      !res.rawRecords.isEmpty(),
      'rawRecords deve contenere almeno un elemento'
    );

    /* ---------- dynamicFields opzionale ---------- */
    if (res.dynamicFields != null) {
      for (ProgramFieldConfigUtil.FieldConf fc : res.dynamicFields) {
        System.assertNotEquals(null, fc.fieldApi, 'fieldApi non null');
        System.assertNotEquals(null, fc.label, 'label non null');
      }
    }
  }
}