public with sharing class DataExportSorrisoSospesoController {

    /**
     * Classe wrapper per i dati della tabella
     */
    public class TableRow {
        @AuraEnabled public String comune { get; set; }
        @AuraEnabled public String provincia { get; set; }
        @AuraEnabled public String regione { get; set; }
        @AuraEnabled public String tipologia { get; set; }
        @AuraEnabled public String fornitore { get; set; }
        @AuraEnabled public String fornitoreId { get; set; }
        @AuraEnabled public String tipologiaSpettacolo { get; set; }
        @AuraEnabled public String booleanValue { get; set; }
        @AuraEnabled public String partner { get; set; }
    }

    /**
     * Recupera tutti i dati necessari per la tabella "Lista Valori - Sorriso Sospeso"
     */
    @AuraEnabled(cacheable=true)
    public static List<TableRow> getAllTableData() {
        List<TableRow> rows = new List<TableRow>();

        // 1. Comune, Provincia, Regione da Comune__c (ordinati alfabeticamente su Name)
        List<Comune__c> comuni = [
            SELECT Name, Provincia__c, Regione__c
            FROM Comune__c
            ORDER BY Name
        ];

        // 2. Tipologia - valori picklist Type__c da Ticket__c
        List<String> tipologie = new List<String>();
        Schema.DescribeFieldResult ticketTypeDescribe = Ticket__c.Type__c.getDescribe();
        for (Schema.PicklistEntry entry : ticketTypeDescribe.getPicklistValues()) {
            tipologie.add(entry.getLabel());
        }
        tipologie.sort();

        // 3. Fornitore - Account con RecordType "Structure" (mostra Name, conserva Id)
        List<Account> fornitori = new List<Account>();
        List<RecordType> structureRecordTypes = [
            SELECT Id
            FROM RecordType
            WHERE SObjectType = 'Account'
            AND DeveloperName = 'Structure'
            LIMIT 1
        ];
        if (!structureRecordTypes.isEmpty()) {
            fornitori = [
                SELECT Id, Name
                FROM Account
                WHERE RecordTypeId = :structureRecordTypes[0].Id
                AND Name != null
                ORDER BY Name
                LIMIT 10000
            ];
        }

        // 4. Tipologia Spettacolo - valori picklist Type__c da Show__c
        List<String> tipologieSpettacolo = new List<String>();
        Schema.DescribeFieldResult showTypeDescribe = Show__c.Type__c.getDescribe();
        for (Schema.PicklistEntry entry : showTypeDescribe.getPicklistValues()) {
            tipologieSpettacolo.add(entry.getLabel());
        }
        tipologieSpettacolo.sort();

        // 5. Boolean - sempre "TRUE" e "FALSE"
        List<String> booleanValues = new List<String>{'TRUE', 'FALSE'};

        // 6. Partner - Account con enrollment attivo sul programma "Sorriso Sospeso"
        Set<Id> enrolledPartnerIds = new Set<Id>();
        for (ProgramEnrollment pe : [
            SELECT AccountId
            FROM ProgramEnrollment
            WHERE Program.Name = :ProgramEnrollmentService.SORRISO_SOSPESO
            AND IsActive = TRUE
            AND AccountId != null
        ]) {
            enrolledPartnerIds.add(pe.AccountId);
        }

        List<String> partners = new List<String>();
        if (!enrolledPartnerIds.isEmpty()) {
            for (Account acc : [
                SELECT Name
                FROM Account
                WHERE Id IN :enrolledPartnerIds
                AND Name != null
                AND (DEFAULT__c = false OR DEFAULT__c = null)
                ORDER BY Name
                LIMIT 10000
            ]) {
                partners.add(acc.Name);
            }
        }
        partners.sort();

        // Prepara valori distinti per Comune/Provincia/Regione
        List<String> comuniNames = new List<String>();
        List<String> province = new List<String>();
        List<String> regioni = new List<String>();
        Set<String> provinceSet = new Set<String>();
        Set<String> regioniSet = new Set<String>();
        for (Comune__c comune : comuni) {
            comuniNames.add(comune.Name);
            if (comune.Provincia__c != null && !provinceSet.contains(comune.Provincia__c)) {
                province.add(comune.Provincia__c);
                provinceSet.add(comune.Provincia__c);
            }
            if (comune.Regione__c != null && !regioniSet.contains(comune.Regione__c)) {
                regioni.add(comune.Regione__c);
                regioniSet.add(comune.Regione__c);
            }
        }

        // Trova il numero massimo di righe necessario
        Integer maxRows = Math.max(
            Math.max(comuniNames.size(), tipologie.size()),
            Math.max(
                Math.max(fornitori.size(), tipologieSpettacolo.size()),
                Math.max(booleanValues.size(), partners.size())
            )
        );

        // Crea righe tabella
        for (Integer i = 0; i < maxRows; i++) {
            TableRow row = new TableRow();

            // Comune, Provincia, Regione
            if (i < comuniNames.size()) {
                row.comune = comuniNames[i];
                if (i < comuni.size()) {
                    row.provincia = comuni[i].Provincia__c;
                    row.regione = comuni[i].Regione__c;
                }
            }

            // Tipologia
            if (i < tipologie.size()) {
                row.tipologia = tipologie[i];
            }

            // Fornitore (Name visibile, Id disponibile)
            if (i < fornitori.size()) {
                row.fornitore = fornitori[i].Name;
                row.fornitoreId = fornitori[i].Id;
            }

            // Tipologia Spettacolo
            if (i < tipologieSpettacolo.size()) {
                row.tipologiaSpettacolo = tipologieSpettacolo[i];
            }

            // Boolean
            if (i < booleanValues.size()) {
                row.booleanValue = booleanValues[i];
            }

            // Partner
            if (i < partners.size()) {
                row.partner = partners[i];
            }

            rows.add(row);
        }

        return rows;
    }
}