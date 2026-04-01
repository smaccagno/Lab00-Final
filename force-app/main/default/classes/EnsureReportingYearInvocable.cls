/**
 * Invocable che garantisce l'esistenza di Reporting_Year__c e Totali_Donatore_Anno__c
 * per una combinazione Donatore/Programma/Anno. Crea Donor_Overview, Reporting_Year
 * e Totali_Donatore_Anno quando mancanti.
 * Usato dal flow Assegna_Donatore_Anno quando il lookup Reporting_Year fallisce.
 */
public with sharing class EnsureReportingYearInvocable {
    @InvocableMethod(
        label='Ensure Reporting Year'
        description='Crea o recupera Reporting_Year e Totali_Donatore_Anno per Donatore/Programma/Anno'
    )
    public static List<Output> execute(List<Input> inputs) {
        List<Output> results = new List<Output>();
        if (inputs == null) {
            return results;
        }

        List<RequestCtx> validRequests = new List<RequestCtx>();
        Set<Id> donorIds = new Set<Id>();
        Set<Id> programIds = new Set<Id>();
        Set<String> years = new Set<String>();

        for (Integer i = 0; i < inputs.size(); i++) {
            Input inReq = inputs[i];
            Output out = new Output();
            out.success = false;
            results.add(out);

            if (inReq == null || String.isBlank(inReq.donorId) || String.isBlank(inReq.programId) || String.isBlank(inReq.yearText)) {
                out.message = 'Parametri mancanti: donorId, programId, yearText';
                continue;
            }

            Id donorId = parseId(inReq.donorId);
            Id programId = parseId(inReq.programId);
            String yearText = String.valueOf(inReq.yearText).trim();

            if (donorId == null || programId == null || String.isBlank(yearText)) {
                out.message = 'Parametri non validi: donorId, programId, yearText';
                continue;
            }

            RequestCtx req = new RequestCtx(i, donorId, programId, yearText);
            validRequests.add(req);
            donorIds.add(donorId);
            programIds.add(programId);
            years.add(yearText);
        }

        if (validRequests.isEmpty()) {
            return results;
        }

        Map<Id, Account> accountById = new Map<Id, Account>([
            SELECT Id, Name, IsPersonAccount, PersonContact.FirstName, PersonContact.LastName
            FROM Account
            WHERE Id IN :donorIds
        ]);
        Map<Id, Program> programById = new Map<Id, Program>([
            SELECT Id, Name
            FROM Program
            WHERE Id IN :programIds
        ]);

        List<RequestCtx> readyRequests = new List<RequestCtx>();
        for (RequestCtx req : validRequests) {
            if (!accountById.containsKey(req.donorId)) {
                setError(results, req.index, 'Donatore non trovato');
                continue;
            }
            if (!programById.containsKey(req.programId)) {
                setError(results, req.index, 'Programma non trovato');
                continue;
            }
            readyRequests.add(req);
        }

        if (readyRequests.isEmpty()) {
            return results;
        }

        Set<Id> readyDonorIds = new Set<Id>();
        Set<Id> readyProgramIds = new Set<Id>();
        Set<String> readyYears = new Set<String>();
        for (RequestCtx req : readyRequests) {
            readyDonorIds.add(req.donorId);
            readyProgramIds.add(req.programId);
            readyYears.add(req.yearText);
        }

        // Lock dei parent per ridurre race condition in creazione overview/anno.
        lockDonorsAndPrograms(readyDonorIds, readyProgramIds);

        Map<String, Id> overviewByKey = new Map<String, Id>();
        for (Donor_Overview__c ov : [
            SELECT Id, Account__c, Programma__c
            FROM Donor_Overview__c
            WHERE Account__c IN :readyDonorIds AND Programma__c IN :readyProgramIds
        ]) {
            overviewByKey.put(overviewKey(ov.Account__c, ov.Programma__c), ov.Id);
        }

        upsertMissingOverviews(readyRequests, accountById, programById, overviewByKey, results);

        Map<String, Id> annoByProgYear = new Map<String, Id>();
        for (Anno_Reportistica__c ar : [
            SELECT Id, Programma__c, Name
            FROM Anno_Reportistica__c
            WHERE Programma__c IN :readyProgramIds AND Name IN :readyYears
        ]) {
            annoByProgYear.put(programYearKey(ar.Programma__c, ar.Name), ar.Id);
        }

        upsertMissingAnni(readyRequests, annoByProgYear, results);

        // Lock dei riferimenti per ridurre race condition in creazione reporting year/totali.
        lockOverviewsAndYears(readyRequests, overviewByKey, annoByProgYear);

        Map<String, Reporting_Year__c> ryByCombo = new Map<String, Reporting_Year__c>();
        refreshReportingYears(readyRequests, ryByCombo);

        createMissingReportingYears(
            readyRequests,
            accountById,
            programById,
            overviewByKey,
            annoByProgYear,
            ryByCombo,
            results
        );

        ensureMissingTotaliForExistingRy(
            readyRequests,
            accountById,
            programById,
            overviewByKey,
            ryByCombo,
            results
        );

        for (RequestCtx req : validRequests) {
            Output out = results[req.index];
            Reporting_Year__c ry = ryByCombo.get(req.comboKey());
            Id ovId = overviewByKey.get(req.overviewKey());
            if (ry == null || ovId == null) {
                if (String.isBlank(out.message)) {
                    setError(results, req.index, 'Impossibile creare o recuperare Reporting_Year');
                }
                continue;
            }

            out.success = true;
            out.message = 'OK';
            out.reportingYearId = String.valueOf(ry.Id);
            out.overviewDonatoreId = String.valueOf(ovId);
        }

        return results;
    }

    private static void upsertMissingOverviews(
        List<RequestCtx> requests,
        Map<Id, Account> accountById,
        Map<Id, Program> programById,
        Map<String, Id> overviewByKey,
        List<Output> results
    ) {
        List<Donor_Overview__c> toInsert = new List<Donor_Overview__c>();
        List<String> keyByInsertIndex = new List<String>();
        Set<String> queued = new Set<String>();

        for (RequestCtx req : requests) {
            String key = req.overviewKey();
            if (overviewByKey.containsKey(key) || queued.contains(key)) {
                continue;
            }
            Account acc = accountById.get(req.donorId);
            Program prog = programById.get(req.programId);
            String label = getAccountLabel(acc);
            toInsert.add(
                new Donor_Overview__c(
                    Account__c = req.donorId,
                    Programma__c = req.programId,
                    Name = 'Overview - ' + label + ' - ' + prog.Name
                )
            );
            keyByInsertIndex.add(key);
            queued.add(key);
        }

        if (toInsert.isEmpty()) {
            return;
        }

        Database.SaveResult[] saveRes = Database.insert(toInsert, false);
        Map<String, String> errorByKey = new Map<String, String>();
        for (Integer i = 0; i < saveRes.size(); i++) {
            String key = keyByInsertIndex[i];
            if (saveRes[i].isSuccess()) {
                overviewByKey.put(key, saveRes[i].getId());
            } else if (!errorByKey.containsKey(key)) {
                errorByKey.put(key, saveRes[i].getErrors()[0].getMessage());
            }
        }

        // Recupera eventuali record creati in parallelo da altre transazioni.
        Set<Id> accountIds = new Set<Id>();
        Set<Id> programIds = new Set<Id>();
        for (RequestCtx req : requests) {
            if (!overviewByKey.containsKey(req.overviewKey())) {
                accountIds.add(req.donorId);
                programIds.add(req.programId);
            }
        }
        if (!accountIds.isEmpty() && !programIds.isEmpty()) {
            for (Donor_Overview__c ov : [
                SELECT Id, Account__c, Programma__c
                FROM Donor_Overview__c
                WHERE Account__c IN :accountIds AND Programma__c IN :programIds
            ]) {
                overviewByKey.put(overviewKey(ov.Account__c, ov.Programma__c), ov.Id);
            }
        }

        for (RequestCtx req : requests) {
            if (!overviewByKey.containsKey(req.overviewKey()) && errorByKey.containsKey(req.overviewKey())) {
                setError(results, req.index, 'Errore creazione Donor_Overview: ' + errorByKey.get(req.overviewKey()));
            }
        }
    }

    private static void upsertMissingAnni(
        List<RequestCtx> requests,
        Map<String, Id> annoByProgYear,
        List<Output> results
    ) {
        List<Anno_Reportistica__c> toInsert = new List<Anno_Reportistica__c>();
        List<String> keyByInsertIndex = new List<String>();
        Set<String> queued = new Set<String>();

        for (RequestCtx req : requests) {
            String key = req.programYearKey();
            if (annoByProgYear.containsKey(key) || queued.contains(key)) {
                continue;
            }
            toInsert.add(
                new Anno_Reportistica__c(
                    Programma__c = req.programId,
                    Name = req.yearText
                )
            );
            keyByInsertIndex.add(key);
            queued.add(key);
        }

        if (toInsert.isEmpty()) {
            return;
        }

        Database.SaveResult[] saveRes = Database.insert(toInsert, false);
        Map<String, String> errorByKey = new Map<String, String>();
        for (Integer i = 0; i < saveRes.size(); i++) {
            String key = keyByInsertIndex[i];
            if (saveRes[i].isSuccess()) {
                annoByProgYear.put(key, saveRes[i].getId());
            } else if (!errorByKey.containsKey(key)) {
                errorByKey.put(key, saveRes[i].getErrors()[0].getMessage());
            }
        }

        // Recupera eventuali record creati in parallelo da altre transazioni.
        Set<Id> programIds = new Set<Id>();
        Set<String> yearTexts = new Set<String>();
        for (RequestCtx req : requests) {
            if (!annoByProgYear.containsKey(req.programYearKey())) {
                programIds.add(req.programId);
                yearTexts.add(req.yearText);
            }
        }
        if (!programIds.isEmpty() && !yearTexts.isEmpty()) {
            for (Anno_Reportistica__c ar : [
                SELECT Id, Programma__c, Name
                FROM Anno_Reportistica__c
                WHERE Programma__c IN :programIds AND Name IN :yearTexts
            ]) {
                annoByProgYear.put(programYearKey(ar.Programma__c, ar.Name), ar.Id);
            }
        }

        for (RequestCtx req : requests) {
            if (!annoByProgYear.containsKey(req.programYearKey()) && errorByKey.containsKey(req.programYearKey())) {
                setError(results, req.index, 'Errore creazione Anno_Reportistica: ' + errorByKey.get(req.programYearKey()));
            }
        }
    }

    private static void createMissingReportingYears(
        List<RequestCtx> requests,
        Map<Id, Account> accountById,
        Map<Id, Program> programById,
        Map<String, Id> overviewByKey,
        Map<String, Id> annoByProgYear,
        Map<String, Reporting_Year__c> ryByCombo,
        List<Output> results
    ) {
        List<PendingCreateRy> pending = new List<PendingCreateRy>();
        Set<String> queuedCombos = new Set<String>();

        for (RequestCtx req : requests) {
            if (ryByCombo.containsKey(req.comboKey()) || queuedCombos.contains(req.comboKey())) {
                continue;
            }
            if (String.isNotBlank(results[req.index].message) && results[req.index].success == false) {
                continue;
            }

            Id ovId = overviewByKey.get(req.overviewKey());
            Id annoId = annoByProgYear.get(req.programYearKey());
            if (ovId == null || annoId == null) {
                setError(results, req.index, 'Mancano Donor_Overview o Anno_Reportistica per creare Reporting_Year');
                continue;
            }

            Account acc = accountById.get(req.donorId);
            Program prog = programById.get(req.programId);
            String expectedRyName = getAccountLabel(acc) + ' - ' + prog.Name + ' - ' + req.yearText;
            String expectedTotName = 'Totali ' + expectedRyName;

            pending.add(new PendingCreateRy(req, ovId, annoId, expectedRyName, expectedTotName));
            queuedCombos.add(req.comboKey());
        }

        if (pending.isEmpty()) {
            return;
        }

        List<Totali_Donatore_Anno__c> totalsToInsert = new List<Totali_Donatore_Anno__c>();
        for (PendingCreateRy p : pending) {
            totalsToInsert.add(
                new Totali_Donatore_Anno__c(
                    Name = p.expectedTotName,
                    Donatore_Programma__c = p.overviewId,
                    Donatore__c = p.req.donorId
                )
            );
        }

        Database.SaveResult[] totRes = Database.insert(totalsToInsert, false);
        List<Reporting_Year__c> ryToInsert = new List<Reporting_Year__c>();
        List<RequestCtx> reqByRyInsert = new List<RequestCtx>();
        for (Integer i = 0; i < totRes.size(); i++) {
            PendingCreateRy p = pending[i];
            if (!totRes[i].isSuccess()) {
                setError(results, p.req.index, 'Errore creazione Totali_Donatore_Anno: ' + totRes[i].getErrors()[0].getMessage());
                continue;
            }
            ryToInsert.add(
                new Reporting_Year__c(
                    Name = p.expectedRyName,
                    Donor_Overview__c = p.overviewId,
                    Anno__c = p.annoId,
                    Account__c = p.req.donorId,
                    Programma__c = p.req.programId,
                    Year__c = p.req.yearText,
                    Totali_Donatore_Anno__c = totRes[i].getId()
                )
            );
            reqByRyInsert.add(p.req);
        }

        if (ryToInsert.isEmpty()) {
            return;
        }

        Database.SaveResult[] ryRes = Database.insert(ryToInsert, false);
        for (Integer i = 0; i < ryRes.size(); i++) {
            RequestCtx req = reqByRyInsert[i];
            if (ryRes[i].isSuccess()) {
                Reporting_Year__c created = ryToInsert[i];
                created.Id = ryRes[i].getId();
                ryByCombo.put(req.comboKey(), created);
            } else {
                setError(results, req.index, 'Errore creazione Reporting_Year: ' + ryRes[i].getErrors()[0].getMessage());
            }
        }

        // Recupera eventuali Reporting_Year creati in parallelo.
        refreshReportingYears(requests, ryByCombo);
    }

    private static void ensureMissingTotaliForExistingRy(
        List<RequestCtx> requests,
        Map<Id, Account> accountById,
        Map<Id, Program> programById,
        Map<String, Id> overviewByKey,
        Map<String, Reporting_Year__c> ryByCombo,
        List<Output> results
    ) {
        List<RequestCtx> toFix = new List<RequestCtx>();
        Set<String> queuedCombos = new Set<String>();
        for (RequestCtx req : requests) {
            Reporting_Year__c ry = ryByCombo.get(req.comboKey());
            if (ry == null || ry.Totali_Donatore_Anno__c != null || queuedCombos.contains(req.comboKey())) {
                continue;
            }
            if (String.isNotBlank(results[req.index].message) && results[req.index].success == false) {
                continue;
            }
            toFix.add(req);
            queuedCombos.add(req.comboKey());
        }

        if (toFix.isEmpty()) {
            return;
        }

        List<Totali_Donatore_Anno__c> totalsToInsert = new List<Totali_Donatore_Anno__c>();
        List<RequestCtx> reqByTotIndex = new List<RequestCtx>();
        for (RequestCtx req : toFix) {
            Id ovId = overviewByKey.get(req.overviewKey());
            if (ovId == null) {
                setError(results, req.index, 'Donor_Overview mancante per Reporting_Year esistente');
                continue;
            }

            Account acc = accountById.get(req.donorId);
            Program prog = programById.get(req.programId);
            String expectedRyName = getAccountLabel(acc) + ' - ' + prog.Name + ' - ' + req.yearText;
            totalsToInsert.add(
                new Totali_Donatore_Anno__c(
                    Name = 'Totali ' + expectedRyName,
                    Donatore_Programma__c = ovId,
                    Donatore__c = req.donorId
                )
            );
            reqByTotIndex.add(req);
        }

        if (totalsToInsert.isEmpty()) {
            return;
        }

        Database.SaveResult[] totRes = Database.insert(totalsToInsert, false);
        List<Reporting_Year__c> ryToUpdate = new List<Reporting_Year__c>();
        List<RequestCtx> reqByRyUpdate = new List<RequestCtx>();
        for (Integer i = 0; i < totRes.size(); i++) {
            RequestCtx req = reqByTotIndex[i];
            if (!totRes[i].isSuccess()) {
                setError(results, req.index, 'Errore creazione Totali_Donatore_Anno: ' + totRes[i].getErrors()[0].getMessage());
                continue;
            }

            Reporting_Year__c ry = ryByCombo.get(req.comboKey());
            if (ry == null) continue;
            ryToUpdate.add(new Reporting_Year__c(Id = ry.Id, Totali_Donatore_Anno__c = totRes[i].getId()));
            reqByRyUpdate.add(req);
        }

        if (ryToUpdate.isEmpty()) {
            return;
        }

        Database.SaveResult[] updRes = Database.update(ryToUpdate, false);
        for (Integer i = 0; i < updRes.size(); i++) {
            RequestCtx req = reqByRyUpdate[i];
            if (!updRes[i].isSuccess()) {
                setError(results, req.index, 'Errore update Reporting_Year: ' + updRes[i].getErrors()[0].getMessage());
                continue;
            }
            Reporting_Year__c ry = ryByCombo.get(req.comboKey());
            if (ry != null) {
                ry.Totali_Donatore_Anno__c = ryToUpdate[i].Totali_Donatore_Anno__c;
            }
        }
    }

    private static Id parseId(String raw) {
        if (String.isBlank(raw)) return null;
        try {
            return (Id) raw;
        } catch (Exception ex) {
            return null;
        }
    }

    private static void setError(List<Output> results, Integer index, String message) {
        if (index == null || index < 0 || index >= results.size()) return;
        Output out = results[index];
        out.success = false;
        if (String.isBlank(out.message)) {
            out.message = message;
        }
    }

    private static void lockDonorsAndPrograms(Set<Id> donorIds, Set<Id> programIds) {
        if (donorIds != null && !donorIds.isEmpty()) {
            List<Account> locksA = [SELECT Id FROM Account WHERE Id IN :donorIds FOR UPDATE];
            System.debug(LoggingLevel.FINE, 'EnsureReportingYearInvocable lock Account rows: ' + locksA.size());
        }
        if (programIds != null && !programIds.isEmpty()) {
            List<Program> locksP = [SELECT Id FROM Program WHERE Id IN :programIds FOR UPDATE];
            System.debug(LoggingLevel.FINE, 'EnsureReportingYearInvocable lock Program rows: ' + locksP.size());
        }
    }

    private static void lockOverviewsAndYears(
        List<RequestCtx> requests,
        Map<String, Id> overviewByKey,
        Map<String, Id> annoByProgYear
    ) {
        Set<Id> overviewIds = new Set<Id>();
        Set<Id> annoIds = new Set<Id>();
        for (RequestCtx req : requests) {
            Id ovId = overviewByKey.get(req.overviewKey());
            Id annoId = annoByProgYear.get(req.programYearKey());
            if (ovId != null) overviewIds.add(ovId);
            if (annoId != null) annoIds.add(annoId);
        }
        if (!overviewIds.isEmpty()) {
            List<Donor_Overview__c> locksOv = [SELECT Id FROM Donor_Overview__c WHERE Id IN :overviewIds FOR UPDATE];
            System.debug(LoggingLevel.FINE, 'EnsureReportingYearInvocable lock Donor_Overview rows: ' + locksOv.size());
        }
        if (!annoIds.isEmpty()) {
            List<Anno_Reportistica__c> locksAr = [SELECT Id FROM Anno_Reportistica__c WHERE Id IN :annoIds FOR UPDATE];
            System.debug(LoggingLevel.FINE, 'EnsureReportingYearInvocable lock Anno_Reportistica rows: ' + locksAr.size());
        }
    }

    private static void refreshReportingYears(
        List<RequestCtx> requests,
        Map<String, Reporting_Year__c> ryByCombo
    ) {
        Set<Id> donorIds = new Set<Id>();
        Set<Id> programIds = new Set<Id>();
        Set<String> years = new Set<String>();
        for (RequestCtx req : requests) {
            donorIds.add(req.donorId);
            programIds.add(req.programId);
            years.add(req.yearText);
        }
        if (donorIds.isEmpty() || programIds.isEmpty() || years.isEmpty()) return;
        for (Reporting_Year__c ry : [
            SELECT Id, Account__c, Programma__c, Year__c, Donor_Overview__c, Totali_Donatore_Anno__c
            FROM Reporting_Year__c
            WHERE Account__c IN :donorIds
              AND Programma__c IN :programIds
              AND Year__c IN :years
        ]) {
            String key = comboKey(ry.Account__c, ry.Programma__c, ry.Year__c);
            if (!ryByCombo.containsKey(key)) {
                ryByCombo.put(key, ry);
            }
        }
    }

    private static String getAccountLabel(Account acc) {
        if (acc == null) return '';
        if (acc.IsPersonAccount) {
            String firstName = acc.PersonContact != null ? acc.PersonContact.FirstName : null;
            String lastName = acc.PersonContact != null ? acc.PersonContact.LastName : null;
            String fullName = ((firstName != null ? firstName : '') + ' ' + (lastName != null ? lastName : '')).trim();
            if (String.isNotBlank(fullName)) {
                return fullName;
            }
        }
        return acc.Name != null ? acc.Name : '';
    }

    private static String comboKey(Id donorId, Id programId, String yearText) {
        return String.valueOf(donorId) + '|' + String.valueOf(programId) + '|' + yearText;
    }

    private static String overviewKey(Id donorId, Id programId) {
        return String.valueOf(donorId) + '|' + String.valueOf(programId);
    }

    private static String programYearKey(Id programId, String yearText) {
        return String.valueOf(programId) + '|' + yearText;
    }

    private class RequestCtx {
        Integer index;
        Id donorId;
        Id programId;
        String yearText;

        RequestCtx(Integer index, Id donorId, Id programId, String yearText) {
            this.index = index;
            this.donorId = donorId;
            this.programId = programId;
            this.yearText = yearText;
        }

        String comboKey() {
            return EnsureReportingYearInvocable.comboKey(donorId, programId, yearText);
        }

        String overviewKey() {
            return EnsureReportingYearInvocable.overviewKey(donorId, programId);
        }

        String programYearKey() {
            return EnsureReportingYearInvocable.programYearKey(programId, yearText);
        }
    }

    private class PendingCreateRy {
        RequestCtx req;
        Id overviewId;
        Id annoId;
        String expectedRyName;
        String expectedTotName;

        PendingCreateRy(RequestCtx req, Id overviewId, Id annoId, String expectedRyName, String expectedTotName) {
            this.req = req;
            this.overviewId = overviewId;
            this.annoId = annoId;
            this.expectedRyName = expectedRyName;
            this.expectedTotName = expectedTotName;
        }
    }

    public class Input {
        @InvocableVariable(label='Donor Id (Account)' required=true)
        public String donorId;
        @InvocableVariable(label='Program Id' required=true)
        public String programId;
        @InvocableVariable(label='Year (text, es. 2026)' required=true)
        public String yearText;
    }

    public class Output {
        @InvocableVariable(label='Reporting Year Id')
        public String reportingYearId;
        @InvocableVariable(label='Overview Donatore Id')
        public String overviewDonatoreId;
        @InvocableVariable(label='Success')
        public Boolean success;
        @InvocableVariable(label='Message')
        public String message;
    }
}