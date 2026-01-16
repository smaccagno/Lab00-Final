@IsTest(SeeAllData=true)
private class VisitGeoControllerTest {
  /*------------------------------------------
   *  1) getVisitDynamicFields
   *-----------------------------------------*/
  @IsTest
  static void testGetVisitDynamicFields() {
    // qualsiasi dev-name va bene: se non esiste, il metodo
    // deve restituire una lista (eventualmente vuota) e NON null
    List<ProgramFieldConfigUtil.FieldConf> cfg = VisitGeoController.getVisitDynamicFields(
      'UT_Program'
    );
    System.assertNotEquals(
      null,
      cfg,
      'getVisitDynamicFields non deve restituire null'
    );
  }

  /*------------------------------------------
   *  2) Aggregazione per Regione
   *-----------------------------------------*/
  @IsTest
  static void testAggregatedRegionData() {
    List<VisitGeoController.AggregatedRegion> lst = VisitGeoController.getAggregatedRegionData(
      'UT_Program'
    );
    System.assertNotEquals(null, lst, 'Lista regioni non null');

    if (!lst.isEmpty()) {
      // Verifica campi calcolati sul primo elemento
      VisitGeoController.AggregatedRegion r = lst[0];
      System.assertNotEquals(null, r.region);
      System.assert(r.numberOfVisits >= 0);
      System.assert(r.numberOfProvinces >= 0);
      System.assert(r.numberOfCities >= 0);
    }
  }

  /*------------------------------------------
   *  3) Aggregazione per Provincia
   *-----------------------------------------*/
  @IsTest
  static void testAggregatedProvinceData() {
    List<VisitGeoController.AggregatedProvince> lst = VisitGeoController.getAggregatedProvinceData(
      'UT_Program'
    );
    System.assertNotEquals(null, lst, 'Lista province non null');

    if (!lst.isEmpty()) {
      VisitGeoController.AggregatedProvince p = lst[0];
      System.assertNotEquals(null, p.province);
      System.assert(p.numberOfVisits >= 0);
      System.assert(p.numberOfCities >= 0);
    }
  }

  /*------------------------------------------
   *  4) Aggregazione per Località
   *-----------------------------------------*/
  @IsTest
  static void testVisitsByLocalita() {
    List<VisitGeoController.LocalitaAggregate> lst = VisitGeoController.getVisitsByLocalita(
      'UT_Program'
    );
    System.assertNotEquals(null, lst, 'Lista località non null');

    if (!lst.isEmpty()) {
      VisitGeoController.LocalitaAggregate l = lst[0];
      System.assertNotEquals(null, l.name);
      System.assert(l.numberOfVisits >= 0);
      // totalVisitValue può essere 0 ma non deve dare eccezioni
      System.assertNotEquals(null, l.totalVisitValue);
    }
  }

  /*------------------------------------------
   *  5) Aggregazione Regione/Tipo Visita
   *-----------------------------------------*/
  @IsTest
  static void testVisitTypeCountsByRegion() {
    List<VisitGeoController.RegionVisitTypeAggregate> lst = VisitGeoController.getVisitTypeCountsByRegion(
      null,
      null,
      null
    );
    System.assertNotEquals(null, lst, 'Lista aggregati non null');
    if (!lst.isEmpty()) {
      VisitGeoController.RegionVisitTypeAggregate a = lst[0];
      System.assertNotEquals(null, a.region);
      System.assertNotEquals(null, a.visitType);
      System.assert(a.quantity >= 0);
    }
  }
}