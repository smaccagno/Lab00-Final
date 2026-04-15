@IsTest(SeeAllData=true)
private class GiftAllocationControllerTest {
  /*────────────────────────────────────────────────────────────
   * 1) getBudgets – parametro nullo  → lista vuota
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testGetBudgets_NullProgramId() {
    List<GiftAllocationController.IdLabel> res = GiftAllocationController.getBudgets(
      null
    );

    System.assertNotEquals(null, res, 'La lista non deve essere null.');
    System.assertEquals(0, res.size(), 'Con programId = null lista vuota.');
  }

  /*────────────────────────────────────────────────────────────
   * 2) getBudgets – con Program valido (se esiste)
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testGetBudgets_WithProgram() {
    List<Program> progs = [SELECT Id FROM Program LIMIT 1];
    if (progs.isEmpty()) {
      // Nessun Program → casi coperti dal test precedente
      return;
    }

    List<GiftAllocationController.IdLabel> res = GiftAllocationController.getBudgets(
      progs[0].Id
    );

    System.assertNotEquals(null, res, 'La lista non deve essere null.');

    // Se esistono record, value e label non devono essere vuoti
    if (!res.isEmpty()) {
      GiftAllocationController.IdLabel first = res[0];
      System.assertNotEquals(null, first.value, 'value non null');
      System.assert(!String.isBlank(first.label), 'label non blank');
    }
  }

  /*────────────────────────────────────────────────────────────
   * 3) getCurrentAmount – parametro nullo  → 0
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testGetCurrentAmount_NullId() {
    Decimal amt = GiftAllocationController.getCurrentAmount(null);
    System.assertEquals(0, amt, 'Con Id null il metodo restituisce 0.');
  }

  /*────────────────────────────────────────────────────────────
   * 4) getCurrentAmount – con GiftTransaction valido (se esiste)
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testGetCurrentAmount_WithId() {
    List<GiftTransaction> gts = [
      SELECT Id, CurrentAmount
      FROM GiftTransaction
      LIMIT 1
    ];

    if (gts.isEmpty()) {
      // Org senza GiftTransaction: il ramo “null” è già testato
      return;
    }

    GiftTransaction gt = gts[0];

    Decimal expected = (gt.CurrentAmount == null) ? 0 : gt.CurrentAmount;

    Decimal res = GiftAllocationController.getCurrentAmount(gt.Id);

    System.assertEquals(
      expected,
      res,
      'CurrentAmount restituito non coerente con il DB.'
    );
  }
}