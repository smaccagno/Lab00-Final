/*─────────────────────────────────────────────────────────────
  PROGRAM OVERVIEW – APEX CONTROLLER
  Rev.: 28-Apr-2025  (rimozione campi visite/minuti + colonne dinamiche)
─────────────────────────────────────────────────────────────*/
public with sharing class RetrieveProgramInfo {
  /*────────────────────────────────────────────
   *  ► UTILITÀ
   *───────────────────────────────────────────*/
  /** Restituisce la stringa dei campi da selezionare:
   *  la parte “base” + eventuali campi dinamici. */
  private static String buildSelect(
    String base,
    List<ProgramFieldConfigUtil.FieldConf> addl
  ) {
    if (addl == null || addl.isEmpty())
      return base;
    Set<String> dyn = new Set<String>();
    for (ProgramFieldConfigUtil.FieldConf f : addl) {
      dyn.add(f.fieldApi);
    }
    return String.join(
      new List<String>{ base, String.join(new List<String>(dyn), ',') },
      ','
    );
  }

  /*────────────────────────────────────────────
   *  ► END-POINT PRINCIPALE (LWC)
   *───────────────────────────────────────────*/
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getRelatedRecords(Id recordId) {
    /* 2) developer-name del Programma  ➜  label con spazi → “_” */
    Program p = [
      SELECT Name
      FROM Program
      WHERE Id = :recordId
    ];
    String programDevName = p.Name.replace(' ', '_'); // ← come nell’esempio
    /* 1) Account iscritti al Programma */
    Set<Id> enrolledAccountIds = new Set<Id>();
    for (ProgramEnrollment pe : [
      SELECT AccountId
      FROM ProgramEnrollment
      WHERE ProgramId = :recordId AND IsActive = TRUE AND AccountId != NULL
    ]) {
      enrolledAccountIds.add(pe.AccountId); // ← 001…
    }

    System.debug(
      LoggingLevel.INFO,
      '👍 enrolledAccountIds = ' + enrolledAccountIds.size()
    );
    Map<String, Object> res = new Map<String, Object>();
    res.put('enrolledAccountIds', new List<Id>(enrolledAccountIds));
    /* 1) CONFIGURAZIONE CAMPI DINAMICI */
    Set<String> objs = new Set<String>{
      'Anno_Reportistica__c',
      'Overview_Budget_per_Anno__c',
      'Reporting_Year__c'
    };
    Map<String, List<ProgramFieldConfigUtil.FieldConf>> cfg = ProgramFieldConfigUtil.getFieldConfig(
      programDevName,
      objs,
      null
    );
    res.put('fieldConfig', cfg);

    /* 2) RECORD  Anno_Reportistica__c */
    String annoSel = buildSelect(
      'Id,Name,Programma__c,' +
        'Ammontare_Disponibile__c,Capienza_budgets__c,' +
        'Ammontare_Distribuzioni__c,Ammontare_Distribuzioni_NON_Pagate__c,' +
        'Ammontare_Distribuzioni_Pagate__c,' +
        'Ammontare_Donazioni_Anno_Corrente__c,Ammontare_Originale_Donato__c,' +
        'Numero_Donazioni_Anno_Corrente__c,' + // Totale_Visite/Minuti RIMOSSI
        'Totale_Fatturato_Budgets__c,' + // Totale_Minuti_Visite_Budgets__c RIMOSSO
        'Totale_Numero_Fatture__c,' +
        'Totale_Allocabile__c,Totale_NON_Distribuito__c',
      cfg.get('Anno_Reportistica__c')
    );
    res.put(
      'records_anno',
      Database.query(
        'SELECT ' +
          annoSel +
          ' FROM Anno_Reportistica__c WHERE Programma__c = :recordId'
      )
    );

    /* 3) RECORD  Overview_Budget_per_Anno__c */
    String budSel = buildSelect(
      'Id,Name,Budget__c,Budget__r.Name, Budget__r.Partner__c,' +
        'Ammontare_Pagamenti_Da_Pagare_formula__c,' +
        'Ammontare_Pagamenti_Fatti_formula__c,' +
        'Anno__c,Numero_di_Fatture_formula__c,' +
        'Numero_Distribuzioni_Formula__c,' +
        'Totale_Ammontare_Fatture_formula__c,' +
        'Totale_Distribuito_NON_Pagato_Formula__c,' +
        'Totale_Distribuito_Pagato_Formula__c,' +
        'Totale_Allocato__c,Capienza__c',
      cfg.get('Overview_Budget_per_Anno__c')
    );
    res.put(
      'records_budget',
      Database.query(
        'SELECT ' +
          budSel +
          ' FROM Overview_Budget_per_Anno__c ' +
          ' WHERE Programma__c = :recordId '
      )
    );

    /* 4) RECORD  Reporting_Year__c */
    String donSel = buildSelect(
      'Id,Account__c,Donor_Overview__c,Donor_Overview__r.Name,' +
        'Nome_Donatore__c,Name,Year__c,Anno_overview__c,' +
        'Donato_Originale_formula__c,Available_Amount__c,' +
        'Allocabile_formula__c,Totale_Numero_Donazioni_formula__c,' +
        'Totale_Fattura_formula__c,' +
        'Totale_Numero_Fatture_formula__c,' +
        'Holding__c',
      cfg.get('Reporting_Year__c')
    );
    List<Reporting_Year__c> donorRecs = Database.query(
      'SELECT ' +
        donSel +
        ' FROM Reporting_Year__c ' +
        ' WHERE Programma__c = :recordId '
    );
    res.put('records_donor', donorRecs);
    /* debug quantità righe */
    System.debug(
      LoggingLevel.INFO,
      'Overview_Budget_per_Anno__c rows = ' +
      ((List<SObject>) res.get('records_budget')).size()
    );

    /* 5) Aggregato GTD Pagati per Donatore (master Account 15) */
    try {
      Map<String, Decimal> gtdPaidByDonor = new Map<String, Decimal>();
      Map<String, Decimal> gtdPaidByDonorYear = new Map<String, Decimal>();
      // mappa RY → record per ricavare Holding/Account (usiamo i record già letti)
      Map<Id, Reporting_Year__c> ryMap = new Map<Id, Reporting_Year__c>(
        donorRecs
      );
      for (AggregateResult ar : [
        SELECT
          Overview_Donatore_per_Anno__c ry,
          Overview_Donatore_per_Anno__r.Year__c year,
          Overview_Donatore_per_Anno__r.Anno__r.Name annName,
          SUM(Amount) tot
        FROM GiftTransactionDesignation
        WHERE Programma__c = :recordId
              AND Overview_Donatore_per_Anno__c != NULL
              AND (
                    Payment__r.Status__c = 'Pagato'
                 OR Data_di_Pagamento__c != NULL
              )
        GROUP BY
          Overview_Donatore_per_Anno__c,
          Overview_Donatore_per_Anno__r.Year__c,
          Overview_Donatore_per_Anno__r.Anno__r.Name
      ]) {
        Id ryId = (Id) ar.get('ry');
        Decimal amt = (Decimal) ar.get('tot');
        Reporting_Year__c ry = ryMap.get(ryId);
        if (ry == null) continue;
        String master15 = (ry.Holding__c != null)
          ? ((String) ry.Holding__c).substring(0, 15)
          : (ry.Account__c == null ? null : ((String) ry.Account__c).substring(0, 15));
        if (master15 == null) continue;
        Decimal safeAmt = (amt == null) ? 0 : amt;
        String year = (String) ar.get('year');
        if (String.isBlank(year)) year = (String) ar.get('annName');
        if (String.isBlank(year) && ry.Anno_overview__c != null) year = ry.Anno_overview__c;
        if (String.isBlank(year) && ry.Year__c != null) year = String.valueOf(ry.Year__c);
        if (String.isBlank(year) && ry.Name != null) year = ry.Name;
        gtdPaidByDonor.put(
          master15,
          (gtdPaidByDonor.containsKey(master15) ? gtdPaidByDonor.get(master15) : 0) + safeAmt
        );
        if (!String.isBlank(year)) {
          String key = master15 + '|' + year;
          gtdPaidByDonorYear.put(
            key,
            (gtdPaidByDonorYear.containsKey(key) ? gtdPaidByDonorYear.get(key) : 0) + safeAmt
          );
        }
      }
      res.put('gtdPaidByDonor', gtdPaidByDonor);
      res.put('gtdPaidByDonorYear', gtdPaidByDonorYear);
    } catch (Exception e) {
      // Non bloccare in caso di permessi insufficienti sulla GTD
    }

    return res;
  }

  /*────────────────────────────────────────────
   *  ► ANNI DISPONIBILI (combobox)
   *───────────────────────────────────────────*/
  @AuraEnabled(cacheable=true)
  public static List<Map<String, String>> getAvailableYears() {
    List<Anno_Reportistica__c> yrs = [
      SELECT Name
      FROM Anno_Reportistica__c
      ORDER BY Name
    ];
    List<Map<String, String>> out = new List<Map<String, String>>();
    for (Anno_Reportistica__c y : yrs) {
      out.add(new Map<String, String>{ 'label' => y.Name, 'value' => y.Name });
    }
    return out;
  }

  /*────────────────────────────────────────────
   *  ► END-POINT SECONDARIO  (NON toccato a parte i campi rimossi)
   *───────────────────────────────────────────*/
  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getBudgetDonorRecords(String recordId) {
    Map<String, Object> res = new Map<String, Object>();

    /* GiftDesignation (Budget) – campi visite/minuti rimossi */
    List<GiftDesignation> records_budget_bud = [
      SELECT
        Id,
        Name,
        Totale_Allocato__c,
        Totale_Distribuito_Pagato__c,
        Totale_Distribuito_NON_Pagato__c,
        Ammontare_Pagamenti_Da_Pagare__c,
        Ammontare_Pagamenti_Fatti__c,
        Totale_Numero_di_Fatture__c,
        Ammontare_Totale_Fatture__c,
        Program__c
      FROM GiftDesignation
      WHERE Program__c = :recordId
    ];
    /* Reporting_Year__c – campi visite/minuti rimossi */
    List<Reporting_Year__c> records_donor_don = [
      SELECT
        Id,
        Name,
        Year__c,
        Anno_overview__c,
        Donato_Originale_formula__c,
        Available_Amount__c,
        Allocabile_formula__c,
        Totale_Numero_Donazioni_formula__c,
        Total_Invoice_Amount__c, // <= originale
        Totale_Numero_di_Fatture__c,
        Account__c,
        Holding__c
      FROM Reporting_Year__c
      WHERE Programma__c = :recordId
    ];
    res.put('records_budget_bud', records_budget_bud);
    res.put('records_donor_don', records_donor_don);
    return res;
  }

  @AuraEnabled(cacheable=true)
  public static List<Invoice__c> getInvoicesForBudget(
    Id programId,
    Id budgetId,
    String annoCompetenza
  ) {
    // ri-uso il wrapper già pronto
    AssegnazioneFattureADonatore.MyWrapper wrap = AssegnazioneFattureADonatore.getAllDataForLWCWithParams(
      programId,
      budgetId,
      annoCompetenza
    );

    return wrap.invoiceList; // <── solo la lista che ci serve
  }
}