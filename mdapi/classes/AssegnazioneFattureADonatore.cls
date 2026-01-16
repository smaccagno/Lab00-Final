/*─────────────────────────────────────────────────────────────
  ASSEGNAZIONE FATTURE A DONATORE – APEX CONTROLLER
  Rev.: 13-May-2025  (aggiunta fieldConfig per colonne dinamiche)
─────────────────────────────────────────────────────────────*/
public with sharing class AssegnazioneFattureADonatore {
  private static final Integer INIT_INVOICE_LIMIT = 50; // primo chunk per performance
  /*────────────────────────────────────────────
   *  ► UTILITÀ  – concatena campi dinamici alla SELECT
   *───────────────────────────────────────────*/
  private static String buildSelect(
    String base,
    List<ProgramFieldConfigUtil.FieldConf> addl
  ) {
    if (addl == null || addl.isEmpty())
      return base;
    // Evita duplicati tra base e dinamiche
    Set<String> baseFields = new Set<String>();
    for (String token : base.split(',')) {
      if (token == null) continue;
      String t = token.trim().toLowerCase();
      if (t != '') baseFields.add(t);
    }
    List<String> dynKeep = new List<String>();
    for (ProgramFieldConfigUtil.FieldConf f : addl) {
      if (f == null || String.isBlank(f.fieldApi)) continue;
      String key = f.fieldApi.trim().toLowerCase();
      if (!baseFields.contains(key)) dynKeep.add(f.fieldApi);
    }
    if (dynKeep.isEmpty()) return base;
    return base + ',' + String.join(dynKeep, ',');
  }

  /**
   * Costruisce la clausola WHERE per la paginazione senza OFFSET.
   * Utilizza il cursore dell'ultima fattura restituita per simulare il keyset pagination.
   */
  private static String quoteDate(Date value) {
    return value == null ? 'NULL' : String.valueOf(value);
  }

  private static String quoteDatetime(Datetime value) {
    return value == null
      ? 'NULL'
      : value.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'');
  }

  private static String buildInvoicePaginationWhere(
    Date lastInvoiceDate,
    Datetime lastCreatedDate,
    Id lastInvoiceId
  ) {
    if (lastCreatedDate == null || lastInvoiceId == null) {
      return null;
    }

    String createdExpr = quoteDatetime(lastCreatedDate);
    String idExpr = '\'' + String.escapeSingleQuotes((String)lastInvoiceId) + '\'';

    if (lastInvoiceDate == null) {
      return '(Date__c = NULL AND (CreatedDate < ' + createdExpr +
        ' OR (CreatedDate = ' + createdExpr + ' AND Id < ' + idExpr + ')))';
    }

    String dateExpr = quoteDate(lastInvoiceDate);
    return '((Date__c != NULL AND (Date__c < ' + dateExpr +
      ' OR (Date__c = ' + dateExpr + ' AND (CreatedDate < ' + createdExpr +
      ' OR (CreatedDate = ' + createdExpr + ' AND Id < ' + idExpr + ')))))' +
      ' OR (Date__c = NULL))';
  }

  /*────────────────────────────────────────────
   *  ► END-POINT STANDARD (senza filtri)
   *───────────────────────────────────────────*/
  @AuraEnabled(cacheable=true)
  public static MyWrapper getAllDataForLWC() {
    return getAllDataForLWCWithParams(null, null, null);
  }

  /*────────────────────────────────────────────
   *  ► END-POINT PRINCIPALE CON FILTRI
   *───────────────────────────────────────────*/
  @AuraEnabled(cacheable=true)
  public static MyWrapper getAllDataForLWCWithParams(
    Id selectedProgram,
    Id selectedGiftDesignation,
    String selectedAnno
  ) {
    /* wrapper di risposta */
    MyWrapper wrap = new MyWrapper();

    /*────────────────────────────────────────
     * 1)  FIELD CONFIG DINAMICO
     *     (stesse colonne del componente “Program Overview”)
     *────────────────────────────────────────*/
    if (selectedProgram != null) {
      /* ricavo il DeveloperName del Programma (spazi → “_”) */
      String programDevName = [
          SELECT Name
          FROM Program
          WHERE Id = :selectedProgram
        ]
        .Name.replace(' ', '_');

      Set<String> objs = new Set<String>{
        'Anno_Reportistica__c',
        'Overview_Budget_per_Anno__c',
        'Reporting_Year__c',
        'Invoice__c'
      };

      wrap.fieldConfig = ProgramFieldConfigUtil.getFieldConfig(
        programDevName,
        objs,
        null
      );
    } else {
      wrap.fieldConfig = new Map<String, List<ProgramFieldConfigUtil.FieldConf>>();
    }

    /* ► ENROLLED ACCOUNTS */
    Set<Id> enrolledAccountIds;

    if (selectedProgram == null) {
      enrolledAccountIds = new Set<Id>(); // nessun filtro
    } else {
      enrolledAccountIds = new Set<Id>();

      for (ProgramEnrollment pe : [
        SELECT AccountId
        FROM ProgramEnrollment
        WHERE
          ProgramId = :selectedProgram
          AND IsActive = TRUE
          AND AccountId != NULL
      ]) {
        enrolledAccountIds.add(pe.AccountId); // ⚠️  AccountId, non pe.Id
      }
    }

    wrap.enrolledAccountIds = new List<Id>(enrolledAccountIds);

    /*────────────────────────────────────────
     * 2)  PROGRAMMI
     *────────────────────────────────────────*/
    wrap.programList = [
      SELECT Id, Name
      FROM Program
      ORDER BY Name
    ];

    /*────────────────────────────────────────
     * 3)  ANNI DI REPORTISTICA
     *────────────────────────────────────────*/
    /* ------------- SELECT dinamica per Anno_Reportistica__c --------------- */
    String arBase = 'Id, Name, Programma__c';
    String arSel = buildSelect(
      arBase,
      wrap.fieldConfig.get('Anno_Reportistica__c')
    );

    wrap.annoReportisticaList = Database.query(
      'SELECT ' + arSel + ' FROM Anno_Reportistica__c ORDER BY Name DESC'
    );

    /*────────────────────────────────────────
     * 4)  GIFT DESIGNATION (budget di alto livello)
     *────────────────────────────────────────*/
    wrap.giftDesignationList = [
      SELECT Id, Name
      FROM GiftDesignation
      ORDER BY Name
    ];

    /*────────────────────────────────────────
     * 5)  OVERVIEW BUDGET PER ANNO
     *────────────────────────────────────────*/
    /* ------------- SELECT dinamica per Overview_Budget_per_Anno__c --------- */
    String budBase = 'Id, Name, Programma__c, Anno__c, Budget__c, Budget__r.Partner__c';
    String budSel = buildSelect(
      budBase,
      wrap.fieldConfig.get('Overview_Budget_per_Anno__c')
    );

    wrap.budgetList = Database.query(
      'SELECT ' +
        budSel +
        ' FROM Overview_Budget_per_Anno__c' +
        ' ORDER BY Name'
    );

    /*────────────────────────────────────────
     * 6)  REPORTING YEAR
     *────────────────────────────────────────*/
    /* ------------- SELECT dinamica per Reporting_Year__c ------------------- */
    String ryBase = 'Id, Nome_Donatore__c, Holding__c, Programma__c, Year__c, Account__c,Account__r.DEFAULT__c, Account__r.GRATUITO__c';
    String rySel = buildSelect(
      ryBase,
      wrap.fieldConfig.get('Reporting_Year__c')
    );

    wrap.reportingYearList = Database.query(
      'SELECT ' + rySel + ' FROM Reporting_Year__c'
    );

    /*────────────────────────────────────────
     * 7)  GIFT TRANSACTION DESIGNATION – filtro lato Apex
     *────────────────────────────────────────*/
    /*
     * Nota: in modalità embedded possiamo ricevere come "selectedGiftDesignation"
     * sia l'Id della GiftDesignation (GD) sia l'Id di un Overview_Budget_per_Anno__c (OB/budgetId).
     * Per robustezza normalizziamo a un insieme di OB ammessi e filtriamo su quello.
     */

    Set<Id> allowedObIds = new Set<Id>();
    if (selectedGiftDesignation != null) {
      Boolean paramIsObId = false;
      for (Overview_Budget_per_Anno__c ob : wrap.budgetList) {
        if (ob.Id == selectedGiftDesignation) {
          paramIsObId = true;
          break;
        }
      }

      if (paramIsObId) {
        // Il parametro è un OB specifico
        for (Overview_Budget_per_Anno__c ob : wrap.budgetList) {
          if (
            ob.Id == selectedGiftDesignation &&
            (selectedAnno == null ||
            ob.Anno__c == selectedAnno)
          ) {
            allowedObIds.add(ob.Id);
          }
        }
      } else {
        // Il parametro è una GD ⇒ includi tutti gli OB figli (eventualmente filtrati per anno)
        for (Overview_Budget_per_Anno__c ob : wrap.budgetList) {
          if (
            ob.Budget__c == selectedGiftDesignation &&
            (selectedAnno == null ||
            ob.Anno__c == selectedAnno)
          ) {
            allowedObIds.add(ob.Id);
          }
        }
      }
    }

    List<GiftTransactionDesignation> allGTD = [
      SELECT
        Id,
        Amount,
        Anno_Distribuzione__c,
        Programma__c,
        Overview_Budget_per_Anno__c,
        /*  ► NUOVO campo di “link” al Reporting_Year  */
        Overview_Donatore_per_Anno__c,
        GiftDesignationId,
        Data_di_Competenza__c,
        /*  ► Campi pagamento per distinguere Pagati */
        Payment__c,
        Payment__r.Status__c,
        Data_di_Pagamento__c
      FROM GiftTransactionDesignation
    ];

    List<GiftTransactionDesignation> filteredGTD = new List<GiftTransactionDesignation>();
    for (GiftTransactionDesignation gtd : allGTD) {
      Boolean ok = true;

      /* filtro Programma */
      if (
        selectedProgram != null &&
        (gtd.Programma__c == null ||
        ((String) gtd.Programma__c).substring(0, 15) !=
        ((String) selectedProgram).substring(0, 15))
      ) {
        ok = false;
      }

      /* filtro Budget/GD ⇢ usa l'insieme di OB ammessi se presente */
      if (ok && selectedGiftDesignation != null) {
        if (!allowedObIds.contains(gtd.Overview_Budget_per_Anno__c)) {
          ok = false;
        }
      }

      /* filtro Anno */
      if (
        ok &&
        selectedAnno != null &&
        gtd.Anno_Distribuzione__c != selectedAnno
      ) {
        ok = false;
      }

      /* filtro Pagato: accetta solo allocazioni con pagamento chiuso */
      if (ok) {
        Boolean isPaid = false;
        try {
          isPaid =
            (gtd.Payment__r != null && gtd.Payment__r.Status__c == 'Pagato') ||
            (gtd.Data_di_Pagamento__c != null);
        } catch (Exception e) {
          isPaid = (gtd.Data_di_Pagamento__c != null);
        }
        ok = isPaid;
      }

      if (ok)
        filteredGTD.add(gtd);
    }
    wrap.giftTransactionDesignationList = filteredGTD;
    wrap.gtdQueryString =
      'Filtraggio Apex post-query. Record iniziali: ' +
      allGTD.size() +
      ', dopo filtro: ' +
      filteredGTD.size();

    /*────────────────────────────────────────
     * 8)  INVOICE – query dinamica
     *────────────────────────────────────────*/

    /* -----------------------------------------------
     * 8) INVOICE – SELECT dinamica con i campi summary
     * --------------------------------------------- */
    String invBase =
      'Id, Name, Invoice_Number__c, Date__c, CreatedDate, Data_di_Competenza__c, ' +
      'Nome_Donatore__c, ' +
      'Totale_Fattura__c, Overview_Budget_per_Anno__c, ' +
      'Overview_Budget_per_Anno__r.Name, Overview_Budget_per_Anno__r.Budget__c, ' +
      'Anno_di_Competenza__c, Reporting_Year__c';

    /* gli stessi fieldApi usati per Reporting_Year__c sono presenti su Invoice */
    String invSel = buildSelect(
      invBase,
      wrap.fieldConfig.get('Invoice__c') // ⇦ aggiunge i dinamici
    );

    String invQuery = 'SELECT ' + invSel + ' FROM Invoice__c';

    List<String> invWhere = new List<String>();

    /* filtro per Budget/GD (accetta sia GD Id che OB Id) */
    if (selectedGiftDesignation != null) {
      List<String> obIds = new List<String>();
      Boolean paramIsObId = false;
      for (Overview_Budget_per_Anno__c ob : wrap.budgetList) {
        if (ob.Id == selectedGiftDesignation) {
          paramIsObId = true;
          break;
        }
      }
      for (Overview_Budget_per_Anno__c ob : wrap.budgetList) {
        Boolean matches = paramIsObId
          ? ob.Id == selectedGiftDesignation
          : ob.Budget__c == selectedGiftDesignation;
        if (matches && (selectedAnno == null || ob.Anno__c == selectedAnno)) {
          obIds.add('\'' + String.escapeSingleQuotes(ob.Id) + '\'');
        }
      }
      invWhere.add(
        obIds.isEmpty()
          ? 'Id = null' /* forza 0 righe */
          : 'Overview_Budget_per_Anno__c IN (' + String.join(obIds, ',') + ')'
      );
    }

    /* filtro per Anno competenza */
    if (selectedAnno != null) {
      invWhere.add(
        'Anno_di_Competenza__c = \'' +
          String.escapeSingleQuotes(selectedAnno) +
          '\''
      );
    }

    if (!invWhere.isEmpty()) {
      invQuery += ' WHERE ' + String.join(invWhere, ' AND ');
    }
    // Ordina per data decrescente e limita a un primo chunk
    invQuery += ' ORDER BY Date__c DESC NULLS LAST, CreatedDate DESC, Id DESC';
    invQuery += ' LIMIT ' + String.valueOf(INIT_INVOICE_LIMIT);

    wrap.invoiceList = Database.query(invQuery);
    wrap.invoiceQueryString = invQuery;

    /*────────────────────────────────────────
     * 8.b)  INVOICE – aggregati completi per Totale_Fattura__c
     *       (per Reporting_Year__c e Anno_di_Competenza__c)
     *────────────────────────────────────────*/
    // Costruisci l'insieme di OB ammessi in base ai filtri correnti
    Set<Id> allowedInvObIds = new Set<Id>();
    Boolean paramIsObId = false;
    if (selectedGiftDesignation != null) {
      for (Overview_Budget_per_Anno__c ob : wrap.budgetList) {
        if (ob.Id == selectedGiftDesignation) { paramIsObId = true; break; }
      }
    }
    for (Overview_Budget_per_Anno__c ob : wrap.budgetList) {
      Boolean ok = true;
      if (selectedProgram != null && ob.Programma__c != selectedProgram) ok = false;
      if (ok && selectedAnno != null && ob.Anno__c != selectedAnno) ok = false;
      if (ok && selectedGiftDesignation != null) {
        ok = paramIsObId ? (ob.Id == selectedGiftDesignation) : (ob.Budget__c == selectedGiftDesignation);
      }
      if (ok) allowedInvObIds.add(ob.Id);
    }

    // Aggrega sempre su tutte le fatture coerenti con i filtri correnti
    wrap.invoiceTotalsByRyYear = new Map<String, Decimal>();

    String whereBase = '';
    if (!allowedInvObIds.isEmpty()) whereBase = ' WHERE Overview_Budget_per_Anno__c IN :allowedInvObIds';

    if (selectedAnno == null) {
      // 1) Con Data_di_Competenza valorizzata → raggruppo per anno di competenza
      String q1 = 'SELECT Reporting_Year__c ry, CALENDAR_YEAR(Data_di_Competenza__c) y, ' +
                  'SUM(Totale_Fattura__c) tot FROM Invoice__c' +
                  whereBase + (whereBase == '' ? ' WHERE ' : ' AND ') + 'Data_di_Competenza__c != NULL ' +
                  'GROUP BY Reporting_Year__c, CALENDAR_YEAR(Data_di_Competenza__c)';
      for (AggregateResult ar : Database.query(q1)) {
        Id ry = (Id) ar.get('ry');
        Integer y = (Integer) ar.get('y');
        Decimal tot = (Decimal) ar.get('tot');
        if (ry == null || y == null || tot == null) continue;
        String key = String.valueOf(ry) + '_' + String.valueOf(y);
        wrap.invoiceTotalsByRyYear.put(key, (wrap.invoiceTotalsByRyYear.containsKey(key) ? wrap.invoiceTotalsByRyYear.get(key) : 0) + tot);
      }

      // 2) Con Data_di_Competenza NULL → fallback su CALENDAR_YEAR(Date__c)
      String q2 = 'SELECT Reporting_Year__c ry, CALENDAR_YEAR(Date__c) y, ' +
                  'SUM(Totale_Fattura__c) tot FROM Invoice__c' +
                  whereBase + (whereBase == '' ? ' WHERE ' : ' AND ') + 'Data_di_Competenza__c = NULL AND Date__c != NULL ' +
                  'GROUP BY Reporting_Year__c, CALENDAR_YEAR(Date__c)';
      for (AggregateResult ar : Database.query(q2)) {
        Id ry = (Id) ar.get('ry');
        Integer y = (Integer) ar.get('y');
        Decimal tot = (Decimal) ar.get('tot');
        if (ry == null || y == null || tot == null) continue;
        String key = String.valueOf(ry) + '_' + String.valueOf(y);
        wrap.invoiceTotalsByRyYear.put(key, (wrap.invoiceTotalsByRyYear.containsKey(key) ? wrap.invoiceTotalsByRyYear.get(key) : 0) + tot);
      }
    } else {
      // Anno specifico → usa range date per Data_di_Competenza; fallback: Date__c
      Integer yy; try { yy = Integer.valueOf(selectedAnno); } catch (Exception e) { yy = null; }
      if (yy != null) {
        Date startOfYear = Date.newInstance(yy, 1, 1);
        Date endOfYear   = Date.newInstance(yy, 12, 31);

        String w = whereBase + (whereBase == '' ? ' WHERE ' : ' AND ');
        // 1) Competenza in anno
        String q1 = 'SELECT Reporting_Year__c ry, SUM(Totale_Fattura__c) tot FROM Invoice__c' +
                    w + 'Data_di_Competenza__c >= :startOfYear AND Data_di_Competenza__c <= :endOfYear ' +
                    'GROUP BY Reporting_Year__c';
        for (AggregateResult ar : Database.query(q1)) {
          Id ry = (Id) ar.get('ry');
          Decimal tot = (Decimal) ar.get('tot');
          if (ry == null || tot == null) continue;
          String key = String.valueOf(ry) + '_' + String.valueOf(yy);
          wrap.invoiceTotalsByRyYear.put(key, (wrap.invoiceTotalsByRyYear.containsKey(key) ? wrap.invoiceTotalsByRyYear.get(key) : 0) + tot);
        }

        // 2) Competenza NULL ma Date__c nell'anno
        String q2 = 'SELECT Reporting_Year__c ry, SUM(Totale_Fattura__c) tot FROM Invoice__c' +
                    w + 'Data_di_Competenza__c = NULL AND Date__c >= :startOfYear AND Date__c <= :endOfYear ' +
                    'GROUP BY Reporting_Year__c';
        for (AggregateResult ar : Database.query(q2)) {
          Id ry = (Id) ar.get('ry');
          Decimal tot = (Decimal) ar.get('tot');
          if (ry == null || tot == null) continue;
          String key = String.valueOf(ry) + '_' + String.valueOf(yy);
          wrap.invoiceTotalsByRyYear.put(key, (wrap.invoiceTotalsByRyYear.containsKey(key) ? wrap.invoiceTotalsByRyYear.get(key) : 0) + tot);
        }
      }
    }

    /* debug opzionale per GTD */
    List<String> dbg = new List<String>();
    for (GiftTransactionDesignation gtd : filteredGTD) {
      dbg.add(
        '- ID: ' +
          gtd.Id +
          ', Amount: ' +
          gtd.Amount +
          ', Anno: ' +
          gtd.Anno_Distribuzione__c +
          ', Programma: ' +
          gtd.Programma__c +
          ', Budget: ' +
          gtd.Overview_Budget_per_Anno__c +
          ', Donatore/Anno (link) = ' +
          gtd.Overview_Donatore_per_Anno__c +
          ', Payment = ' + gtd.Payment__c +
          ', PaymentStatus = ' + (gtd.Payment__r == null ? null : gtd.Payment__r.Status__c) +
          ', DataPagamento = ' + gtd.Data_di_Pagamento__c
      );
    }
    wrap.gtdDebugInfo = 'GTD filtrati:\n' + String.join(dbg, '\n');

    return wrap;
  }

  /**
   * Restituisce un chunk paginato di fatture in base ai filtri (Programma/Budget/Anno).
   */
  @AuraEnabled(cacheable=true)
  public static List<Invoice__c> getInvoicesChunk(
    Id selectedProgram,
    Id selectedGiftDesignation,
    String selectedAnno,
    Integer limitSize,
    Integer offsetSize,
    Date lastInvoiceDate,
    Datetime lastCreatedDate,
    Id lastInvoiceId
  ) {
    Integer lim = (limitSize == null || limitSize <= 0) ? 50 : limitSize;
    // Offset mantenuto per retrocompatibilità lato client, non più utilizzato dopo il passaggio a keyset pagination

    // Calcola gli OB validi per Programma/Anno/Budget
    String obBase = 'SELECT Id FROM Overview_Budget_per_Anno__c';
    List<String> obWhere = new List<String>();
    if (selectedProgram != null)
      obWhere.add('Programma__c = \'' + String.escapeSingleQuotes((String)selectedProgram) + '\'');
    if (selectedAnno != null)
      obWhere.add('Anno__c = \'' + String.escapeSingleQuotes(selectedAnno) + '\'');
    if (selectedGiftDesignation != null)
      obWhere.add('Budget__c = \'' + String.escapeSingleQuotes((String)selectedGiftDesignation) + '\'');
    if (!obWhere.isEmpty())
      obBase += ' WHERE ' + String.join(obWhere, ' AND ');

    Set<Id> allowedObIds = new Set<Id>();
    for (Overview_Budget_per_Anno__c ob : Database.query(obBase))
      allowedObIds.add(ob.Id);

    if (selectedGiftDesignation != null && allowedObIds.isEmpty())
      return new List<Invoice__c>(); // nessuna OB per la GD selezionata

    // Base fields; dinamiche verranno aggiunte in base al Programma selezionato
    String invBase =
      'Id, Name, Invoice_Number__c, Date__c, CreatedDate, Data_di_Competenza__c, ' +
      'Nome_Donatore__c, ' +
      'Totale_Fattura__c, Overview_Budget_per_Anno__c, ' +
      'Overview_Budget_per_Anno__r.Name, Overview_Budget_per_Anno__r.Budget__c, ' +
      'Anno_di_Competenza__c, Reporting_Year__c';
    String invSel = invBase;
    if (selectedProgram != null) {
      String dev = [SELECT Name FROM Program WHERE Id = :selectedProgram LIMIT 1].Name.replace(' ', '_');
      Map<String, List<ProgramFieldConfigUtil.FieldConf>> cfg = ProgramFieldConfigUtil.getFieldConfig(dev, new Set<String>{ 'Invoice__c' }, null);
      invSel = buildSelect(invBase, cfg.get('Invoice__c'));
    }

    String base = 'SELECT ' + invSel + ' FROM Invoice__c';
    List<String> w = new List<String>();
    if (!allowedObIds.isEmpty()) {
      List<String> quoted = new List<String>();
      for (Id obId : allowedObIds) {
        quoted.add('\'' + String.escapeSingleQuotes((String)obId) + '\'');
      }
      w.add('Overview_Budget_per_Anno__c IN (' + String.join(quoted, ',') + ')');
    }
    if (selectedAnno != null)
      w.add('Anno_di_Competenza__c = \'' + String.escapeSingleQuotes(selectedAnno) + '\'');
    String paginationClause = buildInvoicePaginationWhere(
      lastInvoiceDate,
      lastCreatedDate,
      lastInvoiceId
    );
    if (paginationClause != null) w.add(paginationClause);

    if (!w.isEmpty()) base += ' WHERE ' + String.join(w, ' AND ');
    base += ' ORDER BY Date__c DESC NULLS LAST, CreatedDate DESC, Id DESC';
    base += ' LIMIT ' + String.valueOf(lim);

    return Database.query(base);
  }

  /**
   * Restituisce gli AccountId con ProgramEnrollment attivo in una data specifica
   * (StartDate <= competenceDate AND (EndDate = NULL OR EndDate >= competenceDate)).
   */
  @AuraEnabled(cacheable=true)
  public static List<Id> getEnrolledAccountsOnDate(Id programId, Date competenceDate) {
    if (programId == null || competenceDate == null) return new List<Id>();
    Set<Id> accIds = new Set<Id>();
    for (ProgramEnrollment pe : [
      SELECT AccountId
      FROM ProgramEnrollment
      WHERE ProgramId = :programId AND AccountId != NULL
            AND StartDate <= :competenceDate
            AND (EndDate = NULL OR EndDate >= :competenceDate)
    ]) accIds.add(pe.AccountId);
    return new List<Id>(accIds);
  }

  /**
   * Restituisce gli AccountId con ProgramEnrollment valido per l'intero anno selezionato
   * (ovvero l'intervallo [StartDate, EndDate] sovrappone l'anno indicato).
   * Criteri:
   *  - StartDate <= 31/12/<anno>
   *  - EndDate = NULL (ancora attivo) oppure EndDate >= 01/01/<anno>
   */
  @AuraEnabled(cacheable=true)
  public static List<Id> getEnrolledAccountsOnYear(Id programId, String year) {
    if (programId == null || String.isBlank(year)) return new List<Id>();
    Integer yy;
    try { yy = Integer.valueOf(year); } catch (Exception e) { return new List<Id>(); }
    Date startOfYear = Date.newInstance(yy, 1, 1);
    Date endOfYear   = Date.newInstance(yy, 12, 31);

    Set<Id> accIds = new Set<Id>();
    for (ProgramEnrollment pe : [
      SELECT AccountId
      FROM ProgramEnrollment
      WHERE ProgramId = :programId AND AccountId != NULL
            AND StartDate <= :endOfYear
            AND (EndDate = NULL OR EndDate >= :startOfYear)
    ]) accIds.add(pe.AccountId);
    return new List<Id>(accIds);
  }

  /*────────────────────────────────────────────
   *  ► WRAPPER DI RISPOSTA
   *───────────────────────────────────────────*/
  public class MyWrapper {
    /* dati principali */
    @AuraEnabled
    public List<Program> programList { get; set; }
    @AuraEnabled
    public List<Anno_Reportistica__c> annoReportisticaList { get; set; }
    @AuraEnabled
    public List<Overview_Budget_per_Anno__c> budgetList { get; set; }
    @AuraEnabled
    public List<GiftDesignation> giftDesignationList { get; set; }
    @AuraEnabled
    public List<Reporting_Year__c> reportingYearList { get; set; }
    @AuraEnabled
    public List<GiftTransactionDesignation> giftTransactionDesignationList {
      get;
      set;
    }
    @AuraEnabled
    public List<Invoice__c> invoiceList { get; set; }
    @AuraEnabled
    public List<Id> enrolledAccountIds { get; set; }
    /* metadati colonne dinamiche */
    @AuraEnabled
    public Map<String, List<ProgramFieldConfigUtil.FieldConf>> fieldConfig {
      get;
      set;
    }

    /* debug / trace */
    @AuraEnabled
    public String gtdQueryString { get; set; }
    @AuraEnabled
    public String invoiceQueryString { get; set; }
    @AuraEnabled
    public String gtdDebugInfo { get; set; }
    @AuraEnabled
    public Map<String, Decimal> invoiceTotalsByRyYear { get; set; }
  }

  /*────────────────────────────────────────────
   *  ► END-POINT LEGACY (NON MODIFICATO)
   *───────────────────────────────────────────*/
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getAllDataForLegacy() {
    return new Map<String, Object>();
  }

  /*────────────────────────────────────────────
   *  ► METODO DI SUPPORTO RICHIESTO DA OVERVIEW
   *───────────────────────────────────────────*/
  @AuraEnabled(cacheable=true)
  public static List<Invoice__c> getInvoicesForBudget(
    Id programId,
    Id budgetId,
    String annoCompetenza
  ) {
    MyWrapper w = getAllDataForLWCWithParams(
      programId,
      budgetId,
      annoCompetenza
    );
    return w.invoiceList;
  }
}