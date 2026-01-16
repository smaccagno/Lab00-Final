global with sharing class ConfigurazioniFlowHelper {
    @InvocableMethod(label='Valuta configurazione prestazione gratuita')
    global static List<Boolean> evaluatePrestazioneGratuita(List<Id> accountIds) {
        List<Boolean> results = new List<Boolean>();
        if (accountIds == null || accountIds.isEmpty()) {
            return results;
        }

        Set<Id> normalizedIds = new Set<Id>();
        for (Id accountId : accountIds) {
            if (accountId != null) {
                normalizedIds.add(accountId);
            }
        }

        Map<Id, Configurazioni__c> configurationsByAccount = new Map<Id, Configurazioni__c>();
        if (!normalizedIds.isEmpty()) {
            for (Configurazioni__c configuration : [
                SELECT Account__c, On_Off__c
                FROM Configurazioni__c
                WHERE Account__c IN :normalizedIds
                    AND Attiva__c = true
                    AND Tipo_Configurazione__c = 'Funzionalità on/off'
                    AND Nome_Funzionalita__c = 'Prestazione Gratuita'
                ORDER BY CreatedDate DESC
            ]) {
                if (!configurationsByAccount.containsKey(configuration.Account__c)) {
                    configurationsByAccount.put(configuration.Account__c, configuration);
                }
            }
        }

        for (Id accountId : accountIds) {
            if (accountId == null) {
                results.add(true);
                continue;
            }
            Configurazioni__c configuration = configurationsByAccount.get(accountId);
            results.add(configuration == null ? true : configuration.On_Off__c);
        }

        return results;
    }
}