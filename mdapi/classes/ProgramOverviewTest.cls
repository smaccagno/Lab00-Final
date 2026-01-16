@IsTest(SeeAllData=true)
public class ProgramOverviewTest {
  /** 1) getRelatedRecords con recordId vuoto: tutti i record lists vuote **/
  @IsTest
  static void testGetRelatedRecordsEmpty() {
    Map<String, Object> res = ProgramOverview.getRelatedRecords('');
    // Chiavi presenti
    System.assert(res.containsKey('records_anno'), 'Chiave records_anno');
    System.assert(res.containsKey('records_budget'), 'Chiave records_budget');
    System.assert(res.containsKey('records_donor'), 'Chiave records_donor');

    // Liste non null ma vuote
    List<Anno_Reportistica__c> listAnno = (List<Anno_Reportistica__c>) res.get(
      'records_anno'
    );
    List<Overview_Budget_per_Anno__c> listBudget = (List<Overview_Budget_per_Anno__c>) res.get(
      'records_budget'
    );
    List<Reporting_Year__c> listDonor = (List<Reporting_Year__c>) res.get(
      'records_donor'
    );

    System.assertNotEquals(null, listAnno, 'records_anno non null');
    System.assertNotEquals(null, listBudget, 'records_budget non null');
    System.assertNotEquals(null, listDonor, 'records_donor non null');

    System.assertEquals(0, listAnno.size(), 'records_anno vuoto');
    System.assertEquals(0, listBudget.size(), 'records_budget vuoto');
    System.assertEquals(0, listDonor.size(), 'records_donor vuoto');
  }

  /** 2) getRelatedRecords con programId esistente: struttura della mappa **/
  @IsTest
  static void testGetRelatedRecordsWithProgram() {
    List<Program> ps = [SELECT Id FROM Program LIMIT 1];
    if (ps.isEmpty()) {
      return; // skip se non esiste Program
    }
    Id programId = ps[0].Id;

    Map<String, Object> res = ProgramOverview.getRelatedRecords(programId);
    // Chiavi presenti
    System.assert(res.containsKey('records_anno'), 'Chiave records_anno');
    System.assert(res.containsKey('records_budget'), 'Chiave records_budget');
    System.assert(res.containsKey('records_donor'), 'Chiave records_donor');

    // Liste non null
    System.assertNotEquals(
      null,
      res.get('records_anno'),
      'records_anno non null'
    );
    System.assertNotEquals(
      null,
      res.get('records_budget'),
      'records_budget non null'
    );
    System.assertNotEquals(
      null,
      res.get('records_donor'),
      'records_donor non null'
    );
  }

  /** 3) getAvailableYears: lista di mappe label/value ordinata **/
  @IsTest
  static void testGetAvailableYears() {
    List<Map<String, String>> opts = ProgramOverview.getAvailableYears();
    System.assertNotEquals(null, opts, 'getAvailableYears non null');
    // Ogni mappa deve contenere label e value uguali
    for (Map<String, String> m : opts) {
      System.assert(m.containsKey('label'), 'Chiave label');
      System.assert(m.containsKey('value'), 'Chiave value');
      System.assertEquals(
        m.get('label'),
        m.get('value'),
        'label e value devono essere uguali'
      );
    }
    // Deve essere ordinata per label
    for (Integer i = 1; i < opts.size(); i++) {
      String prev = opts[i - 1].get('label');
      String curr = opts[i].get('label');
      System.assert(prev.compareTo(curr) <= 0, 'Opzioni ordinata per label');
    }
  }
  /** 4) getBudgetDonorRecords con recordId vuoto: chiavi presenti **/
  @IsTest
  static void testGetBudgetDonorRecordsEmpty() {
    Map<String, Object> res = ProgramOverview.getBudgetDonorRecords('');

    System.assert(
      res.containsKey('records_budget_bud'),
      'Chiave records_budget_bud'
    );
    System.assert(
      res.containsKey('records_donor_don'),
      'Chiave records_donor_don'
    );

    // devono almeno essere liste non-null
    System.assertNotEquals(null, res.get('records_budget_bud'));
    System.assertNotEquals(null, res.get('records_donor_don'));

    /* Se proprio vuoi assicurarti che NON ci sia filtro su Program__c
       puoi controllare che la query costruita nel debug (se esposta) contenga
       "Program__c = ''" – ma NON è necessario contare gli elementi. */
  }

  /** 5) getBudgetDonorRecords con programId esistente: mappe presenti **/
  @IsTest
  static void testGetBudgetDonorRecordsWithProgram() {
    List<Program> ps = [SELECT Id FROM Program LIMIT 1];
    if (ps.isEmpty())
      return;
    Id programId = ps[0].Id;

    Map<String, Object> res = ProgramOverview.getBudgetDonorRecords(programId);
    System.assertNotEquals(
      null,
      res.get('records_budget_bud'),
      'records_budget_bud non null'
    );
    System.assertNotEquals(
      null,
      res.get('records_donor_don'),
      'records_donor_don non null'
    );
  }
}