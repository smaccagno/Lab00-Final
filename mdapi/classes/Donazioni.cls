public with sharing class Donazioni {
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getRelatedRecords(String year) {
        // Prepara la query per filtrare in base all'anno passato come parametro
        String currentYear = String.valueOf(Date.today().year());
        if (String.isEmpty(year)) {
            year = currentYear; // Se non viene fornito un anno, utilizza l'anno corrente
        }

        // Recupera i record correlati
        List<GiftEntry> records = [
            SELECT Id, Name, Data_di_Competenza__c, Title__c, DonorId,Nome_Donatore__c, GiftReceivedDate, PaymentMethod, Programma__c,
            Tipo_Donatore__c, Withholding_percent__c, Original_Donation_Amount__c, GiftAmount, Reporting_Year__c
            FROM GiftEntry 
            WHERE Anno_di_Competenza__c = :year
        ];

        // Calcola le somme per gli stati "Paid" e "Distributed"
        Decimal totalOriginal = 0;
        Decimal totalToDistribute = 0;

        for (GiftEntry record : records) {
            totalOriginal += record.Original_Donation_Amount__c;
            totalToDistribute += record.GiftAmount;
        }

        // Restituisce i record e le somme in un Map
        Map<String, Object> result = new Map<String, Object>();
        result.put('records', records);
        result.put('totalPaid', totalOriginal);
        result.put('totalDistributed', totalToDistribute);

        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<String> getAvailableYears() {
        // Esegui una query sull'oggetto Anno_Reportistica__c per recuperare gli anni disponibili
        List<Anno_Reportistica__c> years = [SELECT Name FROM Anno_Reportistica__c ORDER BY Name];
        List<String> yearNames = new List<String>();

        for (Anno_Reportistica__c year : years) {
            yearNames.add(year.Name);
        }

        return yearNames; // Restituisce la lista degli anni disponibili
    }
}