trigger InvoiceTrigger on Invoice__c (before insert, before update, after insert, after update, before delete) {
    InvoiceTriggerHandler.run(Trigger.isBefore, Trigger.isAfter, Trigger.isInsert, Trigger.isUpdate, Trigger.isDelete,
                              Trigger.isDelete ? null : Trigger.new,
                              Trigger.isDelete ? null : Trigger.oldMap,
                              Trigger.isDelete ? Trigger.old : null);
}