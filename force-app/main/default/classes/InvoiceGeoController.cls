public with sharing class InvoiceGeoController {
  public class AggregatedRegion implements Comparable {
    @AuraEnabled
    public String region;
    @AuraEnabled
    public Integer numberOfProvinces;
    @AuraEnabled
    public Integer numberOfCities;
    @AuraEnabled
    public Integer numberOfInvoices;
    @AuraEnabled
    public Decimal totalInvoice;
    @AuraEnabled
    public Map<String, Decimal> extraFields;

    private Set<String> provinces = new Set<String>();
    private Set<String> cities = new Set<String>();

    public AggregatedRegion(String regionName) {
      this.region = regionName;
      this.totalInvoice = 0;
      this.numberOfInvoices = 0;
      this.extraFields = new Map<String, Decimal>();
    }

    public void finalizeCounts() {
      this.numberOfProvinces = provinces.size();
      this.numberOfCities = cities.size();
    }

    public Integer compareTo(Object other) {
      AggregatedRegion that = (AggregatedRegion) other;
      return this.region.toLowerCase().compareTo(that.region.toLowerCase());
    }
  }

  public class AggregatedProvince implements Comparable {
    @AuraEnabled
    public String province;
    @AuraEnabled
    public Integer numberOfCities;
    @AuraEnabled
    public Integer numberOfInvoices;
    @AuraEnabled
    public Decimal totalInvoice;
    @AuraEnabled
    public Map<String, Decimal> extraFields;

    private Set<String> cities = new Set<String>();

    public AggregatedProvince(String name) {
      this.province = name;
      this.totalInvoice = 0;
      this.numberOfInvoices = 0;
      this.extraFields = new Map<String, Decimal>();
    }

    public void finalizeCounts() {
      this.numberOfCities = cities.size();
    }

    public Integer compareTo(Object other) {
      AggregatedProvince that = (AggregatedProvince) other;
      return this.province.toLowerCase().compareTo(that.province.toLowerCase());
    }
  }

  public class LocalitaAggregate implements Comparable {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Integer numberOfInvoices;
    @AuraEnabled
    public Decimal totalInvoice;
    @AuraEnabled
    public Map<String, Decimal> extraFields;

    public LocalitaAggregate(String name) {
      this.name = name;
      this.totalInvoice = 0;
      this.numberOfInvoices = 0;
      this.extraFields = new Map<String, Decimal>();
    }

    public Integer compareTo(Object other) {
      LocalitaAggregate that = (LocalitaAggregate) other;
      return that.numberOfInvoices - this.numberOfInvoices;
    }
  }

  @AuraEnabled(cacheable=true)
  public static String getDeveloperNameForProgram(Id programId) {
    Program p = [SELECT Name FROM Program WHERE Id = :programId LIMIT 1];
    if (p == null)
      return null;
    return p.Name.replaceAll(' ', '_');
  }

  @AuraEnabled(cacheable=true)
  public static List<Program> getPrograms() {
    return [SELECT Id, Name FROM Program ORDER BY Name];
  }

  @AuraEnabled(cacheable=true)
  public static List<ProgramFieldConfigUtil.FieldConf> getInvoiceDynamicFields(
    String programDevName
  ) {
    Set<String> targets = new Set<String>{ 'Invoice__c' };
    Map<String, List<ProgramFieldConfigUtil.FieldConf>> config = ProgramFieldConfigUtil.getFieldConfig(
      programDevName,
      targets,
      null
    );
    return config.get('Invoice__c');
  }

  @AuraEnabled(cacheable=true)
  public static List<AggregatedRegion> getAggregatedRegionData(
    String programDevName,
    Id programId
  ) {
    List<ProgramFieldConfigUtil.FieldConf> dynamicFields = getInvoiceDynamicFields(
      programDevName
    );
    String shortProgramId = (programId != null)
      ? String.valueOf(programId).substring(0, 15)
      : null;

    Set<String> fieldSet = new Set<String>{
      'Id',
      'Region__c',
      'Province__c',
      'City__c',
      'Totale_Fattura__c'
    };
    for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
      if (f.isSummary)
        fieldSet.add(f.fieldApi);
    }

    String baseQuery =
      'SELECT ' +
      String.join(new List<String>(fieldSet), ', ') +
      ' FROM Invoice__c WHERE Region__c != null';
    if (shortProgramId != null) {
      baseQuery += ' AND Programma__c = \'' + shortProgramId + '\'';
    }

    List<SObject> invoices = Database.query(baseQuery);
    Map<String, AggregatedRegion> mapAgg = new Map<String, AggregatedRegion>();

    for (SObject s : invoices) {
      Invoice__c inv = (Invoice__c) s;
      String key = inv.Region__c;
      if (!mapAgg.containsKey(key))
        mapAgg.put(key, new AggregatedRegion(key));
      AggregatedRegion agg = mapAgg.get(key);

      agg.numberOfInvoices++;
      if (inv.Province__c != null)
        agg.provinces.add(inv.Province__c);
      if (inv.City__c != null)
        agg.cities.add(inv.City__c);
      if (inv.Totale_Fattura__c != null)
        agg.totalInvoice += inv.Totale_Fattura__c;

      for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
        if (f.isSummary) {
          Decimal val = (Decimal) inv.get(f.fieldApi);
          if (val != null) {
            agg.extraFields.put(
              f.fieldApi,
              (agg.extraFields.containsKey(f.fieldApi)
                ? agg.extraFields.get(f.fieldApi)
                : 0) + val
            );
          }
        }
      }
    }

    List<AggregatedRegion> result = new List<AggregatedRegion>(mapAgg.values());
    for (AggregatedRegion r : result)
      r.finalizeCounts();
    result.sort();
    return result;
  }

  @AuraEnabled(cacheable=true)
  public static List<AggregatedProvince> getAggregatedProvinceData(
    String programDevName,
    Id programId
  ) {
    List<ProgramFieldConfigUtil.FieldConf> dynamicFields = getInvoiceDynamicFields(
      programDevName
    );
    String shortProgramId = (programId != null)
      ? String.valueOf(programId).substring(0, 15)
      : null;

    Set<String> fieldSet = new Set<String>{
      'Id',
      'Province__c',
      'City__c',
      'Totale_Fattura__c'
    };
    for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
      if (f.isSummary)
        fieldSet.add(f.fieldApi);
    }

    String baseQuery =
      'SELECT ' +
      String.join(new List<String>(fieldSet), ', ') +
      ' FROM Invoice__c WHERE Province__c != null';
    if (shortProgramId != null) {
      baseQuery += ' AND Programma__c = \'' + shortProgramId + '\'';
    }

    List<SObject> invoices = Database.query(baseQuery);
    Map<String, AggregatedProvince> mapAgg = new Map<String, AggregatedProvince>();

    for (SObject s : invoices) {
      Invoice__c inv = (Invoice__c) s;
      String key = inv.Province__c;
      if (!mapAgg.containsKey(key))
        mapAgg.put(key, new AggregatedProvince(key));
      AggregatedProvince agg = mapAgg.get(key);

      agg.numberOfInvoices++;
      if (inv.City__c != null)
        agg.cities.add(inv.City__c);
      if (inv.Totale_Fattura__c != null)
        agg.totalInvoice += inv.Totale_Fattura__c;

      for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
        if (f.isSummary) {
          Decimal val = (Decimal) inv.get(f.fieldApi);
          if (val != null) {
            agg.extraFields.put(
              f.fieldApi,
              (agg.extraFields.containsKey(f.fieldApi)
                ? agg.extraFields.get(f.fieldApi)
                : 0) + val
            );
          }
        }
      }
    }

    List<AggregatedProvince> result = new List<AggregatedProvince>(
      mapAgg.values()
    );
    for (AggregatedProvince p : result)
      p.finalizeCounts();
    result.sort();
    return result;
  }

  @AuraEnabled(cacheable=true)
  public static List<LocalitaAggregate> getVisitsByLocalita(
    String programDevName,
    Id programId
  ) {
    List<ProgramFieldConfigUtil.FieldConf> dynamicFields = getInvoiceDynamicFields(
      programDevName
    );
    String shortProgramId = (programId != null)
      ? String.valueOf(programId).substring(0, 15)
      : null;

    Set<String> fieldSet = new Set<String>{
      'Id',
      'Localit__c',
      'Totale_Fattura__c'
    };
    for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
      if (f.isSummary)
        fieldSet.add(f.fieldApi);
    }

    String baseQuery =
      'SELECT ' +
      String.join(new List<String>(fieldSet), ', ') +
      ' FROM Invoice__c WHERE Localit__c != null';
    if (shortProgramId != null) {
      baseQuery += ' AND Programma__c = \'' + shortProgramId + '\'';
    }

    List<SObject> invoices = Database.query(baseQuery);
    Map<String, LocalitaAggregate> mapAgg = new Map<String, LocalitaAggregate>();

    for (SObject s : invoices) {
      Invoice__c inv = (Invoice__c) s;
      String key = inv.Localit__c;
      if (!mapAgg.containsKey(key))
        mapAgg.put(key, new LocalitaAggregate(key));
      LocalitaAggregate agg = mapAgg.get(key);

      agg.numberOfInvoices++;
      if (inv.Totale_Fattura__c != null)
        agg.totalInvoice += inv.Totale_Fattura__c;

      for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
        if (f.isSummary) {
          Decimal val = (Decimal) inv.get(f.fieldApi);
          if (val != null) {
            agg.extraFields.put(
              f.fieldApi,
              (agg.extraFields.containsKey(f.fieldApi)
                ? agg.extraFields.get(f.fieldApi)
                : 0) + val
            );
          }
        }
      }
    }

    List<LocalitaAggregate> result = new List<LocalitaAggregate>(
      mapAgg.values()
    );
    result.sort();
    return result;
  }
}