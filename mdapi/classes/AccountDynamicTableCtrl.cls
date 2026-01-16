public with sharing class AccountDynamicTableCtrl {
  /* ---------- DTO ---------- */
  public class ColumnDTO {
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String fieldName;
    @AuraEnabled
    public String type;
  }

  public class TableDTO {
    @AuraEnabled
    public String recordTypeId;
    @AuraEnabled
    public String recordTypeDeveloperName;
    @AuraEnabled
    public String recordTypeLabel;
    @AuraEnabled
    public List<ColumnDTO> columns;
    @AuraEnabled
    public List<Map<String, Object>> rows;
  }

  /* ---------- Public API ---------- */
  /**
   * Restituisce una lista di tabelle (una per Record Type)
   * con colonne derivate dal Field Set omonimo e righe di Account.
   */
  @AuraEnabled(cacheable=true)
  public static List<TableDTO> getAccountTables() {
    List<TableDTO> result = new List<TableDTO>();

    Schema.DescribeSObjectResult accDescribe = Account.SObjectType.getDescribe();
    Map<String, Schema.FieldSet> fieldSetMap = accDescribe.fieldSets.getMap();

    // developerName → RecordTypeInfo
    Map<String, Schema.RecordTypeInfo> rtByDevName = accDescribe.getRecordTypeInfosByDeveloperName();

    for (Schema.RecordTypeInfo rtInfo : rtByDevName.values()) {
      // salta “Master” o RT non disponibili
      if (!rtInfo.isAvailable() || rtInfo.isMaster()) {
        continue;
      }

      String rtDevName = rtInfo.getDeveloperName();
      if (!fieldSetMap.containsKey(rtDevName)) {
        continue; // manca Field Set omonimo
      }

      /* ---------- colonne ---------- */
      Schema.FieldSet fs = fieldSetMap.get(rtDevName);
      List<ColumnDTO> columns = new List<ColumnDTO>();
      List<String> selFields = new List<String>{ 'Id' };

      for (Schema.FieldSetMember m : fs.getFields()) {
        ColumnDTO col = new ColumnDTO();
        col.label = m.getLabel();
        col.fieldName = m.getFieldPath();
        col.type = mapToLwcType(m.getType());
        columns.add(col);
        selFields.add(m.getFieldPath());
      }

      /* ---------- righe ---------- */
      Id rtId = rtInfo.getRecordTypeId();
      String soql =
        'SELECT ' +
        String.join(selFields, ',') +
        ' FROM Account' +
        ' WHERE RecordTypeId = :rtId' +
        ' LIMIT 200';

      List<SObject> accs = Database.query(soql);
      List<Map<String, Object>> rows = new List<Map<String, Object>>();

      for (SObject acc : accs) {
        Map<String, Object> row = new Map<String, Object>();
        for (String f : selFields) {
          row.put(f, acc.get(f));
        }
        rows.add(row);
      }

      /* ---------- wrapper ---------- */
      TableDTO table = new TableDTO();
      table.recordTypeId = rtId;
      table.recordTypeDeveloperName = rtDevName;
      table.recordTypeLabel = rtInfo.getName(); // etichetta
      table.columns = columns;
      table.rows = rows;

      result.add(table);
    }
    return result;
  }

  /* ---------- Helper ---------- */
  private static String mapToLwcType(Schema.DisplayType apexType) {
    switch on apexType {
      when BOOLEAN {
        return 'boolean';
      }
      when CURRENCY {
        return 'currency';
      }
      when DATE {
        return 'date';
      }
      when DATETIME {
        return 'date';
      } // gestito come data
      when DOUBLE {
        return 'number';
      }
      when EMAIL {
        return 'email';
      }
      when PHONE {
        return 'phone';
      }
      when URL {
        return 'url';
      }
      when else {
        return 'text';
      }
    }
  }
}