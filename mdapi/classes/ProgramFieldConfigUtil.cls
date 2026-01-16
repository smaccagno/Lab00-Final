/*─────────────────────────────────────────────────────────────
  PROGRAM FIELD CONFIG – utility
─────────────────────────────────────────────────────────────*/
public with sharing class ProgramFieldConfigUtil {

    /*--------------------------------------------------------
     *  Wrapper che descrive un KPI/colonna dinamica
     *-------------------------------------------------------*/
    public class FieldConf {
        @AuraEnabled public String  objectApi;   // es. "Reporting_Year__c"
        @AuraEnabled public String  fieldApi;    // es. "Totale_Minuti_Visite__c"
        @AuraEnabled public String  label;       // etichetta UI
        @AuraEnabled public Integer sequence;    // ordine vis.
        @AuraEnabled public Boolean isSummary;   // true se va totalizzato
        @AuraEnabled public String  dataType;       // 〈── nuovo: pick-list “Type__c”
    }

    /*--------------------------------------------------------
     *  Ritorna la mappa <objectApi, FieldConf[]>
     *-------------------------------------------------------*/
    public static Map<String, List<FieldConf>> getFieldConfig(
        String                programDevName,
        Set<String>           targetObjects,
        Integer               limitPerObject          // null = nessun limite
    ){
        /* mappa risultato inizializzata a liste vuote */
        Map<String, List<FieldConf>> res = new Map<String, List<FieldConf>>();
        for (String obj : targetObjects) {
            res.put(obj, new List<FieldConf>());
        }

        /* query sul custom-metadata */
        for (Program_Field_Config__mdt c : [
            SELECT Target_Object_API__c,
                   Field_API__c,
                   UI_Label__c,
                   Sequence__c,
                   Is_Summary__c,
                   Type__c                           /* 🆕 */
            FROM   Program_Field_Config__mdt
            WHERE  Program_Config__r.DeveloperName = :programDevName
                   AND Target_Object_API__c IN :targetObjects
            ORDER BY Target_Object_API__c, Sequence__c
        ]){

            List<FieldConf> lst = res.get(c.Target_Object_API__c);

            /* rispetto eventuale limite per oggetto */
            if (limitPerObject == null || lst.size() < limitPerObject){
                FieldConf f    = new FieldConf();
                f.objectApi    = c.Target_Object_API__c;
                f.fieldApi     = c.Field_API__c;
                f.label        = c.UI_Label__c;
                f.sequence     = (Integer)c.Sequence__c;
                f.isSummary    = c.Is_Summary__c;
                f.dataType     = c.Type__c;              // 〈── nuovo
                lst.add(f);
            }
        }
        return res;
    }
}