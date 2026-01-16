public with sharing class ListViewAnnoReportistica {
  @AuraEnabled(cacheable=true)
  public static List<AnnoReportisticaWrapper> getAnnoReportisticaData() {
    final String TARGET_OBJECT = 'Anno_Reportistica__c';

    /* ----------------------------------------------------
     * 1. Recupero campi dinamici da Program_Field_Config
     * --------------------------------------------------*/
    Set<String> dynamicFieldSet = new Set<String>();

    for (Program_Field_Config__mdt cfg : [
      SELECT Field_API__c
      FROM Program_Field_Config__mdt
      WHERE Target_Object_API__c = :TARGET_OBJECT
    ]) {
      dynamicFieldSet.add(cfg.Field_API__c);
    }

    /* ----------------------------------------------------
     * 2. Costruzione lista completa di campi da selezionare
     * --------------------------------------------------*/
    List<String> baseFields = new List<String>{
      'Name',
      'Id',
      'Ammontare_Originale_Donato__c',
      'Totale_Allocabile__c',
      'Ammontare_Distribuzioni__c',
      'Ammontare_Distribuzioni_Pagate__c',
      'Totale_NON_Distribuito__c',
      'Numero_Donazioni_Anno_Corrente__c',
      'Totale_Fatturato_Budgets__c',
      'Capienza_budgets__c',
      'Totale_Numero_Fatture__c',
      'Programma__c',
      'Programma__r.Name'
    };
    baseFields.addAll(dynamicFieldSet);

    String soql =
      'SELECT ' +
      String.join(baseFields, ',') +
      ' FROM Anno_Reportistica__c' +
      ' WHERE Programma__r.Name != null';

    List<Anno_Reportistica__c> records = Database.query(soql);

    /* ----------------------------------------------------
     * 3. Resto del metodo invariato
     * --------------------------------------------------*/
    Map<String, String> nameToDevMap = getProgramNameToDevNameMap();
    List<AnnoReportisticaWrapper> result = new List<AnnoReportisticaWrapper>();

    for (Anno_Reportistica__c record : records) {
      String programLabel = record.Programma__r.Name;
      String programDevName = nameToDevMap.get(programLabel);
      if (programDevName == null)
        programDevName = programLabel.replace(' ', '_');

      Map<String, List<ProgramFieldConfigUtil.FieldConf>> fieldConfMap = ProgramFieldConfigUtil.getFieldConfig(
        programDevName,
        new Set<String>{ TARGET_OBJECT },
        null
      );

      List<ProgramFieldConfigUtil.FieldConf> dynamicFields = fieldConfMap.get(
        TARGET_OBJECT
      );
      result.add(new AnnoReportisticaWrapper(record, dynamicFields));
    }
    return result;
  }

  private static Map<String, String> getProgramNameToDevNameMap() {
    Map<String, String> result = new Map<String, String>();
    for (Program_Config__mdt conf : [
      SELECT DeveloperName, MasterLabel
      FROM Program_Config__mdt
    ]) {
      result.put(conf.MasterLabel, conf.DeveloperName);
    }
    return result;
  }

  public class AnnoReportisticaWrapper {
    @AuraEnabled
    public Anno_Reportistica__c record;
    @AuraEnabled
    public List<ProgramFieldConfigUtil.FieldConf> dynamicFields;

    public AnnoReportisticaWrapper(
      Anno_Reportistica__c r,
      List<ProgramFieldConfigUtil.FieldConf> fields
    ) {
      this.record = r;
      this.dynamicFields = fields != null
        ? fields
        : new List<ProgramFieldConfigUtil.FieldConf>();
    }
  }
}