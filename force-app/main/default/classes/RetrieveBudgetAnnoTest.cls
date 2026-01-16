@IsTest(SeeAllData=true)
public class RetrieveBudgetAnnoTest {
  /*────────────────────────────────────────────────────────────
   * CONTEXT FINDER: cerca un budget reale + utente coerente
   *───────────────────────────────────────────────────────────*/
  private class Ctx {
    User user;
    Id partnerId;
    Id programId;
    Id budgetId;
    String partnerName;
    String partnerDonorName;
  }

  /**
   * Trova una GiftDesignation valida (con Program__c e Partner__c, partner Type='Partner'),
   * poi trova uno User con CompanyName = (prima) Nome_Donatore__c, (fallback) Name.
   * Se qualcosa manca, ritorna null.
   */
  private static Ctx findCtxFromExistingBudget() {
    List<GiftDesignation> gds = [
      SELECT
        Id,
        Program__c,
        Partner__c,
        Partner__r.Name,
        Partner__r.Nome_Donatore__c,
        Partner__r.Type
      FROM GiftDesignation
      WHERE
        Program__c != NULL
        AND Partner__c != NULL
        AND Partner__r.Type = 'Partner'
      ORDER BY CreatedDate DESC
      LIMIT 1
    ];
    if (gds.isEmpty())
      return null;

    GiftDesignation gd = gds[0];
    String donorName = gd.Partner__r.Nome_Donatore__c;
    String accName = gd.Partner__r.Name;

    // Preferisci Nome_Donatore__c (coerente con la classe), poi fallback su Name
    List<User> us = (donorName != null)
      ? [
          SELECT Id, CompanyName
          FROM User
          WHERE CompanyName = :donorName AND IsActive = true
          LIMIT 1
        ]
      : new List<User>();
    if (us.isEmpty() && accName != null) {
      us = [
        SELECT Id, CompanyName
        FROM User
        WHERE CompanyName = :accName AND IsActive = true
        LIMIT 1
      ];
    }
    if (us.isEmpty())
      return null;

    Ctx ctx = new Ctx();
    ctx.user = us[0];
    ctx.partnerId = gd.Partner__c;
    ctx.programId = gd.Program__c;
    ctx.budgetId = gd.Id;
    ctx.partnerName = accName;
    ctx.partnerDonorName = donorName;
    return ctx;
  }

  /*────────────────────────────────────────────────────────────
   * 1) getActiveProgramsForCurrentUser
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testGetActiveProgramsForCurrentUser() {
    Ctx ctx = findCtxFromExistingBudget();
    if (ctx == null) {
      System.debug(
        '⏭️ Skip testGetActiveProgramsForCurrentUser: nessun budget/utente coerente trovato.'
      );
      return;
    }

    System.runAs(ctx.user) {
      List<RetrieveBudgetAnno.ProgramOption> opts = RetrieveBudgetAnno.getActiveProgramsForCurrentUser();

      System.assertNotEquals(
        null,
        opts,
        'Il metodo deve restituire una lista (anche vuota).'
      );
      if (!opts.isEmpty()) {
        RetrieveBudgetAnno.ProgramOption p0 = opts[0];
        System.assertNotEquals(null, p0.programId, 'programId valorizzato');
        System.assert(
          !String.isBlank(p0.programName),
          'programName valorizzato'
        );
      }
    }
  }

  /*────────────────────────────────────────────────────────────
   * 2) getDefaultRecordId – nessuna eccezione, valore opzionale
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testGetDefaultRecordId() {
    Ctx ctx = findCtxFromExistingBudget();
    if (ctx == null) {
      System.debug(
        '⏭️ Skip testGetDefaultRecordId: nessun budget/utente coerente trovato.'
      );
      return;
    }

    System.runAs(ctx.user) {
      Id result;
      try {
        result = RetrieveBudgetAnno.getDefaultRecordId();
      } catch (Exception e) {
        System.assert(false, 'Il metodo non deve generare eccezioni.');
      }
      if (result != null) {
        System.assertEquals(
          18,
          String.valueOf(result).length(),
          'Id restituito non sembra valido.'
        );
      }
    }
  }

  /*────────────────────────────────────────────────────────────
   * 3) getBudgetsByProgram – parametri null e validi
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testGetBudgetsByProgram() {
    // a) Parametro null → wrapper con liste inizializzate ma vuote
    RetrieveBudgetAnno.ResultWrapper empty = RetrieveBudgetAnno.getBudgetsByProgram(
      null
    );
    System.assertNotEquals(null, empty, 'Wrapper deve essere valorizzato');
    System.assertNotEquals(null, empty.records, 'records deve essere una lista');
    System.assertEquals(0, empty.records.size(), 'records vuoto atteso');
    System.assertNotEquals(
      null,
      empty.dynamicFields,
      'dynamicFields deve essere una lista'
    );
    System.assertEquals(
      0,
      empty.dynamicFields.size(),
      'dynamicFields vuoto atteso'
    );

    // b) Programma valido partendo da una GiftDesignation reale
    Ctx ctx = findCtxFromExistingBudget();
    if (ctx == null) {
      System.debug(
        '⏭️ Skip testGetBudgetsByProgram: nessun budget/utente coerente trovato.'
      );
      return;
    }

    System.runAs(ctx.user) {
      RetrieveBudgetAnno.ResultWrapper wr = RetrieveBudgetAnno.getBudgetsByProgram(
        ctx.programId
      );
      System.assertNotEquals(null, wr, 'Wrapper non null');
      // Le liste possono essere vuote, ma il metodo non deve lanciare eccezioni
    }
  }

  /*────────────────────────────────────────────────────────────
   * 4) getRelatedRecordsWithFields – parentId null e valido
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testGetRelatedRecordsWithFields() {
    // a) parentId null
    RetrieveBudgetAnno.ResultWrapper rNull = RetrieveBudgetAnno.getRelatedRecordsWithFields(
      null
    );
    System.assertNotEquals(null, rNull.records, 'records deve essere lista');
    System.assertEquals(0, rNull.records.size(), 'records vuoto con parentId null');
    System.assertNotEquals(
      null,
      rNull.dynamicFields,
      'dynamicFields deve essere lista'
    );
    System.assertEquals(
      0,
      rNull.dynamicFields.size(),
      'dynamicFields vuoto con parentId null'
    );

    // b) parentId valido: usiamo un Overview_Budget_per_Anno__c reale per essere sicuri
    List<Overview_Budget_per_Anno__c> sample = [
      SELECT Id, Budget__c
      FROM Overview_Budget_per_Anno__c
      WHERE Budget__c != NULL AND Programma__c != NULL
      LIMIT 1
    ];
    if (sample.isEmpty()) {
      System.debug(
        '⏭️ Skip testGetRelatedRecordsWithFields: nessun Overview_Budget_per_Anno__c valido.'
      );
      return;
    }

    Id budgetId = sample[0].Budget__c;
    Id sampleId = sample[0].Id;

    RetrieveBudgetAnno.ResultWrapper rOk = RetrieveBudgetAnno.getRelatedRecordsWithFields(
      budgetId
    );

    System.assertNotEquals(null, rOk.records, 'records non null');
    System.assert(rOk.records.size() > 0, 'Almeno un record restituito');

    Boolean containsSample = false;
    for (Overview_Budget_per_Anno__c ob : rOk.records) {
      if (ob.Id == sampleId) {
        containsSample = true;
        break;
      }
    }
    System.assert(
      containsSample,
      'La lista deve contenere il record di esempio'
    );
  }

  /*────────────────────────────────────────────────────────────
   * 5) getSingleRecord – recordId null e valido
   *───────────────────────────────────────────────────────────*/
  @IsTest
  static void testGetSingleRecord() {
    // a) recordId null
    RetrieveBudgetAnno.ResultWrapper wNull = RetrieveBudgetAnno.getSingleRecord(
      null
    );
    System.assertNotEquals(null, wNull.records, 'records deve essere lista');
    System.assertEquals(0, wNull.records.size(), 'records vuoto con recordId null');
    System.assertNotEquals(
      null,
      wNull.dynamicFields,
      'dynamicFields deve essere lista'
    );
    System.assertEquals(
      0,
      wNull.dynamicFields.size(),
      'dynamicFields vuoto con recordId null'
    );

    // b) recordId valido
    List<Overview_Budget_per_Anno__c> obs = [
      SELECT Id
      FROM Overview_Budget_per_Anno__c
      LIMIT 1
    ];
    if (obs.isEmpty()) {
      System.debug(
        '⏭️ Skip testGetSingleRecord: nessun Overview_Budget_per_Anno__c.'
      );
      return;
    }

    Id rid = obs[0].Id;
    RetrieveBudgetAnno.ResultWrapper wOk = RetrieveBudgetAnno.getSingleRecord(
      rid
    );

    System.assertNotEquals(null, wOk.records, 'records non null');
    System.assertEquals(
      1,
      wOk.records.size(),
      'records deve avere un solo elemento'
    );
    System.assertEquals(
      rid,
      wOk.records[0].Id,
      'record restituito non corrisponde'
    );
  }
}