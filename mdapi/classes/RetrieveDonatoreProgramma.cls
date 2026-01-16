public with sharing class RetrieveDonatoreProgramma {

    public class DonatoreDataWrapper {
        @AuraEnabled public List<Reporting_Year__c> records;
        @AuraEnabled public List<ProgramFieldConfigUtil.FieldConf> dynamicFields;
    }

    @AuraEnabled(cacheable=true)
    public static DonatoreDataWrapper getRawRecords(Id parentId) {
        if (parentId == null) return new DonatoreDataWrapper();

        Reporting_Year__c root = [
            SELECT Id, Programma__c, Programma__r.Name
            FROM Reporting_Year__c
            WHERE Donor_Overview__c = :parentId
            LIMIT 1
        ];

        if (root.Programma__c == null) return new DonatoreDataWrapper();

        String programLabel = root.Programma__r.Name;
        String programDevName = programLabel.replace(' ', '_');

        Set<String> targets = new Set<String>{ 'Reporting_Year__c' };
        Map<String, List<ProgramFieldConfigUtil.FieldConf>> confMap =
            ProgramFieldConfigUtil.getFieldConfig(programDevName, targets, null);
        List<ProgramFieldConfigUtil.FieldConf> dynamicFields = confMap.get('Reporting_Year__c');

        List<String> baseFields = new List<String>{
            'Id', 'Name', 'Account__c', 'Holding__c', 'Donor_Overview__c', 'Nome_Donatore__c', 'Anno_overview__c',
            'Ammontare_Originale_Donato_Anno_Corrente__c',
            'Available_Amount__c',
            'Current_Year_Donation_Amount__c',
            'Current_Year_Donation_Number__c',
            'Total_Invoice_Amount__c',
            'Totale_Numero_di_Fatture__c'
        };

        for (ProgramFieldConfigUtil.FieldConf f : dynamicFields) {
            if (!baseFields.contains(f.fieldApi)) {
                baseFields.add(f.fieldApi);
            }
        }

        String query =
            'SELECT ' + String.join(baseFields, ', ') +
            ' FROM Reporting_Year__c' +
            ' WHERE Programma__c = \'' + String.escapeSingleQuotes(root.Programma__c) + '\'';

        List<Reporting_Year__c> records = Database.query(query);

        DonatoreDataWrapper result = new DonatoreDataWrapper();
        result.records = records;
        result.dynamicFields = dynamicFields;
        return result;
    }
}