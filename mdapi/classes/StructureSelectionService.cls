public with sharing class StructureSelectionService {
    public class SubStructureOption {
        @AuraEnabled public String id { get; set; }
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String typeValue { get; set; }
        @AuraEnabled public String address { get; set; }
        @AuraEnabled public Id comuneId { get; set; }
        @AuraEnabled public String comuneName { get; set; }
    }

    public class StructureOption {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public List<SubStructureOption> subStructures;
    }

    public class PicklistOption {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
    }

    public class ComuneOption {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
    }

    public class NewSubStructureInput {
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String typeValue { get; set; }
        @AuraEnabled public Id comuneId { get; set; }
        @AuraEnabled public String address { get; set; }
    }

    private static final Map<String, String> STRUCTURE_TYPE_RESOLUTION_MAP = buildStructureTypeResolutionMap();

    @AuraEnabled(cacheable=true)
    public static List<StructureOption> fetchStructures(Id structureRecordTypeId) {
        if (structureRecordTypeId == null) {
            throw new AuraHandledException('structureRecordTypeId is required.');
        }

        List<Account> structures = [
            SELECT Id, Name,
                (SELECT Id, Name, Type__c, Address__c, City__c, City__r.Name FROM SubStructures__r ORDER BY Name)
            FROM Account
            WHERE RecordTypeId = :structureRecordTypeId
            ORDER BY Name
        ];

        List<StructureOption> results = new List<StructureOption>();
        for (Account structureRecord : structures) {
            StructureOption option = new StructureOption();
            option.id = structureRecord.Id;
            option.name = structureRecord.Name;
            option.subStructures = new List<SubStructureOption>();

            for (SubStructure__c subStructure : structureRecord.SubStructures__r) {
                SubStructureOption subOption = new SubStructureOption();
                subOption.id = subStructure.Id;
                subOption.name = subStructure.Name;
                subOption.typeValue = subStructure.Type__c;
                subOption.address = subStructure.Address__c;
                subOption.comuneId = subStructure.City__c;
                subOption.comuneName = subStructure.City__r != null ? subStructure.City__r.Name : null;
                option.subStructures.add(subOption);
            }

            results.add(option);
        }

        return results;
    }

    @AuraEnabled(cacheable=true)
    public static List<PicklistOption> fetchStructureTypes() {
        List<PicklistOption> results = new List<PicklistOption>();

        for (Schema.PicklistEntry entry : SubStructure__c.Type__c.getDescribe().getPicklistValues()) {
            PicklistOption option = new PicklistOption();
            option.label = entry.getLabel();
            option.value = entry.getValue();
            results.add(option);
        }

        return results;
    }

    @AuraEnabled(cacheable=true)
    public static List<ComuneOption> fetchComuni() {
        List<ComuneOption> results = new List<ComuneOption>();

        for (Comune__c comune : [
            SELECT Id, Name
            FROM Comune__c
            ORDER BY Name
        ]) {
            ComuneOption option = new ComuneOption();
            option.id = comune.Id;
            option.name = comune.Name;
            results.add(option);
        }

        return results;
    }

    @AuraEnabled
    public static List<Id> createSubStructures(Id structureId, List<NewSubStructureInput> newStructures) {
        System.debug(LoggingLevel.DEBUG, 'createSubStructures called with structureId=' + structureId +
            ' payload=' + JSON.serialize(newStructures));

        if (structureId == null) {
            throw new AuraHandledException('Structure Id is required.');
        }

        List<SubStructure__c> recordsToInsert = new List<SubStructure__c>();
        if (newStructures != null) {
            for (NewSubStructureInput input : newStructures) {
                if (input == null) {
                    continue;
                }

                SubStructure__c record = new SubStructure__c();
                record.Structure__c = structureId;
                record.Name = !String.isBlank(input.name) ? input.name.trim() : null;
                record.Type__c = resolveStructureTypeValue(input.typeValue);
                record.City__c = input.comuneId;
                if (!String.isBlank(input.address)) {
                    record.Address__c = input.address.trim();
                }

                recordsToInsert.add(record);
            }
        }

        if (recordsToInsert.isEmpty()) {
            throw new AuraHandledException('At least one sub-structure is required.');
        }

        Database.SaveResult[] results = Database.insert(recordsToInsert, false);
        List<Id> createdIds = new List<Id>();
        List<String> errors = new List<String>();

        for (Integer idx = 0; idx < results.size(); idx++) {
            Database.SaveResult sr = results[idx];
            if (sr.isSuccess()) {
                createdIds.add(sr.getId());
            } else {
                for (Database.Error error : sr.getErrors()) {
                    errors.add(
                        'Row ' + (idx + 1) + ': ' + error.getMessage()
                    );
                }
            }
        }

        if (!errors.isEmpty()) {
            throw new AuraHandledException(String.join(errors, ' '));
        }

        return createdIds;
    }

    private static Map<String, String> buildStructureTypeResolutionMap() {
        Map<String, String> resolutionMap = new Map<String, String>();
        for (Schema.PicklistEntry entry : SubStructure__c.Type__c.getDescribe().getPicklistValues()) {
            String value = entry.getValue();
            String label = entry.getLabel();
            if (value != null) {
                resolutionMap.put(value.toLowerCase(), value);
            }
            if (label != null) {
                resolutionMap.put(label.toLowerCase(), value);
            }
        }
        System.debug(LoggingLevel.DEBUG, 'Structure type resolution map: ' + resolutionMap);
        return resolutionMap;
    }

    private static String resolveStructureTypeValue(String rawValue) {
        if (String.isBlank(rawValue)) {
            return null;
        }

        String resolved = STRUCTURE_TYPE_RESOLUTION_MAP.get(rawValue.toLowerCase());
        if (resolved != null) {
            return resolved;
        }

        return rawValue;
    }
}