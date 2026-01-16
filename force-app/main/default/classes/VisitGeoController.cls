// VisitGeoController.cls
public with sharing class VisitGeoController {
  /* ---------- CLASSI DI APPOGGIO ---------- */

  public class AggregatedRegion implements Comparable {
    @AuraEnabled
    public String region;
    @AuraEnabled
    public Integer numberOfProvinces;
    @AuraEnabled
    public Integer numberOfCities;
    @AuraEnabled
    public Decimal numberOfVisits;
    @AuraEnabled
    public Decimal totalVisitValue; // eventuale campo monetario
    @AuraEnabled
    public Map<String, Decimal> extraFields;

    private Set<String> provinces = new Set<String>();
    private Set<String> cities = new Set<String>();

    public AggregatedRegion(String regionName) {
      region = regionName;
      numberOfVisits = 0;
      totalVisitValue = 0;
      extraFields = new Map<String, Decimal>();
    }
    public void finalizeCounts() {
      numberOfProvinces = provinces.size();
      numberOfCities = cities.size();
    }
    public Integer compareTo(Object other) {
      return region.toLowerCase()
        .compareTo(((AggregatedRegion) other).region.toLowerCase());
    }
  }

  public class AggregatedProvince implements Comparable {
    @AuraEnabled
    public String province;
    @AuraEnabled
    public Integer numberOfCities;
    @AuraEnabled
    public Decimal numberOfVisits;
    @AuraEnabled
    public Decimal totalVisitValue;
    @AuraEnabled
    public Map<String, Decimal> extraFields;

    private Set<String> cities = new Set<String>();

    public AggregatedProvince(String p) {
      province = p;
      numberOfVisits = 0;
      totalVisitValue = 0;
      extraFields = new Map<String, Decimal>();
    }
    public void finalizeCounts() {
      numberOfCities = cities.size();
    }
    public Integer compareTo(Object other) {
      return province.toLowerCase()
        .compareTo(((AggregatedProvince) other).province.toLowerCase());
    }
  }

  public class LocalitaAggregate implements Comparable {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Decimal numberOfVisits;
    @AuraEnabled
    public Decimal totalVisitValue;
    @AuraEnabled
    public Map<String, Decimal> extraFields;

    public LocalitaAggregate(String n) {
      name = n;
      numberOfVisits = 0;
      totalVisitValue = 0;
      extraFields = new Map<String, Decimal>();
    }
    public Integer compareTo(Object other) {
      Decimal a = ((LocalitaAggregate) other).numberOfVisits;
      Decimal b = numberOfVisits;
      if (a == b)
        return 0;
      return a > b ? 1 : -1;
    }
  }

  public class RegionVisitTypeAggregate {
    @AuraEnabled
    public String region;
    @AuraEnabled
    public String visitType;
    @AuraEnabled
    public Decimal quantity;

    public RegionVisitTypeAggregate(String region, String visitType, Decimal qty) {
      this.region = region;
      this.visitType = visitType;
      this.quantity = qty == null ? 0 : qty;
    }
  }

  /* ---------- METADATI DINAMICI ---------- */

  @AuraEnabled(cacheable=true)
  public static List<ProgramFieldConfigUtil.FieldConf> getVisitDynamicFields(
    String programDevName
  ) {
    // NB: il set targets ora punta a Visit__c
    Set<String> targets = new Set<String>{ 'Visit__c' };
    Map<String, List<ProgramFieldConfigUtil.FieldConf>> cfg = ProgramFieldConfigUtil.getFieldConfig(
      programDevName,
      targets,
      null
    );
    return cfg.get('Visit__c');
  }

  /* ---------- AGGREGAZIONI ---------- */

  @AuraEnabled(cacheable=true)
  public static List<AggregatedRegion> getAggregatedRegionData(
    String programDevName
  ) {
    List<ProgramFieldConfigUtil.FieldConf> dynFields = getVisitDynamicFields(
      programDevName
    );

    /* Costruiamo la SELECT dinamica */
    Set<String> fieldSet = new Set<String>{
      'Id',
      'Region__c',
      'Province__c',
      'City__c',
      'Amount__c', /* se esiste */
      'Quantity__c'
    };
    for (ProgramFieldConfigUtil.FieldConf f : dynFields) {
      if (f.isSummary)
        fieldSet.add(f.fieldApi);
    }

    String soql =
      'SELECT ' +
      String.join(new List<String>(fieldSet), ', ') +
      ' FROM Visit__c';

    List<SObject> visits = Database.query(soql);

    Map<String, AggregatedRegion> mapAgg = new Map<String, AggregatedRegion>();
    for (SObject s : visits) {
      Visit__c v = (Visit__c) s;
      String key = String.isBlank(v.Region__c) ? '(Non valorizzata)' : v.Region__c;
      if (!mapAgg.containsKey(key))
        mapAgg.put(key, new AggregatedRegion(key));

      AggregatedRegion agg = mapAgg.get(key);
      if (v.Quantity__c != null)
        agg.numberOfVisits += v.Quantity__c;
      if (v.Province__c != null)
        agg.provinces.add(v.Province__c);
      if (v.City__c != null)
        agg.cities.add(v.City__c);
      if (v.Amount__c != null)
        agg.totalVisitValue += v.Amount__c;

      for (ProgramFieldConfigUtil.FieldConf f : dynFields) {
        if (f.isSummary) {
          Decimal val = (Decimal) v.get(f.fieldApi);
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

    List<AggregatedRegion> res = new List<AggregatedRegion>(mapAgg.values());
    for (AggregatedRegion r : res)
      r.finalizeCounts();
    res.sort();
    return res;
  }

  @AuraEnabled(cacheable=true)
  public static List<AggregatedProvince> getAggregatedProvinceData(
    String programDevName
  ) {
    List<ProgramFieldConfigUtil.FieldConf> dynFields = getVisitDynamicFields(
      programDevName
    );

    Set<String> fieldSet = new Set<String>{
      'Id',
      'Province__c',
      'City__c',
      'Amount__c',
      'Quantity__c'
    };
    for (ProgramFieldConfigUtil.FieldConf f : dynFields) {
      if (f.isSummary)
        fieldSet.add(f.fieldApi);
    }

    String soql =
      'SELECT ' +
      String.join(new List<String>(fieldSet), ', ') +
      ' FROM Visit__c';

    List<SObject> visits = Database.query(soql);

    Map<String, AggregatedProvince> mapAgg = new Map<String, AggregatedProvince>();
    for (SObject s : visits) {
      Visit__c v = (Visit__c) s;
      String key = String.isBlank(v.Province__c) ? '(Non valorizzata)' : v.Province__c;
      if (!mapAgg.containsKey(key))
        mapAgg.put(key, new AggregatedProvince(key));

      AggregatedProvince agg = mapAgg.get(key);
      if (v.Quantity__c != null)
        agg.numberOfVisits += v.Quantity__c;
      if (v.City__c != null)
        agg.cities.add(v.City__c);
      if (v.Amount__c != null)
        agg.totalVisitValue += v.Amount__c;

      for (ProgramFieldConfigUtil.FieldConf f : dynFields) {
        if (f.isSummary) {
          Decimal val = (Decimal) v.get(f.fieldApi);
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

    List<AggregatedProvince> res = new List<AggregatedProvince>(
      mapAgg.values()
    );
    for (AggregatedProvince p : res)
      p.finalizeCounts();
    res.sort();
    return res;
  }

  @AuraEnabled(cacheable=true)
  public static List<LocalitaAggregate> getVisitsByLocalita(
    String programDevName
  ) {
    List<ProgramFieldConfigUtil.FieldConf> dynFields = getVisitDynamicFields(
      programDevName
    );

    Set<String> fieldSet = new Set<String>{ 'Id', 'Localit__c', 'Amount__c' };
    fieldSet.add('Quantity__c');
    for (ProgramFieldConfigUtil.FieldConf f : dynFields) {
      if (f.isSummary)
        fieldSet.add(f.fieldApi);
    }

    String soql =
      'SELECT ' +
      String.join(new List<String>(fieldSet), ', ') +
      ' FROM Visit__c';

    List<SObject> visits = Database.query(soql);

    Map<String, LocalitaAggregate> mapAgg = new Map<String, LocalitaAggregate>();
    for (SObject s : visits) {
      Visit__c v = (Visit__c) s;
      String key = String.isBlank(v.Localit__c) ? '(Non valorizzata)' : v.Localit__c;
      if (!mapAgg.containsKey(key))
        mapAgg.put(key, new LocalitaAggregate(key));

      LocalitaAggregate agg = mapAgg.get(key);
      if (v.Quantity__c != null)
        agg.numberOfVisits += v.Quantity__c;
      if (v.Amount__c != null)
        agg.totalVisitValue += v.Amount__c;

      for (ProgramFieldConfigUtil.FieldConf f : dynFields) {
        if (f.isSummary) {
          Decimal val = (Decimal) v.get(f.fieldApi);
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

    List<LocalitaAggregate> res = new List<LocalitaAggregate>(mapAgg.values());
    res.sort();
    return res;
  }

  /**
   * Aggrega le visite per Regione e Tipo Visita, sommando Quantity__c.
   * Filtri opzionali su Comune/Provincia/Regione.
   */
  @AuraEnabled(cacheable=true)
  public static List<RegionVisitTypeAggregate> getVisitTypeCountsByRegion(
    String city,
    String province,
    String region
  ) {
    List<String> filters = new List<String>{ 'Region__c != NULL' };
    if (!String.isBlank(city))
      filters.add('City__c = :city');
    if (!String.isBlank(province))
      filters.add('Province__c = :province');
    if (!String.isBlank(region))
      filters.add('Region__c = :region');

    String soql =
      'SELECT Region__c, Visit_Type__c, SUM(Quantity__c) qty ' +
      'FROM Visit__c ' +
      (filters.isEmpty() ? '' : 'WHERE ' + String.join(filters, ' AND ')) +
      ' GROUP BY Region__c, Visit_Type__c';

    List<RegionVisitTypeAggregate> out = new List<RegionVisitTypeAggregate>();
    for (AggregateResult ar : Database.query(soql)) {
      out.add(
        new RegionVisitTypeAggregate(
          (String) ar.get('Region__c'),
          (String) ar.get('Visit_Type__c'),
          (Decimal) ar.get('qty')
        )
      );
    }
    return out;
  }
}