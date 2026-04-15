public class CreateWithholdIncassoAction {
    @InvocableMethod(label='Create Withhold Incasso' description='Creates a Voce di Incasso for the withhold amount of a distributed transaction')
    public static void createWithholdIncasso(List<Id> transactionIds) {
        if (transactionIds == null || transactionIds.isEmpty()) return;

        List<GiftTransaction> txs = [
            SELECT Id, Name, Reporting_Year__c, Programma__c, Original_Donation_Amount__c, Withholding__c, Data_di_Competenza__c
            FROM GiftTransaction
            WHERE Id IN :transactionIds AND Programma__c != null
        ];

        if (txs.isEmpty()) return;

        Set<Id> programIds = new Set<Id>();
        Set<String> years = new Set<String>();
        for (GiftTransaction tx : txs) {
            programIds.add(tx.Programma__c);
            if (tx.Data_di_Competenza__c != null) {
                years.add(String.valueOf(tx.Data_di_Competenza__c.year()));
            }
        }

        Map<String, Id> defaultOverviewBudgetByProgAndYear = new Map<String, Id>();
        if (!programIds.isEmpty() && !years.isEmpty()) {
            for (Overview_Budget_per_Anno__c ob : [
                SELECT Id, Programma__c, Anno__c 
                FROM Overview_Budget_per_Anno__c 
                WHERE Programma__c IN :programIds 
                  AND Anno__c IN :years 
                  AND Budget__r.IsDefault = true
            ]) {
                defaultOverviewBudgetByProgAndYear.put(ob.Programma__c + '_' + ob.Anno__c, ob.Id);
            }
        }

        List<Voce_di_Incasso__c> incassiToCreate = new List<Voce_di_Incasso__c>();
        for (GiftTransaction tx : txs) {
            Decimal originalAmount = tx.Original_Donation_Amount__c != null ? tx.Original_Donation_Amount__c : 0;
            Decimal withholdPercent = tx.Withholding__c != null ? tx.Withholding__c : 0;
            String yearStr = tx.Data_di_Competenza__c != null ? String.valueOf(tx.Data_di_Competenza__c.year()) : null;
            
            if (withholdPercent > 0 && originalAmount > 0 && yearStr != null) {
                Id overviewBudgetId = defaultOverviewBudgetByProgAndYear.get(tx.Programma__c + '_' + yearStr);
                if (overviewBudgetId != null) {
                    Decimal withholdAmount = (originalAmount * (withholdPercent / 100)).setScale(2, RoundingMode.HALF_UP);
                    if (withholdAmount > 0) {
                        Voce_di_Incasso__c vi = new Voce_di_Incasso__c();
                        vi.Overview_Budget_per_Anno__c = overviewBudgetId;
                        String nameStr = 'Trattenuta ' + tx.Name;
                        if (nameStr.length() > 80) nameStr = nameStr.substring(0, 80);
                        vi.Name = nameStr;
                        vi.Categoria__c = 'Donazione';
                        vi.Stato__c = 'Effettiva';
                        vi.Ammontare__c = withholdAmount;
                        vi.Transazione__c = tx.Id;
                        incassiToCreate.add(vi);
                    }
                }
            }
        }

        if (!incassiToCreate.isEmpty()) {
            Database.insert(incassiToCreate, false);
        }
    }
}
