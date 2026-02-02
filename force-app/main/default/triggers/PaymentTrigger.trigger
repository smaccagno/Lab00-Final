trigger PaymentTrigger on Payment__c (after update) {
    PaymentTriggerHandler.run(Trigger.new, Trigger.oldMap);
}
