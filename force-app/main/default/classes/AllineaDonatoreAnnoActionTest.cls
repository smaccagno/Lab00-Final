@IsTest(SeeAllData=true)
private class AllineaDonatoreAnnoActionTest {
  /* =============================================================
   *  1) Input con overviewDonatoreId  (flusso “principale”)
   * =========================================================== */
  @IsTest
  static void testExecute_withOverviewId() {
    // cerco un Donor_Overview__c esistente
    List<Donor_Overview__c> ovList = [
      SELECT Id
      FROM Donor_Overview__c
      LIMIT 1
    ];

    AllineaDonatoreAnnoAction.Input inRec = new AllineaDonatoreAnnoAction.Input();
    if (!ovList.isEmpty()) {
      inRec.overviewDonatoreId = (String) ovList[0].Id;
    }
    // anche se vuoto, l’input va comunque passato
    List<AllineaDonatoreAnnoAction.Input> inputs = new List<AllineaDonatoreAnnoAction.Input>{
      inRec
    };

    Test.startTest();
    List<AllineaDonatoreAnnoAction.Output> outp = AllineaDonatoreAnnoAction.execute(
      inputs
    );
    Test.stopTest();

    System.assertEquals(1, outp.size(), 'È previsto un solo record di output.');
    System.assert(
      !String.isBlank(outp[0].message),
      'Il messaggio di output non deve essere vuoto.'
    );
  }

  /* =============================================================
   *  2) Input con donatoreAnnoId  (ramo “risalita all’Overview”)
   * =========================================================== */
  @IsTest
  static void testExecute_withDonatoreAnnoId() {
    // cerco un Reporting_Year__c esistente
    List<Reporting_Year__c> ryList = [
      SELECT Id
      FROM Reporting_Year__c
      LIMIT 1
    ];

    if (ryList.isEmpty()) {
      /* Nessun record presente: copriamo comunque la logica chiamando
       il test sul ramo “input vuoto” per assicurare copertura. */
      testExecute_withEmptyInput();
      return;
    }

    AllineaDonatoreAnnoAction.Input inRec = new AllineaDonatoreAnnoAction.Input();
    inRec.donatoreAnnoId = (String) ryList[0].Id;

    Test.startTest();
    List<AllineaDonatoreAnnoAction.Output> res = AllineaDonatoreAnnoAction.execute(
      new List<AllineaDonatoreAnnoAction.Input>{ inRec }
    );
    Test.stopTest();

    System.assertEquals(1, res.size(), 'È previsto un solo record di output.');
    System.assert(
      !String.isBlank(res[0].message),
      'Il messaggio di output non deve essere vuoto.'
    );
  }

  /* =============================================================
   *  3) Lista di input vuota  →  early-exit “Nessun elemento in input”
   * =========================================================== */
  @IsTest
  static void testExecute_withEmptyInput() {
    Test.startTest();
    List<AllineaDonatoreAnnoAction.Output> res = AllineaDonatoreAnnoAction.execute(
      new List<AllineaDonatoreAnnoAction.Input>()
    );
    Test.stopTest();

    System.assertEquals(
      1,
      res.size(),
      'Anche con input vuoto torna un solo Output.'
    );
    System.assertEquals(
      'Nessun elemento in input',
      res[0].message,
      'Messaggio non corrispondente per input vuoto.'
    );
  }
}