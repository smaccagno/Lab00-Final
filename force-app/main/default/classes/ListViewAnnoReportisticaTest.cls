@IsTest(SeeAllData=true)
public class ListViewAnnoReportisticaTest {
  @IsTest
  static void testGetAnnoReportisticaData() {
    // Invoca il metodo
    List<ListViewAnnoReportistica.AnnoReportisticaWrapper> data = ListViewAnnoReportistica.getAnnoReportisticaData();

    // Il risultato non deve essere null
    System.assertNotEquals(null, data, 'La lista non deve essere null');

    // Se ci sono record, verifica la struttura del wrapper
    if (!data.isEmpty()) {
      ListViewAnnoReportistica.AnnoReportisticaWrapper w = data[0];
      System.assertNotEquals(
        null,
        w.record,
        'Il wrapper deve contenere il record Anno_Reportistica__c'
      );
      System.assertNotEquals(
        null,
        w.dynamicFields,
        'Il wrapper deve contenere la lista dynamicFields'
      );
      // dynamicFields può essere vuoto ma non null
    }
  }
}