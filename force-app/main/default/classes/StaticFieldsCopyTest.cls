@IsTest(SeeAllData=true)
private class StaticFieldsCopyTest {
  /* ───────────────────────────── 1) Nessun filtro ───────────────────────── */
  @IsTest
  static void testCopiaValori_NoParams() {
    StaticFieldsCopy.InputWrapper iw = new StaticFieldsCopy.InputWrapper();
    List<StaticFieldsCopy.InputWrapper> inputs = new List<StaticFieldsCopy.InputWrapper>{
      iw
    };

    Test.startTest();
    List<StaticFieldsCopy.OutputWrapper> outs = StaticFieldsCopy.copiaValori(
      inputs
    );
    Test.stopTest();

    System.assertEquals(1, outs.size(), 'Un solo OutputWrapper atteso');
    System.assertEquals('Copia completata', outs[0].message);
  }

  /* ───────────────────── 2) Con recordId + programId (se presenti) ─────────────────── */
  @IsTest
  static void testCopiaValori_WithFilters() {
    /* ►  Program – uso LIST per evitare QueryException  */
    List<Program> progs = [SELECT Id FROM Program LIMIT 1];
    if (progs.isEmpty()) {
      System.debug('⚠️  Nessun Program presente: test skipped');
      return; // nessun dato ⇒ il ramo con filtri non è testabile
    }
    Id progId = progs[0].Id;

    /* ►  Anno_Reportistica__c legato al Program (se esiste)  */
    List<Anno_Reportistica__c> anni = [
      SELECT Id
      FROM Anno_Reportistica__c
      WHERE Programma__c = :progId
      LIMIT 1
    ];
    if (anni.isEmpty()) {
      System.debug('⚠️  Nessun Anno_Reportistica__c collegato: test skipped');
      return;
    }
    Id annoId = anni[0].Id;

    /* ►  Invocazione con filtri  */
    StaticFieldsCopy.InputWrapper iw = new StaticFieldsCopy.InputWrapper();
    iw.programId = progId;
    iw.recordId = annoId;

    List<StaticFieldsCopy.InputWrapper> inputs = new List<StaticFieldsCopy.InputWrapper>{
      iw
    };

    Test.startTest();
    List<StaticFieldsCopy.OutputWrapper> outs = StaticFieldsCopy.copiaValori(
      inputs
    );
    Test.stopTest();

    System.assertEquals(1, outs.size(), 'Un solo OutputWrapper atteso');
    System.assertEquals('Copia completata', outs[0].message);
  }
}