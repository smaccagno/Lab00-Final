@IsTest(SeeAllData=true)
private class AssegnazioneFattureADonatoreTest {
  /*────────────────────────────────────────────
   * 1) getAllDataForLWC  – senza parametri
   *───────────────────────────────────────────*/
  @IsTest
  static void testGetAllData_NoParams() {
    Test.startTest();
    AssegnazioneFattureADonatore.MyWrapper w = AssegnazioneFattureADonatore.getAllDataForLWC();
    Test.stopTest();

    /* wrapper e tutte le sue collezioni devono esistere               */
    System.assertNotEquals(null, w);
    System.assertNotEquals(null, w.programList);
    System.assertNotEquals(null, w.annoReportisticaList);
    System.assertNotEquals(null, w.giftDesignationList);
    System.assertNotEquals(null, w.budgetList);
    System.assertNotEquals(null, w.reportingYearList);
    System.assertNotEquals(null, w.giftTransactionDesignationList);
    System.assertNotEquals(null, w.invoiceList);
    System.assertNotEquals(null, w.invoiceTotalsByRyYear);
    System.assertNotEquals(null, w.enrolledAccountIds);
    System.assertNotEquals(null, w.fieldConfig);

    /* stringhe di debug non vuote                                     */
    System.assert(!String.isBlank(w.gtdQueryString));
    System.assert(!String.isBlank(w.invoiceQueryString));
  }

  /*────────────────────────────────────────────
   * 2) getAllDataForLWCWithParams – con filtri
   *───────────────────────────────────────────*/
  @IsTest
  static void testGetAllData_WithParams() {
    /* a) Program obbligatorio                                         */
    List<Program> progList = [SELECT Id FROM Program LIMIT 1];
    if (progList.isEmpty()) {
      /*   org priva di dati – invoca comunque il metodo a null      */
      Test.startTest();
      AssegnazioneFattureADonatore.MyWrapper emptyW = AssegnazioneFattureADonatore.getAllDataForLWCWithParams(
        null,
        null,
        null
      );
      Test.stopTest();
      System.assertNotEquals(null, emptyW);
      return;
    }
    Id progId = progList[0].Id;

    /* b) GiftDesignation legata al Program (se esiste)                */
    Id gdId = null;
    List<GiftDesignation> gds = [
      SELECT Id
      FROM GiftDesignation
      WHERE Program__c = :progId
      LIMIT 1
    ];
    if (!gds.isEmpty())
      gdId = gds[0].Id;

    /* c) Anno_Reportistica legato al Program (se esiste)              */
    String anno = null;
    List<Anno_Reportistica__c> ars = [
      SELECT Name
      FROM Anno_Reportistica__c
      WHERE Programma__c = :progId
      LIMIT 1
    ];
    if (!ars.isEmpty())
      anno = ars[0].Name;

    /* d) Invocazione                                                  */
    Test.startTest();
    AssegnazioneFattureADonatore.MyWrapper w = AssegnazioneFattureADonatore.getAllDataForLWCWithParams(
      progId,
      gdId,
      anno
    );
    Test.stopTest();

    /* wrapper non null & fieldConfig valorizzato                      */
    System.assertNotEquals(null, w);
    System.assertNotEquals(null, w.fieldConfig);
    System.assertNotEquals(null, w.invoiceTotalsByRyYear);

    /* enrolledAccountIds deve esistere sempre                         */
    System.assertNotEquals(null, w.enrolledAccountIds);

    /* debug strings                                                   */
    System.assert(
      w.gtdQueryString.contains('Filtraggio Apex post-query'),
      'gtdQueryString deve indicare il filtraggio Apex'
    );
    System.assert(
      w.invoiceQueryString.startsWith('SELECT'),
      'invoiceQueryString deve iniziare con SELECT'
    );
  }

  /*────────────────────────────────────────────
   * 3) getAllDataForLWCWithParams – parametro come OB (Overview_Budget_per_Anno__c)
   *    Copre il ramo paramIsObId = true e filtri anno.
   *───────────────────────────────────────────*/
  @IsTest
  static void testGetAllData_WithObParam() {
    List<Overview_Budget_per_Anno__c> obs = [
      SELECT Id, Anno__c, Programma__c
      FROM Overview_Budget_per_Anno__c
      LIMIT 1
    ];
    if (obs.isEmpty()) return; // org senza dati: esci silenziosamente

    Overview_Budget_per_Anno__c ob = obs[0];

    Test.startTest();
    AssegnazioneFattureADonatore.MyWrapper w = AssegnazioneFattureADonatore.getAllDataForLWCWithParams(
      ob.Programma__c,
      ob.Id,            // ⇦ passa un OB, non una GiftDesignation
      ob.Anno__c        // ⇦ applica filtro anno
    );
    Test.stopTest();

    System.assertNotEquals(null, w);
    System.assertNotEquals(null, w.giftTransactionDesignationList);
    System.assertNotEquals(null, w.invoiceList);
    System.assertNotEquals(null, w.invoiceTotalsByRyYear);
  }

  /*────────────────────────────────────────────
   * 4) getInvoicesForBudget – wrapper helper usato dall’Overview
   *───────────────────────────────────────────*/
  @IsTest
  static void testGetInvoicesForBudget() {
    List<Overview_Budget_per_Anno__c> obs = [
      SELECT Id, Programma__c, Anno__c
      FROM Overview_Budget_per_Anno__c
      LIMIT 1
    ];
    if (obs.isEmpty()) return;

    Overview_Budget_per_Anno__c ob = obs[0];
    Test.startTest();
    List<Invoice__c> invs = AssegnazioneFattureADonatore.getInvoicesForBudget(
      ob.Programma__c,
      ob.Id,
      ob.Anno__c
    );
    Test.stopTest();
    System.assertNotEquals(null, invs);
  }

  /*────────────────────────────────────────────
   * 6) getEnrolledAccountsOnDate – parametri validi/opzionali
   *───────────────────────────────────────────*/
  @IsTest
  static void testGetEnrolledAccountsOnDate() {
    // Caso guardia: parametri null ⇒ lista vuota
    List<Id> empty = AssegnazioneFattureADonatore.getEnrolledAccountsOnDate(
      null,
      null
    );
    System.assertEquals(0, empty.size(), 'Parametri null ⇒ lista vuota');

    List<ProgramEnrollment> pes = [
      SELECT ProgramId, AccountId, StartDate, EndDate
      FROM ProgramEnrollment
      WHERE ProgramId != NULL AND AccountId != NULL
      LIMIT 1
    ];
    if (pes.isEmpty()) return; // org senza dati coerenti: esci

    ProgramEnrollment pe = pes[0];
    Date probe = Date.today();
    if (pe.StartDate != null) probe = pe.StartDate;
    if (pe.EndDate != null && probe > pe.EndDate) probe = pe.EndDate;

    List<Id> res = AssegnazioneFattureADonatore.getEnrolledAccountsOnDate(
      pe.ProgramId,
      probe
    );
    System.assertNotEquals(null, res);

    if (
      pe.StartDate != null &&
      pe.StartDate <= probe &&
      (pe.EndDate == null || pe.EndDate >= probe)
    ) {
      System.assert(
        res.contains(pe.AccountId),
        'L’account iscritto deve essere incluso per la data scelta'
      );
    }
  }

  /*────────────────────────────────────────────
   * 7) getEnrolledAccountsOnYear – anno valido/edge-case
   *───────────────────────────────────────────*/
  @IsTest
  static void testGetEnrolledAccountsOnYear() {
    List<Id> empty = AssegnazioneFattureADonatore.getEnrolledAccountsOnYear(
      null,
      null
    );
    System.assertEquals(0, empty.size(), 'Parametri null ⇒ lista vuota');

    List<ProgramEnrollment> pes = [
      SELECT ProgramId, AccountId, StartDate, EndDate
      FROM ProgramEnrollment
      WHERE ProgramId != NULL AND AccountId != NULL
      LIMIT 1
    ];
    if (pes.isEmpty()) return;

    ProgramEnrollment pe = pes[0];
    Integer year;
    if (pe.StartDate != null) {
      year = pe.StartDate.year();
    } else if (pe.EndDate != null) {
      year = pe.EndDate.year();
    } else {
      year = Date.today().year();
    }

    List<Id> res = AssegnazioneFattureADonatore.getEnrolledAccountsOnYear(
      pe.ProgramId,
      String.valueOf(year)
    );
    System.assertNotEquals(null, res);

    Date startOfYear = Date.newInstance(year, 1, 1);
    Date endOfYear = Date.newInstance(year, 12, 31);
    Boolean coversYear = (
      (pe.StartDate == null || pe.StartDate <= endOfYear) &&
      (pe.EndDate == null || pe.EndDate >= startOfYear)
    );
    if (coversYear) {
      System.assert(
        res.contains(pe.AccountId),
        'L’account deve risultare tra gli iscritti per l’anno indicato'
      );
    }
  }

  /*────────────────────────────────────────────
   * 5) getAllDataForLegacy – mantiene compatibilità
   *───────────────────────────────────────────*/
  @IsTest
  static void testGetAllDataForLegacy() {
    Map<String, Object> res = AssegnazioneFattureADonatore.getAllDataForLegacy();
    System.assertNotEquals(null, res);
  }
}