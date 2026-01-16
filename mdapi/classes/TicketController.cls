/*──────────────────────────────────
 * TicketController.cls
 * Rev. 05-lug-2025
 *──────────────────────────────────*/
public with sharing class TicketController {
  /*────────────────── WRAPPERS ──────────────────*/
  public virtual class IdLabelPair {
    @AuraEnabled
    public String label { get; set; }
    @AuraEnabled
    public String value { get; set; }
    public IdLabelPair(String value, String label) {
      this.label = label;
      this.value = value;
    }
  }

  public class BudgetWrapper extends IdLabelPair {
    @AuraEnabled
    public Boolean isDefault { get; set; }
    public BudgetWrapper(String id, String name, Boolean isDefault) {
      super(id, name);
      this.isDefault = isDefault;
    }
  }

  public class ComuneWrapper {
    @AuraEnabled
    public String id { get; set; }
    @AuraEnabled
    public String name { get; set; }
    @AuraEnabled
    public String province { get; set; }
    @AuraEnabled
    public String region { get; set; }
    public ComuneWrapper(
      String id,
      String name,
      String province,
      String region
    ) {
      this.id = id;
      this.name = name;
      this.province = province;
      this.region = region;
    }
  }

  /*──────── 1)  BUDGET PRE-SELEZIONATO ────────*/

  @AuraEnabled(cacheable=true)
  public static BudgetWrapper getBudgetId() {
    /* 1️⃣  Recupero la CompanyName dell’utente */
    User u = [
      SELECT CompanyName
      FROM User
      WHERE Id = :UserInfo.getUserId()
      LIMIT 1
    ];
    if (String.isBlank(u.CompanyName)) {
      return null; // → niente CompanyName ⇒ niente budget
    }

    /* 2️⃣  Account corrispondente alla CompanyName */
    List<Account> accs = [
      SELECT Id
      FROM Account
      WHERE Name = :u.CompanyName
      LIMIT 1
    ];
    if (accs.isEmpty()) {
      return null; // → l’utente non è legato a un Account
    }
    Id accId = accs[0].Id;

    /* 3️⃣  GiftDesignation collegata all’Account sul programma Sorriso Sospeso” */
    List<GiftDesignation> gds = [
      SELECT Id, Name, DEFAULT_PRG__c
      FROM GiftDesignation
      WHERE Partner__c = :accId AND Program__r.Name = 'Sorriso Sospeso'
      LIMIT 1
    ];
    if (gds.isEmpty()) {
      return null; // → nessun budget trovato
    }

    GiftDesignation gd = gds[0];
    return new BudgetWrapper(gd.Id, gd.Name, gd.DEFAULT_PRG__c);
  }

  @AuraEnabled(cacheable=true)
  public static List<String> getAvailableTypes() {
    Schema.DescribeFieldResult fieldResult = Ticket__c.Type__c.getDescribe();
    List<Schema.PicklistEntry> ple = fieldResult.getPicklistValues();
    List<String> values = new List<String>();
    for (Schema.PicklistEntry p : ple) {
      values.add(p.getValue());
    }
    return values;
  }

  /*──────── 2)  QUERY CON FILTRI + TOTALI ────────*/
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getRelatedRecords(
    String year,
    String month,
    String invoiceNumber,
    String budgetId,
    Integer limitSize,
    Integer offsetSize,
    String city,
    String province,
    String region,
    String type
  ) {
    /* 2.1  condizioni dinamiche */
    List<String> conditions = new List<String>();

    if (!String.isBlank(year))
      conditions.add(
        'CALENDAR_YEAR(Show__r.Datetime__c) = ' +
        String.escapeSingleQuotes(year)
      );

    if (!String.isBlank(month))
      conditions.add(
        'CALENDAR_MONTH(Show__r.Datetime__c) = ' +
        String.escapeSingleQuotes(month)
      );

    if (!String.isBlank(invoiceNumber))
      conditions.add(
        'Invoice__r.Invoice_Number__c LIKE \'%' +
          String.escapeSingleQuotes(invoiceNumber) +
          '%\''
      );

    if (!String.isBlank(budgetId))
      conditions.add(
        'Invoice__r.Budget__c = \'' + String.escapeSingleQuotes(budgetId) + '\''
      );

    if (!String.isBlank(city))
      conditions.add('City__c = \'' + String.escapeSingleQuotes(city) + '\'');

    if (!String.isBlank(province))
      conditions.add(
        'Province__c = \'' + String.escapeSingleQuotes(province) + '\''
      );

    if (!String.isBlank(region))
      conditions.add(
        'Region__c = \'' + String.escapeSingleQuotes(region) + '\''
      );

    if (!String.isBlank(type))
      conditions.add('Type__c = \'' + String.escapeSingleQuotes(type) + '\'');

    String whereClause = conditions.isEmpty()
      ? ''
      : ' WHERE ' + String.join(conditions, ' AND ');

    /* 2.2  query finale */
    String soql =
      'SELECT Id, Name, Uses__c, Price__c, IsFree__c,' +
      '       City__c, Province__c, Region__c, Type__c,' +
      '       TicketAvailability__c, TicketAvailability__r.Name,' +
      '       Show__c, Show__r.Name, Show__r.Datetime__c,' +
      '       Invoice__c, Invoice__r.Name, Invoice__r.Invoice_Number__c,' +
      '       Invoice__r.Budget__c, Invoice__r.Budget__r.Name,' +
      '       Invoice__r.Account__c, Invoice__r.Account__r.Name' +
      '  FROM Ticket__c' +
      whereClause +
      ' ORDER BY Show__r.Datetime__c DESC' +
      ' LIMIT ' +
      limitSize +
      ' OFFSET ' +
      offsetSize;

    System.debug('SOQL Ticket: ' + soql);

    List<Ticket__c> tickets = Database.query(soql);

    /* 2.3  totali */
    Decimal totalUses = 0;
    Decimal totalAmount = 0;
    for (Ticket__c t : tickets) {
      if (t.Uses__c != null)
        totalUses += t.Uses__c;
      if (t.Price__c != null)
        totalAmount += t.Price__c;
    }

    /* 2.4  output */
    return new Map<String, Object>{
      'records' => tickets,
      'totalUses' => totalUses,
      'totalAmount' => totalAmount,
      'query' => soql
    };
  }

  @AuraEnabled(cacheable=true)
  public static List<String> getAvailableYears() {
    List<AggregateResult> agg = [
      SELECT Name
      FROM Anno_Reportistica__c
      WHERE Programma__r.Name = 'Sorriso Sospeso'
      GROUP BY Name
      ORDER BY Name
    ];

    List<String> years = new List<String>();
    for (AggregateResult ar : agg) {
      years.add((String) ar.get('Name'));
    }
    return years;
  }

  /*──────── 4)  BUDGET DISPONIBILI ────────*/
  @AuraEnabled(cacheable=true)
  public static List<IdLabelPair> getAvailableBudgets() {
    /* se il Programma NON è Sorriso Sospeso” sostituisci qui ↓↓↓ */
    List<GiftDesignation> gds = [
      SELECT Id, Name
      FROM GiftDesignation
      WHERE Program__r.Name = 'Sorriso Sospeso'
      ORDER BY Name
    ];
    List<IdLabelPair> opts = new List<IdLabelPair>();
    for (GiftDesignation g : gds)
      opts.add(new IdLabelPair(g.Id, g.Name));
    return opts;
  }

  /*──────── 5)  ELENCO COMUNI (filtri geo) ────────*/
  @AuraEnabled(cacheable=true)
  public static List<ComuneWrapper> getAllComuni() {
    List<Comune__c> comuni = [
      SELECT Id, Name, Provincia__c, Regione__c
      FROM Comune__c
      ORDER BY Name
    ];
    List<ComuneWrapper> out = new List<ComuneWrapper>();
    for (Comune__c c : comuni)
      out.add(new ComuneWrapper(c.Id, c.Name, c.Provincia__c, c.Regione__c));
    return out;
  }
}