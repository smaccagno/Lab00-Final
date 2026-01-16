public with sharing class RetrieveDonatoreAnno {

    public class ResultWrapper {
        @AuraEnabled public List<Reporting_Year__c> rawRecords;
        @AuraEnabled public List<ProgramFieldConfigUtil.FieldConf> dynamicFields;
    }

    @AuraEnabled(cacheable=true)
    public static ResultWrapper getRecords(Id reportingYearId) {
        if (reportingYearId == null) return new ResultWrapper();

        Reporting_Year__c target = [
            SELECT Id, Account__c, Holding__c, Programma__c, Programma__r.Name
            FROM Reporting_Year__c
            WHERE Id = :reportingYearId
            LIMIT 1
        ];

        if (target.Programma__c == null) return new ResultWrapper();

        String programLabel = target.Programma__r.Name;
        String programDevName = programLabel.replace(' ', '_');

        Set<String> targets = new Set<String>{ 'Reporting_Year__c' };
        Map<String, List<ProgramFieldConfigUtil.FieldConf>> fieldConfMap =
            ProgramFieldConfigUtil.getFieldConfig(programDevName, targets, null);
        List<ProgramFieldConfigUtil.FieldConf> dynamicFields = fieldConfMap.get('Reporting_Year__c');

        List<String> baseFields = new List<String>{
            'Id', 'Name', 'Account__c', 'Holding__c', 'Donor_Overview__c', 'Nome_Donatore__c', 'Anno_overview__c',
            'Ammontare_Originale_Donato_Anno_Corrente__c',
            'Available_Amount__c',
            'Current_Year_Donation_Amount__c',
            'Current_Year_Donation_Number__c',
            'Total_Invoice_Amount__c',
            'Totale_Numero_di_Fatture__c'
        };

        if (dynamicFields != null) {
            for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
                if (!baseFields.contains(f.fieldApi)) {
                    baseFields.add(f.fieldApi);
                }
            }
        }

        String fieldList = String.join(baseFields, ', ');
        List<Reporting_Year__c> raw = Database.query(
            'SELECT ' + fieldList +
            ' FROM Reporting_Year__c' +
            ' WHERE Anno_overview__c != null' +
            ' AND Programma__c = \'' + String.escapeSingleQuotes(target.Programma__c) + '\''
        );

        ResultWrapper res = new ResultWrapper();
        res.rawRecords = raw;
        res.dynamicFields = dynamicFields;
        return res;
    }
}