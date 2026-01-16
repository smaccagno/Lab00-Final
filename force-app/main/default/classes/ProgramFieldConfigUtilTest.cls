@IsTest(SeeAllData=true)
public class ProgramFieldConfigUtilTest {
  @IsTest
  static void testGetFieldConfig_NoMatchesAndWithLimit() {
    // 1) Nessun match: map restituita con chiave e lista vuota
    Set<String> targets = new Set<String>{ 'Nonexistent_Object__c' };
    Map<String, List<ProgramFieldConfigUtil.FieldConf>> emptyMap = ProgramFieldConfigUtil.getFieldConfig(
      'NoSuchProgram',
      targets,
      null
    );

    System.assert(
      emptyMap.containsKey('Nonexistent_Object__c'),
      'Deve contenere la chiave anche senza metadata'
    );
    System.assertEquals(
      0,
      emptyMap.get('Nonexistent_Object__c').size(),
      'Lista vuota se non ci sono metadata'
    );

    // 2) Se non ci sono metadata reali, skip del resto
    List<Program_Config__mdt> progConfigs = [
      SELECT DeveloperName
      FROM Program_Config__mdt
      LIMIT 1
    ];
    if (progConfigs.isEmpty()) {
      return;
    }
    String devName = progConfigs[0].DeveloperName;

    // Prelevo tutte le configurazioni per questo DeveloperName
    List<Program_Field_Config__mdt> mdts = [
      SELECT
        Target_Object_API__c,
        Field_API__c,
        UI_Label__c,
        Sequence__c,
        Is_Summary__c,
        Type__c
      FROM Program_Field_Config__mdt
      WHERE Program_Config__r.DeveloperName = :devName
      ORDER BY Target_Object_API__c, Sequence__c
    ];
    if (mdts.isEmpty()) {
      return;
    }

    // Costruisco il set di oggetti target
    Set<String> objectSet = new Set<String>();
    for (Program_Field_Config__mdt m : mdts) {
      objectSet.add(m.Target_Object_API__c);
    }

    // 3) Chiamata senza limite
    Map<String, List<ProgramFieldConfigUtil.FieldConf>> fullMap = ProgramFieldConfigUtil.getFieldConfig(
      devName,
      objectSet,
      null
    );

    // Verifico che per ogni oggetto il conteggio corrisponda
    for (String objApi : objectSet) {
      // Conteggio raw
      Integer rawCount = 0;
      for (Program_Field_Config__mdt m : mdts) {
        if (m.Target_Object_API__c == objApi) {
          rawCount++;
        }
      }
      List<ProgramFieldConfigUtil.FieldConf> confList = fullMap.get(objApi);
      System.assertEquals(
        rawCount,
        confList.size(),
        'Numero di FieldConf per ' + objApi + ' deve corrispondere'
      );
      // Verifica dei valori del primo elemento
      Program_Field_Config__mdt sampleMeta = null;
      for (Program_Field_Config__mdt m : mdts) {
        if (m.Target_Object_API__c == objApi) {
          sampleMeta = m;
          break;
        }
      }
      ProgramFieldConfigUtil.FieldConf sampleConf = confList[0];
      System.assertEquals(
        sampleMeta.Target_Object_API__c,
        sampleConf.objectApi
      );
      System.assertEquals(sampleMeta.Field_API__c, sampleConf.fieldApi);
      System.assertEquals(sampleMeta.UI_Label__c, sampleConf.label);
      System.assertEquals(
        Integer.valueOf(sampleMeta.Sequence__c),
        sampleConf.sequence
      );
      System.assertEquals(sampleMeta.Is_Summary__c, sampleConf.isSummary);
      System.assertEquals(sampleMeta.Type__c, sampleConf.dataType);
    }

    // 4) Test del parametro limitPerObject
    Integer maxItems = 1;
    Map<String, List<ProgramFieldConfigUtil.FieldConf>> limitedMap = ProgramFieldConfigUtil.getFieldConfig(
      devName,
      objectSet,
      maxItems
    );

    for (String objApi : objectSet) {
      List<ProgramFieldConfigUtil.FieldConf> limitedList = limitedMap.get(
        objApi
      );
      System.assert(
        limitedList.size() <= maxItems,
        'Con limitPerObject=' +
          maxItems +
          ', size(' +
          objApi +
          ') <= ' +
          maxItems
      );
    }
  }
}