GiftTransactionDesignation gtd1 = [SELECT Id, Percent FROM GiftTransactionDesignation WHERE Id = '6tdMA0000000CXRYA2'];
gtd1.Percent = 45;
update gtd1;

GiftTransactionDesignation gtd2 = [SELECT Id, Percent FROM GiftTransactionDesignation WHERE Id = '6tdMA0000000CXSYA2'];
gtd2.Percent = 45;
update gtd2;

GiftTransactionDesignation gtd3 = new GiftTransactionDesignation(
    GiftTransactionId = '6trMA000000303VYAQ',
    GiftDesignationId = '6gdMA0000007QqbYAE',
    Amount = 90,
    Percent = 10,
    Status__c = 'Distributed'
);
try {
    insert gtd3;
    System.debug('Success!');
} catch (Exception e) {
    System.debug('Error: ' + e.getMessage());
}
