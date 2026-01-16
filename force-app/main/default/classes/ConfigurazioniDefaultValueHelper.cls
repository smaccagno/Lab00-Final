/**
 * Helper per recuperare i valori di default configurati su Invoice__c.Medical_Center__c.
 */
global with sharing class ConfigurazioniDefaultValueHelper {
    private static final String CONFIGURATION_TYPE_DEFAULT = 'Valore di Default';
    private static final String INVOICE_OBJECT_API_NAME = 'Invoice__c';
    private static final String MEDICAL_CENTER_FIELD_API_NAME = 'Medical_Center__c';

    @InvocableMethod(label='Recupera centro medico di default')
    global static List<String> retrieveMedicalCenterDefaults(List<Id> accountIds) {
        List<String> results = new List<String>();
        if (accountIds == null || accountIds.isEmpty()) {
            return results;
        }

        Set<Id> partnerIds = new Set<Id>();
        for (Id accountId : accountIds) {
            results.add(null);
            if (accountId != null) {
                partnerIds.add(accountId);
            }
        }

        if (partnerIds.isEmpty()) {
            return results;
        }

        List<Configurazioni__c> configurations = [
            SELECT Account__c, Valore__c
            FROM Configurazioni__c
            WHERE Attiva__c = true
                AND Tipo_Configurazione__c = :CONFIGURATION_TYPE_DEFAULT
                AND Object_Name__c = :INVOICE_OBJECT_API_NAME
                AND Field_Name__c = :MEDICAL_CENTER_FIELD_API_NAME
                AND Account__c IN :partnerIds
            ORDER BY CreatedDate DESC, LastModifiedDate DESC, Id DESC
        ];

        Map<Id, String> defaultsByAccount = new Map<Id, String>();
        for (Configurazioni__c configuration : configurations) {
            if (!defaultsByAccount.containsKey(configuration.Account__c)) {
                defaultsByAccount.put(configuration.Account__c, normalize(configuration.Valore__c));
            }
        }

        for (Integer index = 0; index < accountIds.size(); index++) {
            Id accountId = accountIds[index];
            if (accountId != null && defaultsByAccount.containsKey(accountId)) {
                results.set(index, defaultsByAccount.get(accountId));
            }
        }

        return results;
    }

    private static String normalize(String value) {
        return String.isBlank(value) ? null : value.trim();
    }
}