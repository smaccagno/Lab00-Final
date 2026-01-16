public with sharing class InvoiceCreationController {
    @AuraEnabled(cacheable=true)
    public static List<String> getMedicalCenters() {
        Set<String> medicalCentersSet = new Set<String>();
        
        // Query per ottenere i valori unici
        for (Invoice__c invoice : [SELECT Medical_Center__c FROM Invoice__c WHERE Medical_Center__c != null]) {
            medicalCentersSet.add(invoice.Medical_Center__c);
        }
        
        // Converti il set in una lista
        return new List<String>(medicalCentersSet);
    }

    @AuraEnabled(cacheable=true)
    public static List<Ente_No_Profit__c> getSignalingNonProfits() {
        return [SELECT Name, Ente_Categoria__c FROM Ente_No_Profit__c];
    }

    @AuraEnabled(cacheable=true)
    public static List<Comune__c> getComune() {
        List<Comune__c> comuniList = [SELECT Nome_Comune__c, Provincia__c, Regione__c FROM Comune__c];
        return comuniList;
    }    

    // Ricerca server-side dei Comuni con LIKE e LIMIT per performance
    @AuraEnabled(cacheable=true)
    public static List<Comune__c> searchComuni(String query, Integer limitSize) {
        if (String.isBlank(query)) {
            return new List<Comune__c>();
        }
        Integer lim = (limitSize == null || limitSize <= 0) ? 50 : Integer.valueOf(Math.min(limitSize, 100));
        String likeQuery = query.trim() + '%';
        return [
            SELECT Nome_Comune__c, Provincia__c, Regione__c
            FROM Comune__c
            WHERE Nome_Comune__c LIKE :likeQuery
            ORDER BY Nome_Comune__c
            LIMIT :lim
        ];
    }

    // Elenco delle Province distinte (per selezione manuale in caso di comune custom)
    @AuraEnabled(cacheable=true)
    public static List<String> getProvinceDistinct() {
        List<String> result = new List<String>();
        for (AggregateResult ar : [SELECT Provincia__c p FROM Comune__c WHERE Provincia__c != null GROUP BY Provincia__c ORDER BY Provincia__c]) {
            String p = (String) ar.get('p');
            if (p != null) result.add(p);
        }
        return result;
    }

    // Ricava la Regione data una Provincia
    @AuraEnabled(cacheable=true)
    public static String getRegioneByProvincia(String provincia) {
        if (String.isBlank(provincia)) return null;
        Comune__c c = [SELECT Regione__c FROM Comune__c WHERE Provincia__c = :provincia LIMIT 1];
        return c != null ? c.Regione__c : null;
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getTipiVisita() {
        List<Map<String, String>> tipiVisitaList = new List<Map<String, String>>();
        for (Tipo_Visita__c tipoVisita : [SELECT Id, Name FROM Tipo_Visita__c]) {
            Map<String, String> tipoVisitaMap = new Map<String, String>();
            tipoVisitaMap.put('Id', tipoVisita.Id);
            tipoVisitaMap.put('Name', tipoVisita.Name);
            tipiVisitaList.add(tipoVisitaMap);
        }
        return tipiVisitaList;
    }
    
    @AuraEnabled(cacheable=true)
    public static List<String> getBeneficiaryTypes() {
        List<String> beneficiaryTypes = new List<String>();

        // Ottieni la descrizione del campo picklist
        Schema.DescribeFieldResult fieldResult = Schema.getGlobalDescribe()
            .get('Visit__c')
            .getDescribe()
            .fields.getMap()
            .get('Beneficiary_Type__c')
            .getDescribe();

        // Estrarre i valori disponibili nella picklist
        for (Schema.PicklistEntry entry : fieldResult.getPicklistValues()) {
            beneficiaryTypes.add(entry.getLabel());
        }

        return beneficiaryTypes;
    }
}