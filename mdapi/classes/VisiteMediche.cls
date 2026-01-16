public with sharing class VisiteMediche {
  private static final String TEMPO_SOSPESO = 'Tempo Sospeso';
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

    /* 3️⃣  GiftDesignation collegata all’Account sul programma “Tempo Sospeso” */
    List<GiftDesignation> gds = [
      SELECT Id, Name, DEFAULT_PRG__c
      FROM GiftDesignation
      WHERE Partner__c = :accId AND Program__r.Name = :TEMPO_SOSPESO
      LIMIT 1
    ];
    if (gds.isEmpty()) {
      return null; // → nessun budget trovato
    }

    GiftDesignation gd = gds[0];
    Boolean isDefault = gd.DEFAULT_PRG__c == null ? false : gd.DEFAULT_PRG__c;
    return new BudgetWrapper(gd.Id, gd.Name, isDefault);
  }

  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getRelatedRecords(
    String year,
    String tipoVisita,
    String month,
    String beneficiario,
    String invoiceNumber,
    String budgetId,
    String donorId,
    Integer limitSize,
    Integer offsetSize,
    String city,
    String province,
    String region
  ) {
    Boolean hasBudgetFilter = !String.isBlank(budgetId);

    String baseQuery =
      'SELECT Id, Name, Beneficiary_Type__c, Duration_in_minutes__c, ' +
      'Quantity__c, Invoice__c, Invoice__r.Name, Invoice__r.Invoice_Number__c, ' +
      'Invoice__r.Budget__c, Invoice__r.Budget__r.Name, ' +
      'Invoice__r.Account__c, Invoice__r.Account__r.Name, ' +
      'Tipo_Visita__c, Tipo_Visita__r.Id, Tipo_Visita__r.Name, ' +
      'Amount__c, Data_della_Visita__c, City__c, Province__c, Region__c ' +
      'FROM Visit__c';

    List<String> conditions = new List<String>();

    if (hasBudgetFilter) {
      conditions.add(
        'Invoice__r.Budget__c = \'' + String.escapeSingleQuotes(budgetId) + '\''
      );
    }
    if (!String.isBlank(year)) {
      conditions.add(
        'CALENDAR_YEAR(Data_della_Visita__c) = ' +
        String.escapeSingleQuotes(year)
      );
    }

    if (!String.isBlank(tipoVisita)) {
      List<String> tipi = tipoVisita.split(',');
      List<String> condTipo = new List<String>();
      for (String t : tipi) {
        condTipo.add(
          'Tipo_Visita__r.Name = \'' +
            String.escapeSingleQuotes(t.trim()) +
            '\''
        );
      }
      conditions.add('(' + String.join(condTipo, ' OR ') + ')');
    }

    if (!String.isBlank(month)) {
      conditions.add(
        'CALENDAR_MONTH(Data_della_Visita__c) = ' +
        String.escapeSingleQuotes(month)
      );
    }

    if (!String.isBlank(beneficiario)) {
      conditions.add(
        'Beneficiary_Type__c = \'' +
          String.escapeSingleQuotes(beneficiario) +
          '\''
      );
    }

    if (!String.isEmpty(invoiceNumber)) {
      String likeValue = '%' + invoiceNumber + '%';
      conditions.add(
        'Invoice__r.Invoice_Number__c LIKE \'' +
          String.escapeSingleQuotes(likeValue) +
          '\''
      );
    }

    if (!String.isBlank(donorId)) {
      conditions.add(
        'Invoice__r.Account__c = \'' + String.escapeSingleQuotes(donorId) + '\''
      );
    }

    if (!String.isBlank(city)) {
      conditions.add('City__c = \'' + String.escapeSingleQuotes(city) + '\'');
    }
    if (!String.isBlank(province)) {
      conditions.add(
        'Province__c = \'' + String.escapeSingleQuotes(province) + '\''
      );
    }
    if (!String.isBlank(region)) {
      conditions.add(
        'Region__c = \'' + String.escapeSingleQuotes(region) + '\''
      );
    }

    String whereClause = conditions.isEmpty()
      ? ''
      : ' WHERE ' + String.join(conditions, ' AND ');

    /* --- 2. Query di aggregazione SENZA LIMIT/OFFSET --------------- */
    String aggQuery =
      'SELECT ' +
      '  SUM(Duration_in_minutes__c)    totMinutes, ' +
      '  SUM(Quantity__c)               totVisits,  ' +
      '  SUM(Amount__c)                 totAmount   ' +
      'FROM Visit__c' +
      whereClause;

    AggregateResult ar = Database.query(aggQuery);
    Decimal totalMinutes = (Decimal) ar.get('totMinutes');
    Decimal totalVisits = (Decimal) ar.get('totVisits');
    Decimal totalAmount = (Decimal) ar.get('totAmount');

    String fullQuery =
      baseQuery +
      whereClause +
      ' ORDER BY Data_della_Visita__c DESC' +
      ' LIMIT ' +
      limitSize +
      ' OFFSET ' +
      offsetSize;

    System.debug('SOQL VISITE: ' + fullQuery);

    List<Visit__c> records = Database.query(fullQuery);

    return new Map<String, Object>{
      'records' => records,
      'totalMinutes' => totalMinutes != null ? totalMinutes : 0,
      'totalVisits' => totalVisits != null ? totalVisits : 0,
      'totalAmount' => totalAmount != null ? totalAmount : 0,
      'query' => fullQuery,
      'aggQuery' => aggQuery
    };
  }

  @AuraEnabled(cacheable=true)
  public static List<String> getBeneficiaryTypes() {
    List<String> options = new List<String>();
    Schema.DescribeFieldResult fieldDesc = Visit__c.Beneficiary_Type__c.getDescribe();
    for (Schema.PicklistEntry entry : fieldDesc.getPicklistValues()) {
      options.add(entry.getValue());
    }
    return options;
  }

  @AuraEnabled(cacheable=true)
  public static List<String> getAvailableYears() {
    List<AggregateResult> agg = [
      SELECT Name
      FROM Anno_Reportistica__c
      GROUP BY Name
      ORDER BY Name
    ];

    List<String> years = new List<String>();
    for (AggregateResult ar : agg) {
      years.add((String) ar.get('Name'));
    }
    return years;
  }

  @AuraEnabled(cacheable=true)
  public static List<IdLabelPair> getAvailableBudgets() {
    List<GiftDesignation> budgets = [
      SELECT Id, Name
      FROM GiftDesignation
      WHERE Program__r.Name = :TEMPO_SOSPESO // 👈 filtro sul programma
      ORDER BY Name
    ];
    List<IdLabelPair> options = new List<IdLabelPair>();
    for (GiftDesignation b : budgets) {
      options.add(new IdLabelPair(b.Id, b.Name));
    }
    return options;
  }

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
    public Boolean isDefault;
    public BudgetWrapper(String id, String name, Boolean isDefault) {
      super(id, name);
      this.isDefault = isDefault;
    }
  }

  @AuraEnabled(cacheable=true)
  public static List<Tipo_Visita__c> getTipiVisita() {
    return [SELECT Id, Name FROM Tipo_Visita__c ORDER BY Name];
  }

  // AGGIUNGI (o riutilizza) un metodo getAllComuni()
  // (Se non lo hai già, puoi replicare quello usato in Fatture)
  @AuraEnabled(cacheable=true)
  public static List<ComuneWrapper> getAllComuni() {
    List<Comune__c> comuni = [
      SELECT Id, Name, Provincia__c, Regione__c
      FROM Comune__c
      ORDER BY Name
    ];
    List<ComuneWrapper> result = new List<ComuneWrapper>();
    for (Comune__c c : comuni) {
      result.add(new ComuneWrapper(c.Id, c.Name, c.Provincia__c, c.Regione__c));
    }
    return result;
  }

  /**
   * Restituisce l'elenco (deduplicato) delle combinazioni città/provincia/regione
   * presenti sui record Visit__c, per permettere filtri coerenti anche su Experience Cloud.
   */
  @AuraEnabled(cacheable=true)
  public static List<ComuneWrapper> getVisitLocations() {
    List<AggregateResult> groups = [
      SELECT City__c, Province__c, Region__c
      FROM Visit__c
      WHERE City__c != NULL OR Province__c != NULL OR Region__c != NULL
      GROUP BY City__c, Province__c, Region__c
      ORDER BY City__c, Province__c, Region__c
    ];

    List<ComuneWrapper> result = new List<ComuneWrapper>();
    for (AggregateResult aggr : groups) {
      String city = (String) aggr.get('City__c');
      String province = (String) aggr.get('Province__c');
      String region = (String) aggr.get('Region__c');
      String key = String.join(
        new List<String>{
          city == null ? '' : city,
          province == null ? '' : province,
          region == null ? '' : region
        },
        '|'
      );
      result.add(new ComuneWrapper(key, city, province, region));
    }
    return result;
  }

  /**
   * Donatori filtrati per ProgramEnrollment e finestra temporale.
   * - programId: opzionale; se null usa Program con Name = 'Tempo Sospeso'
   * - year: se blank → considera solo enrollment attivi (IsActive=TRUE) in qualunque data
   * - month: se blank → applica solo il filtro anno (attivo almeno un giorno nell'anno)
   *          altrimenti attivo almeno un giorno nel mese specificato
   */
  @AuraEnabled(cacheable=true)
  public static List<Fatture.IdNameWrapper> getAvailableDonors(
    String year,
    String month,
    Id programId
  ) {
    Id prgId = programId;
    if (prgId == null) {
      List<Program> ps = [
        SELECT Id
        FROM Program
        WHERE Name = :TEMPO_SOSPESO
        LIMIT 1
      ];
      if (!ps.isEmpty()) {
        prgId = ps[0].Id;
      }
    }

    Set<Id> accIds = new Set<Id>();

    if (String.isBlank(year)) {
      // Nessun filtro anno/mese → enrollment attivi in qualunque data
      String baseQuery = 'SELECT AccountId FROM ProgramEnrollment WHERE AccountId != NULL AND IsActive = TRUE';
      if (prgId != null) {
        baseQuery += ' AND ProgramId = :prgId';
      }
      baseQuery += ' AND (Tipo_Stakeholder__c = \'Grande Donatore\' OR Tipo_Stakeholder__c = \'Piccolo Donatore\')';

      List<ProgramEnrollment> enrollments = Database.query(baseQuery);
      if (enrollments.isEmpty()) {
        // In alcuni org il campo Tipo_Stakeholder__c è read-only: fallback senza filtro
        String fallbackQuery = 'SELECT AccountId FROM ProgramEnrollment WHERE AccountId != NULL AND IsActive = TRUE';
        if (prgId != null) {
          fallbackQuery += ' AND ProgramId = :prgId';
        }
        enrollments = Database.query(fallbackQuery);
      }
      for (ProgramEnrollment pe : enrollments)
        accIds.add(pe.AccountId);
    } else {
      Integer y = Integer.valueOf(year);
      Integer mStart = String.isBlank(month) ? 1 : Integer.valueOf(month);
      Integer mEnd = String.isBlank(month) ? 12 : Integer.valueOf(month);
      Date periodStart = Date.newInstance(y, mStart, 1);
      Date periodEnd = Date.newInstance(y, mEnd, Date.daysInMonth(y, mEnd));

      // Overlap logica: StartDate <= periodEnd AND (EndDate == NULL OR EndDate >= periodStart)
      String baseQuery =
        'SELECT AccountId, StartDate, EndDate FROM ProgramEnrollment WHERE AccountId != NULL' +
        ' AND StartDate <= :periodEnd AND (EndDate = NULL OR EndDate >= :periodStart)';
      if (prgId != null) {
        baseQuery += ' AND ProgramId = :prgId';
      }
      baseQuery += ' AND (Tipo_Stakeholder__c = \'Grande Donatore\' OR Tipo_Stakeholder__c = \'Piccolo Donatore\')';

      List<ProgramEnrollment> enrollments = Database.query(baseQuery);
      if (enrollments.isEmpty()) {
        String fallbackQuery =
          'SELECT AccountId, StartDate, EndDate FROM ProgramEnrollment WHERE AccountId != NULL' +
          ' AND StartDate <= :periodEnd AND (EndDate = NULL OR EndDate >= :periodStart)';
        if (prgId != null) {
          fallbackQuery += ' AND ProgramId = :prgId';
        }
        enrollments = Database.query(fallbackQuery);
      }
      for (ProgramEnrollment pe : enrollments)
        accIds.add(pe.AccountId);
    }

    if (accIds.isEmpty())
      return new List<Fatture.IdNameWrapper>();

    // Preleva IsPersonAccount per mappare lo Stakeholder Type: Company / PersonAccount
    List<Account> accs = [
      SELECT Id, Name, IsPersonAccount
      FROM Account
      WHERE Id IN :accIds
      ORDER BY Name
    ];

    // Filtro coerente con richiesta: Stakeholder Type ∈ { Company, PersonAccount }
    // (Qui derivato da IsPersonAccount: true → PersonAccount, false → Company)
    List<Fatture.IdNameWrapper> out = new List<Fatture.IdNameWrapper>();
    for (Account a : accs) {
      // Sempre vero per Account standard: includiamo solo Company/PersonAccount
      // (Non esistono altri tipi derivati da IsPersonAccount)
      out.add(new Fatture.IdNameWrapper(a.Id, a.Name));
    }
    return out;
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

  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getVisitWithInvoiceData(
    String year,
    String month,
    String beneficiario,
    String budgetId,
    Integer limitSize,
    Integer offsetSize,
    String city,
    String province,
    String region
  ) {
    List<String> filters = new List<String>();

    if (!String.isBlank(year)) {
      filters.add(
        'CALENDAR_YEAR(Data_della_Visita__c) = ' +
        String.escapeSingleQuotes(year)
      );
    }
    if (!String.isBlank(month)) {
      filters.add(
        'CALENDAR_MONTH(Data_della_Visita__c) = ' +
        String.escapeSingleQuotes(month)
      );
    }
    if (!String.isBlank(beneficiario)) {
      filters.add(
        'Beneficiary_Type__c = \'' +
          String.escapeSingleQuotes(beneficiario) +
          '\''
      );
    }
    if (!String.isBlank(budgetId)) {
      filters.add(
        'Invoice__r.Budget__c = \'' + String.escapeSingleQuotes(budgetId) + '\''
      );
    }

    if (!String.isBlank(city)) {
      filters.add('City__c = \'' + String.escapeSingleQuotes(city) + '\'');
    }
    if (!String.isBlank(province)) {
      filters.add(
        'Province__c = \'' + String.escapeSingleQuotes(province) + '\''
      );
    }
    if (!String.isBlank(region)) {
      filters.add('Region__c = \'' + String.escapeSingleQuotes(region) + '\'');
    }

    String whereClause = filters.isEmpty()
      ? ''
      : ' WHERE ' + String.join(filters, ' AND ');

    // Aggregati completi sui risultati filtrati (indipendenti da LIMIT/OFFSET)
    String aggQuery =
      'SELECT ' +
      '  SUM(Quantity__c) totVisits, ' +
      '  SUM(Amount__c)   totAmount ' +
      'FROM Visit__c' +
      whereClause;

    AggregateResult ar = Database.query(aggQuery);
    Decimal totalVisits = (Decimal) ar.get('totVisits');
    Decimal totalAmount = (Decimal) ar.get('totAmount');

    String query =
      'SELECT Id, Visit_Type__c, Quantity__c, Beneficiary_Type__c, Duration_in_minutes__c, Amount__c, Data_della_Visita__c,' +
      ' Invoice__r.Id, Invoice__r.Account__c, Invoice__r.Account__r.Name, ' +
      ' Invoice__r.Budget__c, Invoice__r.Budget__r.Name, ' +
      ' Invoice__r.Medical_Center__c, Invoice__r.Invoice_Number__c, ' +
      ' Invoice__r.Date__c, Invoice__r.Non_Profit_Signaling__c, City__c, Province__c, Region__c ' +
      'FROM Visit__c' +
      whereClause +
      ' ORDER BY Invoice__r.Date__c DESC ' +
      ' LIMIT ' +
      limitSize +
      ' OFFSET ' +
      offsetSize;

    List<Visit__c> visits = Database.query(query);

    return new Map<String, Object>{
      'records' => visits,
      'query' => query,
      'totalVisits' => totalVisits != null ? totalVisits : 0,
      'totalAmount' => totalAmount != null ? totalAmount : 0
    };
  }
}