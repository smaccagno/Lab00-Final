@IsTest(SeeAllData=true)
private class ProgramEnrollmentServiceTest {
  // Programmi richiesti dai test
  private static final Set<String> REQUIRED_PROGRAMS = new Set<String>{
    ProgramEnrollmentService.TEMPO_SOSPESO,
    ProgramEnrollmentService.SORRISO_SOSPESO
  };

  // Piccolo wrapper per restituire contesto trovato (account + user)
  private class TestContext {
    Account account;
    User user;
    Set<String> programsOnAccount;
  }

  /**
   * Trova un Account che abbia enrollments attivi per TUTTI i programmi richiesti
   * e uno User con CompanyName = Account.Name.
   * Se non trovato, restituisce null.
   */
  private static TestContext findContextWithBothPrograms() {
    // 1) Recupero enrollments attivi per i programmi richiesti
    List<ProgramEnrollment> enrs = [
      SELECT Id, IsActive, AccountId, Account.Name, Program.Name
      FROM ProgramEnrollment
      WHERE IsActive = TRUE AND Program.Name IN :REQUIRED_PROGRAMS
    ];
    if (enrs.isEmpty())
      return null;

    // 2) Aggrego per Account gli insiemi di programmi presenti
    Map<Id, Set<String>> programsByAccount = new Map<Id, Set<String>>();
    Map<Id, String> accNameById = new Map<Id, String>();
    for (ProgramEnrollment pe : enrs) {
      accNameById.put(pe.AccountId, pe.Account.Name);
      if (!programsByAccount.containsKey(pe.AccountId)) {
        programsByAccount.put(pe.AccountId, new Set<String>());
      }
      programsByAccount.get(pe.AccountId).add(pe.Program.Name);
    }

    // 3) Cerco un Account che copra TUTTI i programmi richiesti
    for (Id accId : programsByAccount.keySet()) {
      Set<String> progs = programsByAccount.get(accId);
      if (progs.containsAll(REQUIRED_PROGRAMS)) {
        // 4) Trovo uno user con CompanyName = Account.Name
        String accName = accNameById.get(accId);
        List<User> users = [
          SELECT Id, CompanyName
          FROM User
          WHERE CompanyName = :accName
          LIMIT 1
        ];
        if (!users.isEmpty()) {
          Account acc = [
            SELECT Id, Name
            FROM Account
            WHERE Id = :accId
            LIMIT 1
          ];
          TestContext ctx = new TestContext();
          ctx.account = acc;
          ctx.user = users[0];
          ctx.programsOnAccount = progs;
          return ctx;
        }
      }
    }
    return null;
  }

  /**
   * TROVA UNO USER SENZA ENROLLMENTS ATTIVI
   * (FIX: niente semi-join annidati)
   *
   * Prima estraggo gli Account con almeno un enrollment attivo,
   * poi cerco uno User la cui CompanyName NON sia tra quei nomi.
   */
  private static User findUserWithoutActiveEnrollments() {
    // 1) Account con enrollments attivi
    Set<Id> accountIdsWithActive = new Set<Id>();
    for (ProgramEnrollment pe : [
      SELECT AccountId
      FROM ProgramEnrollment
      WHERE IsActive = TRUE
    ]) {
      if (pe.AccountId != null)
        accountIdsWithActive.add(pe.AccountId);
    }

    // 2) Nomi degli account con enrollments attivi
    Set<String> accountNamesWithActive = new Set<String>();
    if (!accountIdsWithActive.isEmpty()) {
      for (Account a : [
        SELECT Name
        FROM Account
        WHERE Id IN :accountIdsWithActive
      ]) {
        if (a.Name != null)
          accountNamesWithActive.add(a.Name);
      }
    }

    // 3) Trovo uno user con CompanyName non presente nella lista
    if (accountNamesWithActive.isEmpty()) {
      // Se non ci sono account con enrollments, prendi un qualunque user con CompanyName
      List<User> users = [
        SELECT Id, CompanyName
        FROM User
        WHERE CompanyName != NULL
        LIMIT 1
      ];
      return users.isEmpty() ? null : users[0];
    } else {
      List<User> users = [
        SELECT Id, CompanyName
        FROM User
        WHERE CompanyName != NULL AND CompanyName NOT IN :accountNamesWithActive
        LIMIT 1
      ];
      return users.isEmpty() ? null : users[0];
    }
  }

  @IsTest
  static void testEnabledForTempoSospeso() {
    TestContext ctx = findContextWithBothPrograms();
    if (ctx == null) {
      System.debug(
        '⏭️ Skip: nessun contesto con entrambi i programmi + user coerente.'
      );
      return;
    }

    System.runAs(ctx.user) {
      Test.startTest();
      Boolean result = ProgramEnrollmentService.enabledForTempoSospeso();
      Test.stopTest();
      System.assertEquals(
        true,
        result,
        'Tempo Sospeso dovrebbe essere abilitato per user CompanyName=' +
        ctx.user.CompanyName
      );
    }
  }

  @IsTest
  static void testEnabledForSorrisoSospeso() {
    TestContext ctx = findContextWithBothPrograms();
    if (ctx == null) {
      System.debug(
        '⏭️ Skip: nessun contesto con entrambi i programmi + user coerente.'
      );
      return;
    }

    System.runAs(ctx.user) {
      Test.startTest();
      Boolean result = ProgramEnrollmentService.enabledForSorrisoSospeso();
      Test.stopTest();
      System.assertEquals(
        true,
        result,
        'Sorriso Sospeso dovrebbe essere abilitato per user CompanyName=' +
        ctx.user.CompanyName
      );
    }
  }

  @IsTest
  static void testGetEnabledPrograms() {
    TestContext ctx = findContextWithBothPrograms();
    if (ctx == null) {
      System.debug(
        '⏭️ Skip: nessun contesto con entrambi i programmi + user coerente.'
      );
      return;
    }

    System.runAs(ctx.user) {
      Test.startTest();
      List<ProgramEnrollment> programs = ProgramEnrollmentService.getEnabledPrograms();
      Test.stopTest();

      System.assertNotEquals(
        null,
        programs,
        'La lista programmi non deve essere null'
      );
      // Non assumiamo numeri fissi: verifichiamo che includa almeno i due richiesti
      Set<String> found = new Set<String>();
      for (ProgramEnrollment pe : programs) {
        if (pe.Program != null)
          found.add(pe.Program.Name);
      }
      System.assert(
        found.containsAll(REQUIRED_PROGRAMS),
        'I programmi abilitati devono includere: ' +
          REQUIRED_PROGRAMS +
          ' ma sono: ' +
          found
      );
    }
  }

  @IsTest
  static void testNoProgramEnrollment() {
    User u = findUserWithoutActiveEnrollments();
    if (u == null) {
      System.debug('⏭️ Skip: non trovato uno user senza enrollments attivi.');
      return;
    }

    System.runAs(u) {
      Test.startTest();
      Boolean tempo = ProgramEnrollmentService.enabledForTempoSospeso();
      Boolean sorriso = ProgramEnrollmentService.enabledForSorrisoSospeso();
      List<ProgramEnrollment> listp = ProgramEnrollmentService.getEnabledPrograms();
      Test.stopTest();

      System.assertEquals(
        false,
        tempo,
        'Non dovrebbe esserci Tempo Sospeso per user=' + u.Id
      );
      System.assertEquals(
        false,
        sorriso,
        'Non dovrebbe esserci Sorriso Sospeso per user=' + u.Id
      );
      System.assertEquals(
        0,
        listp.size(),
        'Non ci dovrebbero essere iscrizioni per user=' + u.Id
      );
    }
  }

  @IsTest
  static void testGetActiveEnrollmentsByAccount() {
    TestContext ctx = findContextWithBothPrograms();
    if (ctx == null) {
      System.debug('⏭️ Skip: nessun account con entrambi i programmi attivi.');
      return;
    }

    Test.startTest();
    List<ProgramEnrollment> results = ProgramEnrollmentService.getActiveEnrollmentsByAccount(
      ctx.account.Id
    );
    Test.stopTest();

    System.assertNotEquals(
      null,
      results,
      'La lista enrollment non deve essere null'
    );
    // Verifica che contenga almeno i due richiesti
    Set<String> found = new Set<String>();
    for (ProgramEnrollment pe : results) {
      if (pe.Program != null)
        found.add(pe.Program.Name);
    }
    System.assert(
      found.containsAll(REQUIRED_PROGRAMS),
      'Gli enrollment attivi per l’account devono includere: ' +
        REQUIRED_PROGRAMS +
        ' ma sono: ' +
        found
    );
  }
}