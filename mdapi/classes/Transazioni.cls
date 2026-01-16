public with sharing class Transazioni {
    
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getRelatedRecords(String year, String program, String status) {
        
        String baseQuery = 'SELECT Id, Name, Allocation_not_paid__c, CampaignId, Campaign.Name, CurrentAmount, Data_di_Competenza__c, DonorId, Nome_Donatore__c, ' +
                          'Programma__r.Name, Original_Donation_Amount__c, PaymentMethod, Payment_Status__c, Programma__c, Status, ' +
                          'Total_Allocations__c, Withholding__c, TransactionDate, Totale_Allocato_NON_Pagato__c, ' +
                          'Totale_Allocato_Pagato__c, Totale_Allocato__c FROM GiftTransaction';

        List<String> conditions = new List<String>();
        
        // Valori bindati che verranno passati alla query
        Integer selectedYear;
        if (!String.isBlank(year)) {
            selectedYear = Integer.valueOf(year);
            conditions.add('CALENDAR_YEAR(TransactionDate) = :selectedYear');
        }

        String shortProgram;
        if (!String.isBlank(program)) {
            shortProgram = program.length() > 15 ? program.substring(0, 15) : program;
            conditions.add('Programma__c = :shortProgram');
        }

        if (!String.isBlank(status) && status != 'all') {
            conditions.add('Status = :status');
        }

        // Costruzione della clausola WHERE
        String whereClause = conditions.isEmpty() ? '' : ' WHERE ' + String.join(conditions, ' AND ');
        String fullQuery = baseQuery + whereClause;

        System.debug('QUERY FINAL: ' + fullQuery);

        // Esecuzione della query
        List<GiftTransaction> transList = Database.query(fullQuery);

        // Calcoli
        Decimal totalOriginalDonation = 0;
        Decimal totalAllocations = 0;
        Decimal totalAllocated = 0;
        Decimal totalAllocatedNotPaid = 0;
        Decimal totalAllocatedPaid = 0;
        Decimal totalAllocable = 0;

        for (GiftTransaction gt : transList) {
            if (gt.Original_Donation_Amount__c != null) {
                totalOriginalDonation += gt.Original_Donation_Amount__c;
            }
            if (gt.CurrentAmount != null) {
                totalAllocable += gt.CurrentAmount;
            }
            if (gt.Total_Allocations__c != null) {
                totalAllocations += gt.Total_Allocations__c;
            }
            if (gt.Totale_Allocato_NON_Pagato__c != null) {
                totalAllocatedNotPaid += gt.Totale_Allocato_NON_Pagato__c;
            }
            if (gt.Totale_Allocato_Pagato__c != null) {
                totalAllocatedPaid += gt.Totale_Allocato_Pagato__c;
            }
            if (gt.Totale_Allocato__c != null) {
                totalAllocated += gt.Totale_Allocato__c;
            }
        }

        Map<String, Object> result = new Map<String, Object>();
        result.put('records', transList);
        result.put('totalOriginalDonation', totalOriginalDonation);
        result.put('totalAllocations', totalAllocations);
        result.put('totalAllocated', totalAllocated);
        result.put('totalAllocatedNotPaid', totalAllocatedNotPaid);
        result.put('totalAllocatedPaid', totalAllocatedPaid);
        result.put('totalAllocable', totalAllocable);
        result.put('query', fullQuery);

        return result;
    }

    
    @AuraEnabled(cacheable=true)
    public static List<String> getAvailableYears() {
        List<Anno_Reportistica__c> rawYears = [
            SELECT Name
            FROM Anno_Reportistica__c
        ];
        Set<String> yearSet = new Set<String>();
        for (Anno_Reportistica__c record : rawYears) {
            if (!String.isBlank(record.Name)) {
                yearSet.add(record.Name);
            }
        }
        List<String> yearNames = new List<String>(yearSet);
        yearNames.sort();
        return yearNames;
    }
    
    @AuraEnabled(cacheable=true)
    public static List<Program> getAvailablePrograms() {
        List<Program> programs = [
            SELECT Id, Name
            FROM Program
            ORDER BY Name
        ];
        return programs;
    }
}