trigger PaymentTrigger on Payment__c (after insert, after update) {
    if (Trigger.isAfter) {
        if (Trigger.isInsert) {
            PaymentTriggerHandler.handleAfterInsert(Trigger.new);
        }
        if (Trigger.isUpdate) {
            PaymentTriggerHandler.handleAfterUpdate(Trigger.new, Trigger.oldMap);
        }
    }
}
