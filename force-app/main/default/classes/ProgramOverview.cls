public with sharing class ProgramOverview {
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getRelatedRecords(String recordId) {
        Map<String, Object> result = new Map<String, Object>();

         // Recupera i record Anno_di_Reportistica__c
         List<Anno_Reportistica__c> records_anno = [
            SELECT Id, Name, Ammontare_Disponibile__c,Capienza_budgets__c,Ammontare_Distribuzioni__c,Ammontare_Distribuzioni_NON_Pagate__c,Ammontare_Distribuzioni_Pagate__c,Ammontare_Donazioni_Anno_Corrente__c,Ammontare_Originale_Donato__c,Numero_Donazioni_Anno_Corrente__c,Programma__c,Totale_Fatturato_Budgets__c,Totale_Minuti_Visite_Budgets__c,Totale_Numero_Fatture__c,Totale_Visite_Budgets__c,Totale_Allocabile__c,Totale_NON_Distribuito__c 
                FROM Anno_Reportistica__c 
                WHERE Programma__c = :recordId
        ];

        // Recupera i record Invoice__c
        List<Overview_Budget_per_Anno__c> records_budget = [
            SELECT Id, Name, Budget__c, Budget__r.Name, Ammontare_Pagamenti_Da_Pagare_formula__c, Ammontare_Pagamenti_Fatti_formula__c, 
                    Anno__c, Numero_di_Fatture_formula__c, Numero_Distribuzioni_Formula__c, Totale_Ammontare_Fatture_formula__c, Totale_Distribuito_NON_Pagato_Formula__c, 
                    Totale_Distribuito_Pagato_Formula__c, Totale_Minuti_di_Visita_formula__c, Totale_Numero_di_Visite_formula__c, Totale_Allocato__c
                FROM Overview_Budget_per_Anno__c 
                WHERE Programma__c = :recordId
        ];

        // Recupera gli ID degli Account che hanno Type = 'Investor'
        Set<Id> investorAccountIds = new Set<Id>();

        for (Account acc : [SELECT Id FROM Account WHERE Type = 'Investor']) {
            investorAccountIds.add(acc.Id);
        }

        // Se abbiamo account validi, eseguiamo la query su Reporting_Year__c
        List<Reporting_Year__c> records_donor = new List<Reporting_Year__c>();

        if (!investorAccountIds.isEmpty()) {
            records_donor = [
                SELECT Id, Account__c, Donor_Overview__c, Donor_Overview__r.Name, Nome_Donatore__c, 
                      Name, Year__c, Anno_overview__c, Donato_Originale_formula__c, 
                      Available_Amount__c, Allocabile_formula__c, Totale_Numero_Donazioni_formula__c, 
                      Totale_Fattura_formula__c, Totale_Durata_Visite_formula__c, Totale_Numero_di_Visite_formula__c, 
                      Totale_Numero_Fatture_formula__c, Holding__c
                FROM Reporting_Year__c
                WHERE Programma__c = :recordId
                AND Account__c IN :investorAccountIds
            ];
        }

        System.debug('Numero di Reporting Year trovati: ' + records_donor.size());

        // Aggiungi i record alla mappa di risultati
        result.put('records_budget', records_budget);
        result.put('records_donor', records_donor);
        result.put('records_anno', records_anno);
        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getAvailableYears() {
        List<Anno_Reportistica__c> years = [SELECT Name FROM Anno_Reportistica__c ORDER BY Name];
        
        // Crea una lista di mappe con label e value per ogni anno
        List<Map<String, String>> yearOptions = new List<Map<String, String>>();
        for (Anno_Reportistica__c year : years) {
            yearOptions.add(new Map<String, String>{
                'label' => year.Name,
                'value' => year.Name
            });
        }
        return yearOptions; // Restituisce la lista di anni come opzioni per la combobox
    }
      
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getBudgetDonorRecords(String recordId) {
        Map<String, Object> result = new Map<String, Object>();

         // Recupera i record Anno_di_Reportistica__c
         List<GiftDesignation> records_budget_bud = [
            SELECT Id, Name, Totale_Allocato__c,Totale_Distribuito_Pagato__c,Totale_Distribuito_NON_Pagato__c,Ammontare_Pagamenti_Da_Pagare__c,Ammontare_Pagamenti_Fatti__c,Totale_Numero_di_Fatture__c,Ammontare_Totale_Fatture__c,Totale_Minuti_di_Visita__c,Program__c,Totale_Visite_Fatte__c 
                FROM GiftDesignation 
                WHERE Program__c = :recordId
        ];

        // Recupera i record GiftTransaction
        List<Reporting_Year__c> records_donor_don = [
            SELECT Id, Name, Year__c, Anno_overview__c, Donato_Originale_formula__c, Available_Amount__c, Allocabile_formula__c, Totale_Numero_Donazioni_formula__c, Total_Invoice_Amount__c, Total_Minutes_of_Visits__c, Total_Visits_done__c, Totale_Numero_di_Fatture__c, Account__c, Holding__c
                FROM Reporting_Year__c 
                WHERE Programma__c = :recordId
        ];

        // Aggiungi i record alla mappa di risultati
        result.put('records_budget_bud', records_budget_bud);
        result.put('records_donor_don', records_donor_don);
        return result;
    }
}