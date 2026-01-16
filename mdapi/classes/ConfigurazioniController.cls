public with sharing class ConfigurazioniController {
    private static final String PARTNER_RECORDTYPE_DEVELOPER_NAME = 'Partner';

    @TestVisible
    private static String recordTypeDeveloperNameOverride;

    @AuraEnabled(cacheable=true)
    public static List<Account> getPartnerAccounts() {
        String recordTypeDeveloperName = String.isNotBlank(recordTypeDeveloperNameOverride)
            ? recordTypeDeveloperNameOverride
            : PARTNER_RECORDTYPE_DEVELOPER_NAME;

        return [
            SELECT Id, Name
            FROM Account
            WHERE RecordType.DeveloperName = :recordTypeDeveloperName
            ORDER BY Name
        ];
    }

    public class FieldValueResponse {
        @AuraEnabled public List<String> values;
        @AuraEnabled public String query;
    }

    @AuraEnabled(cacheable=true)
    public static FieldValueResponse getFieldValues(String objectApiName, String fieldApiName, Id accountId) {
        if (String.isBlank(objectApiName) || String.isBlank(fieldApiName)) {
            return new FieldValueResponse();
        }

        Schema.SObjectType sobjectType = Schema.getGlobalDescribe().get(objectApiName);
        if (sobjectType == null) {
            throw new AuraHandledException('Oggetto non valido.');
        }

        Schema.DescribeSObjectResult describeResult = sobjectType.getDescribe();
        Map<String, Schema.SObjectField> fieldsMap = describeResult.fields.getMap();
        if (!fieldsMap.containsKey(fieldApiName)) {
            throw new AuraHandledException('Campo non valido.');
        }

        Schema.DescribeFieldResult fieldDescribe = fieldsMap.get(fieldApiName).getDescribe();
        if (!fieldDescribe.isAccessible()) {
            throw new AuraHandledException('Campo non accessibile.');
        }

        List<String> conditions = new List<String>();
        conditions.add(fieldApiName + ' != NULL');

        if ('Invoice__c'.equalsIgnoreCase(objectApiName) && accountId != null) {
            String escapedAccountId = String.escapeSingleQuotes(String.valueOf(accountId));
            String quote = String.fromCharArray(new List<Integer>{39});
            conditions.add('Budget__r.Partner__c = ' + quote + escapedAccountId + quote);
        }

        String query = 'SELECT ' + fieldApiName + ' FROM ' + objectApiName;
        if (!conditions.isEmpty()) {
            query += ' WHERE ' + String.join(conditions, ' AND ');
        }
        query += ' GROUP BY ' + fieldApiName + ' ORDER BY ' + fieldApiName;

        System.debug(LoggingLevel.INFO, 'ConfigurazioniController.getFieldValues - Query: ' + query);
        System.debug(LoggingLevel.INFO, 'ConfigurazioniController.getFieldValues - AccountId parameter: ' + String.valueOf(accountId));

        List<SObject> records = Database.query(query);
        System.debug(LoggingLevel.INFO, 'ConfigurazioniController.getFieldValues - Raw records: ' + JSON.serialize(records));
        List<String> values = new List<String>();
        for (SObject record : records) {
            Object rawValue = record.get(fieldApiName);
            if (rawValue != null) {
                values.add(String.valueOf(rawValue));
            }
        }

        System.debug(LoggingLevel.INFO, 'ConfigurazioniController.getFieldValues - Extracted values: ' + JSON.serialize(values));

        FieldValueResponse response = new FieldValueResponse();
        response.values = values;
        response.query = query;
        System.debug(LoggingLevel.INFO, 'ConfigurazioniController.getFieldValues - Response: ' + JSON.serializePretty(response));

        return response;
    }

    @AuraEnabled(cacheable=true)
    public static List<Configurazioni__c> getConfigurationsByAccount(Id accountId) {
        if (accountId == null) {
            return new List<Configurazioni__c>();
        }

        return [
            SELECT
                Id,
                Name,
                Account__c,
                Account__r.Name,
                Attiva__c,
                Nome_Configurazione__c,
                Nome_Funzionalita__c,
                Object_Name__c,
                Field_Name__c,
                On_Off__c,
                Tipo_Configurazione__c,
                Valore__c,
                CreatedDate
            FROM Configurazioni__c
            WHERE Account__c = :accountId
            ORDER BY CreatedDate DESC, Name ASC
        ];
    }

    @AuraEnabled
    public static Configurazioni__c createConfiguration(
        Id accountId,
        String configurationTypeLabel,
        String configurationName,
        String functionalityName,
        String objectApiName,
        String fieldApiName,
        String defaultValue,
        Boolean onOff
    ) {
        if (accountId == null) {
            throw new AuraHandledException('Account non valido.');
        }
        if (String.isBlank(configurationTypeLabel)) {
            throw new AuraHandledException('Tipo di configurazione non valido.');
        }

        String normalizedConfigurationName = String.isBlank(configurationName)
            ? null
            : configurationName.trim();
        String normalizedFunctionality = String.isBlank(functionalityName)
            ? null
            : functionalityName.trim();
        String normalizedObjectName = String.isBlank(objectApiName)
            ? null
            : objectApiName.trim();
        String normalizedFieldName = String.isBlank(fieldApiName)
            ? null
            : fieldApiName.trim();
        String normalizedDefaultValue = String.isBlank(defaultValue)
            ? null
            : defaultValue.trim();
        Boolean normalizedOnOff = onOff == null ? false : onOff;

        Savepoint sp = Database.setSavepoint();
        try {
            List<Configurazioni__c> matching = findMatchingConfigurations(
                accountId,
                configurationTypeLabel,
                normalizedObjectName,
                normalizedFieldName,
                normalizedFunctionality,
                null
            );

            deactivateConfigurations(matching);

            Configurazioni__c newConfiguration = new Configurazioni__c(
                Account__c = accountId,
                Attiva__c = true,
                Nome_Configurazione__c = normalizedConfigurationName,
                Tipo_Configurazione__c = configurationTypeLabel,
                Nome_Funzionalita__c = normalizedFunctionality,
                Object_Name__c = normalizedObjectName,
                Field_Name__c = normalizedFieldName,
                Valore__c = normalizedDefaultValue,
                On_Off__c = normalizedOnOff
            );

            insert newConfiguration;

            return newConfiguration;
        } catch (Exception error) {
            Database.rollback(sp);
            throw error;
        }
    }

    @AuraEnabled
    public static Configurazioni__c updateConfiguration(
        Id configurationId,
        Id accountId,
        String configurationTypeLabel,
        String configurationName,
        String functionalityName,
        String objectApiName,
        String fieldApiName,
        String defaultValue,
        Boolean onOff,
        Boolean active
    ) {
        if (configurationId == null) {
            throw new AuraHandledException('Configurazione non valida.');
        }
        if (accountId == null) {
            throw new AuraHandledException('Account non valido.');
        }
        if (String.isBlank(configurationTypeLabel)) {
            throw new AuraHandledException('Tipo di configurazione non valido.');
        }

        Configurazioni__c existingConfiguration = [
            SELECT Id
            FROM Configurazioni__c
            WHERE Id = :configurationId
            LIMIT 1
        ];

        String normalizedConfigurationName = String.isBlank(configurationName)
            ? null
            : configurationName.trim();
        String normalizedFunctionality = String.isBlank(functionalityName)
            ? null
            : functionalityName.trim();
        String normalizedObjectName = String.isBlank(objectApiName)
            ? null
            : objectApiName.trim();
        String normalizedFieldName = String.isBlank(fieldApiName)
            ? null
            : fieldApiName.trim();
        String normalizedDefaultValue = String.isBlank(defaultValue)
            ? null
            : defaultValue.trim();
        Boolean normalizedOnOff = onOff == null ? false : onOff;
        Boolean normalizedActive = active == null ? existingConfiguration.Attiva__c : active;

        Savepoint sp = Database.setSavepoint();
        try {
            List<Configurazioni__c> matching = findMatchingConfigurations(
                accountId,
                configurationTypeLabel,
                normalizedObjectName,
                normalizedFieldName,
                normalizedFunctionality,
                configurationId
            );

            if (normalizedActive) {
                deactivateConfigurations(matching);
            }

            existingConfiguration.Account__c = accountId;
            existingConfiguration.Attiva__c = normalizedActive;
            existingConfiguration.Nome_Configurazione__c = normalizedConfigurationName;
            existingConfiguration.Tipo_Configurazione__c = configurationTypeLabel;
            existingConfiguration.Nome_Funzionalita__c = normalizedFunctionality;
            existingConfiguration.Object_Name__c = normalizedObjectName;
            existingConfiguration.Field_Name__c = normalizedFieldName;
            existingConfiguration.Valore__c = normalizedDefaultValue;
            existingConfiguration.On_Off__c = normalizedOnOff;

            update existingConfiguration;

            return existingConfiguration;
        } catch (Exception error) {
            Database.rollback(sp);
            throw error;
        }
    }

    @AuraEnabled
    public static void deleteConfiguration(Id configurationId) {
        if (configurationId == null) {
            throw new AuraHandledException('Configurazione da eliminare non valida.');
        }

        delete new Configurazioni__c(Id = configurationId);
    }

    private static Boolean stringValuesMatch(String recordValue, String expectedValue) {
        String normalizedRecordValue = String.isBlank(recordValue) ? null : recordValue.trim();
        return normalizedRecordValue == expectedValue;
    }

    private static List<Configurazioni__c> findMatchingConfigurations(
        Id accountId,
        String configurationTypeLabel,
        String normalizedObjectName,
        String normalizedFieldName,
        String normalizedFunctionality,
        Id configurationIdToSkip
    ) {
        if (accountId == null || String.isBlank(configurationTypeLabel)) {
            return new List<Configurazioni__c>();
        }

        List<Configurazioni__c> candidates;
        if (configurationIdToSkip == null) {
            candidates = [
                SELECT Id, Attiva__c, Nome_Funzionalita__c, Object_Name__c, Field_Name__c
                FROM Configurazioni__c
                WHERE Account__c = :accountId
                    AND Tipo_Configurazione__c = :configurationTypeLabel
            ];
        } else {
            candidates = [
                SELECT Id, Attiva__c, Nome_Funzionalita__c, Object_Name__c, Field_Name__c
                FROM Configurazioni__c
                WHERE Account__c = :accountId
                    AND Tipo_Configurazione__c = :configurationTypeLabel
                    AND Id != :configurationIdToSkip
            ];
        }

        List<Configurazioni__c> matching = new List<Configurazioni__c>();
        for (Configurazioni__c candidate : candidates) {
            if (
                stringValuesMatch(candidate.Object_Name__c, normalizedObjectName) &&
                stringValuesMatch(candidate.Field_Name__c, normalizedFieldName) &&
                stringValuesMatch(candidate.Nome_Funzionalita__c, normalizedFunctionality)
            ) {
                matching.add(candidate);
            }
        }

        return matching;
    }

    private static void deactivateConfigurations(List<Configurazioni__c> configurations) {
        if (configurations == null || configurations.isEmpty()) {
            return;
        }

        List<Configurazioni__c> toDeactivate = new List<Configurazioni__c>();
        for (Configurazioni__c configuration : configurations) {
            if (configuration.Attiva__c) {
                configuration.Attiva__c = false;
                toDeactivate.add(configuration);
            }
        }

        if (!toDeactivate.isEmpty()) {
            update toDeactivate;
        }
    }
}