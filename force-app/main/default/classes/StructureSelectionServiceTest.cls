@IsTest
private class StructureSelectionServiceTest {
    @IsTest
    static void fetchStructures_and_createSubStructures() {
        RecordType structureRt = [
            SELECT Id
            FROM RecordType
            WHERE SobjectType = 'Account' AND DeveloperName = 'Structure'
            LIMIT 1
        ];

        Account structureAccount = new Account(
            Name = 'Test Structure',
            RecordTypeId = structureRt.Id
        );
        insert structureAccount;

        Comune__c comune = new Comune__c(
            Name = 'Test Comune',
            Nome_Comune__c = 'Test Comune',
            Provincia__c = 'Milano (MI)',
            Regione__c = 'Lombardia'
        );
        insert comune;

        String typeValue = getFirstStructureTypeValue();

        SubStructure__c subStructure = new SubStructure__c(
            Name = 'Existing Sub Structure',
            Structure__c = structureAccount.Id,
            Type__c = typeValue,
            City__c = comune.Id,
            Address__c = 'Via Esistente 1'
        );
        insert subStructure;

        Test.startTest();
        List<StructureSelectionService.StructureOption> results =
            StructureSelectionService.fetchStructures(structureRt.Id);
        List<StructureSelectionService.ComuneOption> comuni =
            StructureSelectionService.fetchComuni();
        List<StructureSelectionService.PicklistOption> types =
            StructureSelectionService.fetchStructureTypes();

        StructureSelectionService.NewSubStructureInput newInput = new StructureSelectionService.NewSubStructureInput();
        newInput.name = 'Generated Structure';
        newInput.typeValue = types[0].value;
        newInput.comuneId = comuni[0].id;
        newInput.address = 'Via Roma 1';

        List<Id> createdIds = StructureSelectionService.createSubStructures(
            structureAccount.Id,
            new List<StructureSelectionService.NewSubStructureInput>{ newInput }
        );
        Test.stopTest();

        System.assertNotEquals(0, results.size(), 'Expected at least one structure.');
        StructureSelectionService.StructureOption retrieved = results[0];
        System.assertEquals(structureAccount.Id, retrieved.id, 'Unexpected structure id.');
        System.assertNotEquals(0, retrieved.subStructures.size(), 'Expected at least one sub structure.');
        StructureSelectionService.SubStructureOption retrievedSub = retrieved.subStructures[0];
        System.assertEquals(subStructure.Id, retrievedSub.id, 'Unexpected sub structure id.');
        System.assertEquals(typeValue, retrievedSub.typeValue, 'Unexpected sub structure type.');
        System.assertEquals('Via Esistente 1', retrievedSub.address, 'Unexpected sub structure address.');
        System.assertEquals(comune.Id, retrievedSub.comuneId, 'Unexpected sub structure comune id.');
        System.assertEquals(comune.Name, retrievedSub.comuneName, 'Unexpected sub structure comune name.');

        System.assertNotEquals(0, comuni.size(), 'Expected at least one comune.');
        System.assertEquals('Test Comune', comuni[0].name, 'Comune ordering mismatch.');
        System.assertNotEquals(0, types.size(), 'Expected at least one structure type.');

        System.assertEquals(1, createdIds.size(), 'Expected one sub-structure created.');
        SubStructure__c created = [
            SELECT Id, Name, Type__c, City__c, Address__c, Structure__c
            FROM SubStructure__c
            WHERE Id = :createdIds[0]
        ];
        System.assertEquals('Generated Structure', created.Name, 'Incorrect structure name.');
        System.assertEquals(types[0].value, created.Type__c, 'Incorrect structure type.');
        System.assertEquals(comuni[0].id, created.City__c, 'Incorrect comune reference.');
        System.assertEquals('Via Roma 1', created.Address__c, 'Incorrect address value.');
        System.assertEquals(structureAccount.Id, created.Structure__c, 'Incorrect parent structure.');
    }

    private static String getFirstStructureTypeValue() {
        List<StructureSelectionService.PicklistOption> types = StructureSelectionService.fetchStructureTypes();
        System.assertNotEquals(0, types.size(), 'Structure type picklist must contain values.');
        return types[0].value;
    }
}