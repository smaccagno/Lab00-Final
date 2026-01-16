@IsTest
private class InvoiceUtilTest {
  @IsTest
  static void testConvertStringToIdList_Simple() {
    List<String> inputs = new List<String>{ 'a,b,c' };
    List<List<String>> result = InvoiceUtil.convertStringToIdList(inputs);

    // Deve restituire una lista di una sottolista
    System.assertEquals(1, result.size(), 'Should have one sublist');
    List<String> sub = result[0];
    System.assertEquals(3, sub.size(), 'Sublist should have three elements');
    System.assertEquals('a', sub[0]);
    System.assertEquals('b', sub[1]);
    System.assertEquals('c', sub[2]);
  }

  @IsTest
  static void testConvertStringToIdList_Whitespace() {
    List<String> inputs = new List<String>{ ' id1 , id2  ,id3 ' };
    List<List<String>> result = InvoiceUtil.convertStringToIdList(inputs);

    System.assertEquals(1, result.size());
    List<String> sub = result[0];
    System.assertEquals(3, sub.size());
    System.assertEquals('id1', sub[0], 'Leading/trailing spaces trimmed');
    System.assertEquals('id2', sub[1], 'Extra spaces removed');
    System.assertEquals('id3', sub[2], 'Trimmed correctly');
  }

  @IsTest
  static void testConvertStringToIdList_MultipleInputs() {
    List<String> inputs = new List<String>{ 'x,y', 'z' };
    List<List<String>> result = InvoiceUtil.convertStringToIdList(inputs);

    System.assertEquals(2, result.size(), 'Two sublists expected');
    // First sublist
    List<String> first = result[0];
    System.assertEquals(2, first.size());
    System.assertEquals('x', first[0]);
    System.assertEquals('y', first[1]);
    // Second sublist
    List<String> second = result[1];
    System.assertEquals(1, second.size());
    System.assertEquals('z', second[0]);
  }

  @IsTest
  static void testConvertStringToIdList_EmptyAndSingle() {
    // Empty input list
    List<String> emptyInputs = new List<String>();
    List<List<String>> emptyResult = InvoiceUtil.convertStringToIdList(
      emptyInputs
    );
    System.assertEquals(0, emptyResult.size(), 'Empty input => empty result');

    // Single string without commas
    List<String> singleInput = new List<String>{ 'onlyOne' };
    List<List<String>> singleResult = InvoiceUtil.convertStringToIdList(
      singleInput
    );
    System.assertEquals(1, singleResult.size());
    System.assertEquals(1, singleResult[0].size());
    System.assertEquals('onlyOne', singleResult[0][0]);
  }
}