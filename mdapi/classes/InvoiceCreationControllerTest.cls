@IsTest
public class InvoiceCreationControllerTest {
  private static String TEST_PROVINCIA;
  private static String TEST_REGIONE;
  @testSetup
  static void setupComune() {
    // Inserisce un comune di test per coprire i metodi di ricerca
    if ([SELECT COUNT() FROM Comune__c WHERE Nome_Comune__c = 'TestComune'] == 0) {
      Schema.DescribeFieldResult provinciaDescribe = Comune__c.Provincia__c.getDescribe();
      Schema.DescribeFieldResult regioneDescribe = Comune__c.Regione__c.getDescribe();
      TEST_PROVINCIA = provinciaDescribe.getPicklistValues().isEmpty()
        ? null
        : provinciaDescribe.getPicklistValues()[0].getValue();
      TEST_REGIONE = regioneDescribe.getPicklistValues().isEmpty()
        ? null
        : regioneDescribe.getPicklistValues()[0].getValue();
      Comune__c comune = new Comune__c(
        Name = 'TestComune',
        Nome_Comune__c = 'TestComune'
      );
      if (TEST_PROVINCIA != null) comune.Provincia__c = TEST_PROVINCIA;
      if (TEST_REGIONE != null) comune.Regione__c = TEST_REGIONE;
      insert comune;
    }
  }
  @IsTest
  static void testGetMedicalCenters() {
    // Chiama il metodo
    List<String> centers = InvoiceCreationController.getMedicalCenters();
    System.assertNotEquals(null, centers, 'La lista non deve essere null');
    // Verifica che non contenga valori null
    for (String c : centers) {
      System.assertNotEquals(
        null,
        c,
        'Ogni Medical Center deve essere non-null'
      );
    }
  }

  @IsTest
  static void testGetSignalingNonProfits() {
    List<Ente_No_Profit__c> ents = InvoiceCreationController.getSignalingNonProfits();
    System.assertNotEquals(null, ents, 'La lista non deve essere null');
    // Se esiste almeno un record, controlla i campi
    if (!ents.isEmpty()) {
      Ente_No_Profit__c first = ents[0];
      System.assertNotEquals(null, first.Name, 'Name non deve essere null');
      System.assertNotEquals(
        null,
        first.Ente_Categoria__c,
        'Categoria non deve essere null'
      );
    }
  }

  @IsTest
  static void testGetComune() {
    List<Comune__c> comuni = InvoiceCreationController.getComune();
    System.assertNotEquals(null, comuni, 'La lista non deve essere null');
    // Se esiste almeno un record, controlla i campi
    if (!comuni.isEmpty()) {
      Comune__c first = comuni[0];
      System.assertNotEquals(
        null,
        first.Nome_Comune__c,
        'Nome_Comune__c non deve essere null'
      );
      System.assertNotEquals(
        null,
        first.Provincia__c,
        'Provincia__c non deve essere null'
      );
      System.assertNotEquals(
        null,
        first.Regione__c,
        'Regione__c non deve essere null'
      );
    }
  }

  @IsTest
  static void testSearchComuni() {
    List<Comune__c> result = InvoiceCreationController.searchComuni(
      'TestCom',
      5
    );
    System.assertNotEquals(null, result, 'searchComuni non null');
    System.assert(result.size() <= 5, 'Rispetta il limite richiesto');
    Boolean found = false;
    for (Comune__c c : result) {
      if (c.Nome_Comune__c == 'TestComune') {
        found = true;
        if (TEST_PROVINCIA != null)
          System.assertEquals(TEST_PROVINCIA, c.Provincia__c);
        if (TEST_REGIONE != null)
          System.assertEquals(TEST_REGIONE, c.Regione__c);
      }
    }
    System.assert(found, 'Il comune inserito deve comparire tra i risultati');

    // Parametro vuoto ⇒ lista vuota
    List<Comune__c> empty = InvoiceCreationController.searchComuni(' ', 5);
    System.assertEquals(0, empty.size(), 'Query vuota ⇒ nessun risultato');
  }

  @IsTest
  static void testGetProvinceDistinct() {
    List<String> provinces = InvoiceCreationController.getProvinceDistinct();
    System.assertNotEquals(null, provinces, 'Lista province non null');
    if (TEST_PROVINCIA != null) {
      System.assert(
        provinces.contains(TEST_PROVINCIA),
        'La provincia del comune di test deve essere presente'
      );
    }
  }

  @IsTest
  static void testGetRegioneByProvincia() {
    if (TEST_PROVINCIA != null && TEST_REGIONE != null) {
      String regione = InvoiceCreationController.getRegioneByProvincia(
        TEST_PROVINCIA
      );
      System.assertEquals(TEST_REGIONE, regione, 'Regione coerente con la provincia');
    }

    System.assertEquals(
      null,
      InvoiceCreationController.getRegioneByProvincia(null),
      'Parametro null ⇒ null'
    );
  }

  @IsTest
  static void testGetTipiVisita() {
    List<Map<String, String>> tipi = InvoiceCreationController.getTipiVisita();
    System.assertNotEquals(null, tipi, 'La lista non deve essere null');
    // Se non vuoto, verifica presenza chiavi Id e Name
    if (!tipi.isEmpty()) {
      Map<String, String> m = tipi[0];
      System.assert(
        m.containsKey('Id'),
        'La mappa deve contenere la chiave "Id"'
      );
      System.assert(
        m.containsKey('Name'),
        'La mappa deve contenere la chiave "Name"'
      );
      System.assertNotEquals(
        null,
        m.get('Id'),
        'Il valore "Id" non deve essere null'
      );
      System.assertNotEquals(
        null,
        m.get('Name'),
        'Il valore "Name" non deve essere null'
      );
    }
  }

  @IsTest
  static void testGetBeneficiaryTypes() {
    List<String> types = InvoiceCreationController.getBeneficiaryTypes();
    System.assertNotEquals(null, types, 'La lista non deve essere null');
    // Confronta con metadata del picklist
    Integer expected = Visit__c.Beneficiary_Type__c
      .getDescribe()
      .getPicklistValues()
      .size();
    System.assertEquals(
      expected,
      types.size(),
      'Numero di tipi deve corrispondere al picklist'
    );
    for (String t : types) {
      System.assertNotEquals(null, t, 'Ogni tipo non deve essere null');
    }
  }
}