GiftTransactionDesignation gtd1 = new GiftTransactionDesignation(
    GiftTransactionId = '6trMA000000303VYAQ',
    GiftDesignationId = '6gdMA0000007QqbYAE',
    Amount = 90,
    Percent = 10,
    Status__c = 'Distributed'
);
try {
    insert gtd1;
    System.debug('Success!');
} catch (Exception e) {
    System.debug('Error: ' + e.getMessage());
}
