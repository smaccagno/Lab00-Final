@IsTest(SeeAllData=true)
private class ReportingYearEnd2EndActionTest {
  /*────────────────────────────────────────────────────────────
   * 1) Nessun anno fornito  →  messaggio “Nessun anno fornito”
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testRun_NoYear() {
    // caso lista vuota
    List<ReportingYearEnd2EndAction.Output> res1 = ReportingYearEnd2EndAction.run(
      new List<ReportingYearEnd2EndAction.Input>()
    );

    System.assertEquals(1, res1.size());
    System.assertEquals(
      'Nessun anno fornito',
      res1[0].message,
      'Messaggio atteso con lista input vuota'
    );

    // caso anno blank
    ReportingYearEnd2EndAction.Input inBlank = new ReportingYearEnd2EndAction.Input();
    inBlank.yearName = ' ';
    List<ReportingYearEnd2EndAction.Output> res2 = ReportingYearEnd2EndAction.run(
      new List<ReportingYearEnd2EndAction.Input>{ inBlank }
    );

    System.assertEquals(1, res2.size());
    System.assertEquals(
      'Nessun anno fornito',
      res2[0].message,
      'Messaggio atteso con anno blank'
    );
  }

  /*────────────────────────────────────────────────────────────
   * 2) Anno valido  →  due possibili rami:
   *      a) Nessun Program “Attivo”  →  messaggio specifico
   *      b) Almeno un Program “Attivo”  →  esecuzione completa
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testRun_WithYear() {
    // anno di test (non rilevante: la logica usa solo la stringa)
    String yr = String.valueOf(Date.today().year());

    ReportingYearEnd2EndAction.Input inp = new ReportingYearEnd2EndAction.Input();
    inp.yearName = yr;
    List<ReportingYearEnd2EndAction.Input> inList = new List<ReportingYearEnd2EndAction.Input>{
      inp
    };

    // verifichiamo quanti Program “Attivo” esistono
    List<Program> activeProgs = [
      SELECT Id
      FROM Program
      WHERE Status = 'Attivo'
      LIMIT 1
    ];

    Test.startTest();
    List<ReportingYearEnd2EndAction.Output> outp = ReportingYearEnd2EndAction.run(
      inList
    );
    Test.stopTest();

    System.assertEquals(
      1,
      outp.size(),
      'L’Invocable deve restituire un solo Output.'
    );
    String msg = outp[0].message;

    if (activeProgs.isEmpty()) {
      System.assertEquals(
        'Nessun Program attivo trovato',
        msg,
        'Messaggio atteso quando non ci sono Program attivi.'
      );
    } else {
      /* In presenza di Program attivi il messaggio può variare
               in base ai dati (anni creati, overview / budget creati,
               oppure “Nessun Account con tipo …”).  Ci limitiamo a
               verificare che NON sia vuoto. */
      System.assert(
        !String.isBlank(msg),
        'Messaggio di esito non deve essere vuoto.'
      );
    }
  }
}