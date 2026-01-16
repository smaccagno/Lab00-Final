@IsTest
private class AnnoReportisticaTest {
  /* ================================================================
   *  ▸  Variabile d’appoggio per evitare ricorsioni circolari
   * ================================================================ */
  private static Set<String> inCreazione = new Set<String>();

  /* ================================================================
   *  ▸  Crea un record di qualunque oggetto e restituisce l’Id
   *     – Riempiamo dinamicamente TUTTI i campi obbligatori
   * ================================================================ */
  private static Id creaLookupRecord(String objectApi) {
    if (objectApi == null || inCreazione.contains(objectApi)) {
      return null; // previene loop
    }
    inCreazione.add(objectApi);

    SObjectType typ = Schema.getGlobalDescribe().get(objectApi);
    SObject rec = typ.newSObject();

    /* Se esiste il campo Name e non è autonumber → valorizzalo */
    Schema.SObjectField nameFld = typ.getDescribe().fields.getMap().get('Name');
    if (nameFld != null && !nameFld.getDescribe().isAutoNumber()) {
      rec.put('Name', objectApi + '‑Test');
    }

    /* ------------------------------------------------------------
     *  Popola tutti i campi obbligatori che risultano ancora null
     * ------------------------------------------------------------ */
    for (Schema.SObjectField f : typ.getDescribe().fields.getMap().values()) {
      Schema.DescribeFieldResult d = f.getDescribe();
      String api = d.getName();

      Boolean deveValorizzare =
        !d.isNillable() && // non può essere vuoto
        !d.isDefaultedOnCreate() && // niente default server‑side
        !d.isCalculated() &&
        !d.isAutoNumber() &&
        rec.get(api) == null; // non già settato

      if (!deveValorizzare)
        continue;

      /* → assegna un valore plausibile in base al tipo */
      Schema.DisplayType t = d.getType();

      if (
        t == Schema.DisplayType.String ||
        t == Schema.DisplayType.TextArea ||
        t == Schema.DisplayType.Url ||
        t == Schema.DisplayType.Email ||
        t == Schema.DisplayType.Phone
      ) {
        rec.put(api, 'Test');
      } else if (t == Schema.DisplayType.Picklist) {
        List<Schema.PicklistEntry> vals = d.getPicklistValues();
        if (!vals.isEmpty())
          rec.put(api, vals[0].getValue());
      } else if (t == Schema.DisplayType.Boolean) {
        rec.put(api, false);
      } else if (
        t == Schema.DisplayType.Integer ||
        t == Schema.DisplayType.Double ||
        t == Schema.DisplayType.Currency ||
        t == Schema.DisplayType.Percent
      ) {
        rec.put(api, 0);
      } else if (t == Schema.DisplayType.Date) {
        rec.put(api, Date.today());
      } else if (t == Schema.DisplayType.DateTime) {
        rec.put(api, DateTime.now());
      } else if (t == Schema.DisplayType.Reference) {
        /* crea ricorsivamente il record referenziato */
        Schema.SObjectType refTyp = d.getReferenceTo().isEmpty()
          ? null
          : d.getReferenceTo()[0];
        Id refId = creaLookupRecord(
          refTyp == null ? null : refTyp.getDescribe().getName()
        );
        rec.put(api, refId);
      }
      // gli altri tipi – formula, encrypted, ecc. – li ignoriamo
    }

    insert rec;
    inCreazione.remove(objectApi);
    return (Id) rec.get('Id');
  }

  /* ================================================================
   *  ▸  Crea i dati di test minimi e restituisce l’Id dell’Anno
   * ================================================================ */
  private static Id creaDati() {
    /* --- Anno_Reportistica__c (con eventuale lookup Programma__c) */
    Anno_Reportistica__c anno = new Anno_Reportistica__c(Name = '2025');
    Schema.SObjectField lookupProg = Schema.getGlobalDescribe()
      .get('Anno_Reportistica__c')
      .getDescribe()
      .fields.getMap()
      .get('Programma__c');
    if (lookupProg != null) {
      Id progId = creaLookupRecord(
        lookupProg.getDescribe().getReferenceTo()[0].getDescribe().getName()
      );
      anno.put('Programma__c', progId);
    }
    insert anno;

    /* --- Overview_Budget_per_Anno__c (2 record) ----------------- */
    List<Overview_Budget_per_Anno__c> budgets = new List<Overview_Budget_per_Anno__c>();
    Schema.SObjectField lookupBudgetPadre = Schema.getGlobalDescribe()
      .get('Overview_Budget_per_Anno__c')
      .getDescribe()
      .fields.getMap()
      .get('Budget__c');
    Id budgetPadreId = null;
    if (lookupBudgetPadre != null) {
      budgetPadreId = creaLookupRecord(
        lookupBudgetPadre.getDescribe().getReferenceTo()[0]
          .getDescribe()
          .getName()
      );
    }
    for (Integer i = 0; i < 2; i++) {
      Overview_Budget_per_Anno__c b = new Overview_Budget_per_Anno__c(
        Name = 'Budget' + i,
        Anno_Reportistica__c = anno.Id
      );
      if (budgetPadreId != null)
        b.put('Budget__c', budgetPadreId);
      budgets.add(b);
    }
    insert budgets;

    /* --- Reporting_Year__c (2 record) --------------------------- */
    List<Reporting_Year__c> donors = new List<Reporting_Year__c>();

    // Describe di Reporting_Year__c per individuare i campi obbligatori
    Schema.DescribeSObjectResult donorDscr = Schema.getGlobalDescribe()
      .get('Reporting_Year__c')
      .getDescribe();
    Map<String, Schema.SObjectField> donorFields = donorDscr.fields.getMap();

    // lookup Programma__c (se esiste)
    Schema.SObjectField lookupProgDonor = donorFields.get('Programma__c');

    // lookup Donor_Overview__c (obbligatorio)
    Schema.SObjectField lookupDonOvFld = donorFields.get('Donor_Overview__c');
    Id donorOverviewId = null;
    if (lookupDonOvFld != null) {
      donorOverviewId = creaLookupRecord(
        lookupDonOvFld.getDescribe().getReferenceTo()[0].getDescribe().getName()
      );
    }

    for (Integer i = 0; i < 2; i++) {
      Reporting_Year__c d = new Reporting_Year__c(
        Name = 'Donor' + i,
        Anno__c = anno.Id
      );

      /* Programma__c (se presente) */
      if (lookupProgDonor != null) {
        Id progIdDonor = creaLookupRecord(
          lookupProgDonor.getDescribe().getReferenceTo()[0]
            .getDescribe()
            .getName()
        );
        d.put('Programma__c', progIdDonor);
      }

      /* Donor_Overview__c (obbligatorio) */
      if (donorOverviewId != null) {
        d.put('Donor_Overview__c', donorOverviewId);
      }

      /* Year__c (obbligatorio) – gestiamo i possibili tipi */
      Schema.DescribeFieldResult yearFld = donorFields.get('Year__c')
        .getDescribe();
      if (
        yearFld.getType() == Schema.DisplayType.Integer ||
        yearFld.getType() == Schema.DisplayType.Double
      ) {
        d.put('Year__c', 2025);
      } else if (yearFld.getType() == Schema.DisplayType.Date) {
        d.put('Year__c', Date.today());
      } else {
        d.put('Year__c', '2025');
      }

      donors.add(d);
    }
    insert donors;

    return anno.Id;
  }

  /* ================================================================
   *  ▸  TEST 1 – Flusso nominale
   * ================================================================ */
  @IsTest
  static void testHappyPath() {
    Id annoId = creaDati();

    Test.startTest();
    Map<String, Object> res = AnnoReportistica.getRelatedRecords(
      annoId,
      'Test_Program'
    );
    Test.stopTest();

    System.assertEquals(
      2,
      ((List<Overview_Budget_per_Anno__c>) res.get('records_budget')).size()
    );
    System.assertEquals(
      2,
      ((List<Reporting_Year__c>) res.get('records_donor_raw')).size()
    );
  }

  /* ================================================================
   *  ▸  TEST 2 – recordId non valido
   * ================================================================ */
  @IsTest
  static void testIdNonValido() {
    Boolean ok = false;
    try {
      AnnoReportistica.getRelatedRecords('123', 'Test_Program');
    } catch (AuraHandledException e) {
      ok = true;
    }
    System.assert(ok, 'Doveva lanciare AuraHandledException per ID non valido');
  }

  /* ================================================================
   *  ▸  TEST 3 – programDevName vuoto
   * ================================================================ */
  @IsTest
  static void testProgramVuoto() {
    Id annoId = creaDati();
    Boolean ok = false;
    try {
      AnnoReportistica.getRelatedRecords(annoId, '');
    } catch (AuraHandledException e) {
      ok = true;
    }
    System.assert(
      ok,
      'Doveva lanciare AuraHandledException per programDevName vuoto'
    );
  }
}