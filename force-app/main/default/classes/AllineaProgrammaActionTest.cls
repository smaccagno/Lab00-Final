@IsTest(SeeAllData=true)
private class AllineaProgrammaActionTest {
  /*=============================================================
   * 1) ProgramId valido  →  percorso principale
   *===========================================================*/
  @IsTest
  static void testRun_withValidProgramId() {
    /* recupera un Program esistente (basta il primo) */
    List<Program> progList = [SELECT Id FROM Program LIMIT 1];
    if (progList.isEmpty()) {
      /* nessun Program nell’org → esegui il test di fallback */
      testRun_withBlankProgramId();
      return;
    }

    AllineaProgrammaAction.Input inRec = new AllineaProgrammaAction.Input();
    inRec.programId = (String) progList[0].Id;

    Test.startTest();
    List<AllineaProgrammaAction.Output> res = AllineaProgrammaAction.run(
      new List<AllineaProgrammaAction.Input>{ inRec }
    );
    Test.stopTest();

    System.assertEquals(1, res.size());

    String msg = res[0].message;
    /* Il messaggio deve citare tutte e tre le parti del riepilogo */
    System.assert(
      msg.contains('Overview allineati') &&
        msg.contains('Budget allineati') &&
        msg.contains('Fatture aggiornate'),
      'Messaggio di esito non coerente: ' + msg
    );
  }

  /*=============================================================
   * 2) ProgramId vuoto  →  “ProgramId vuoti o non validi”
   *===========================================================*/
  @IsTest
  static void testRun_withBlankProgramId() {
    AllineaProgrammaAction.Input inRec = new AllineaProgrammaAction.Input();
    inRec.programId = ''; // stringa vuota ⇒ set programIds sarà vuoto

    Test.startTest();
    List<AllineaProgrammaAction.Output> res = AllineaProgrammaAction.run(
      new List<AllineaProgrammaAction.Input>{ inRec }
    );
    Test.stopTest();

    System.assertEquals(1, res.size());
    System.assertEquals('ProgramId vuoti o non validi', res[0].message);
  }

  /*=============================================================
   * 3) Lista input vuota  →  “Nessun ProgramId fornito”
   *===========================================================*/
  @IsTest
  static void testRun_withEmptyInputList() {
    Test.startTest();
    List<AllineaProgrammaAction.Output> res = AllineaProgrammaAction.run(
      new List<AllineaProgrammaAction.Input>()
    );
    Test.stopTest();

    System.assertEquals(1, res.size());
    System.assertEquals('Nessun ProgramId fornito', res[0].message);
  }
}