public with sharing class OffersController {

    private static final Set<String> PARTNER_ALLOWED_STATES = new Set<String>{
        'Prenotato',
        'Utilizzato',
        'Scaduto'
    };

    private static final Integer DEFAULT_LIMIT = 50;

    public class TicketAvailabilityResponse {
        @AuraEnabled public List<TicketAvailability__c> records;
        @AuraEnabled public Integer returnedSize;
        @AuraEnabled public Boolean isDefaultPartner;
        @AuraEnabled public List<String> availableStates;
        @AuraEnabled public List<StructureOption> availableStructures;
    }

    public class StructureOption {
        @AuraEnabled public String value;
        @AuraEnabled public String label;

        public StructureOption(Id value, String label) {
            this.value = value != null ? (String) value : null;
            this.label = label;
        }
    }

    @AuraEnabled(cacheable=false)
    public static TicketAvailabilityResponse getTicketAvailabilities(
        List<String> states,
        Integer limitSize,
        Integer offsetSize,
        String searchTerm,
        Boolean includeStates,
        String structureId
    ) {
        User currentUser = [
            SELECT CompanyName
            FROM User
            WHERE Id = :UserInfo.getUserId()
            WITH SYSTEM_MODE
        ];

        if (String.isBlank(currentUser.CompanyName)) {
            return buildEmptyResponse(false);
        }

        List<Account> matchingAccounts = [
            SELECT Id, Default_per_Budgets__c, RecordType.DeveloperName
            FROM Account
            WHERE Name = :currentUser.CompanyName
            WITH SYSTEM_MODE
            LIMIT 1
        ];

        if (matchingAccounts.isEmpty()) {
            return buildEmptyResponse(false);
        }

        Account userAccount = matchingAccounts.get(0);
        Boolean isDefaultPartner = userAccount.Default_per_Budgets__c == true;
        String recordTypeDevName = userAccount.RecordType != null
            ? userAccount.RecordType.DeveloperName
            : null;
        Id partnerId = userAccount.Id;
        Set<String> partnerStateFilter = new Set<String>(PARTNER_ALLOWED_STATES);

        if (!isDefaultPartner && recordTypeDevName != 'Partner') {
            return buildEmptyResponse(false);
        }

        Integer effectiveLimit = limitSize != null && limitSize > 0
            ? limitSize
            : DEFAULT_LIMIT;
        Integer effectiveOffset = offsetSize != null && offsetSize >= 0
            ? offsetSize
            : 0;

        List<String> sanitizedStates = sanitizeStates(states);
        String sanitizedStructureId = !String.isBlank(structureId)
            ? structureId.trim()
            : null;

        String searchPattern = null;
        if (!String.isBlank(searchTerm)) {
            searchPattern = '%' + escapeLike(searchTerm.trim()) + '%';
        }

        // Build the WHERE clauses shared across queries
        List<String> whereParts = new List<String>();

        if (!isDefaultPartner) {
            whereParts.add('Partner__c = :partnerId');
            whereParts.add('State__c IN :partnerStateFilter');
        }

        if (!sanitizedStates.isEmpty()) {
            whereParts.add('State__c IN :sanitizedStates');
        }

        if (sanitizedStructureId != null) {
            whereParts.add('Structure__c = :sanitizedStructureId');
        }

        if (searchPattern != null) {
            whereParts.add(
                '(' +
                'Name LIKE :searchPattern OR ' +
                'TicketType__c LIKE :searchPattern OR ' +
                'IssuanceType__c LIKE :searchPattern OR ' +
                'PaymentType__c LIKE :searchPattern OR ' +
                'SubscriptionName__c LIKE :searchPattern OR ' +
                'State__c LIKE :searchPattern OR ' +
                'Structure__r.Name LIKE :searchPattern OR ' +
                'Show__r.Name LIKE :searchPattern' +
                ')'
            );
        }

        String whereClause = whereParts.isEmpty()
            ? ''
            : ' WHERE ' + String.join(whereParts, ' AND ');

        String selectClause =
            'SELECT Id, Name, TicketType__c, IssuanceType__c, PaymentType__c, ' +
            'Structure__c, Structure__r.Name, Show__c, Show__r.Name, Show__r.Datetime__c, ' +
            'SubscriptionName__c, NumberUses__c, OfferExpirationDate__c, PriceFull__c, ' +
            'PriceDiscounted__c, IsFree__c, State__c, Partner__c';

        String soqlQuery =
            selectClause +
            ' FROM TicketAvailability__c' +
            whereClause +
            ' ORDER BY CreatedDate DESC, Name ASC' +
            ' LIMIT ' + String.valueOf(effectiveLimit) +
            ' OFFSET ' + String.valueOf(effectiveOffset);

        List<TicketAvailability__c> records = Database.query(soqlQuery);

        TicketAvailabilityResponse response = new TicketAvailabilityResponse();
        response.records = records;
        response.returnedSize = records.size();
        response.isDefaultPartner = isDefaultPartner;
        response.availableStates = new List<String>();
        response.availableStructures = new List<StructureOption>();

        if (includeStates == true) {
            response.availableStates = fetchAvailableStates(
                partnerId,
                isDefaultPartner,
                sanitizedStructureId
            );
            response.availableStructures = fetchAvailableStructures(
                partnerId,
                isDefaultPartner
            );
        }

        return response;
    }

    private static TicketAvailabilityResponse buildEmptyResponse(Boolean isDefaultPartner) {
        TicketAvailabilityResponse resp = new TicketAvailabilityResponse();
        resp.records = new List<TicketAvailability__c>();
        resp.returnedSize = 0;
        resp.isDefaultPartner = isDefaultPartner;
        resp.availableStates = new List<String>();
        resp.availableStructures = new List<StructureOption>();
        return resp;
    }

    private static List<String> sanitizeStates(List<String> states) {
        List<String> result = new List<String>();
        if (states == null) {
            return result;
        }
        for (String stateValue : states) {
            if (String.isNotBlank(stateValue)) {
                result.add(stateValue.trim());
            }
        }
        return result;
    }

    private static List<String> fetchAvailableStates(
        Id partnerId,
        Boolean isDefaultPartner,
        String structureId
    ) {
        List<String> stateFilters = new List<String>();
        Set<String> partnerAllowedStates = new Set<String>(PARTNER_ALLOWED_STATES);

        if (!isDefaultPartner) {
            stateFilters.add('Partner__c = :partnerId');
            stateFilters.add('State__c IN :partnerAllowedStates');
        }

        if (!String.isBlank(structureId)) {
            stateFilters.add('Structure__c = :structureId');
        }

        String whereClause = stateFilters.isEmpty()
            ? ''
            : ' WHERE ' + String.join(stateFilters, ' AND ');

        String stateQuery =
            'SELECT State__c FROM TicketAvailability__c' +
            whereClause +
            ' GROUP BY State__c' +
            ' ORDER BY State__c';

        List<AggregateResult> aggregateResults = Database.query(stateQuery);
        List<String> states = new List<String>();

        for (AggregateResult ar : aggregateResults) {
            String value = (String) ar.get('State__c');
            if (String.isNotBlank(value)) {
                states.add(value);
            }
        }

        return states;
    }

    private static List<StructureOption> fetchAvailableStructures(
        Id partnerId,
        Boolean isDefaultPartner
    ) {
        List<String> structureFilters = new List<String>{
            'Structure__c != null'
        };
        Set<String> partnerAllowedStates = new Set<String>(PARTNER_ALLOWED_STATES);

        if (!isDefaultPartner) {
            structureFilters.add('Partner__c = :partnerId');
            structureFilters.add('State__c IN :partnerAllowedStates');
        }

        String whereClause = structureFilters.isEmpty()
            ? ''
            : ' WHERE ' + String.join(structureFilters, ' AND ');

        String structureQuery =
            'SELECT Structure__c, Structure__r.Name FROM TicketAvailability__c' +
            whereClause +
            ' ORDER BY Structure__r.Name';

        List<TicketAvailability__c> records = Database.query(structureQuery);
        Set<Id> seen = new Set<Id>();
        List<StructureOption> options = new List<StructureOption>();

        for (TicketAvailability__c record : records) {
            if (record.Structure__c != null && !seen.contains(record.Structure__c)) {
                String label = record.Structure__r != null ? record.Structure__r.Name : null;
                options.add(new StructureOption(record.Structure__c, label));
                seen.add(record.Structure__c);
            }
        }

        return options;
    }

    private static String escapeLike(String value) {
        String escaped = String.escapeSingleQuotes(value);
        escaped = escaped.replace('\\', '\\\\');
        escaped = escaped.replace('%', '\\%');
        escaped = escaped.replace('_', '\\_');
        return escaped;
    }
}