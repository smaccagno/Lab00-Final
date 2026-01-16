@IsTest(SeeAllData=true)
private class RetrieveDonatoreProgrammaTest {
  /**
   * 1)  ID nullo  →  ritorna wrapper “vuoto” (coverage ramo early-return)
   */
  @IsTest
  static void testGetRawRecords_NullId() {
    RetrieveDonatoreProgramma.DonatoreDataWrapper res = RetrieveDonatoreProgramma.getRawRecords(
      null
    );

    System.assertNotEquals(null, res, 'Wrapper non deve essere null');
    System.assertEquals(
      null,
      res.records,
      'records deve essere null con id nullo'
    );
    System.assertEquals(
      null,
      res.dynamicFields,
      'dynamicFields deve essere null con id nullo'
    );
  }

  /**
   * 2)  ID valido  →  records e (eventuali) dynamicFields popolati.
   *     Il test cerca un Donor_Overview__c collegato ad almeno
   *     un Reporting_Year__c che abbia Programma__c valorizzato;
   *     se in org non ce n’è nessuno, esegue comunque il metodo
   *     ma si limita a verificare che non lanci eccezioni.
   */
  @IsTest
  static void testGetRawRecords_ValidId() {
    /* — recupero un id adatto, se esiste — */
    List<Reporting_Year__c> ryWithProgram = [
      SELECT Donor_Overview__c
      FROM Reporting_Year__c
      WHERE Donor_Overview__c != NULL AND Programma__c != NULL
      LIMIT 1
    ];

    Id validParentId = ryWithProgram.isEmpty()
      ? null
      : ryWithProgram[0].Donor_Overview__c;

    Test.startTest();
    RetrieveDonatoreProgramma.DonatoreDataWrapper res = RetrieveDonatoreProgramma.getRawRecords(
      validParentId
    );
    Test.stopTest();

    /* -------- asserzioni di base -------- */
    System.assertNotEquals(null, res, 'Wrapper non deve essere null');

    if (validParentId == null) {
      // nessun dato idoneo in org: ci si aspetta wrapper “vuoto”
      System.assertEquals(
        null,
        res.records,
        'records deve essere null se non c’è un id valido'
      );
    } else {
      // dati trovati: verifico che i record siano popolati
      System.assertNotEquals(
        null,
        res.records,
        'records non deve essere null con id valido'
      );
      System.assert(
        !res.records.isEmpty(),
        'Deve esistere almeno un Reporting_Year__c restituito'
      );

      /* dynamicFields opzionali – se presenti, hanno fieldApi/label */
      if (res.dynamicFields != null) {
        for (ProgramFieldConfigUtil.FieldConf f : res.dynamicFields) {
          System.assertNotEquals(null, f.fieldApi, 'fieldApi popolato');
          System.assertNotEquals(null, f.label, 'label popolato');
        }
      }
    }
  }
}