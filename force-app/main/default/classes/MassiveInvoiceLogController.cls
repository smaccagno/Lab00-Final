public with sharing class MassiveInvoiceLogController {
    
    /**
     * Recupera gli ultimi log di caricamento massivo per il combobox
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getRecentLogs(Integer limitCount) {
        Integer limitVal = (limitCount != null && limitCount > 0) ? Math.min(limitCount, 100) : 50;
        
        List<MassiveInvoiceLog__c> logs = [
            SELECT Id, Name, Data__c, Utente__r.Name, Numero_Fatture__c, Numero_Visite__c
            FROM MassiveInvoiceLog__c
            ORDER BY Data__c DESC
            LIMIT :limitVal
        ];
        
        List<Map<String, Object>> result = new List<Map<String, Object>>();
        for (MassiveInvoiceLog__c log : logs) {
            Map<String, Object> item = new Map<String, Object>();
            item.put('id', log.Id);
            item.put('name', log.Name);
            item.put('label', log.Name + ' - ' + (log.Data__c != null ? log.Data__c.format('dd/MM/yyyy HH:mm') : '') + 
                ' (' + (log.Numero_Fatture__c != null ? String.valueOf(log.Numero_Fatture__c.intValue()) : '0') + ' fatture, ' +
                (log.Numero_Visite__c != null ? String.valueOf(log.Numero_Visite__c.intValue()) : '0') + ' visite)');
            item.put('data', log.Data__c != null ? String.valueOf(log.Data__c) : '');
            item.put('utente', log.Utente__r != null ? log.Utente__r.Name : '');
            item.put('numeroFatture', log.Numero_Fatture__c != null ? log.Numero_Fatture__c.intValue() : 0);
            item.put('numeroVisite', log.Numero_Visite__c != null ? log.Numero_Visite__c.intValue() : 0);
            result.add(item);
        }
        return result;
    }
    
    /**
     * Recupera i dettagli completi di un log incluso il JSON
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getLogDetails(Id recordId) {
        if (recordId == null) {
            return null;
        }
        
        List<MassiveInvoiceLog__c> logs = [
            SELECT Id, Name, Data__c, Utente__c, Utente__r.Name, Numero_Fatture__c, Numero_Visite__c, Log__c, Errori__c
            FROM MassiveInvoiceLog__c
            WHERE Id = :recordId
            LIMIT 1
        ];
        
        if (logs.isEmpty()) {
            return null;
        }
        
        MassiveInvoiceLog__c log = logs[0];
        Map<String, Object> result = new Map<String, Object>();
        result.put('id', log.Id);
        result.put('name', log.Name);
        result.put('data', log.Data__c != null ? String.valueOf(log.Data__c) : null);
        result.put('utente', log.Utente__r != null ? log.Utente__r.Name : '');
        result.put('numeroFatture', log.Numero_Fatture__c != null ? log.Numero_Fatture__c.intValue() : 0);
        result.put('numeroVisite', log.Numero_Visite__c != null ? log.Numero_Visite__c.intValue() : 0);
        result.put('logJson', log.Log__c);
        result.put('errori', log.Errori__c);
        return result;
    }
}