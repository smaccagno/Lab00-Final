public with sharing class RetrieveBudgetAnno {
  /* ────────────────────────────────────────────────────────────────────────────
   * Wrapper originale
   * ──────────────────────────────────────────────────────────────────────────── */
  public class ResultWrapper {
    @AuraEnabled
    public List<Overview_Budget_per_Anno__c> records;
    @AuraEnabled
    public List<ProgramFieldConfigUtil.FieldConf> dynamicFields;
    @AuraEnabled
    public List<String> debugInfo;
  }
  public class ProgramOption {
    @AuraEnabled
    public Id programId;
    @AuraEnabled
    public String programName;
  }

  /*───────────────────────────────────────────────────────────────────
   * 1. Programmi attivi per l’utente corrente
   *──────────────────────────────────────────────────────────────────*/
  @AuraEnabled(cacheable=true)
  public static List<ProgramOption> getActiveProgramsForCurrentUser() {
    // 1.a – CompanyName dell’utente (questa restituisce sempre 1 riga)
    User currentUser = [
      SELECT CompanyName
      FROM User
      WHERE Id = :UserInfo.getUserId()
      LIMIT 1
    ];
    if (String.isBlank(currentUser.CompanyName)) {
      return new List<ProgramOption>();
    }

    // 1.b – Account Partner corrispondente (SAFE: uso lista)
    List<Account> partners = [
      SELECT Id
      FROM Account
      WHERE Nome_Donatore__c = :currentUser.CompanyName AND Type = 'Partner'
      LIMIT 1
    ];
    if (partners.isEmpty()) {
      return new List<ProgramOption>();
    }
    Id partnerId = partners[0].Id;

    // 1.c – Program Enrollments “Active”
    List<ProgramEnrollment> enrolls = [
      SELECT ProgramId, Program.Name
      FROM ProgramEnrollment
      WHERE AccountId = :partnerId AND IsActive = TRUE
    ];

    // 1.d – DTO per il client
    List<ProgramOption> options = new List<ProgramOption>();
    for (ProgramEnrollment pe : enrolls) {
      ProgramOption po = new ProgramOption();
      po.programId = pe.ProgramId;
      po.programName = pe.Program.Name;
      options.add(po);
    }
    return options;
  }

  /*───────────────────────────────────────────────────────────────────
   * 2. Budget-per-Anno del partner corrente per uno specifico Programma
   *──────────────────────────────────────────────────────────────────*/
  @AuraEnabled(cacheable=true)
  public static ResultWrapper getBudgetsByProgram(Id programId) {
    List<String> debugInfo = new List<String>();
    ResultWrapper emptyResult = new ResultWrapper();
    emptyResult.debugInfo = debugInfo;
    emptyResult.records = new List<Overview_Budget_per_Anno__c>();
    emptyResult.dynamicFields = new List<ProgramFieldConfigUtil.FieldConf>();
    if (programId == null) {
      debugInfo.add('Input programId nullo, ritorno risultato vuoto');
      return emptyResult;
    }

    // 1. Partner dell’utente (SAFE)
    debugInfo.add(
      'SOQL: SELECT CompanyName FROM User WHERE Id = \'' +
      UserInfo.getUserId() +
      '\''
    );
    User curUser = [
      SELECT CompanyName
      FROM User
      WHERE Id = :UserInfo.getUserId()
      LIMIT 1
    ];
    debugInfo.add('User.CompanyName = ' + curUser.CompanyName);
    if (String.isBlank(curUser.CompanyName)) {
      debugInfo.add('CompanyName vuoto, stop flusso');
      return emptyResult;
    }

    debugInfo.add(
      'SOQL: SELECT Id FROM Account WHERE Nome_Donatore__c = \'' +
      String.escapeSingleQuotes(curUser.CompanyName) +
      '\' AND Type = \'Partner\''
    );
    List<Account> partnerList = [
      SELECT Id
      FROM Account
      WHERE Nome_Donatore__c = :curUser.CompanyName AND Type = 'Partner'
      LIMIT 1
    ];
    if (partnerList.isEmpty()) {
      debugInfo.add('Nessun Account Partner trovato');
      return emptyResult;
    }
    Id partnerId = partnerList[0].Id;
    debugInfo.add('Account Partner trovato: ' + partnerId);

    // 2. GiftDesignation (Budget) del partner per quel Programma (SAFE)
    debugInfo.add(
      'SOQL: SELECT Id FROM GiftDesignation WHERE Partner__c = \'' +
      partnerId +
      '\' AND Program__c = \'' +
      programId +
      '\''
    );
    List<GiftDesignation> gds = [
      SELECT Id
      FROM GiftDesignation
      WHERE Partner__c = :partnerId AND Program__c = :programId
      LIMIT 1
    ];
    if (gds.isEmpty()) {
      debugInfo.add('Nessuna GiftDesignation trovata per il programma scelto');
      return emptyResult;
    }
    Id budgetId = gds[0].Id;
    debugInfo.add('GiftDesignation trovata: ' + budgetId);

    // 3. Config dinamica dei campi (SAFE sul Program)
    debugInfo.add(
      'SOQL: SELECT Name FROM Program WHERE Id = \'' + programId + '\''
    );
    List<Program> progs = [
      SELECT Name
      FROM Program
      WHERE Id = :programId
      LIMIT 1
    ];
    if (progs.isEmpty() || String.isBlank(progs[0].Name)) {
      debugInfo.add('Programma non trovato o Name vuoto');
      return emptyResult;
    }
    String progDevName = progs[0].Name.replace(' ', '_');
    debugInfo.add('Program Name: ' + progs[0].Name + ' → key: ' + progDevName);

    Set<String> targets = new Set<String>{ 'Overview_Budget_per_Anno__c' };
    Map<String, List<ProgramFieldConfigUtil.FieldConf>> confMap = ProgramFieldConfigUtil.getFieldConfig(
      progDevName,
      targets,
      null
    );
    List<ProgramFieldConfigUtil.FieldConf> dynamicFields = confMap != null
      ? confMap.get('Overview_Budget_per_Anno__c')
      : null;

    // 4. Campi base + dinamici
    List<String> baseFields = new List<String>{
      'Id',
      'Name',
      'Anno__c',
      'Totale_Allocato__c',
      'Totale_Distribuito_Pagato_Formula__c',
      'Totale_Distribuito_NON_Pagato_Formula__c',
      'Ammontare_Pagamenti_Da_Pagare_formula__c',
      'Ammontare_Pagamenti_Fatti_formula__c',
      'Numero_di_Fatture_formula__c',
      'Totale_Ammontare_Fatture_formula__c',
      'Capienza__c',
      'Numero_Distribuzioni_Formula__c',
      'Numero_Distribuzioni_NON_Pagate__c'
    };
    if (dynamicFields != null) {
      for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
        if (
          f != null &&
          !String.isBlank(f.fieldApi) &&
          !baseFields.contains(f.fieldApi)
        ) {
          baseFields.add(f.fieldApi);
        }
      }
    }

    // 5. Query: filtro su Budget__c
    String q =
      'SELECT ' +
      String.join(baseFields, ', ') +
      ' FROM   Overview_Budget_per_Anno__c' +
      ' WHERE  Budget__c = :budgetId';

    debugInfo.add(
      'SOQL dinamica: ' +
      q.replace(':budgetId', '\'' + String.valueOf(budgetId) + '\'')
    );
    List<Overview_Budget_per_Anno__c> rows = Database.query(q);
    debugInfo.add('Record restituiti: ' + rows.size());

    // 6. Wrapper finale
    ResultWrapper res = new ResultWrapper();
    res.records = rows;
    res.dynamicFields = dynamicFields;
    res.debugInfo = debugInfo;
    return res;
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * 3) getDefaultRecordId – invariato
   * ──────────────────────────────────────────────────────────────────────────── */
  @AuraEnabled(cacheable=true)
  public static Id getDefaultRecordId() {
    try {
      User u = [
        SELECT CompanyName
        FROM User
        WHERE Id = :UserInfo.getUserId()
        LIMIT 1
      ];
      System.debug(
        LoggingLevel.WARN,
        'DBG › CompanyName utente: ' + u.CompanyName
      );

      if (String.isBlank(u.CompanyName)) {
        System.debug(LoggingLevel.WARN, 'DBG › CompanyName vuoto → esco');
        return null;
      }

      List<Account> accts = [
        SELECT Id, Name
        FROM Account
        WHERE Nome_Donatore__c = :u.CompanyName AND Type = 'Partner'
        LIMIT 1
      ];
      if (accts.isEmpty()) {
        System.debug(
          LoggingLevel.WARN,
          'DBG › Nessun Account Partner per CompanyName ' + u.CompanyName
        );
        return null;
      }
      Id partnerId = accts[0].Id;
      System.debug(
        LoggingLevel.WARN,
        'DBG › Account Partner trovato: ' + partnerId
      );

      List<GiftDesignation> gds = [
        SELECT Id, Name
        FROM GiftDesignation
        WHERE Partner__c = :partnerId
        LIMIT 1
      ];
      if (gds.isEmpty()) {
        System.debug(
          LoggingLevel.WARN,
          'DBG › Nessuna GiftDesignation collegata al Partner ' + partnerId
        );
        return null;
      }
      System.debug(
        LoggingLevel.WARN,
        'DBG › GiftDesignation trovata: ' + gds[0].Id
      );

      return gds[0].Id;
    } catch (Exception e) {
      System.debug(
        LoggingLevel.ERROR,
        'DBG › ERRORE getDefaultRecordId – ' +
          e.getTypeName() +
          ' – ' +
          e.getMessage()
      );
      return null;
    }
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * 4) getRelatedRecordsWithFields – invariata nella logica
   * ──────────────────────────────────────────────────────────────────────────── */
  @AuraEnabled(cacheable=true)
  public static ResultWrapper getRelatedRecordsWithFields(Id parentId) {
    List<String> debugInfo = new List<String>();
    ResultWrapper emptyRes = new ResultWrapper();
    emptyRes.debugInfo = debugInfo;
    emptyRes.records = new List<Overview_Budget_per_Anno__c>();
    emptyRes.dynamicFields = new List<ProgramFieldConfigUtil.FieldConf>();

    if (parentId == null) {
      debugInfo.add('Input parentId nullo, ritorno risultato vuoto');
      return emptyRes;
    }

    // Qui il chiamante passa un Budget__c reale; se non esiste, non troveremo sample
    debugInfo.add(
      'SOQL: SELECT Id, Programma__c, Programma__r.Name FROM Overview_Budget_per_Anno__c WHERE Budget__c = \'' +
      String.valueOf(parentId) +
      ' LIMIT 1'
    );
    List<Overview_Budget_per_Anno__c> samples = [
      SELECT Id, Programma__c, Programma__r.Name
      FROM Overview_Budget_per_Anno__c
      WHERE Budget__c = :parentId
      LIMIT 1
    ];
    if (samples.isEmpty() || samples[0].Programma__c == null) {
      debugInfo.add('Sample non trovato o Programma__c nullo');
      return emptyRes;
    }
    Overview_Budget_per_Anno__c sample = samples[0];
    debugInfo.add('Sample trovato: ' + sample.Id);
    debugInfo.add('Programma__c: ' + sample.Programma__c);

    String programDevName = sample.Programma__r.Name.replace(' ', '_');
    debugInfo.add('Program Name: ' + sample.Programma__r.Name + ' → key: ' + programDevName);

    Set<String> targets = new Set<String>{ 'Overview_Budget_per_Anno__c' };
    Map<String, List<ProgramFieldConfigUtil.FieldConf>> confMap = ProgramFieldConfigUtil.getFieldConfig(
      programDevName,
      targets,
      null
    );
    List<ProgramFieldConfigUtil.FieldConf> dynamicFields = confMap != null
      ? confMap.get('Overview_Budget_per_Anno__c')
      : null;

    List<String> baseFields = new List<String>{
      'Id',
      'Name',
      'Anno__c',
      'Totale_Allocato__c',
      'Totale_Distribuito_Pagato_Formula__c',
      'Totale_Distribuito_NON_Pagato_Formula__c',
      'Ammontare_Pagamenti_Da_Pagare_formula__c',
      'Ammontare_Pagamenti_Fatti_formula__c',
      'Numero_di_Fatture_formula__c',
      'Totale_Ammontare_Fatture_formula__c',
      'Capienza__c',
      'Numero_Distribuzioni_Formula__c',
      'Numero_Distribuzioni_NON_Pagate__c'
    };
    if (dynamicFields != null) {
      for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
        if (
          f != null &&
          !String.isBlank(f.fieldApi) &&
          !baseFields.contains(f.fieldApi)
        ) {
          baseFields.add(f.fieldApi);
        }
      }
    }

    String query =
      'SELECT ' +
      String.join(baseFields, ', ') +
      ' FROM   Overview_Budget_per_Anno__c' +
      ' WHERE  Budget__c = :parentId';

    debugInfo.add(
      'SOQL dinamica: ' +
      query.replace(':parentId', '\'' + String.valueOf(parentId) + '\'')
    );
    List<Overview_Budget_per_Anno__c> records = Database.query(query);
    debugInfo.add('Record restituiti: ' + records.size());

    ResultWrapper res = new ResultWrapper();
    res.records = records;
    res.dynamicFields = dynamicFields;
    res.debugInfo = debugInfo;
    return res;
  }

  /* ────────────────────────────────────────────────────────────────────────────
   * 5) getSingleRecord – invariata nella logica
   * ──────────────────────────────────────────────────────────────────────────── */
  @AuraEnabled(cacheable=true)
  public static ResultWrapper getSingleRecord(Id recordId) {
    List<String> debugInfo = new List<String>();
    ResultWrapper emptyRes = new ResultWrapper();
    emptyRes.debugInfo = debugInfo;
    emptyRes.records = new List<Overview_Budget_per_Anno__c>();
    emptyRes.dynamicFields = new List<ProgramFieldConfigUtil.FieldConf>();

    if (recordId == null) {
      debugInfo.add('Input recordId nullo, ritorno risultato vuoto');
      return emptyRes;
    }

    debugInfo.add(
      'SOQL: SELECT Id, Programma__c, Programma__r.Name FROM Overview_Budget_per_Anno__c WHERE Id = \'' +
      String.valueOf(recordId) +
      ' LIMIT 1'
    );
    List<Overview_Budget_per_Anno__c> targets = [
      SELECT Id, Programma__c, Programma__r.Name
      FROM Overview_Budget_per_Anno__c
      WHERE Id = :recordId
      LIMIT 1
    ];
    if (targets.isEmpty() || targets[0].Programma__c == null) {
      debugInfo.add('Record non trovato o Programma__c nullo');
      return emptyRes;
    }
    Overview_Budget_per_Anno__c target = targets[0];
    debugInfo.add('Record trovato: ' + target.Id);
    debugInfo.add('Programma__c: ' + target.Programma__c);

    String programDevName = target.Programma__r.Name.replace(' ', '_');
    debugInfo.add('Program Name: ' + target.Programma__r.Name + ' → key: ' + programDevName);

    Set<String> objTargets = new Set<String>{ 'Overview_Budget_per_Anno__c' };
    Map<String, List<ProgramFieldConfigUtil.FieldConf>> confMap = ProgramFieldConfigUtil.getFieldConfig(
      programDevName,
      objTargets,
      null
    );
    List<ProgramFieldConfigUtil.FieldConf> dynamicFields = confMap != null
      ? confMap.get('Overview_Budget_per_Anno__c')
      : null;

    List<String> baseFields = new List<String>{
      'Id',
      'Name',
      'Anno__c',
      'Totale_Allocato__c',
      'Totale_Distribuito_Pagato_Formula__c',
      'Totale_Distribuito_NON_Pagato_Formula__c',
      'Ammontare_Pagamenti_Da_Pagare_formula__c',
      'Ammontare_Pagamenti_Fatti_formula__c',
      'Numero_di_Fatture_formula__c',
      'Totale_Ammontare_Fatture_formula__c',
      'Capienza__c',
      'Numero_Distribuzioni_Formula__c',
      'Numero_Distribuzioni_NON_Pagate__c'
    };
    if (dynamicFields != null) {
      for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
        if (
          f != null &&
          !String.isBlank(f.fieldApi) &&
          !baseFields.contains(f.fieldApi)
        ) {
          baseFields.add(f.fieldApi);
        }
      }
    }

    String query =
      'SELECT ' +
      String.join(baseFields, ', ') +
      ' FROM   Overview_Budget_per_Anno__c' +
      ' WHERE  Id = :recordId';

    debugInfo.add(
      'SOQL dinamica: ' +
      query.replace(':recordId', '\'' + String.valueOf(recordId) + '\'')
    );
    List<Overview_Budget_per_Anno__c> records = Database.query(query);
    debugInfo.add('Record restituiti: ' + records.size());

    ResultWrapper res = new ResultWrapper();
    res.records = records;
    res.dynamicFields = dynamicFields;
    res.debugInfo = debugInfo;
    return res;
  }
}