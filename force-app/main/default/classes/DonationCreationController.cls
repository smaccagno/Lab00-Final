public with sharing class DonationCreationController {
    
    /**
     * @description Crea una o più donazioni con le relative transazioni
     * @param donationsData JSON string con array di donazioni da creare
     * @param donorId ID del donatore selezionato
     * @param donorName Nome del donatore
     * @return Map con risultati della creazione
     */
    @AuraEnabled
    public static Map<String, Object> createDonations(String donationsData, String donorId, String donorName) {
        Map<String, Object> result = new Map<String, Object>();
        List<String> createdDonationIds = new List<String>();
        List<String> errors = new List<String>();
        
        try {
            if (String.isBlank(donationsData)) {
                throw new AuraHandledException('Nessun dato donazione fornito');
            }
            
            // Parse JSON
            Object parsedObj = JSON.deserializeUntyped(donationsData);
            if (!(parsedObj instanceof List<Object>)) {
                throw new AuraHandledException('Formato dati non valido: atteso un array');
            }
            
            List<Object> donationsList = (List<Object>) parsedObj;
            if (donationsList.isEmpty()) {
                throw new AuraHandledException('Nessuna donazione da creare');
            }
            // Limite per evitare "Too many SOQL queries" (flows + trigger consumano molte query)
            if (donationsList.size() > 5) {
                throw new AuraHandledException('Massimo 5 donazioni per volta. Riduci il numero e crea in più passaggi.');
            }
            
            // Estrai tutti i DonorId presenti nei dati
            Set<String> donorIds = new Set<String>();
            if (String.isNotBlank(donorId)) donorIds.add(donorId);
            for (Object donationObj : donationsList) {
                Map<String, Object> donationData = (Map<String, Object>) donationObj;
                String dId = (String)donationData.get('Donatore');
                if (String.isNotBlank(dId)) donorIds.add(dId);
            }
            
            // Ottieni i record type dei donatori
            Map<Id, Account> donorsMap = new Map<Id, Account>([
                SELECT Id, RecordType.DeveloperName, RecordType.Name, IsPersonAccount, PersonContact.FirstName, PersonContact.LastName, Name 
                FROM Account 
                WHERE Id IN :donorIds
            ]);
            
            List<GiftEntry> donationsToCreate = new List<GiftEntry>();
            Map<Integer, Map<String, Object>> donationDataMap = new Map<Integer, Map<String, Object>>();
            
            // Prepara le donazioni
            for (Integer i = 0; i < donationsList.size(); i++) {
                Object donationObj = donationsList[i];
                if (!(donationObj instanceof Map<String, Object>)) {
                    errors.add('Riga ' + (i + 1) + ': formato dati non valido');
                    continue;
                }
                
                Map<String, Object> donationData = (Map<String, Object>) donationObj;
                donationDataMap.put(i, donationData);
                
                String rowDonorId = String.isNotBlank((String)donationData.get('Donatore')) ? (String)donationData.get('Donatore') : donorId;
                if (String.isBlank(rowDonorId)) {
                    errors.add('Riga ' + (i + 1) + ': Donatore obbligatorio');
                    continue;
                }
                
                Account rowDonor = donorsMap.get(rowDonorId);
                if (rowDonor == null) {
                    errors.add('Riga ' + (i + 1) + ': Donatore non trovato a sistema');
                    continue;
                }
                
                String giftType = rowDonor.RecordType.DeveloperName == 'Company' ? 'Organizational' : 'Individual';
                String tipoDonatore = rowDonor.RecordType.DeveloperName == 'Company' ? 'grande_donatore' : 'piccolo_donatore';
                String rowDonorName = rowDonor.Name;
                
                // Valida campi obbligatori
                if (String.isBlank((String)donationData.get('Nome_della_Donazione'))) {
                    errors.add('Riga ' + (i + 1) + ': Descrizione obbligatoria');
                    continue;
                }
                if (String.isBlank((String)donationData.get('Programma'))) {
                    errors.add('Riga ' + (i + 1) + ': Programma obbligatorio');
                    continue;
                }
                if (donationData.get('Ammontare') == null || (Decimal)donationData.get('Ammontare') <= 0) {
                    errors.add('Riga ' + (i + 1) + ': Ammontare obbligatorio e deve essere maggiore di 0');
                    continue;
                }
                
                // Calcola anno donazione
                String dataRicezione = (String)donationData.get('Data_di_ricezione');
                String donationYear = '';
                if (String.isNotBlank(dataRicezione)) {
                    Date dateRicezione = Date.valueOf(dataRicezione);
                    donationYear = String.valueOf(dateRicezione.year());
                } else {
                    donationYear = String.valueOf(Date.today().year());
                }
                
                // Calcola ammontare finale (al netto della trattenuta)
                Decimal ammontare = (Decimal)donationData.get('Ammontare');
                Decimal trattenuta = donationData.get('Trattenuta') != null ? (Decimal)donationData.get('Trattenuta') : 20;
                Decimal finalAmount = ammontare - (trattenuta * ammontare / 100);
                
                // Crea donazione
                GiftEntry donation = new GiftEntry();
                donation.DonorId = rowDonorId;
                donation.OrganizationName = rowDonorName;
                donation.GiftAmount = finalAmount;
                donation.Original_Donation_Amount__c = ammontare;
                donation.Withholding_percent__c = trattenuta;
                donation.GiftType = giftType;
                donation.Title__c = (String)donationData.get('Nome_della_Donazione');
                donation.PaymentMethod = (String)donationData.get('Metodo_di_pagamento');
                donation.Programma__c = (String)donationData.get('Programma');
                donation.Tipo_Donatore__c = tipoDonatore;
                donation.Year_of_the_Donation__c = donationYear;
                
                if (String.isNotBlank(dataRicezione)) {
                    donation.GiftReceivedDate = Date.valueOf(dataRicezione);
                }
                
                String dataCompetenza = (String)donationData.get('Data_di_Competenza');
                if (String.isNotBlank(dataCompetenza)) {
                    donation.Data_di_Competenza__c = Date.valueOf(dataCompetenza);
                }
                
                donationsToCreate.add(donation);
            }
            
            if (!donationsToCreate.isEmpty()) {
                DonationCreationContext.skipTransazioneShadowQueueable = true;
                try {
                // Inserisci donazioni (il record-triggered flow Allinea_Donazione_dopo_creazione_record può eseguire Assegna_Donatore_Anno)
                insert donationsToCreate;
                
                List<Id> descUpdateTxIds = new List<Id>();
                List<String> descUpdateTitles = new List<String>();
                List<Map<String, Object>> allocationPayloads = new List<Map<String, Object>>();
                
                // Per ogni donazione: usa gli stessi subflow del flusso Inserisci Donazione
                for (Integer i = 0; i < donationsToCreate.size(); i++) {
                    GiftEntry donation = donationsToCreate[i];
                    Map<String, Object> donationData = donationDataMap.get(i);
                    createdDonationIds.add(donation.Id);
                    
                    String programId = (String)donationData.get('Programma');
                    
                    // 1. Assegna_Donatore_Anno - come nel flow Create_New_Donation (assegna Reporting_Year__c, Overview_Donatore__c)
                    if (String.isNotBlank(programId)) {
                        try {
                            Flow.Interview.Assegna_Donatore_Anno flowAssegna = new Flow.Interview.Assegna_Donatore_Anno(new Map<String, Object>{
                                'donorId' => donation.DonorId,
                                'programId' => programId,
                                'recordId' => donation.Id
                            });
                            flowAssegna.start();
                        } catch (Exception e) {
                            System.debug('Errore Assegna_Donatore_Anno per donazione ' + donation.Id + ': ' + e.getMessage());
                        }
                    }
                    
                    // 2. Crea_Transazione - come nel flow Create_New_Donation (crea GiftTransaction e aggiorna donazione)
                    String transactionId = null;
                    try {
                        Flow.Interview.Crea_Transazione flowTrans = new Flow.Interview.Crea_Transazione(new Map<String, Object>{
                            'donationId' => donation.Id
                        });
                        flowTrans.start();
                        transactionId = (String) flowTrans.getVariableValue('transactionID');
                    } catch (Exception e) {
                        System.debug('Errore Crea_Transazione per donazione ' + donation.Id + ': ' + e.getMessage());
                    }
                    
                    // 2b. Description: deferita a Queueable per evitare Crea_Transazione_Shadow (e SOQL limit)
                    if (String.isNotBlank(transactionId) && String.isNotBlank(donation.Title__c)) {
                        descUpdateTxIds.add(transactionId);
                        descUpdateTitles.add(donation.Title__c);
                    }
                    
                    // 3. Allocazioni: deferite a Queueable per evitare "Designations can't exceed 100%"
                    // NPSP (es. Sorriso Sospeso) può creare designazioni di default nella stessa transazione.
                    // Eseguendo in Queueable, la transazione principale committa prima; poi eliminiamo le default e inseriamo le nostre.
                    if (String.isNotBlank(transactionId) && donationData.containsKey('Allocazioni') && donationData.get('Allocazioni') != null) {
                        List<Object> allocList = (List<Object>) donationData.get('Allocazioni');
                        if (!allocList.isEmpty()) {
                            GiftEntry donationWithAmount = [SELECT Data_di_Competenza__c FROM GiftEntry WHERE Id = :donation.Id LIMIT 1];
                            Date dataDist = donationWithAmount.Data_di_Competenza__c != null
                                ? donationWithAmount.Data_di_Competenza__c
                                : Date.today();
                            allocationPayloads.add(new Map<String, Object>{
                                'transactionId' => transactionId,
                                'programId' => programId,
                                'dataDistribuzione' => String.valueOf(dataDist),
                                'allocazioni' => allocList
                            });
                        }
                    }
                }
                
                // Un solo Queueable per transazione (limite 1 con flow record-triggered)
                List<UpdateTransazioneShadowStaticQueueable.Payload> shadowPayloads = UpdateTransazioneShadowStaticInvocable.takePendingPayloads();
                Set<Id> txIdsForShadow = new Set<Id>();
                for (Map<String, Object> p : allocationPayloads) {
                    Object txId = p.get('transactionId');
                    if (txId instanceof Id) txIdsForShadow.add((Id) txId);
                    else if (txId instanceof String && String.isNotBlank((String) txId)) txIdsForShadow.add((Id) txId);
                }
                txIdsForShadow.addAll(descUpdateTxIds);
                List<Id> txIdsForShadowList = new List<Id>(txIdsForShadow);
                if (!allocationPayloads.isEmpty() || !descUpdateTxIds.isEmpty()) {
                    try {
                        System.enqueueJob(new CreateAllocationsQueueable(allocationPayloads, descUpdateTxIds, descUpdateTitles, shadowPayloads, txIdsForShadowList));
                    } catch (Exception eq) {
                        System.debug('Errore enqueue CreateAllocationsQueueable: ' + eq.getMessage());
                        UpdateTransazioneShadowStaticInvocable.enqueueShadowUpdates(shadowPayloads);
                    }
                } else if (!shadowPayloads.isEmpty()) {
                    UpdateTransazioneShadowStaticInvocable.enqueueShadowUpdates(shadowPayloads);
                } else if (!txIdsForShadowList.isEmpty()) {
                    try {
                        System.enqueueJob(new CreateAllocationsQueueable(new List<Map<String, Object>>(), new List<Id>(), new List<String>(), null, txIdsForShadowList));
                    } catch (Exception eq) {
                        System.debug('Errore enqueue CreateAllocationsQueueable (solo shadow batch): ' + eq.getMessage());
                    }
                }
                } finally {
                    DonationCreationContext.skipTransazioneShadowQueueable = false;
                }
            }
            
            result.put('success', true);
            result.put('createdDonationIds', createdDonationIds);
            result.put('createdCount', createdDonationIds.size());
            result.put('errors', errors);
            
        } catch (Exception e) {
            result.put('success', false);
            result.put('errorMessage', e.getMessage());
            result.put('createdDonationIds', createdDonationIds);
            result.put('createdCount', createdDonationIds.size());
            result.put('errors', errors);
        }
        
        return result;
    }
    
    /**
     * @description Metodo invocabile per Flow - crea donazioni
     */
    @InvocableMethod(label='Create Donations' description='Crea una o più donazioni con transazioni')
    public static List<CreateDonationsResult> createDonationsFromFlow(List<CreateDonationsRequest> requests) {
        List<CreateDonationsResult> results = new List<CreateDonationsResult>();
        
        for (CreateDonationsRequest request : requests) {
            Map<String, Object> result = createDonations(
                request.donationsData, 
                request.donorId, 
                request.donorName
            );
            
            CreateDonationsResult response = new CreateDonationsResult();
            response.success = (Boolean)result.get('success');
            response.createdDonationIds = (List<String>)result.get('createdDonationIds');
            response.createdCount = (Integer)result.get('createdCount');
            response.errorMessage = (String)result.get('errorMessage');
            response.errors = (List<String>)result.get('errors');
            
            results.add(response);
        }
        
        return results;
    }
    
    public class CreateDonationsRequest {
        @InvocableVariable(label='Donations Data JSON' required=true)
        public String donationsData;
        
        @InvocableVariable(label='Donor ID' required=true)
        public String donorId;
        
        @InvocableVariable(label='Donor Name' required=true)
        public String donorName;
    }
    
    public class CreateDonationsResult {
        @InvocableVariable(label='Success')
        public Boolean success;
        
        @InvocableVariable(label='Created Donation IDs')
        public List<String> createdDonationIds;
        
        @InvocableVariable(label='Created Count')
        public Integer createdCount;
        
        @InvocableVariable(label='Error Message')
        public String errorMessage;
        
        @InvocableVariable(label='Errors')
        public List<String> errors;
    }
    
    /**
     * @description Ottiene i donatori per un programma
     */
    @AuraEnabled
    public static List<Account> getDonorsForProgram(String programId, String recordTypeId) {
        List<Account> donors = new List<Account>();
        
        try {
            // Ottieni gli enrollments attivi per il programma
            List<ProgramEnrollment> enrollments = [
                SELECT AccountId 
                FROM ProgramEnrollment 
                WHERE ProgramId = :programId 
                AND IsActive = true
            ];
            
            Set<Id> accountIds = new Set<Id>();
            for (ProgramEnrollment enrollment : enrollments) {
                accountIds.add(enrollment.AccountId);
            }
            
            if (accountIds.isEmpty()) {
                return donors;
            }
            
            // Query per ottenere gli account
            String query = 'SELECT Id, Name, RecordType.DeveloperName, IsPersonAccount, PersonContact.FirstName, PersonContact.LastName ' +
                          'FROM Account ' +
                          'WHERE Id IN :accountIds ' +
                          'AND DEFAULT__c = false ' +
                          'AND GRATUITO__c = false';
            
            if (String.isNotBlank(recordTypeId)) {
                query += ' AND RecordTypeId = :recordTypeId';
            }
            
            query += ' ORDER BY Name ASC';
            
            donors = Database.query(query);
            
        } catch (Exception e) {
            throw new AuraHandledException('Errore nel caricamento dei donatori: ' + e.getMessage());
        }
        
        return donors;
    }
    
    /**
     * @description Ottiene i programmi attivi per popolare la tendina nel componente se avviato come Tab Standalone
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getActivePrograms() {
        List<Map<String, String>> options = new List<Map<String, String>>();
        for (Program p : [SELECT Id, Name FROM Program WHERE Status = 'Attivo' ORDER BY Name ASC]) {
            Map<String, String> option = new Map<String, String>();
            option.put('label', p.Name);
            option.put('value', p.Id);
            options.add(option);
        }
        return options;
    }
    
    /**
     * @description Ottiene i metodi di pagamento attivi (da picklist) se avviato come Tab Standalone
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getPaymentMethods() {
        List<Map<String, String>> options = new List<Map<String, String>>();
        Schema.DescribeFieldResult fieldResult = GiftEntry.PaymentMethod.getDescribe();
        List<Schema.PicklistEntry> ple = fieldResult.getPicklistValues();
        for(Schema.PicklistEntry pickListVal : ple) {
            if(pickListVal.isActive()) {
                Map<String, String> option = new Map<String, String>();
                option.put('label', pickListVal.getLabel());
                option.put('value', pickListVal.getValue());
                options.add(option);
            }
        }
        return options;
    }
    
    /**
     * Restituisce i budget (GiftDesignation) disponibili.
     * Solo quelli dove il Partner ha un ProgramEnrollment attivo sul Programma del budget.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getBudgets() {
        List<GiftDesignation> allGds = [
            SELECT Id, Name, Partner__r.Name, Partner__c, Program__c 
            FROM GiftDesignation 
            WHERE IsActive = true AND DEFAULT_PRG__c = false 
            ORDER BY Partner__r.Name ASC
        ];
        if (allGds.isEmpty()) return new List<Map<String, String>>();
        
        // Raggruppa per Programma per query efficiente
        Set<Id> programIds = new Set<Id>();
        for (GiftDesignation gd : allGds) {
            if (gd.Program__c != null) programIds.add(gd.Program__c);
        }
        
        // ProgramEnrollment attivi: (ProgramId, AccountId)
        Map<Id, Set<Id>> programToAccountIds = new Map<Id, Set<Id>>();
        for (ProgramEnrollment pe : [
            SELECT ProgramId, AccountId 
            FROM ProgramEnrollment 
            WHERE ProgramId IN :programIds AND IsActive = true AND AccountId != null
        ]) {
            if (!programToAccountIds.containsKey(pe.ProgramId)) {
                programToAccountIds.put(pe.ProgramId, new Set<Id>());
            }
            programToAccountIds.get(pe.ProgramId).add(pe.AccountId);
        }
        
        List<Map<String, String>> options = new List<Map<String, String>>();
        for (GiftDesignation gd : allGds) {
            Set<Id> enrolledAccounts = programToAccountIds.get(gd.Program__c);
            if (enrolledAccounts == null || !enrolledAccounts.contains(gd.Partner__c)) continue;
            
            Map<String, String> option = new Map<String, String>();
            String label = gd.Partner__r.Name != null ? gd.Partner__r.Name : gd.Name;
            option.put('label', label + ' (' + gd.Name + ')');
            option.put('value', gd.Id);
            option.put('programId', gd.Program__c);
            options.add(option);
        }
        return options;
    }
}