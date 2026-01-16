public with sharing class VisitTypeExportController {
  public String city { get; set; }
  public String province { get; set; }
  public String region { get; set; }
  public List<VisitRow> rows { get; private set; }
  public Decimal maxBar { get; private set; }
  public List<Section> sections { get; private set; }

  public class VisitRow implements Comparable {
    public String sectionLabel { get; set; }
    public String visitType { get; set; }
    public Decimal qty { get; set; }
    public Decimal percentOfMax { get; set; }
    public Decimal totalSection { get; set; }
    public VisitRow(String sectionLabel, String visitType, Decimal qty, Decimal percentOfMax, Decimal totalSection) {
      this.sectionLabel = sectionLabel;
      this.visitType = visitType;
      this.qty = qty == null ? 0 : qty;
      this.percentOfMax = percentOfMax == null ? 0 : percentOfMax;
      this.totalSection = totalSection == null ? 0 : totalSection;
    }

    public Integer compareTo(Object other) {
      VisitRow o = (VisitRow) other;
      if (o.qty == qty) return 0;
      return o.qty > qty ? 1 : -1; // desc
    }
  }

  public class Section implements Comparable {
    public String label { get; set; }
    public Decimal totalQty { get; set; }
    public List<VisitRow> rows { get; set; }
    public Decimal sectionMax { get; set; }

    public Integer compareTo(Object other) {
      Section o = (Section) other;
      if (o.totalQty == totalQty) return 0;
      return o.totalQty > totalQty ? 1 : -1; // desc
    }
  }

  public VisitTypeExportController() {
    city = ApexPages.currentPage().getParameters().get('city');
    province = ApexPages.currentPage().getParameters().get('province');
    region = ApexPages.currentPage().getParameters().get('region');
    buildData(city, province, region);
  }

  private void buildData(String city, String province, String region) {
    List<VisitGeoController.RegionVisitTypeAggregate> data = VisitGeoController.getVisitTypeCountsByRegion(
      city,
      province,
      region
    );
    if (data == null) {
      rows = new List<VisitRow>();
      sections = new List<Section>();
      maxBar = 0;
      return;
    }

    Map<String, Decimal> totalsBySection = new Map<String, Decimal>();
    Map<String, Decimal> maxBySection = new Map<String, Decimal>();
    maxBar = 0;

    for (VisitGeoController.RegionVisitTypeAggregate r : data) {
      String baseRegion = String.isBlank(r.region) ? '(Senza regione)' : r.region;
      String sectionLabel = buildSectionLabel(baseRegion, region, province, city);

      Decimal qty = r.quantity == null ? 0 : r.quantity;
      totalsBySection.put(sectionLabel, (totalsBySection.get(sectionLabel) == null ? 0 : totalsBySection.get(sectionLabel)) + qty);
      Decimal currentMax = maxBySection.get(sectionLabel);
      if (currentMax == null || qty > currentMax) maxBySection.put(sectionLabel, qty);
      if (qty > maxBar) maxBar = qty;
    }

    List<VisitRow> out = new List<VisitRow>();
    Map<String, List<VisitRow>> grouped = new Map<String, List<VisitRow>>();
    for (VisitGeoController.RegionVisitTypeAggregate r : data) {
      String baseRegion = String.isBlank(r.region) ? '(Senza regione)' : r.region;
      String sectionLabel = buildSectionLabel(baseRegion, region, province, city);

      Decimal sectionMax = maxBySection.get(sectionLabel);
      Decimal perc = 0;
      if (maxBar != null && maxBar > 0) {
        perc = (r.quantity / maxBar) * 100;
        if (perc > 0 && perc < 0.2) perc = 0.2; // larghezza minima ma molto piccola
      }
      VisitRow vr = new VisitRow(
        sectionLabel,
        String.isBlank(r.visitType) ? 'N/D' : r.visitType,
        r.quantity,
        perc,
        totalsBySection.get(sectionLabel)
      );
      out.add(vr);

      if (!grouped.containsKey(sectionLabel)) grouped.put(sectionLabel, new List<VisitRow>());
      grouped.get(sectionLabel).add(vr);
    }
    // ordina le righe all'interno di ogni sezione
    sections = new List<Section>();
    for (String sec : grouped.keySet()) {
      List<VisitRow> entries = grouped.get(sec);
      entries.sort(); // usa compareTo su qty desc
      Section s = new Section();
      s.label = sec;
      s.totalQty = totalsBySection.get(sec);
      s.sectionMax = maxBySection.get(sec);
      s.rows = entries;
      sections.add(s);
    }
    sections.sort(); // desc su totalQty
    rows = out;
  }

  private static String buildSectionLabel(String baseRegion, String region, String province, String city) {
    List<String> parts = new List<String>();
    if (!String.isBlank(region)) parts.add(region);
    if (!String.isBlank(province)) parts.add(province);
    if (!String.isBlank(city)) parts.add(city);
    if (parts.isEmpty()) parts.add(baseRegion);
    return String.join(parts, ' - ');
  }

  @AuraEnabled
  public static String generatePdf(String city, String province, String region) {
    PageReference ref = Page.VisitTypeRegionChartPdf;
    if (city != null) ref.getParameters().put('city', city);
    if (province != null) ref.getParameters().put('province', province);
    if (region != null) ref.getParameters().put('region', region);
    Blob pdfBlob = ref.getContentAsPDF();
    return EncodingUtil.base64Encode(pdfBlob);
  }
}