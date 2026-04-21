trigger VoceDiSpesaTrigger on Voce_di_Spesa__c (before insert, before update) {
    VoceStatoPrecedenteHandler.handleSpese(Trigger.new, Trigger.oldMap);
}
