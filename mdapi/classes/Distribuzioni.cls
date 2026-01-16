public with sharing class Distribuzioni {
  /*── wrapper per picklist (API + Label) ──*/
  public class PicklistItem {
    @AuraEnabled
    public String value; // API-Name
    @AuraEnabled
    public String label; // Etichetta localizzata
    public PicklistItem(String v, String l) {
      value = v;
      label = l;
    }
  }

  /*──────────── wrapper generico (id/label) usato dalle pick-list ───────────*/
  public class BudgetWrapper {
    @AuraEnabled
    public String id { get; set; }
    @AuraEnabled
    public Boolean isDefault { get; set; }
    public BudgetWrapper(Id i, Boolean d) {
      id = (String) i;
      isDefault = d;
    }
  }
  public virtual class IdLabelPair {
    @AuraEnabled
    public String value { get; set; }
    @AuraEnabled
    public String label { get; set; }
    public IdLabelPair(String v, String l) {
      value = v;
      label = l;
    }
  }

  /*──────────────────────────── ❶ mappa API→Label ───────────────────────────*/
  private static Map<String, String> statusApiToLabel() {
    Map<String, String> m = new Map<String, String>();
    for (
      Schema.PicklistEntry pe : GiftTransactionDesignation.Status__c.getDescribe()
        .getPicklistValues()
    )
      m.put(pe.getValue(), pe.getLabel());
    return m;
  }

  /*──────────────────────────── ❷ allocazioni con stato tradotto ────────────*/
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getRelatedRecords(
    String year,
    String program,
    String status,
    String budgetId
  ) {
    /* --- SELECT base --- */
    String soql =
      'SELECT Id, Name, Title__c, Programma__c, Amount, ' +
      'Anno_Distribuzione__c, Budget_Name__c, Percent, GiftTransactionId, ' +
      'GiftTransaction.Name, Data_di_Distribuzione__c, Data_di_Pagamento__c, ' +
      'Status__c, Overview_Budget_per_Anno__c, Overview_Budget_per_Anno__r.Name, ' +
      'Payment__c, Payment__r.Name ' +
      'FROM GiftTransactionDesignation';

    /* --- WHERE dinamico --- */
    List<String> W = new List<String>();
    if (!String.isBlank(year))
      W.add('Anno_Distribuzione__c = :year');

    if (!String.isBlank(program)) {
      W.add('Programma__c = :program');
    }
    if (!String.isBlank(status))
      W.add('Status__c = :status'); // status ora è l’API-Name ✔️

    if (!String.isBlank(budgetId))
      W.add('GiftDesignationId = :budgetId');

    if (!W.isEmpty())
      soql += ' WHERE ' + String.join(W, ' AND ');

    System.debug('Query Distribuzioni ► ' + soql);

    /* --- query DB --- */
    List<GiftTransactionDesignation> recs = Database.query(soql);

    /* --- traduzione stato + totali --- */
    Map<String, String> api2lbl = statusApiToLabel();
    List<Map<String, Object>> rows = new List<Map<String, Object>>();
    Decimal totPaid = 0, totDist = 0;

    for (GiftTransactionDesignation g : recs) {
      if (g.Status__c == 'Paid')
        totPaid += g.Amount;
      else if (g.Status__c == 'Distributed')
        totDist += g.Amount;

      /*───────────────────────────────
       * getPopulatedFieldsAsMap() torna
       * una mappa read-only ► facciamo
       * subito una copia mutabile
       *───────────────────────────────*/
      Map<String, Object> row = new Map<String, Object>();
      row.putAll(g.getPopulatedFieldsAsMap()); // copia di tutti i campi

      row.put('StatusLabel', api2lbl.get(g.Status__c)); // OK: la mappa ora è mutabile
      rows.add(row);
    }

    System.debug(LoggingLevel.WARN, 'SOQL getRelatedRecords ► ' + soql);
    System.debug(LoggingLevel.WARN, 'Record trovati: ' + recs.size());

    return new Map<String, Object>{
      'records' => rows,
      'totalPaid' => totPaid,
      'totalDistributed' => totDist,
      'query' => soql
    };
  }

  /*────────────────────────── ❸ picklist Stati per il combobox ──────────────*/
  @AuraEnabled(cacheable=true)
  public static List<PicklistItem> getAvailableStatuses() {
    List<PicklistItem> res = new List<PicklistItem>();
    for (
      Schema.PicklistEntry pe : GiftTransactionDesignation.Status__c.getDescribe()
        .getPicklistValues()
    )
      res.add(new PicklistItem(pe.getValue(), pe.getLabel()));
    return res;
  }

  /*──────── metodi di supporto (immutati) ───────*/
  @AuraEnabled(cacheable=true)
  public static BudgetWrapper getBudgetIdForCurrentUser() {
    User u = [SELECT CompanyName FROM User WHERE Id = :UserInfo.getUserId()];
    if (String.isBlank(u.CompanyName))
      return null;

    Account acc = [SELECT Id FROM Account WHERE Name = :u.CompanyName LIMIT 1];
    if (acc == null)
      return null;

    GiftDesignation gd = [
      SELECT Id, DEFAULT_PRG__c
      FROM GiftDesignation
      WHERE Partner__c = :acc.Id
      LIMIT 1
    ];
    if (gd == null)
      return null;
    System.debug(
      LoggingLevel.WARN,
      'User[' +
        UserInfo.getUserId() +
        '] ► BudgetId: ' +
        (gd == null ? 'null' : gd.Id)
    );
    return new BudgetWrapper(gd.Id, gd.DEFAULT_PRG__c);
  }

  @AuraEnabled(cacheable=true)
  public static List<String> getAvailableYears() {
    Set<String> s = new Set<String>();
    for (Anno_Reportistica__c a : [SELECT Name FROM Anno_Reportistica__c])
      if (!String.isBlank(a.Name))
        s.add(a.Name);
    List<String> y = new List<String>(s);
    y.sort();
    return y;
  }

  /*──────────────────────── budgets per combobox ───────────────────────*/
  @AuraEnabled(cacheable=true)
  public static List<IdLabelPair> getAvailableBudgets(String programId) {
    String q =
      'SELECT Id, Name ' +
      'FROM GiftDesignation ' +
      'WHERE IsActive   = TRUE ';
    if (!String.isBlank(programId)) {
      /* Filtra sui budget collegati al Programma scelto */
      q += 'AND Program__c = :programId ';
    }
    q += 'ORDER BY Name';

    List<IdLabelPair> res = new List<IdLabelPair>();
    for (GiftDesignation g : Database.query(q)) {
      res.add(new IdLabelPair(g.Id, g.Name));
    }
    System.debug(LoggingLevel.WARN, 'SOQL getAvailableBudgets ► ' + q);
    return res;
  }

  /*─────────────────────────── ❸ programmi disponibili (con query) ──────────────────────────*/
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getAvailablePrograms(String budgetId) {
    /* Caso fallback: nessun budget ► tutti i Program */
    if (String.isBlank(budgetId)) {
      String qAll = 'SELECT Id, Name FROM Program ORDER BY Name';
      List<Program> allProgs = Database.query(qAll);
      List<String> allIds = new List<String>();
      for (Program p : allProgs)
        allIds.add((String) p.Id);
      return new Map<String, Object>{
        'records' => allProgs,
        'queryEnrollment' => null,
        'query' => qAll,
        'programIds' => allIds
      };
    }

    /* 1. Ricavo l’Account (Partner__c) dal GiftDesignation */
    List<GiftDesignation> gdl = [
      SELECT Partner__c
      FROM GiftDesignation
      WHERE Id = :budgetId
      LIMIT 1
    ];
    Id accountId = gdl.isEmpty() ? null : gdl[0].Partner__c;

    if (accountId == null) {
      return new Map<String, Object>{
        'records' => new List<Program>(),
        'queryEnrollment' => null,
        'query' => null,
        'programIds' => new List<String>()
      };
    }

    /* 2. ProgramEnrollment per l’Account */
    String qPE =
      'SELECT ProgramId ' +
      'FROM ProgramEnrollment ' +
      'WHERE AccountId = \'' +
      String.escapeSingleQuotes(accountId) +
      '\' ' +
      'AND ProgramId != NULL ' +
      'AND IsActive = TRUE';

    List<ProgramEnrollment> enrolls = Database.query(qPE);
    Set<Id> pIds = new Set<Id>();
    for (ProgramEnrollment pe : enrolls) {
      pIds.add(pe.ProgramId);
    }

    System.debug('ProgramEnrollment IDs ► ' + pIds);

    if (pIds.isEmpty()) {
      return new Map<String, Object>{
        'records' => new List<Program>(),
        'queryEnrollment' => qPE,
        'query' => null,
        'programIds' => new List<String>()
      };
    }

    /* 3. Preparazione lista Id come stringhe */
    List<String> idStrings = new List<String>();

    for (Id pid : pIds) {
      idStrings.add((String) pid);
    }
    String idList = '\'' + String.join(idStrings, '\',\'') + '\'';

    /* 4. Query finale Program */
    String qProg =
      'SELECT Id, Name FROM Program ' +
      'WHERE Id IN (' +
      idList +
      ') ' +
      'ORDER BY Name';

    System.debug(LoggingLevel.WARN, 'SOQL ProgramEnrollment ► ' + qPE);
    System.debug(LoggingLevel.WARN, 'SOQL Program ► ' + qProg);

    return new Map<String, Object>{
      'records' => Database.query(qProg),
      'queryEnrollment' => qPE,
      'query' => qProg,
      'programIds' => idStrings
    };
  }
}