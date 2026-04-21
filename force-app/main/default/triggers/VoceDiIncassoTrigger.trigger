trigger VoceDiIncassoTrigger on Voce_di_Incasso__c (before insert, before update) {
    VoceStatoPrecedenteHandler.handleIncassi(Trigger.new, Trigger.oldMap);
}
