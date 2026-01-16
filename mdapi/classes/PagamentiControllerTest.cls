@IsTest(SeeAllData=true)
public class PagamentiControllerTest {
  /** 1) getPagamenti senza filtri: controlla struttura e chiavi **/
  @IsTest
  static void testGetPagamentiNoFilter() {
    Map<String, Object> res = PagamentiController.getPagamenti('', '', '');
    // Mappa non nulla e contiene le chiavi attese
    System.assertNotEquals(null, res, 'Risposta non deve essere null');
    System.assert(res.containsKey('records'), 'Chiave "records" deve esistere');
    System.assert(
      res.containsKey('totalePagato'),
      'Chiave "totalePagato" deve esistere'
    );
    System.assert(res.containsKey('query'), 'Chiave "query" deve esistere');
    System.assert(
      res.containsKey('resolvedQuery'),
      'Chiave "resolvedQuery" deve esistere'
    );
    // Lista di record non nulla
    List<Payment__c> recs = (List<Payment__c>) res.get('records');
    System.assertNotEquals(
      null,
      recs,
      'Lista di pagamenti non deve essere null'
    );
    // Totale non negativo
    Decimal tot = (Decimal) res.get('totalePagato');
    System.assert(tot >= 0, 'totalePagato deve essere >= 0');
    // Query di debug inizia con SELECT
    String q = (String) res.get('query');
    String rq = (String) res.get('resolvedQuery');
    System.assert(q.startsWith('SELECT'), 'query deve iniziare con SELECT');
    System.assert(
      rq.startsWith('SELECT'),
      'resolvedQuery deve iniziare con SELECT'
    );
    System.assert(
      q.contains('ORDER BY Data_di_Pagamento__c DESC NULLS LAST'),
      'La query deve ordinare per Data_di_Pagamento__c DESC NULLS LAST'
    );
    System.assert(
      rq.contains('ORDER BY Data_di_Pagamento__c DESC NULLS LAST'),
      'resolvedQuery deve mantenere la clausola di ordinamento'
    );
  }

  /** 2) getPagamenti con filtri anno, programId e stato **/
  @IsTest
  static void testGetPagamentiWithFilters() {
    // Preleva un pagamento di esempio
    List<Payment__c> sampleList = [
      SELECT Id, Amount__c, Programma__c, Status__c, Anno_di_Pagamento__c
      FROM Payment__c
      WHERE Status__c != NULL
      LIMIT 1
    ];
    if (sampleList.isEmpty()) {
      // Nessun dato ⇒ lista vuota
      Map<String, Object> emptyRes = PagamentiController.getPagamenti(
        '1900',
        '00D000000000001',
        'X'
      );
      List<Payment__c> emptyRecs = (List<Payment__c>) emptyRes.get('records');
      System.assertEquals(0, emptyRecs.size(), 'Senza dati, records vuoto');
      return;
    }
    Payment__c sample = sampleList[0];
    String year = sample.Anno_di_Pagamento__c;
    String prog15 = String.valueOf(sample.Programma__c).substring(0, 15);
    String stato = sample.Status__c;

    Map<String, Object> res = PagamentiController.getPagamenti(
      year,
      prog15,
      stato
    );
    List<Payment__c> filtered = (List<Payment__c>) res.get('records');
    System.assert(
      filtered.size() > 0,
      'Almeno un record deve superare i filtri'
    );
    for (Payment__c p : filtered) {
      System.assertEquals(
        year,
        p.Anno_di_Pagamento__c,
        'Anno_di_Pagamento deve corrispondere'
      );
      String p15 = String.valueOf(p.Programma__c).substring(0, 15);
      System.assertEquals(
        prog15,
        p15,
        'Programma__c prefix deve corrispondere'
      );
      System.assertEquals(stato, p.Status__c, 'Status deve corrispondere');
    }

    String rq = (String) res.get('resolvedQuery');
    System.assert(
      rq.contains(prog15),
      'resolvedQuery deve sostituire il placeholder :shortProgramId'
    );
  }

  /** 3) getAvailablePrograms: tutti i Program ordinati **/
  @IsTest
  static void testGetAvailablePrograms() {
    List<Program> allProgs = PagamentiController.getAvailablePrograms();
    System.assertNotEquals(null, allProgs, 'La lista non deve essere null');
    Integer expectedCount = [SELECT COUNT() FROM Program];
    System.assertEquals(
      expectedCount,
      allProgs.size(),
      'Numero di programmi deve corrispondere'
    );
  }

  /** 4) getAvailableYears: anni unici da Payment__c **/
  @IsTest
  static void testGetAvailableYears() {
    List<String> years = PagamentiController.getAvailableYears();
    System.assertNotEquals(null, years, 'La lista anni non deve essere null');
    // Confronto con i valori unici in org
    Set<String> expectedSet = new Set<String>();
    for (Payment__c p : [
      SELECT Anno_di_Pagamento__c
      FROM Payment__c
      WHERE Anno_di_Pagamento__c != NULL
    ]) {
      expectedSet.add(p.Anno_di_Pagamento__c);
    }
    List<String> expectedList = new List<String>(expectedSet);
    expectedList.sort();
    System.assertEquals(
      expectedList,
      years,
      'Gli anni restituiti devono corrispondere e essere ordinati'
    );
  }

  /** 5) getAvailableStatuses: valori del picklist Status__c **/
  @IsTest
  static void testGetAvailableStatuses() {
    List<String> statuses = PagamentiController.getAvailableStatuses();
    System.assertNotEquals(
      null,
      statuses,
      'La lista status non deve essere null'
    );
    Integer expected = Payment__c.Status__c.getDescribe()
      .getPicklistValues()
      .size();
    System.assertEquals(
      expected,
      statuses.size(),
      'Numero di status deve corrispondere al picklist'
    );
  }
}