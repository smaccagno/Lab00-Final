public with sharing class DataExportController {
    
    /**
     * Classe wrapper per i dati della tabella
     */
    public class TableRow {
        @AuraEnabled public String comune { get; set; }
        @AuraEnabled public String provincia { get; set; }
        @AuraEnabled public String regione { get; set; }
        @AuraEnabled public String tipoVisita { get; set; }
        @AuraEnabled public String beneficiario { get; set; }
        @AuraEnabled public String centroMedico { get; set; }
        @AuraEnabled public String enteNoProfit { get; set; }
        @AuraEnabled public String noProfitCategory { get; set; }
        @AuraEnabled public String booleanValue { get; set; }
        @AuraEnabled public String partner { get; set; }
    }
    
    /**
     * Recupera tutti i dati necessari per la tabella
     */
    @AuraEnabled(cacheable=true)
    public static List<TableRow> getAllTableData() {
        List<TableRow> rows = new List<TableRow>();
        
        // 1. Comune, Provincia, Regione da Comune__c (ordinati alfabeticamente su Name)
        List<Comune__c> comuni = [
            SELECT Name, Provincia__c, Regione__c 
            FROM Comune__c 
            ORDER BY Name
        ];
        
        // 2. Tipo Visita da Tipo_Visita__c (ordinati alfabeticamente su Name)
        List<Tipo_Visita__c> tipiVisita = [
            SELECT Name 
            FROM Tipo_Visita__c 
            ORDER BY Name
        ];
        
        // 3. Beneficiario - valori della picklist Beneficiary_Type__c da Visit__c
        List<String> beneficiaryTypes = new List<String>();
        Schema.DescribeFieldResult fieldResult = Visit__c.Beneficiary_Type__c.getDescribe();
        for (Schema.PicklistEntry entry : fieldResult.getPicklistValues()) {
            beneficiaryTypes.add(entry.getLabel());
        }
        beneficiaryTypes.sort();
        
        // 4. Centro Medico - valori distinct e ordinati alfabeticamente di Medical_Center__c da Invoice__c
        // Ottimizzazione: usa GROUP BY invece di loop su tutti i record
        List<String> medicalCenters = new List<String>();
        try {
            for (AggregateResult ar : [
                SELECT Medical_Center__c 
                FROM Invoice__c 
                WHERE Medical_Center__c != null
                GROUP BY Medical_Center__c
                ORDER BY Medical_Center__c
                LIMIT 10000
            ]) {
                String mc = (String) ar.get('Medical_Center__c');
                if (mc != null) {
                    medicalCenters.add(mc);
                }
            }
        } catch (Exception e) {
            // Fallback: se GROUP BY non funziona, usa Set con query normale
            Set<String> medicalCentersSet = new Set<String>();
            for (Invoice__c invoice : [
                SELECT Medical_Center__c 
                FROM Invoice__c 
                WHERE Medical_Center__c != null
                ORDER BY Medical_Center__c
                LIMIT 10000
            ]) {
                if (invoice.Medical_Center__c != null) {
                    medicalCentersSet.add(invoice.Medical_Center__c);
                }
            }
            medicalCenters = new List<String>(medicalCentersSet);
            medicalCenters.sort();
        }
        
        // 5. Ente No Profit e No Profit Category - ordinati alfabeticamente su Name
        List<Ente_No_Profit__c> entiNoProfit = [
            SELECT Name, Ente_Categoria__c 
            FROM Ente_No_Profit__c 
            ORDER BY Name
        ];
        
        // 6. Boolean - sempre "TRUE" e "FALSE"
        List<String> booleanValues = new List<String>{'TRUE', 'FALSE'};
        
        // 7. Partner - nomi da Account con Type = 'Investor', campo Nome_Donatore__c
        // Escludi gli Account con DEFAULT__c = true (Default for invoice)
        // Ottimizzazione: usa Set per deduplicazione e query con ORDER BY
        Set<String> partnersSet = new Set<String>();
        for (Account acc : [
            SELECT Nome_Donatore__c 
            FROM Account 
            WHERE Type = 'Investor' 
            AND Nome_Donatore__c != null
            AND (DEFAULT__c = false OR DEFAULT__c = null)
            ORDER BY Nome_Donatore__c
            LIMIT 10000
        ]) {
            if (acc.Nome_Donatore__c != null) {
                partnersSet.add(acc.Nome_Donatore__c);
            }
        }
        List<String> partners = new List<String>(partnersSet);
        partners.sort();
        
        // Prepara le liste per ogni colonna (ottimizzazione: usa direttamente i dati dalle query)
        List<String> comuniNames = new List<String>();
        List<String> province = new List<String>();
        List<String> regioni = new List<String>();
        Set<String> provinceSet = new Set<String>();
        Set<String> regioniSet = new Set<String>();
        
        for (Comune__c comune : comuni) {
            comuniNames.add(comune.Name);
            if (comune.Provincia__c != null && !provinceSet.contains(comune.Provincia__c)) {
                province.add(comune.Provincia__c);
                provinceSet.add(comune.Provincia__c);
            }
            if (comune.Regione__c != null && !regioniSet.contains(comune.Regione__c)) {
                regioni.add(comune.Regione__c);
                regioniSet.add(comune.Regione__c);
            }
        }
        
        List<String> tipiVisitaNames = new List<String>();
        for (Tipo_Visita__c tipoVisita : tipiVisita) {
            tipiVisitaNames.add(tipoVisita.Name);
        }
        
        List<String> entiNames = new List<String>();
        List<String> entiCategories = new List<String>();
        for (Ente_No_Profit__c ente : entiNoProfit) {
            entiNames.add(ente.Name);
            if (ente.Ente_Categoria__c != null) {
                entiCategories.add(ente.Ente_Categoria__c);
            }
        }
        
        // Trova il numero massimo di righe necessario
        Integer maxRows = Math.max(
            Math.max(comuniNames.size(), tipiVisitaNames.size()),
            Math.max(
                Math.max(beneficiaryTypes.size(), medicalCenters.size()),
                Math.max(
                    Math.max(entiNames.size(), booleanValues.size()),
                    partners.size()
                )
            )
        );
        
        // Crea le righe della tabella, una per ogni valore disponibile
        // Ogni colonna mostra i suoi valori distinti, le celle vuote vengono lasciate vuote
        for (Integer i = 0; i < maxRows; i++) {
            TableRow row = new TableRow();
            
            // Comune, Provincia, Regione
            if (i < comuniNames.size()) {
                row.comune = comuniNames[i];
                if (i < comuni.size()) {
                    row.provincia = comuni[i].Provincia__c;
                    row.regione = comuni[i].Regione__c;
                }
            }
            
            // Tipo Visita
            if (i < tipiVisitaNames.size()) {
                row.tipoVisita = tipiVisitaNames[i];
            }
            
            // Beneficiario
            if (i < beneficiaryTypes.size()) {
                row.beneficiario = beneficiaryTypes[i];
            }
            
            // Centro Medico
            if (i < medicalCenters.size()) {
                row.centroMedico = medicalCenters[i];
            }
            
            // Ente No Profit e No Profit Category
            if (i < entiNames.size()) {
                row.enteNoProfit = entiNames[i];
                if (i < entiNoProfit.size()) {
                    row.noProfitCategory = entiNoProfit[i].Ente_Categoria__c;
                }
            }
            
            // Boolean
            if (i < booleanValues.size()) {
                row.booleanValue = booleanValues[i];
            }
            
            // Partner
            if (i < partners.size()) {
                row.partner = partners[i];
            }
            
            rows.add(row);
        }
        
        return rows;
    }
}
