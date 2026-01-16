public with sharing class AnnoReportistica {

    /**
     * Ritorna:
     *  • records_budget      → lista Overview_Budget_per_Anno__c
     *  • records_donor_raw   → lista Reporting_Year__c
     *  • budgetMeta          → List<FieldConf> (ultime 2 colonne Budget)
     *  • donorMeta           → List<FieldConf> (ultime 2 colonne Donor)
     *  • query_budget / query_donor → stringhe SOQL risolte
     */

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getRelatedRecords(
            String recordId,
            String programDevName        // <— nuovo parametro
    ) {
      
        /* --- validazione minima --- */
        if (String.isBlank(recordId) || (recordId.length() != 15 && recordId.length() != 18)) {
            throw new AuraHandledException('recordId non valido');
        }
        if (String.isBlank(programDevName)) {
            throw new AuraHandledException('Program developer name mancante');
        }

        /* -----------------------------------------------------------
         * 1) Leggi la configurazione dinamica (max 2 KPI per oggetto)
         * ----------------------------------------------------------- */
        Set<String> targetObjs = new Set<String>{
            'Overview_Budget_per_Anno__c',
            'Reporting_Year__c'
        };
        Map<String, List<ProgramFieldConfigUtil.FieldConf>> metaByObj =
            ProgramFieldConfigUtil.getFieldConfig(
                programDevName,
                targetObjs,
                2           // limite colonne dinamiche per oggetto
            );


        /* -----------------------------------------------------------
         * 2) Campi statici + dinamici per Overview_Budget_per_Anno__c
         * ----------------------------------------------------------- */
        List<String> budgetFields = new List<String>{
            'Id','Name','Budget__c','Budget__r.Name','Anno__c',
            'Ammontare_Pagamenti_Da_Pagare_formula__c',
            'Ammontare_Pagamenti_Fatti_formula__c',
            'Numero_di_Fatture_formula__c','Numero_Distribuzioni_Formula__c',
            'Totale_Ammontare_Fatture_formula__c',
            'Totale_Distribuito_NON_Pagato_Formula__c',
            'Totale_Distribuito_Pagato_Formula__c',
            'Totale_Allocato__c'
        };
        for (ProgramFieldConfigUtil.FieldConf f :
             metaByObj.get('Overview_Budget_per_Anno__c')) {
            budgetFields.add(f.fieldApi);
        }

        /* -----------------------------------------------------------
         * 3) Campi statici + dinamici per Reporting_Year__c
         * ----------------------------------------------------------- */
        List<String> donorFields = new List<String>{
            'Id','Name','Account__c','Nome_Donatore__c','Donor_Overview__c',
            'Donor_Overview__r.Name','Year__c','Anno_overview__c',
            'Programma__c','Holding__c',
            'Donato_Originale_formula__c','Available_Amount__c',
            'Allocabile_formula__c','Totale_Numero_Donazioni_formula__c',
            'Totale_Fattura_formula__c',
            'Totale_Numero_Fatture_formula__c'
        };
        for (ProgramFieldConfigUtil.FieldConf f :
             metaByObj.get('Reporting_Year__c')) {
            donorFields.add(f.fieldApi);
        }


        /* -----------------------------------------------------------
         * 4) Costruisci ed esegui le query SOQL
         * ----------------------------------------------------------- */
        String soqlBudget =
            'SELECT ' + String.join(budgetFields, ',') +
            ' FROM Overview_Budget_per_Anno__c' +
            ' WHERE Anno_Reportistica__c = :recordId';

        String soqlDonor  =
            'SELECT ' + String.join(donorFields, ',') +
            ' FROM Reporting_Year__c' +
            ' WHERE Anno__c = :recordId';

        System.debug('SOQL Budget ► ' + soqlBudget);
        System.debug('SOQL Donor  ► ' + soqlDonor);

        List<Overview_Budget_per_Anno__c> recordsBudget =
            Database.query(soqlBudget);
        List<Reporting_Year__c> recordsDonor =
            Database.query(soqlDonor);

        /* -----------------------------------------------------------
         * 5) Costruisci la risposta per il client
         * ----------------------------------------------------------- */
        return new Map<String, Object>{
            'records_budget'    => recordsBudget,
            'records_donor_raw' => recordsDonor,
            'budgetMeta'        => metaByObj.get('Overview_Budget_per_Anno__c'),
            'donorMeta'         => metaByObj.get('Reporting_Year__c'),
            'query_budget'      => soqlBudget,
            'query_donor'       => soqlDonor
        };
    }
}