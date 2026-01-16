@IsTest
private class ProgramAlignmentConsoleServiceTest {
  /**
   * Il metodo deve:
   *  • eseguire senza eccezioni;
   *  • accodare esattamente un job Queueable
   *    (AlignActiveProgramsQueueable).
   */
  @IsTest
  static void testStartAlignment_enqueuesJob() {
    /* ─────────────────────────────
     *  Setup “best-effort” (opzionale)
     * ─────────────────────────────
     * Inseriamo un Program ‘Attivo’ così, se il Queueable
     * dovesse partire durante il test, trova almeno un record.
     * Se l’oggetto Program avesse altri campi obbligatori ignoti
     * l’insert fallirebbe, ma la prova di enqueue rimarrebbe valida.
     */
    try {
      insert new Program(Name = 'UT-Program', Status = 'Attivo');
    } catch (Exception ignore) {
      /* non blocca il test */
    }

    /* ─────────────────────────────
     *  Esercizio del metodo da testare
     * ───────────────────────────── */
    Test.startTest();
    ProgramAlignmentConsoleService.startAlignment();
    /* Il job è stato accodato nella transazione corrente */
    Integer jobsQueued = Limits.getQueueableJobs();
    Test.stopTest();

    /* ─────────────────────────────
     *  Asserzioni
     * ───────────────────────────── */
    System.assertEquals(
      1,
      jobsQueued,
      'Deve essere accodato un solo Queueable job'
    );
  }
}