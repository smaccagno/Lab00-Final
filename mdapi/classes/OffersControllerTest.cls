@isTest
private class OffersControllerTest {

    private class TestData {
        Account partnerAccount;
        Account secondaryPartner;
        Account defaultAccount;
        Account nonPartnerAccount;
        Account structureOne;
        Account structureTwo;
    }

    private static String ticketTypePrimaryValue;
    private static String ticketTypeSecondaryValue;
    private static String ticketTypeSearchValue;
    private static final String SEARCH_KEYWORD = 'SearchableOffer';

    @testSetup
    static void setupData() {
        Map<String, Schema.RecordTypeInfo> accountRecordTypes = Schema.SObjectType.Account
            .getRecordTypeInfosByDeveloperName();

        Id partnerRecordTypeId = accountRecordTypes.get('Partner').getRecordTypeId();
        Id structureRecordTypeId = accountRecordTypes.containsKey('Structure')
            ? accountRecordTypes.get('Structure').getRecordTypeId()
            : null;

        System.assertNotEquals(
            null,
            structureRecordTypeId,
            'Structure record type must exist for Account'
        );

        List<String> activeTicketTypes = new List<String>();
        for (Schema.PicklistEntry entry : TicketAvailability__c.TicketType__c.getDescribe().getPicklistValues()) {
            if (entry.isActive()) {
                activeTicketTypes.add(entry.getValue());
            }
        }
        System.assert(
            !activeTicketTypes.isEmpty(),
            'Test setup requires at least one active TicketType__c value.'
        );
        ticketTypePrimaryValue = activeTicketTypes[0];
        ticketTypeSecondaryValue = activeTicketTypes.size() > 1
            ? activeTicketTypes[1]
            : ticketTypePrimaryValue;
        ticketTypeSearchValue = activeTicketTypes.size() > 2
            ? activeTicketTypes[2]
            : ticketTypePrimaryValue;

        Account partnerAccount = new Account(
            Name = 'Test Partner Account',
            RecordTypeId = partnerRecordTypeId,
            Default_per_Budgets__c = false
        );
        Account secondaryPartner = new Account(
            Name = 'Other Partner Account',
            RecordTypeId = partnerRecordTypeId,
            Default_per_Budgets__c = false
        );
        Account defaultAccount = new Account(
            Name = 'Default Budget Account',
            Default_per_Budgets__c = true
        );
        Account nonPartnerAccount = new Account(
            Name = 'Standard Account',
            Default_per_Budgets__c = false
        );
        Account structureOne = new Account(
            Name = 'Teatro Alfa',
            RecordTypeId = structureRecordTypeId
        );
        Account structureTwo = new Account(
            Name = 'Cinema Beta',
            RecordTypeId = structureRecordTypeId
        );

        insert new List<Account>{
            partnerAccount,
            secondaryPartner,
            defaultAccount,
            nonPartnerAccount,
            structureOne,
            structureTwo
        };

        Date futureDate = Date.today().addDays(30);

        insert new List<TicketAvailability__c>{
            new TicketAvailability__c(
                Partner__c = partnerAccount.Id,
                Structure__c = structureOne.Id,
                TicketType__c = ticketTypePrimaryValue,
                State__c = 'Prenotato',
                NumberUses__c = 1,
                OfferExpirationDate__c = futureDate
            ),
            new TicketAvailability__c(
                Partner__c = partnerAccount.Id,
                Structure__c = structureTwo.Id,
                TicketType__c = ticketTypeSecondaryValue,
                State__c = 'Scaduto',
                NumberUses__c = 2,
                OfferExpirationDate__c = futureDate
            ),
            new TicketAvailability__c(
                Partner__c = partnerAccount.Id,
                Structure__c = structureOne.Id,
                TicketType__c = ticketTypePrimaryValue,
                State__c = 'Disponibile',
                NumberUses__c = 3,
                OfferExpirationDate__c = futureDate
            ),
            new TicketAvailability__c(
                Partner__c = secondaryPartner.Id,
                Structure__c = structureTwo.Id,
                TicketType__c = ticketTypeSecondaryValue,
                State__c = 'Utilizzato',
                NumberUses__c = 1,
                OfferExpirationDate__c = futureDate
            ),
            new TicketAvailability__c(
                Partner__c = defaultAccount.Id,
                Structure__c = structureOne.Id,
                SubscriptionName__c = SEARCH_KEYWORD + ' 1',
                TicketType__c = ticketTypeSearchValue,
                State__c = 'Fatturato',
                NumberUses__c = 5,
                OfferExpirationDate__c = futureDate
            ),
            new TicketAvailability__c(
                Partner__c = defaultAccount.Id,
                Structure__c = structureTwo.Id,
                SubscriptionName__c = SEARCH_KEYWORD + ' 2',
                TicketType__c = ticketTypeSearchValue,
                State__c = 'Disponibile',
                NumberUses__c = 1,
                OfferExpirationDate__c = futureDate
            )
        };
    }

    @isTest
    static void testPartnerUserReceivesFilteredStates() {
        TestData data = loadAccounts();
        setCurrentUserCompany(data.partnerAccount.Name);

        OffersController.TicketAvailabilityResponse response = callController(null, true);

        System.assertEquals(false, response.isDefaultPartner, 'Partner flag should be false');
        System.assertEquals(2, response.records.size(), 'Partner should see limited states');

        Set<String> states = new Set<String>();
        for (TicketAvailability__c record : response.records) {
            System.assertEquals(data.partnerAccount.Id, record.Partner__c, 'Only own partner records returned');
            states.add(record.State__c);
        }

        System.assert(states.contains('Prenotato'));
        System.assert(states.contains('Scaduto'));
        System.assert(!states.contains('Disponibile'));
        System.assertEquals(new Set<String>{'Prenotato', 'Scaduto'}, new Set<String>(response.availableStates));

        Set<Id> providerIds = new Set<Id>();
        for (OffersController.StructureOption option : response.availableStructures) {
            if (String.isNotBlank(option.value)) {
                providerIds.add(Id.valueOf(option.value));
            }
        }
        System.assertEquals(
            new Set<Id>{data.structureOne.Id, data.structureTwo.Id},
            providerIds,
            'Partner should only see own providers'
        );
    }

    @isTest
    static void testPartnerUserWithStateFilter() {
        TestData data = loadAccounts();
        setCurrentUserCompany(data.partnerAccount.Name);

        OffersController.TicketAvailabilityResponse response =
            OffersController.getTicketAvailabilities(
                new List<String>{'Scaduto'},
                50,
                0,
                null,
                false,
                null
            );

        System.assertEquals(1, response.records.size(), 'State filter applied');
        System.assertEquals('Scaduto', response.records[0].State__c);
    }

    @isTest
    static void testDefaultPartnerSeesAllStates() {
        TestData data = loadAccounts();
        setCurrentUserCompany(data.defaultAccount.Name);

        OffersController.TicketAvailabilityResponse response = callController(null, true);

        System.assertEquals(true, response.isDefaultPartner, 'Default partner flag');
        System.assertEquals(6, response.records.size(), 'Default user sees all records');

        Set<Id> partnerIds = new Set<Id>();
        Set<String> states = new Set<String>();
        for (TicketAvailability__c record : response.records) {
            partnerIds.add(record.Partner__c);
            states.add(record.State__c);
        }

        System.assertEquals(new Set<Id>{
            data.partnerAccount.Id,
            data.secondaryPartner.Id,
            data.defaultAccount.Id
        }, partnerIds);
        System.assert(states.contains('Disponibile'));
        System.assert(states.contains('Fatturato'));
        System.assertEquals(states, new Set<String>(response.availableStates));

        Set<Id> allProviderIds = new Set<Id>();
        for (OffersController.StructureOption option : response.availableStructures) {
            if (String.isNotBlank(option.value)) {
                allProviderIds.add(Id.valueOf(option.value));
            }
        }
        System.assertEquals(
            new Set<Id>{data.structureOne.Id, data.structureTwo.Id},
            allProviderIds,
            'Default partner should see all provider options'
        );
    }

    @isTest
    static void testDefaultPartnerFiltersByStructure() {
        TestData data = loadAccounts();
        setCurrentUserCompany(data.defaultAccount.Name);

        OffersController.TicketAvailabilityResponse response =
            OffersController.getTicketAvailabilities(
                null,
                50,
                0,
                null,
                false,
                data.structureOne.Id
            );

        System.assert(response.records.size() > 0, 'Expected records for selected provider');
        for (TicketAvailability__c record : response.records) {
            System.assertEquals(data.structureOne.Id, record.Structure__c);
        }
    }

    @isTest
    static void testSearchTermFiltersResults() {
        TestData data = loadAccounts();
        setCurrentUserCompany(data.defaultAccount.Name);

        OffersController.TicketAvailabilityResponse response =
            OffersController.getTicketAvailabilities(
                null,
                50,
                0,
                SEARCH_KEYWORD,
                false,
                null
            );

        System.assertEquals(2, response.records.size());
        for (TicketAvailability__c record : response.records) {
            System.assertEquals(data.defaultAccount.Id, record.Partner__c);
            System.assert(record.SubscriptionName__c != null && record.SubscriptionName__c.contains(SEARCH_KEYWORD));
        }
    }

    @isTest
    static void testUnmatchedUserGetsEmptySet() {
        setCurrentUserCompany('Unknown Company');

        OffersController.TicketAvailabilityResponse response = callController(null, true);

        System.assertEquals(0, response.records.size());
        System.assertEquals(false, response.isDefaultPartner);
    }

    @isTest
    static void testNonPartnerAccountBlocked() {
        TestData data = loadAccounts();
        setCurrentUserCompany(data.nonPartnerAccount.Name);

        OffersController.TicketAvailabilityResponse response = callController(null, true);

        System.assertEquals(0, response.records.size());
    }

    private static OffersController.TicketAvailabilityResponse callController(List<String> states, Boolean includeStates) {
        return OffersController.getTicketAvailabilities(
            states,
            50,
            0,
            null,
            includeStates,
            null
        );
    }

    private static void setCurrentUserCompany(String companyName) {
        User runningUser = [
            SELECT Id, CompanyName
            FROM User
            WHERE Id = :UserInfo.getUserId()
        ];
        runningUser.CompanyName = companyName;
        update runningUser;
    }

    private static TestData loadAccounts() {
        TestData data = new TestData();
        Map<String, Account> accountsByName = new Map<String, Account>();
        for (Account acc : [
            SELECT Id, Name, Default_per_Budgets__c, RecordType.DeveloperName
            FROM Account
            WHERE Name IN (
                'Test Partner Account',
                'Other Partner Account',
                'Default Budget Account',
                'Standard Account',
                'Teatro Alfa',
                'Cinema Beta'
            )
        ]) {
            accountsByName.put(acc.Name, acc);
        }
        data.partnerAccount = accountsByName.get('Test Partner Account');
        data.secondaryPartner = accountsByName.get('Other Partner Account');
        data.defaultAccount = accountsByName.get('Default Budget Account');
        data.nonPartnerAccount = accountsByName.get('Standard Account');
        data.structureOne = accountsByName.get('Teatro Alfa');
        data.structureTwo = accountsByName.get('Cinema Beta');
        return data;
    }
}