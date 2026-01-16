@IsTest
private class RandomNumberTest {
  @IsTest
  static void testGeneraCodiceCasuale_NonNullAndRange() {
    // Anche se l'input non è utilizzato, serve passare una lista
    List<Integer> input = new List<Integer>{ 0 };
    Test.startTest();
    List<Integer> codes = RandomNumber.generaCodiceCasuale(input);
    Test.stopTest();

    // Deve restituire una lista non nulla di lunghezza 1
    System.assertNotEquals(null, codes, 'La lista non deve essere null');
    System.assertEquals(
      1,
      codes.size(),
      'La lista deve contenere esattamente un codice'
    );

    Integer code = codes[0];
    // Il codice deve essere compreso tra 0 (incluso) e 1.000.000.000 (escluso)
    System.assert(code >= 0, 'Il codice deve essere >= 0');
    System.assert(code < 1000000000, 'Il codice deve essere < 1.000.000.000');
  }

  @IsTest
  static void testGeneraCodiceCasuale_Variabilita() {
    List<Integer> input = new List<Integer>{ 1 };
    Set<Integer> uniqueCodes = new Set<Integer>();

    Test.startTest();
    // Genera più codici sequenziali
    for (Integer i = 0; i < 10; i++) {
      List<Integer> codes = RandomNumber.generaCodiceCasuale(input);
      uniqueCodes.add(codes[0]);
    }
    Test.stopTest();

    // Deve produrre almeno un codice e non più di 10 distinti
    System.assert(
      uniqueCodes.size() > 0,
      'Deve essere generato almeno un codice'
    );
    System.assert(
      uniqueCodes.size() <= 10,
      'Non devono esserci più di 10 codici unici'
    );
  }
}