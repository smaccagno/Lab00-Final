/**
 *  Fatture.cls  –  usa ProgramFieldConfigUtil per KPI dinamiche
 */
public with sharing class Fatture {
  /*──────────────────────── WRAPPERS ───────────────────────*/
  public virtual class IdNameWrapper implements Comparable {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
    public IdNameWrapper(String i, String n) {
      id = i;
      name = n;
    }
    public Integer compareTo(Object o) {
      IdNameWrapper other = (IdNameWrapper) o;
      if (other == null)
        return 1;
      if (name == null && other.name == null)
        return 0;
      if (name == null)
        return -1;
      if (other.name == null)
        return 1;
      return name.toLowerCase().compareTo(other.name.toLowerCase());
    }
  }

  /*  Wrapper esteso che SERVE SOLO quando vogliamo anche l’informazione
   *  “default”.  Non lo usiamo più come tipo di ritorno di getAvailableDonors,
   *  così evitiamo conflitti generics List<Sottotipo>/List<Supertipo>.        */
  public class DonorWrapper extends IdNameWrapper {
    @AuraEnabled
    public Boolean isDefault;
    public DonorWrapper(Id i, String n, Boolean d) {
      super((String) i, n);
      isDefault = d;
    }
  }

  public class BudgetWrapper extends IdNameWrapper {
    @AuraEnabled
    public Boolean isDefault;
    public BudgetWrapper(Id i, String n, Boolean d) {
      super((String) i, n);
      isDefault = d;
    }
  }

  public class ComuneWrapper {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String province;
    @AuraEnabled
    public String region;
    public ComuneWrapper(String i, String n, String p, String r) {
      id = i;
      name = n;
      province = p;
      region = r;
    }
  }

  public class FieldConf {
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String fieldApi;
    public FieldConf(String l, String f) {
      label = l;
      fieldApi = f;
    }
  }

  /*──────── util: verifica esistenza campo ───────*/
  private static Boolean hasField(String obj, String api) {
    return Schema.getGlobalDescribe()
      .get(obj)
      .getDescribe()
      .fields.getMap()
      .containsKey(api);
  }

  /*======================================================================
   *  1. Ricerca fatture + KPI dinamici  – versione con doppia query
   *====================================================================*/
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getRelatedRecords(
    String year,
    String budgetId,
    String month,
    String programId,
    String donorId,
    String invoiceNumber,
    Integer limitSize,
    Integer offsetSize,
    String refreshKey
  ) {
    /* 1) Programma obbligatorio ------------------------------------ */
    if (String.isBlank(programId)) {
      return new Map<String, Object>{
        'records' => new List<Invoice__c>(),
        'dynamicColumnsMeta' => new List<FieldConf>(),
        'totalsByField' => new Map<String, Decimal>()
      };
    }

    /* 2) KPI dinamici ---------------------------------------------- */
    Program prg = [SELECT Name FROM Program WHERE Id = :programId];
    String programDevName = prg.Name.replace(' ', '_');

    Set<String> tgt = new Set<String>{ 'Invoice__c' };
    Map<String, List<ProgramFieldConfigUtil.FieldConf>> conf = ProgramFieldConfigUtil.getFieldConfig(
      programDevName,
      tgt,
      null
    );

    List<ProgramFieldConfigUtil.FieldConf> meta = conf.get('Invoice__c');
    List<String> dynApis = new List<String>();
    List<FieldConf> dynMeta = new List<FieldConf>();
    for (ProgramFieldConfigUtil.FieldConf fc : meta) {
      dynApis.add(fc.fieldApi);
      dynMeta.add(new FieldConf(fc.label, fc.fieldApi));
    }

    /* 3) SELECT per la query paginata ------------------------------- */
    List<String> sel = new List<String>{
      'Id',
      'Name',
      'Account__c',
      'Totale_Fattura__c',
      'Anno_di_Competenza__c',
      'Budget__c',
      'Nome_Budget__c',
      'Overview_Budget_Anno__c',
      'Data_di_Competenza__c',
      'Invoice_Number__c',
      'Nome_Donatore__c',
      'Overview_Budget_per_Anno__c',
      'Programma__c',
      'Programma_name__c'
    };
    if (!dynApis.isEmpty())
      sel.addAll(dynApis);

    /* 4) WHERE condiviso ------------------------------------------- */
    List<String> wp = new List<String>();

    String prog15 = programId.length() > 15
      ? programId.substring(0, 15)
      : programId;

    wp.add('Programma__c = :prog15');

    if (String.isNotBlank(budgetId)) {
      Id bid = (Id) budgetId;
      wp.add('Budget__c   = :bid');
    }
    if (String.isNotBlank(donorId)) {
      Id did = (Id) donorId;
      wp.add('Account__c  = :did');
    }

    Integer yy = String.isNotBlank(year) ? Integer.valueOf(year) : null;
    Integer mm = String.isNotBlank(month) ? Integer.valueOf(month) : null;
    if (yy != null)
      wp.add('CALENDAR_YEAR(Data_di_Competenza__c)  = :yy');
    if (mm != null)
      wp.add('CALENDAR_MONTH(Data_di_Competenza__c) = :mm');

    if (String.isNotBlank(invoiceNumber)) {
      String likeVal = '%' + invoiceNumber + '%';
      wp.add('Invoice_Number__c LIKE :likeVal');
    }

    String whereClause = ' WHERE ' + String.join(wp, ' AND ');

    /* 5A) Query paginata per le righe ------------------------------- */
    String soqlRows =
      'SELECT ' +
      String.join(sel, ',') +
      ' FROM Invoice__c' +
      whereClause +
      ' ORDER BY Data_di_Competenza__c DESC' +
      ' LIMIT :limitSize OFFSET :offsetSize';

    List<Invoice__c> rows = Database.query(soqlRows);

    /* 5B) Query aggregata solo alla prima pagina ------------------- */
    Map<String, Decimal> totals = new Map<String, Decimal>();
    if (offsetSize == 0 || offsetSize == null) {
      /* 5B-1) prepara select con i soli campi numerici ------------ */
      List<String> aggSel = new List<String>{
        'COUNT(Id) totCnt',
        'SUM(Totale_Fattura__c) totAmm'
      };

      List<String> numDynApis = new List<String>();
      for (String api : dynApis) {
        Schema.DisplayType t = Invoice__c.SObjectType
          .getDescribe()
          .fields.getMap()
          .get(api)
          .getDescribe()
          .getType();
        if (
          t == Schema.DisplayType.Currency ||
          t == Schema.DisplayType.Double ||
          t == Schema.DisplayType.Integer
        ) {
          numDynApis.add(api);
          aggSel.add('SUM(' + api + ') ' + api + '_sum');
        }
      }

      String soqlAgg =
        'SELECT ' +
        String.join(aggSel, ',') +
        ' FROM Invoice__c' +
        whereClause;

      AggregateResult ar = Database.query(soqlAgg);

      /* 5B-2) costruisci la mappa dei totali ---------------------- */
      totals.put('__rowCount__', (Decimal) ar.get('totCnt'));
      totals.put('Totale_Fattura__c', (Decimal) ar.get('totAmm'));
      for (String api : numDynApis) {
        Decimal v = (Decimal) ar.get(api + '_sum');
        if (v != null)
          totals.put(api, v);
      }
    }

    /* 6) Ritorno ---------------------------------------------------- */
    return new Map<String, Object>{
      'records' => rows,
      'dynamicColumnsMeta' => dynMeta,
      'totalsByField' => totals // vuoto nei chunk successivi
    };
  }

  // Backward-compatible overload for Apex callers (without refreshKey)
  public static Map<String, Object> getRelatedRecords(
    String year,
    String budgetId,
    String month,
    String programId,
    String donorId,
    String invoiceNumber,
    Integer limitSize,
    Integer offsetSize
  ) {
    return getRelatedRecords(
      year,
      budgetId,
      month,
      programId,
      donorId,
      invoiceNumber,
      limitSize,
      offsetSize,
      null
    );
  }

  /*===========================  2-8. servizi di lookup  =========================*/

  @AuraEnabled(cacheable=true)
  public static List<String> getAvailableYears() {
    Set<String> s = new Set<String>();
    for (Anno_Reportistica__c a : [SELECT Name FROM Anno_Reportistica__c])
      if (a.Name != null)
        s.add(a.Name);
    List<String> y = new List<String>(s);
    y.sort();
    return y;
  }

  @AuraEnabled(cacheable=true)
  public static List<IdNameWrapper> getAvailableBudgets(String pid) {
    String q = 'SELECT Id,Name FROM GiftDesignation WHERE IsActive=TRUE AND IsDefault=FALSE';
    if (!String.isEmpty(pid))
      q += ' AND Program__c=:pid';
    List<IdNameWrapper> r = new List<IdNameWrapper>();
    for (GiftDesignation g : Database.query(q + ' ORDER BY Name'))
      r.add(new IdNameWrapper(g.Id, g.Name));
    return r;
  }

  @AuraEnabled(cacheable=true)
  public static List<IdNameWrapper> getAvailablePrograms() {
    List<IdNameWrapper> r = new List<IdNameWrapper>();
    for (Program p : [SELECT Id, Name FROM Program ORDER BY Name])
      r.add(new IdNameWrapper(p.Id, p.Name));
    return r;
  }

  @AuraEnabled(cacheable=true)
  public static List<IdNameWrapper> getProgramsForBudget(String bid) {
    if (String.isEmpty(bid))
      return getAvailablePrograms();

    GiftDesignation gd = [
      SELECT Partner__c
      FROM GiftDesignation
      WHERE Id = :bid
      LIMIT 1
    ];
    Id accountId = gd?.Partner__c;
    if (accountId == null)
      return new List<IdNameWrapper>();

    String qPE =
      'SELECT ProgramId FROM ProgramEnrollment ' +
      'WHERE AccountId = :accountId AND ProgramId != NULL AND IsActive = TRUE';
    List<ProgramEnrollment> enrolls = Database.query(qPE);
    Set<Id> pIds = new Set<Id>();
    for (ProgramEnrollment pe : enrolls)
      pIds.add(pe.ProgramId);

    if (pIds.isEmpty())
      return new List<IdNameWrapper>();

    List<IdNameWrapper> res = new List<IdNameWrapper>();
    for (Program pr : [
      SELECT Id, Name
      FROM Program
      WHERE Id IN :pIds
      ORDER BY Name
    ])
      res.add(new IdNameWrapper(pr.Id, pr.Name));

    res.sort(); // usa compareTo
    return res;
  }

  /*────────────────────────  CAMBIO PRINCIPALE  ────────────────────────*
   *  Torniamo a List<IdNameWrapper> per evitare l’assegnazione illegale
   *  incontrata nel deploy.  Se in futuro ti serve “isDefault” nella UI,
   *  crea un nuovo endpoint oppure serializza DonorWrapper dalla LWC.    */
  @AuraEnabled(cacheable=true)
  public static List<IdNameWrapper> getAvailableDonors() {
    List<IdNameWrapper> res = new List<IdNameWrapper>();
    for (Account a : [
      SELECT Id, Name
      FROM Account
      WHERE Type = 'Investor' AND ParentId = NULL
      ORDER BY Name
    ])
      res.add(new IdNameWrapper(a.Id, a.Name));
    return res;
  }

  /*  Versione opzionale, se da qualche parte ti serve anche isDefault
   (in tal caso NON usarla in classi che si aspettano IdNameWrapper)  */
  @AuraEnabled(cacheable=true)
  public static List<DonorWrapper> getAvailableDonorsWithDefault() {
    List<DonorWrapper> res = new List<DonorWrapper>();
    for (Account a : [
      SELECT Id, Name, DEFAULT__c
      FROM Account
      WHERE Type = 'Investor' AND ParentId = NULL
      ORDER BY Name
    ])
      res.add(new DonorWrapper(a.Id, a.Name, a.DEFAULT__c));
    return res;
  }

  @AuraEnabled(cacheable=true)
  public static BudgetWrapper getUserBudget() {
    User u = [SELECT CompanyName FROM User WHERE Id = :UserInfo.getUserId()];
    if (String.isBlank(u.CompanyName))
      return null;

    Account acc = [SELECT Id FROM Account WHERE Name = :u.CompanyName LIMIT 1];
    if (acc == null)
      return null;

    GiftDesignation gd = [
      SELECT Id, Name, DEFAULT_PRG__c
      FROM GiftDesignation
      WHERE Partner__c = :acc.Id
      LIMIT 1
    ];
    if (gd == null)
      return null;

    return new BudgetWrapper(gd.Id, gd.Name, gd.DEFAULT_PRG__c);
  }

  /*===========================  9. delete invoice  ============================*/
  @AuraEnabled
  public static void deleteInvoice(Id invoiceId) {
    if (invoiceId == null) {
      throw new AuraHandledException('Id fattura mancante.');
    }
    try {
      // Usa DML diretto sull'Id per evitare query soggette a sharing
      delete new Invoice__c(Id = invoiceId);
    } catch (Exception e) {
      // Propaga un messaggio leggibile alla LWC (copre anche TypeException)
      String msg;
      if (e instanceof DmlException) {
        DmlException de = (DmlException) e;
        msg = (de.getNumDml() > 0 && de.getDmlMessage(0) != null)
          ? de.getDmlMessage(0)
          : de.getMessage();
      } else {
        msg = e.getMessage();
      }
      throw new AuraHandledException(msg);
    }
  }
}