@IsTest
private class VisiteMedicheTest {
  private static final String PROGRAM_NAME = 'Tempo Sospeso';
  private static final String PARTNER_NAME = 'Partner Test Co';
  private static final String DONOR_NAME = 'Donor Main';
  private static final String NO_BUDGET_NAME = 'No Budget Org';
  private static final String BUDGET_NAME = 'Budget Tempo';
  private static final String TIPO_VISITA_LABEL = 'Visita Generale';
  private static final String INVOICE_NUMBER = 'INV-001';
  private static final String CITY = 'Roma';
  private static final String PROVINCE = 'Roma (RM)';
  private static final String REGION = 'Lazio';

  private static Id tempoProgramId;
  private static Id partnerAccountId;
  private static Id donorAccountId;
  private static Id noBudgetAccountId;
  private static Id budgetId;
  private static Id invoiceId;
  private static Id tipoVisitaId;
  private static Id visitId;
  private static String beneficiaryValue;

  @TestSetup
  static void setupData() {
    List<Program> existingPrograms = [
      SELECT Id
      FROM Program
      WHERE Name = :PROGRAM_NAME
      LIMIT 1
    ];
    if (existingPrograms.isEmpty()) {
      Program tempo = new Program(
        Name = PROGRAM_NAME,
        Status = 'Attivo',
        StartDate = Date.today(),
        EndDate = Date.today().addYears(1)
      );
      insert tempo;
      tempoProgramId = tempo.Id;
    } else {
      tempoProgramId = existingPrograms[0].Id;
    }

    Account partner = new Account(Name = PARTNER_NAME);
    insert partner;
    partnerAccountId = partner.Id;

    Id donorRecordTypeId = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName()
      .get('Company')
      .getRecordTypeId();

    Account donor = new Account(
      Name = DONOR_NAME,
      RecordTypeId = donorRecordTypeId
    );
    insert donor;
    donorAccountId = donor.Id;

    Account noBudget = new Account(Name = NO_BUDGET_NAME);
    insert noBudget;
    noBudgetAccountId = noBudget.Id;

    GiftDesignation budget = new GiftDesignation(
      Name = BUDGET_NAME,
      Partner__c = partner.Id,
      Program__c = tempoProgramId
    );
    insert budget;
    budgetId = budget.Id;

    Tipo_Visita__c tipo = new Tipo_Visita__c(
      Name = TIPO_VISITA_LABEL,
      Tipo_Visita__c = TIPO_VISITA_LABEL
    );
    insert tipo;
    tipoVisitaId = tipo.Id;

    Invoice__c invoice = new Invoice__c(
      Account__c = donor.Id,
      Budget__c = budgetId,
      Invoice_Number__c = INVOICE_NUMBER,
      Date__c = Date.today(),
      Province__c = PROVINCE,
      Region__c = REGION
    );
    insert invoice;
    invoiceId = invoice.Id;

    beneficiaryValue = pickFirst(Visit__c.Beneficiary_Type__c);
    if (String.isBlank(beneficiaryValue)) {
      beneficiaryValue = 'Adulto';
    }

    Visit__c visit = new Visit__c(
      Invoice__c = invoiceId,
      Tipo_Visita__c = tipoVisitaId,
      Visit_Type__c = TIPO_VISITA_LABEL,
      Data_della_Visita__c = Date.today(),
      Duration_in_minutes__c = 45,
      Quantity__c = 2,
      Amount__c = 150,
      Beneficiary_Type__c = beneficiaryValue,
      City__c = CITY,
      Province__c = PROVINCE,
      Region__c = REGION
    );
    insert visit;
    visitId = visit.Id;

    ProgramEnrollment enrollment = new ProgramEnrollment(
      ProgramId = tempoProgramId,
      AccountId = donorAccountId,
      IsActive = true,
      StartDate = Date.today().addMonths(-3),
      EndDate = Date.today().addMonths(3),
      Status = 'In corso'
    );
    insert enrollment;

    insert new Anno_Reportistica__c(
      Name = String.valueOf(Date.today().year()),
      Programma__c = tempoProgramId
    );

    insert new Comune__c(
      Name = CITY,
      Provincia__c = PROVINCE,
      Regione__c = REGION,
      Nome_Comune__c = CITY
    );
  }

  private static String pickFirst(Schema.SObjectField fieldRef) {
    List<Schema.PicklistEntry> values = fieldRef.getDescribe()
      .getPicklistValues();
    return values.isEmpty() ? null : values[0].getValue();
  }

  private static void ensureTestData() {
    if (tempoProgramId == null) {
      tempoProgramId = [
        SELECT Id
        FROM Program
        WHERE Name = :PROGRAM_NAME
        LIMIT 1
      ]
      .Id;
    }
    if (partnerAccountId == null) {
      partnerAccountId = [
        SELECT Id
        FROM Account
        WHERE Name = :PARTNER_NAME
        LIMIT 1
      ]
      .Id;
    }
    if (donorAccountId == null) {
      donorAccountId = [
        SELECT Id
        FROM Account
        WHERE Name = :DONOR_NAME
        LIMIT 1
      ]
      .Id;
    }
    if (noBudgetAccountId == null) {
      noBudgetAccountId = [
        SELECT Id
        FROM Account
        WHERE Name = :NO_BUDGET_NAME
        LIMIT 1
      ]
      .Id;
    }
    if (budgetId == null) {
      budgetId = [
        SELECT Id
        FROM GiftDesignation
        WHERE Name = :BUDGET_NAME
        LIMIT 1
      ]
      .Id;
    }
    if (tipoVisitaId == null) {
      tipoVisitaId = [
        SELECT Id
        FROM Tipo_Visita__c
        WHERE Name = :TIPO_VISITA_LABEL
        LIMIT 1
      ]
      .Id;
    }
    if (invoiceId == null) {
      invoiceId = [
        SELECT Id
        FROM Invoice__c
        WHERE Invoice_Number__c = :INVOICE_NUMBER
        LIMIT 1
      ]
      .Id;
    }
    if (visitId == null) {
      visitId = [
        SELECT Id
        FROM Visit__c
        WHERE Invoice__r.Invoice_Number__c = :INVOICE_NUMBER
        LIMIT 1
      ]
      .Id;
    }
    if (String.isBlank(beneficiaryValue)) {
      beneficiaryValue = pickFirst(Visit__c.Beneficiary_Type__c);
      if (String.isBlank(beneficiaryValue)) {
        beneficiaryValue = 'Adulto';
      }
    }
  }

  private static User createUser(String alias, String companyName) {
    String aliasValue = (alias + '12345').substring(0, 5);
    String unique = alias + '.' + DateTime.now().getTime() + '@test.com';
    User u = new User(
      Alias = aliasValue,
      Email = unique,
      EmailEncodingKey = 'UTF-8',
      LastName = 'Test ' + alias,
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = UserInfo.getProfileId(),
      TimeZoneSidKey = 'Europe/Paris',
      UserName = unique,
      CompanyName = companyName
    );
    insert u;
    return u;
  }

  @IsTest
  static void testGetBudgetId_found() {
    ensureTestData();
    User u = createUser('budg1', PARTNER_NAME);
    System.runAs(u) {
      Test.startTest();
      VisiteMediche.BudgetWrapper info = VisiteMediche.getBudgetId();
      Test.stopTest();

      System.assertNotEquals(
        null,
        info,
        'Dovrebbe restituire il budget collegato'
      );
      System.assertEquals(budgetId, info.value);
      System.assertEquals(BUDGET_NAME, info.label);
    }
  }

  @IsTest
  static void testGetBudgetId_noCompanyName() {
    ensureTestData();
    User u = createUser('budg2', '');
    System.runAs(u) {
      Test.startTest();
      VisiteMediche.BudgetWrapper info = VisiteMediche.getBudgetId();
      Test.stopTest();
      System.assertEquals(
        null,
        info,
        'Senza CompanyName non viene trovato nulla'
      );
    }
  }

  @IsTest
  static void testGetBudgetId_unknownAccount() {
    ensureTestData();
    User u = createUser('budg3', 'Ghost Company');
    System.runAs(u) {
      Test.startTest();
      VisiteMediche.BudgetWrapper info = VisiteMediche.getBudgetId();
      Test.stopTest();
      System.assertEquals(null, info, 'Account inesistente ⇒ nessun budget');
    }
  }

  @IsTest
  static void testGetBudgetId_accountWithoutBudget() {
    ensureTestData();
    User u = createUser('budg4', NO_BUDGET_NAME);
    System.runAs(u) {
      Test.startTest();
      VisiteMediche.BudgetWrapper info = VisiteMediche.getBudgetId();
      Test.stopTest();
      System.assertEquals(
        null,
        info,
        'Account senza budget non deve restituire nulla'
      );
    }
  }

  @IsTest
  static void testGetRelatedRecordsWithFilters() {
    ensureTestData();
    Test.startTest();
    Map<String, Object> res = VisiteMediche.getRelatedRecords(
      String.valueOf(Date.today().year()),
      TIPO_VISITA_LABEL,
      String.valueOf(Date.today().month()),
      beneficiaryValue,
      'INV-',
      budgetId,
      donorAccountId,
      5,
      0,
      CITY,
      PROVINCE,
      REGION
    );
    Test.stopTest();

    List<Visit__c> records = (List<Visit__c>) res.get('records');
    System.assertEquals(1, records.size());
    System.assertEquals(visitId, records[0].Id);

    Decimal totalVisits = (Decimal) res.get('totalVisits');
    Decimal totalMinutes = (Decimal) res.get('totalMinutes');
    Decimal totalAmount = (Decimal) res.get('totalAmount');
    System.assertEquals(2, totalVisits);
    System.assertEquals(45, totalMinutes);
    System.assertEquals(150, totalAmount);

    String query = (String) res.get('query');
    for (
      String token : new List<String>{
        'CALENDAR_YEAR',
        'CALENDAR_MONTH',
        'Beneficiary_Type__c',
        'Invoice_Number__c LIKE',
        'Invoice__r.Account__c',
        'City__c =',
        'Province__c =',
        'Region__c ='
      }
    ) {
      System.assert(query.contains(token), 'Manca la clausola: ' + token);
    }
  }

  @IsTest
  static void testGetRelatedRecordsNoFilters() {
    ensureTestData();
    Test.startTest();
    Map<String, Object> res = VisiteMediche.getRelatedRecords(
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      1,
      0,
      null,
      null,
      null
    );
    Test.stopTest();
    List<Visit__c> records = (List<Visit__c>) res.get('records');
    System.assert(!records.isEmpty());
  }

  @IsTest
  static void testGetAvailableDonors() {
    ensureTestData();
    String year = String.valueOf(Date.today().year());
    String month = String.valueOf(Date.today().month());

    Test.startTest();
    List<Fatture.IdNameWrapper> donors = VisiteMediche.getAvailableDonors(
      year,
      month,
      tempoProgramId
    );
    List<Fatture.IdNameWrapper> fallback = VisiteMediche.getAvailableDonors(
      null,
      null,
      null
    );
    Test.stopTest();

    System.assertEquals(1, donors.size());
    System.assert(
      !fallback.isEmpty(),
      'Il fallback deve individuare Tempo Sospeso automaticamente'
    );
  }

  @IsTest
  static void testGetVisitLocations() {
    ensureTestData();
    Test.startTest();
    List<VisiteMediche.ComuneWrapper> locations = VisiteMediche.getVisitLocations();
    Test.stopTest();
    System.assert(!locations.isEmpty());
    System.assertEquals(CITY, locations[0].name);
  }

  @IsTest
  static void testMetadataQueries() {
    ensureTestData();
    Test.startTest();
    List<String> beneficiaries = VisiteMediche.getBeneficiaryTypes();
    List<String> years = VisiteMediche.getAvailableYears();
    List<VisiteMediche.IdLabelPair> budgets = VisiteMediche.getAvailableBudgets();
    List<Tipo_Visita__c> tipi = VisiteMediche.getTipiVisita();
    List<VisiteMediche.ComuneWrapper> comuni = VisiteMediche.getAllComuni();
    Test.stopTest();

    System.assert(!beneficiaries.isEmpty());
    System.assert(!years.isEmpty());
    System.assert(!budgets.isEmpty());
    System.assert(!tipi.isEmpty());
    System.assert(!comuni.isEmpty());
  }

  @IsTest
  static void testGetVisitWithInvoiceData() {
    ensureTestData();
    Test.startTest();
    Map<String, Object> res = VisiteMediche.getVisitWithInvoiceData(
      String.valueOf(Date.today().year()),
      String.valueOf(Date.today().month()),
      beneficiaryValue,
      budgetId,
      5,
      0,
      CITY,
      PROVINCE,
      REGION
    );
    Test.stopTest();

    List<Visit__c> records = (List<Visit__c>) res.get('records');
    System.assertEquals(1, records.size());
    System.assertEquals(visitId, records[0].Id);
    String query = (String) res.get('query');
    System.assert(query.contains('City__c = \'' + CITY + '\''));
    System.assertEquals(2, (Decimal) res.get('totalVisits'));
    System.assertEquals(150, (Decimal) res.get('totalAmount'));
  }
}