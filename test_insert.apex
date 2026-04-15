GiftTransactionDesignation gtd = new GiftTransactionDesignation(
    GiftTransactionId = '6trMA000000303VYAQ',
    GiftDesignationId = '6gdMA0000007QqbYAE',
    Amount = 100,
    Percent = 11.11,
    Status__c = 'Distributed'
);
try {
    insert gtd;
    System.debug('Success!');
} catch (Exception e) {
    System.debug('Error: ' + e.getMessage());
}
