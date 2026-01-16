@IsTest(SeeAllData=true)
private class InvoiceGeoControllerTest {
  /** 1) getAggregatedRegionData **/
  @IsTest
  static void testGetAggregatedRegionData() {
    // Prendo un Program esistente
    List<Program> progs = [SELECT Id, Name FROM Program LIMIT 1];
    if (progs.isEmpty())
      return;
    Program prog = progs[0];
    String devName = prog.Name.replace(' ', '_');

    // Invoco con i parametri corretti
    List<InvoiceGeoController.AggregatedRegion> regions = InvoiceGeoController.getAggregatedRegionData(
      devName,
      prog.Id
    );

    System.assertNotEquals(null, regions, 'AggregatedRegion list non null');
    for (InvoiceGeoController.AggregatedRegion ar : regions) {
      System.assertNotEquals(null, ar.region, 'Region non null');
      System.assert(ar.numberOfInvoices >= 0, 'numberOfInvoices >= 0');
      System.assert(ar.numberOfCities >= 0, 'numberOfCities >= 0');
      System.assert(ar.numberOfProvinces >= 0, 'numberOfProvinces >= 0');
      System.assert(ar.totalInvoice >= 0, 'totalInvoice >= 0');
      System.assertNotEquals(null, ar.extraFields, 'extraFields map non null');
    }
    // Verifica ordinamento alfabetico per region
    for (Integer i = 1; i < regions.size(); i++) {
      String prev = regions[i - 1].region.toLowerCase();
      String curr = regions[i].region.toLowerCase();
      System.assert(prev.compareTo(curr) <= 0, 'Regions sorted');
    }
  }

  /** 2) getAggregatedProvinceData        **/
  @IsTest
  static void testGetAggregatedProvinceData() {
    // Prendo un Program esistente
    List<Program> progs = [SELECT Id, Name FROM Program LIMIT 1];
    if (progs.isEmpty())
      return;
    Program prog = progs[0];
    String devName = prog.Name.replace(' ', '_');

    List<InvoiceGeoController.AggregatedProvince> provs = InvoiceGeoController.getAggregatedProvinceData(
      devName,
      prog.Id
    );

    System.assertNotEquals(null, provs, 'AggregatedProvince list non null');
    for (InvoiceGeoController.AggregatedProvince ap : provs) {
      System.assertNotEquals(null, ap.province, 'Province non null');
      System.assert(ap.numberOfInvoices >= 0, 'numberOfInvoices >= 0');
      System.assert(ap.numberOfCities >= 0, 'numberOfCities >= 0');
      System.assert(ap.totalInvoice >= 0, 'totalInvoice >= 0');
      System.assertNotEquals(null, ap.extraFields, 'extraFields map non null');
    }
    // Verifica ordinamento alfabetico per province
    for (Integer i = 1; i < provs.size(); i++) {
      String prev = provs[i - 1].province.toLowerCase();
      String curr = provs[i].province.toLowerCase();
      System.assert(prev.compareTo(curr) <= 0, 'Provinces sorted');
    }
  }

  /** 3) getVisitsByLocalita **/
  @IsTest
  static void testGetVisitsByLocalita() {
    // Prendo un Program esistente
    List<Program> progs = [SELECT Id, Name FROM Program LIMIT 1];
    if (progs.isEmpty())
      return;
    Program prog = progs[0];
    String devName = prog.Name.replace(' ', '_');

    List<InvoiceGeoController.LocalitaAggregate> locals = InvoiceGeoController.getVisitsByLocalita(
      devName,
      prog.Id
    );

    System.assertNotEquals(null, locals, 'LocalitaAggregate list non null');
    for (InvoiceGeoController.LocalitaAggregate la : locals) {
      System.assertNotEquals(null, la.name, 'Localita name non null');
      System.assert(la.numberOfInvoices >= 0, 'numberOfInvoices >= 0');
      System.assert(la.totalInvoice >= 0, 'totalInvoice >= 0');
      System.assertNotEquals(null, la.extraFields, 'extraFields map non null');
    }
    // Verifica ordinamento decrescente per numberOfInvoices
    for (Integer i = 1; i < locals.size(); i++) {
      System.assert(
        locals[i - 1].numberOfInvoices >= locals[i].numberOfInvoices,
        'LocalitaAggregate sorted by numberOfInvoices desc'
      );
    }
  }
}