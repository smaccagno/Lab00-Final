@IsTest(SeeAllData=true)
private class InvoiceStaticValuesUpdaterTest {
  /*────────────────────────────────────────────────────────────
   * 1) invoke – lista null e lista vuota
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testInvoke_NullOrEmpty() {
    Test.startTest();
    InvoiceStaticValuesUpdater.invoke(null);

    InvoiceStaticValuesUpdater.invoke(
      new List<InvoiceStaticValuesUpdater.ProgramIdWrapper>()
    );
    Test.stopTest();
  }

  /*────────────────────────────────────────────────────────────
   * 2) invoke – con Program (se esiste)
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testInvoke_WithProgramId() {
    List<Program> progs = [SELECT Id FROM Program LIMIT 1];
    if (progs.isEmpty())
      return;

    InvoiceStaticValuesUpdater.ProgramIdWrapper w = new InvoiceStaticValuesUpdater.ProgramIdWrapper();
    w.programId = progs[0].Id;

    Test.startTest();
    InvoiceStaticValuesUpdater.invoke(
      new List<InvoiceStaticValuesUpdater.ProgramIdWrapper>{ w }
    );
    Test.stopTest();
  }

  /*────────────────────────────────────────────────────────────
   * 3) updateStaticValues(Set<Id>) – set nullo e set vuoto
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testUpdateStaticValues_NullEmpty() {
    Test.startTest();
    InvoiceStaticValuesUpdater.updateStaticValues((Set<Id>) null);
    InvoiceStaticValuesUpdater.updateStaticValues(new Set<Id>());
    Test.stopTest();
  }

  /*────────────────────────────────────────────────────────────
   * 4) updateStaticValues(Set<Id>) – con Program (se esiste)
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testUpdateStaticValues_WithSet() {
    List<Program> progs = [SELECT Id FROM Program LIMIT 1];
    if (progs.isEmpty())
      return;

    Test.startTest();
    InvoiceStaticValuesUpdater.updateStaticValues(new Set<Id>{ progs[0].Id });
    Test.stopTest();
  }

  /*────────────────────────────────────────────────────────────
   * 5) updateStaticValues(Id) – Id nullo e Id valido
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testUpdateStaticValues_SingleId() {
    List<Program> progs = [SELECT Id FROM Program LIMIT 1];

    Test.startTest();
    // caso Id nullo
    InvoiceStaticValuesUpdater.updateStaticValues((Id) null);

    // caso Id valido, se esiste
    if (!progs.isEmpty())
      InvoiceStaticValuesUpdater.updateStaticValues(progs[0].Id);

    Test.stopTest();
  }
}