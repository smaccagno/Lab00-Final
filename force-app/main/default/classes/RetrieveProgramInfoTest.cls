@IsTest(SeeAllData=true)
public class RetrieveProgramInfoTest {
  /** 1) getRelatedRecords con programId valido **/
  @IsTest
  static void testGetRelatedRecords() {
    // Prendo un Program esistente
    List<Program> progs = [SELECT Id FROM Program LIMIT 1];
    if (progs.isEmpty())
      return;
    Id programId = progs[0].Id;

    // Invoco il metodo
    Map<String, Object> res = RetrieveProgramInfo.getRelatedRecords(programId);
    System.assertNotEquals(null, res, 'La mappa non deve essere null');

    // Controllo chiavi base
    System.assert(
      res.containsKey('fieldConfig'),
      'Chiave fieldConfig presente'
    );
    System.assert(
      res.containsKey('records_anno'),
      'Chiave records_anno presente'
    );
    System.assert(
      res.containsKey('records_budget'),
      'Chiave records_budget presente'
    );
    System.assert(
      res.containsKey('records_donor'),
      'Chiave records_donor presente'
    );
    System.assert(
      res.containsKey('enrolledAccountIds'),
      'Chiave enrolledAccountIds presente'
    );
    System.assert(
      res.containsKey('gtdPaidByDonor'),
      'Chiave gtdPaidByDonor presente'
    );
    System.assert(
      res.containsKey('gtdPaidByDonorYear'),
      'Chiave gtdPaidByDonorYear presente'
    );

    // Verifico configuration map
    Map<String, List<ProgramFieldConfigUtil.FieldConf>> cfg = (Map<String, List<ProgramFieldConfigUtil.FieldConf>>) res.get(
      'fieldConfig'
    );
    System.assertNotEquals(null, cfg, 'fieldConfig non null');
    for (
      String obj : new List<String>{
        'Anno_Reportistica__c',
        'Overview_Budget_per_Anno__c',
        'Reporting_Year__c'
      }
    ) {
      System.assert(cfg.containsKey(obj), 'fieldConfig contiene ' + obj);
    }

    //  - Years: qui Programma__c è selezionato
    List<Anno_Reportistica__c> anni = (List<Anno_Reportistica__c>) res.get(
      'records_anno'
    );
    System.assertNotEquals(null, anni, 'records_anno non null');
    if (!anni.isEmpty()) {
      for (Anno_Reportistica__c a : anni) {
        System.assertEquals(
          programId,
          a.Programma__c,
          'Programma__c in records_anno deve corrispondere'
        );
      }
    }

    //  - Budgets: non verifichiamo Programma__c perché non è restituito
    List<Overview_Budget_per_Anno__c> budgets = (List<Overview_Budget_per_Anno__c>) res.get(
      'records_budget'
    );
    System.assertNotEquals(null, budgets, 'records_budget non null');

    //  - Donors: non verifichiamo Programma__c perché non è restituito
    List<Reporting_Year__c> donors = (List<Reporting_Year__c>) res.get(
      'records_donor'
    );
    System.assertNotEquals(null, donors, 'records_donor non null');

    //  - Enrolled account ids e aggregati GTD
    List<Id> accIds = (List<Id>) res.get('enrolledAccountIds');
    System.assertNotEquals(null, accIds, 'enrolledAccountIds non null');

    Map<String, Decimal> gtdByDonor = (Map<String, Decimal>) res.get(
      'gtdPaidByDonor'
    );
    Map<String, Decimal> gtdByDonorYear = (Map<String, Decimal>) res.get(
      'gtdPaidByDonorYear'
    );
    System.assertNotEquals(null, gtdByDonor, 'gtdPaidByDonor non null');
    System.assertNotEquals(null, gtdByDonorYear, 'gtdPaidByDonorYear non null');
  }

  /** 2) getAvailableYears restituisce liste label/value ordinate **/
  @IsTest
  static void testGetAvailableYears() {
    List<Map<String, String>> opts = RetrieveProgramInfo.getAvailableYears();
    System.assertNotEquals(null, opts, 'getAvailableYears non null');
    for (Map<String, String> m : opts) {
      System.assert(m.containsKey('label'), 'Ogni mappa contiene label');
      System.assert(m.containsKey('value'), 'Ogni mappa contiene value');
      System.assertEquals(
        m.get('label'),
        m.get('value'),
        'label e value devono coincidere'
      );
    }
    for (Integer i = 1; i < opts.size(); i++) {
      String prev = opts[i - 1].get('label');
      String curr = opts[i].get('label');
      System.assert(prev.compareTo(curr) <= 0, 'Opzioni ordinate per label');
    }
  }

  /** 3) getBudgetDonorRecords con programId valido **/
  @IsTest
  static void testGetBudgetDonorRecords() {
    List<Program> progs = [SELECT Id FROM Program LIMIT 1];
    if (progs.isEmpty())
      return;
    Id programId = progs[0].Id;

    Map<String, Object> res = RetrieveProgramInfo.getBudgetDonorRecords(
      programId
    );
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

  /** 4) getInvoicesForBudget senza filtri ⇒ lista globale **/
  @IsTest
  static void testGetInvoicesForBudget_NoFilter() {
    List<Invoice__c> invs = RetrieveProgramInfo.getInvoicesForBudget(
      null,
      null,
      null
    );
    System.assertNotEquals(
      null,
      invs,
      'getInvoicesForBudget non deve restituire null'
    );
    for (Invoice__c inv : invs) {
      System.assertNotEquals(null, inv.Id, 'Ogni invoice ha Id');
    }
  }

  /** 5) getInvoicesForBudget con anno inesistente ⇒ lista vuota **/
  @IsTest
  static void testGetInvoicesForBudget_Invalid() {
    List<Invoice__c> invs = RetrieveProgramInfo.getInvoicesForBudget(
      null,
      null,
      '2099'
    );
    System.assertNotEquals(null, invs, 'Restituisce lista non null');
    System.assertEquals(
      0,
      invs.size(),
      'Anno di competenza inesistente ⇒ nessuna invoice'
    );
  }
}