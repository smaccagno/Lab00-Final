public with sharing class VoceStatoPrecedenteHandler {
    private static final String ANNULLATA = 'Annullata';

    public static void handleIncassi(List<Voce_di_Incasso__c> newList, Map<Id, Voce_di_Incasso__c> oldMap) {
        for (Voce_di_Incasso__c v : newList) {
            Voce_di_Incasso__c old = oldMap == null ? null : oldMap.get(v.Id);
            applyStatoPrecedente(v, v.Stato__c, old == null ? null : old.Stato__c);
        }
    }

    public static void handleSpese(List<Voce_di_Spesa__c> newList, Map<Id, Voce_di_Spesa__c> oldMap) {
        for (Voce_di_Spesa__c v : newList) {
            Voce_di_Spesa__c old = oldMap == null ? null : oldMap.get(v.Id);
            applyStatoPrecedente(v, v.Stato__c, old == null ? null : old.Stato__c);
        }
    }

    private static void applyStatoPrecedente(SObject record, String newStato, String oldStato) {
        if (newStato == ANNULLATA && oldStato != ANNULLATA && oldStato != null) {
            record.put('Stato_Precedente__c', oldStato);
        } else if (newStato != ANNULLATA) {
            record.put('Stato_Precedente__c', null);
        }
    }
}
