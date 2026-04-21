public with sharing class BudgetAppDashboardController {
    public class DashboardData {
        @AuraEnabled public Id accountId;
        @AuraEnabled public List<GiftDesignation> programs;
    }

    @AuraEnabled(cacheable=true)
    public static DashboardData getDashboardData() {
        DashboardData data = new DashboardData();
        List<Account> accs = [SELECT Id FROM Account WHERE Name = 'Lab00' LIMIT 1];
        if (!accs.isEmpty()) {
            data.accountId = accs[0].Id;
            data.programs = [SELECT Id, Name, Program__r.Name FROM GiftDesignation WHERE Partner__c = :data.accountId ORDER BY Program__r.Name];
        }
        return data;
    }

    public class YearSummary {
        @AuraEnabled public String anno;
        @AuraEnabled public String tipo;
        @AuraEnabled public String categoria;
        @AuraEnabled public Decimal previsto;
        @AuraEnabled public Decimal effettivo;
        
        public YearSummary(String anno, String tipo, String categoria) {
            this.anno = anno;
            this.tipo = tipo;
            this.categoria = categoria;
            this.previsto = 0;
            this.effettivo = 0;
        }
    }

    public class ProgramItem {
        @AuraEnabled public Id programId;
        @AuraEnabled public Id budgetYearId;
        @AuraEnabled public String anno;
        @AuraEnabled public String tipo;
        @AuraEnabled public String categoria;
        @AuraEnabled public String stato;
        @AuraEnabled public Decimal ammontare;
        @AuraEnabled public Date itemDate;

        public ProgramItem(Id programId, Id budgetYearId, String anno, String tipo, String categoria, String stato, Decimal ammontare, Date itemDate) {
            this.programId = programId;
            this.budgetYearId = budgetYearId;
            this.anno = anno;
            this.tipo = tipo;
            this.categoria = categoria;
            this.stato = stato;
            this.ammontare = ammontare;
            this.itemDate = itemDate;
        }
    }

    public class ScaleValues {
        @AuraEnabled public Decimal maxIncassiVal;
        @AuraEnabled public Decimal maxSpeseVal;
        @AuraEnabled public Decimal maxCashFlowVal;
        @AuraEnabled public Decimal maxGlobalVal;

        public ScaleValues() {
            this.maxIncassiVal = 0;
            this.maxSpeseVal = 0;
            this.maxCashFlowVal = 0;
            this.maxGlobalVal = 0;
        }
    }

    @AuraEnabled(cacheable=true)
    public static ScaleValues getProgramsScaleValues(Id accountId, String selectedDateStr) {
        ScaleValues result = new ScaleValues();
        if (accountId == null) return result;

        Date filterDate = parseDate(selectedDateStr);

        Map<String, BudgetAggregator.AmountPair> incassiByProgramCategory = new Map<String, BudgetAggregator.AmountPair>();
        Map<String, BudgetAggregator.AmountPair> speseByProgramCategory = new Map<String, BudgetAggregator.AmountPair>();
        Map<Id, BudgetAggregator.AmountPair> incassiTotalsByProgram = new Map<Id, BudgetAggregator.AmountPair>();
        Map<Id, BudgetAggregator.AmountPair> speseTotalsByProgram = new Map<Id, BudgetAggregator.AmountPair>();

        for (Voce_di_Incasso__c vi : [
            SELECT Categoria__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__r.Budget__c
            FROM Voce_di_Incasso__c
            WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :accountId
        ]) {
            Id programId = vi.Overview_Budget_per_Anno__r.Budget__c;
            if (programId == null) continue;
            if (!BudgetAggregator.isInDateScope(vi.Data__c, filterDate)) continue;

            String categoria = BudgetAggregator.normalizeCategoria(vi.Categoria__c);
            String key = String.valueOf(programId) + '::' + categoria;
            if (!incassiByProgramCategory.containsKey(key)) {
                incassiByProgramCategory.put(key, new BudgetAggregator.AmountPair());
            }
            if (!incassiTotalsByProgram.containsKey(programId)) {
                incassiTotalsByProgram.put(programId, new BudgetAggregator.AmountPair());
            }
            BudgetAggregator.accumulate(incassiByProgramCategory.get(key), vi.Stato__c, vi.Stato_Precedente__c, vi.Ammontare__c);
            BudgetAggregator.accumulate(incassiTotalsByProgram.get(programId), vi.Stato__c, vi.Stato_Precedente__c, vi.Ammontare__c);
        }

        for (Voce_di_Spesa__c vs : [
            SELECT Categoria__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__r.Budget__c
            FROM Voce_di_Spesa__c
            WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :accountId
        ]) {
            Id programId = vs.Overview_Budget_per_Anno__r.Budget__c;
            if (programId == null) continue;
            if (!BudgetAggregator.isInDateScope(vs.Data__c, filterDate)) continue;

            String categoria = BudgetAggregator.normalizeCategoria(vs.Categoria__c);
            String key = String.valueOf(programId) + '::' + categoria;
            if (!speseByProgramCategory.containsKey(key)) {
                speseByProgramCategory.put(key, new BudgetAggregator.AmountPair());
            }
            if (!speseTotalsByProgram.containsKey(programId)) {
                speseTotalsByProgram.put(programId, new BudgetAggregator.AmountPair());
            }
            BudgetAggregator.accumulate(speseByProgramCategory.get(key), vs.Stato__c, vs.Stato_Precedente__c, vs.Ammontare__c);
            BudgetAggregator.accumulate(speseTotalsByProgram.get(programId), vs.Stato__c, vs.Stato_Precedente__c, vs.Ammontare__c);
        }

        for (BudgetAggregator.AmountPair pair : incassiByProgramCategory.values()) {
            BudgetAggregator.finalizePair(pair);
            result.maxIncassiVal = Math.max(result.maxIncassiVal, Math.max(pair.effettivo, pair.previsto));
        }

        for (BudgetAggregator.AmountPair pair : speseByProgramCategory.values()) {
            BudgetAggregator.finalizePair(pair);
            result.maxSpeseVal = Math.max(result.maxSpeseVal, Math.max(pair.effettivo, pair.previsto));
        }

        Set<Id> programIds = new Set<Id>();
        programIds.addAll(incassiTotalsByProgram.keySet());
        programIds.addAll(speseTotalsByProgram.keySet());
        for (Id programId : programIds) {
            BudgetAggregator.AmountPair inc = incassiTotalsByProgram.containsKey(programId) ? incassiTotalsByProgram.get(programId) : new BudgetAggregator.AmountPair();
            BudgetAggregator.AmountPair spe = speseTotalsByProgram.containsKey(programId) ? speseTotalsByProgram.get(programId) : new BudgetAggregator.AmountPair();
            BudgetAggregator.finalizePair(inc);
            BudgetAggregator.finalizePair(spe);

            Decimal dispEff = inc.effettivo - spe.effettivo;
            Decimal dispPrev = inc.previsto - spe.previsto;
            Decimal maxCashForProgram = Math.max(
                Math.max(inc.effettivo, inc.previsto),
                Math.max(Math.max(spe.effettivo, spe.previsto), Math.max(Math.abs(dispEff), Math.abs(dispPrev)))
            );
            result.maxCashFlowVal = Math.max(result.maxCashFlowVal, maxCashForProgram);
        }

        result.maxGlobalVal = Math.max(result.maxIncassiVal, Math.max(result.maxSpeseVal, result.maxCashFlowVal));

        return result;
    }

    private static Date parseDate(String selectedDateStr) {
        if (String.isBlank(selectedDateStr)) return null;
        try { return Date.valueOf(selectedDateStr); } catch (Exception e) { return null; }
    }

    public class ProgramKpi {
        @AuraEnabled public Id programId;
        @AuraEnabled public Decimal incassiTotale;
        @AuraEnabled public Decimal speseTotale;
        @AuraEnabled public Decimal avanzamentoIncassi;
        @AuraEnabled public Decimal avanzamentoSpese;
    }

    @AuraEnabled(cacheable=true)
    public static List<ProgramKpi> getProgramsKpis(Id accountId, String selectedDateStr) {
        List<ProgramKpi> result = new List<ProgramKpi>();
        if (accountId == null) return result;

        Date filterDate = parseDate(selectedDateStr);
        Map<Id, BudgetAggregator.AmountPair> incByProgram = new Map<Id, BudgetAggregator.AmountPair>();
        Map<Id, BudgetAggregator.AmountPair> speByProgram = new Map<Id, BudgetAggregator.AmountPair>();

        for (Voce_di_Incasso__c vi : [
            SELECT Stato__c, Stato_Precedente__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__r.Budget__c
            FROM Voce_di_Incasso__c
            WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :accountId
        ]) {
            Id pid = vi.Overview_Budget_per_Anno__r.Budget__c;
            if (pid == null) continue;
            if (!BudgetAggregator.isInDateScope(vi.Data__c, filterDate)) continue;
            if (!incByProgram.containsKey(pid)) incByProgram.put(pid, new BudgetAggregator.AmountPair());
            BudgetAggregator.accumulate(incByProgram.get(pid), vi.Stato__c, vi.Stato_Precedente__c, vi.Ammontare__c);
        }

        for (Voce_di_Spesa__c vs : [
            SELECT Stato__c, Stato_Precedente__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__r.Budget__c
            FROM Voce_di_Spesa__c
            WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :accountId
        ]) {
            Id pid = vs.Overview_Budget_per_Anno__r.Budget__c;
            if (pid == null) continue;
            if (!BudgetAggregator.isInDateScope(vs.Data__c, filterDate)) continue;
            if (!speByProgram.containsKey(pid)) speByProgram.put(pid, new BudgetAggregator.AmountPair());
            BudgetAggregator.accumulate(speByProgram.get(pid), vs.Stato__c, vs.Stato_Precedente__c, vs.Ammontare__c);
        }

        Set<Id> allPrograms = new Set<Id>();
        allPrograms.addAll(incByProgram.keySet());
        allPrograms.addAll(speByProgram.keySet());

        for (Id pid : allPrograms) {
            BudgetAggregator.AmountPair inc = incByProgram.containsKey(pid) ? incByProgram.get(pid) : new BudgetAggregator.AmountPair();
            BudgetAggregator.AmountPair spe = speByProgram.containsKey(pid) ? speByProgram.get(pid) : new BudgetAggregator.AmountPair();
            BudgetAggregator.finalizePair(inc);
            BudgetAggregator.finalizePair(spe);

            ProgramKpi k = new ProgramKpi();
            k.programId = pid;
            k.incassiTotale = inc.totale;
            k.speseTotale = spe.totale;
            k.avanzamentoIncassi = inc.totale > 0 ? (inc.effettivo / inc.totale) * 100 : 0;
            k.avanzamentoSpese = spe.totale > 0 ? (spe.effettivo / spe.totale) * 100 : 0;
            result.add(k);
        }

        return result;
    }

    public class DashboardKpis {
        @AuraEnabled public Decimal incassiEffettivo;
        @AuraEnabled public Decimal incassiPrevisto;
        @AuraEnabled public Decimal incassiTotale;
        @AuraEnabled public Decimal speseEffettivo;
        @AuraEnabled public Decimal spesePrevisto;
        @AuraEnabled public Decimal speseTotale;
        @AuraEnabled public Decimal cashFlowEffettivo;
        @AuraEnabled public Decimal cashFlowPrevisto;
        @AuraEnabled public Decimal cashFlowTotale;
        @AuraEnabled public Decimal avanzamentoIncassi;
        @AuraEnabled public Decimal avanzamentoSpese;

        public DashboardKpis() {
            this.incassiEffettivo = 0; this.incassiPrevisto = 0; this.incassiTotale = 0;
            this.speseEffettivo = 0; this.spesePrevisto = 0; this.speseTotale = 0;
            this.cashFlowEffettivo = 0; this.cashFlowPrevisto = 0; this.cashFlowTotale = 0;
            this.avanzamentoIncassi = 0; this.avanzamentoSpese = 0;
        }
    }

    @AuraEnabled(cacheable=true)
    public static DashboardKpis getDashboardKpis(Id accountId, String selectedDateStr) {
        DashboardKpis kpis = new DashboardKpis();
        if (accountId == null) return kpis;

        Date filterDate = parseDate(selectedDateStr);
        BudgetAggregator.AmountPair inc = new BudgetAggregator.AmountPair();
        BudgetAggregator.AmountPair spe = new BudgetAggregator.AmountPair();

        for (Voce_di_Incasso__c vi : [
            SELECT Stato__c, Stato_Precedente__c, Ammontare__c, Data__c
            FROM Voce_di_Incasso__c
            WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :accountId
        ]) {
            if (!BudgetAggregator.isInDateScope(vi.Data__c, filterDate)) continue;
            BudgetAggregator.accumulate(inc, vi.Stato__c, vi.Stato_Precedente__c, vi.Ammontare__c);
        }
        BudgetAggregator.finalizePair(inc);

        for (Voce_di_Spesa__c vs : [
            SELECT Stato__c, Stato_Precedente__c, Ammontare__c, Data__c
            FROM Voce_di_Spesa__c
            WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :accountId
        ]) {
            if (!BudgetAggregator.isInDateScope(vs.Data__c, filterDate)) continue;
            BudgetAggregator.accumulate(spe, vs.Stato__c, vs.Stato_Precedente__c, vs.Ammontare__c);
        }
        BudgetAggregator.finalizePair(spe);

        kpis.incassiEffettivo = inc.effettivo;
        kpis.incassiPrevisto = inc.previsto;
        kpis.incassiTotale = inc.totale;
        kpis.speseEffettivo = spe.effettivo;
        kpis.spesePrevisto = spe.previsto;
        kpis.speseTotale = spe.totale;
        kpis.cashFlowEffettivo = inc.effettivo - spe.effettivo;
        kpis.cashFlowPrevisto = inc.previsto - spe.previsto;
        kpis.cashFlowTotale = inc.totale - spe.totale;

        // Avanzamento = effettivo / (previsto + effettivo) se il budget totale e' > 0
        if (inc.totale > 0) {
            kpis.avanzamentoIncassi = (inc.effettivo / inc.totale) * 100;
        }
        if (spe.totale > 0) {
            kpis.avanzamentoSpese = (spe.effettivo / spe.totale) * 100;
        }

        return kpis;
    }

    @AuraEnabled(cacheable=true)
    public static List<ProgramItem> getProgramItems(Id programId, Id accountId) {
        List<ProgramItem> items = new List<ProgramItem>();
        if (programId == null && accountId == null) return items;

        List<Voce_di_Incasso__c> incassi = programId != null
            ? [
                SELECT Categoria__c, Stato__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__c, Overview_Budget_per_Anno__r.Anno__c, Overview_Budget_per_Anno__r.Budget__c
                FROM Voce_di_Incasso__c
                WHERE Overview_Budget_per_Anno__r.Budget__c = :programId
            ]
            : [
                SELECT Categoria__c, Stato__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__c, Overview_Budget_per_Anno__r.Anno__c, Overview_Budget_per_Anno__r.Budget__c
                FROM Voce_di_Incasso__c
                WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :accountId
            ];

        for (Voce_di_Incasso__c vi : incassi) {
            String anno = vi.Overview_Budget_per_Anno__r.Anno__c;
            if (String.isBlank(anno)) anno = 'N/A';
            String categoria = vi.Categoria__c;
            if (String.isBlank(categoria)) categoria = 'Non categorizzato';
            String stato = vi.Stato__c;
            Decimal ammontare = vi.Ammontare__c != null ? vi.Ammontare__c : 0;
            items.add(new ProgramItem(vi.Overview_Budget_per_Anno__r.Budget__c, vi.Overview_Budget_per_Anno__c, anno, 'Incasso', categoria, stato, ammontare, vi.Data__c));
        }

        List<Voce_di_Spesa__c> spese = programId != null
            ? [
                SELECT Categoria__c, Stato__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__c, Overview_Budget_per_Anno__r.Anno__c, Overview_Budget_per_Anno__r.Budget__c
                FROM Voce_di_Spesa__c
                WHERE Overview_Budget_per_Anno__r.Budget__c = :programId
            ]
            : [
                SELECT Categoria__c, Stato__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__c, Overview_Budget_per_Anno__r.Anno__c, Overview_Budget_per_Anno__r.Budget__c
                FROM Voce_di_Spesa__c
                WHERE Overview_Budget_per_Anno__r.Budget__r.Partner__c = :accountId
            ];

        for (Voce_di_Spesa__c vs : spese) {
            String anno = vs.Overview_Budget_per_Anno__r.Anno__c;
            if (String.isBlank(anno)) anno = 'N/A';
            String categoria = String.isNotBlank(vs.Categoria__c) ? vs.Categoria__c : 'Non categorizzato';
            String stato = vs.Stato__c;
            Decimal ammontare = vs.Ammontare__c != null ? vs.Ammontare__c : 0;
            items.add(new ProgramItem(vs.Overview_Budget_per_Anno__r.Budget__c, vs.Overview_Budget_per_Anno__c, anno, 'Spesa', categoria, stato, ammontare, vs.Data__c));
        }

        return items;
    }

    public class ViewerOptions {
        @AuraEnabled public List<Map<String, String>> programs;
        @AuraEnabled public List<String> anni;
        @AuraEnabled public List<String> categorieIncasso;
        @AuraEnabled public List<String> categorieSpesa;
        @AuraEnabled public Map<String, List<String>> sottocategorieByCategoria;

        public ViewerOptions() {
            this.programs = new List<Map<String, String>>();
            this.anni = new List<String>();
            this.categorieIncasso = new List<String>();
            this.categorieSpesa = new List<String>();
            this.sottocategorieByCategoria = new Map<String, List<String>>();
        }
    }

    @AuraEnabled(cacheable=true)
    public static ViewerOptions getViewerOptions() {
        ViewerOptions opts = new ViewerOptions();

        // Programs of the Lab00 partner.
        List<Account> accs = [SELECT Id FROM Account WHERE Name = 'Lab00' LIMIT 1];
        if (!accs.isEmpty()) {
            for (GiftDesignation gd : [
                SELECT Id, Name, Program__r.Name
                FROM GiftDesignation
                WHERE Partner__c = :accs[0].Id
                ORDER BY Program__r.Name
            ]) {
                Map<String, String> p = new Map<String, String>();
                p.put('value', gd.Id);
                p.put('label', gd.Program__r != null && String.isNotBlank(gd.Program__r.Name) ? gd.Program__r.Name : gd.Name);
                opts.programs.add(p);
            }
        }

        // Distinct years from Overview_Budget_per_Anno__c.
        Set<String> yearSet = new Set<String>();
        for (Overview_Budget_per_Anno__c o : [
            SELECT Anno__c FROM Overview_Budget_per_Anno__c WHERE Anno__c != null
        ]) {
            yearSet.add(o.Anno__c);
        }
        List<String> yearList = new List<String>(yearSet);
        yearList.sort();
        // Descending order.
        List<String> yearDesc = new List<String>();
        for (Integer i = yearList.size() - 1; i >= 0; i--) {
            yearDesc.add(yearList.get(i));
        }
        opts.anni = yearDesc;

        // Picklist values for incasso category.
        opts.categorieIncasso = getPicklistValues(Voce_di_Incasso__c.Categoria__c);

        // Spesa: leverage existing controlling -> dependent map.
        Map<String, List<String>> sottoMap = SpeseExcelEditorController.getSottocategorieByCategoria();
        opts.sottocategorieByCategoria = sottoMap;
        List<String> spesaCats = new List<String>(sottoMap.keySet());
        spesaCats.sort();
        opts.categorieSpesa = spesaCats;

        return opts;
    }

    private static List<String> getPicklistValues(Schema.SObjectField field) {
        List<String> values = new List<String>();
        Schema.DescribeFieldResult dfr = field.getDescribe();
        for (Schema.PicklistEntry entry : dfr.getPicklistValues()) {
            if (entry.isActive()) values.add(entry.getValue());
        }
        values.sort();
        return values;
    }

    public class ViewerRecord {
        @AuraEnabled public String tipo;
        @AuraEnabled public Id recordId;
        @AuraEnabled public String name;
        @AuraEnabled public String url;
        @AuraEnabled public Id programId;
        @AuraEnabled public String programName;
        @AuraEnabled public String programUrl;
        @AuraEnabled public String anno;
        @AuraEnabled public String categoria;
        @AuraEnabled public String sottocategoria;
        @AuraEnabled public String note;
        @AuraEnabled public String stato;
        @AuraEnabled public Decimal ammontare;
        @AuraEnabled public Date data;
        @AuraEnabled public Id transazioneId;
        @AuraEnabled public String transazioneName;
        @AuraEnabled public String transazioneUrl;
        @AuraEnabled public Id budgetYearId;
        @AuraEnabled public String budgetYearName;
    }

    public class ViewerRecordsResult {
        @AuraEnabled public List<ViewerRecord> rows;
        @AuraEnabled public Boolean truncated;
        @AuraEnabled public Integer limitApplied;

        public ViewerRecordsResult() {
            this.rows = new List<ViewerRecord>();
            this.truncated = false;
            this.limitApplied = 0;
        }
    }

    // Safety cap sui risultati del viewer. Sopra questa soglia la tabella
    // risulta troncata (warning visivo nel LWC).
    private static final Integer VIEWER_RECORDS_LIMIT = 10000;
    private static final Integer VIEWER_TOTALS_LIMIT = 50000;

    private class QueryBuilder {
        String sobj;
        String fields;
        List<String> conditions = new List<String>();
        Map<String, Object> binds = new Map<String, Object>();
        String orderByClause;
        Integer limitSize;
        Integer bindCounter = 0;

        QueryBuilder(String sobj) { this.sobj = sobj; }
        QueryBuilder withFields(String f) { this.fields = f; return this; }
        QueryBuilder orderBy(String clause) { this.orderByClause = clause; return this; }
        QueryBuilder withLimit(Integer n) { this.limitSize = n; return this; }

        QueryBuilder whereEq(String field, Object value) {
            String bindKey = 'b' + (bindCounter++);
            conditions.add(field + ' = :' + bindKey);
            binds.put(bindKey, value);
            return this;
        }

        QueryBuilder whereDateOrBefore(String field, Date filterDate) {
            String bindKey = 'b' + (bindCounter++);
            conditions.add('(' + field + ' = null OR ' + field + ' <= :' + bindKey + ')');
            binds.put(bindKey, filterDate);
            return this;
        }

        List<SObject> execute() {
            String soql = 'SELECT ' + fields + ' FROM ' + sobj;
            if (!conditions.isEmpty()) soql += ' WHERE ' + String.join(conditions, ' AND ');
            if (orderByClause != null) soql += ' ORDER BY ' + orderByClause;
            if (limitSize != null) soql += ' LIMIT ' + limitSize;
            return Database.queryWithBinds(soql, binds, AccessLevel.SYSTEM_MODE);
        }
    }

    @AuraEnabled(cacheable=true)
    public static ViewerRecordsResult getViewerRecords(Id programId, String anno, String tipo, String categoria, String sottocategoria, String selectedDateStr) {
        ViewerRecordsResult result = new ViewerRecordsResult();
        result.limitApplied = VIEWER_RECORDS_LIMIT;

        Id partnerAccountId = null;
        if (programId == null) {
            List<Account> accs = [SELECT Id FROM Account WHERE Name = 'Lab00' LIMIT 1];
            if (accs.isEmpty()) return result;
            partnerAccountId = accs[0].Id;
        }

        Date filterDate = parseDate(selectedDateStr);
        String annoStr = String.isNotBlank(anno) ? anno.trim() : null;
        String tipoNorm = String.isBlank(tipo) ? null : tipo;
        Boolean wantIncasso = tipoNorm == null || tipoNorm == 'Incasso';
        Boolean wantSpesa = tipoNorm == null || tipoNorm == 'Spesa';

        // Richiediamo LIMIT+1 per capire se abbiamo troncato.
        Integer remainingBudget = VIEWER_RECORDS_LIMIT + 1;

        if (wantIncasso && remainingBudget > 0) {
            QueryBuilder qb = new QueryBuilder('Voce_di_Incasso__c')
                .withFields('Id, Name, Categoria__c, Stato__c, Ammontare__c, Data__c, ' +
                            'Transazione__c, Transazione__r.Name, ' +
                            'Overview_Budget_per_Anno__c, Overview_Budget_per_Anno__r.Name, ' +
                            'Overview_Budget_per_Anno__r.Anno__c, Overview_Budget_per_Anno__r.Budget__c, ' +
                            'Overview_Budget_per_Anno__r.Budget__r.Name, ' +
                            'Overview_Budget_per_Anno__r.Budget__r.Program__r.Name');
            applyViewerScope(qb, programId, partnerAccountId);
            applyViewerCommonFilters(qb, annoStr, categoria, filterDate);
            // Sottocategoria non applicabile agli Incassi.
            qb.orderBy('Data__c DESC NULLS LAST, Name').withLimit(remainingBudget);

            List<Voce_di_Incasso__c> incassi = (List<Voce_di_Incasso__c>) qb.execute();
            remainingBudget -= incassi.size();
            for (Voce_di_Incasso__c vi : incassi) {
                if (result.rows.size() >= VIEWER_RECORDS_LIMIT) { result.truncated = true; break; }
                result.rows.add(buildIncassoRow(vi));
            }
        }

        if (wantSpesa && remainingBudget > 0 && !result.truncated) {
            QueryBuilder qb = new QueryBuilder('Voce_di_Spesa__c')
                .withFields('Id, Name, Categoria__c, Sottocategoria__c, Note__c, Stato__c, ' +
                            'Ammontare__c, Data__c, Anno__c, ' +
                            'Overview_Budget_per_Anno__c, Overview_Budget_per_Anno__r.Name, ' +
                            'Overview_Budget_per_Anno__r.Anno__c, Overview_Budget_per_Anno__r.Budget__c, ' +
                            'Overview_Budget_per_Anno__r.Budget__r.Name, ' +
                            'Overview_Budget_per_Anno__r.Budget__r.Program__r.Name');
            applyViewerScope(qb, programId, partnerAccountId);
            applyViewerCommonFilters(qb, annoStr, categoria, filterDate);
            if (String.isNotBlank(sottocategoria)) qb.whereEq('Sottocategoria__c', sottocategoria);
            qb.orderBy('Data__c DESC NULLS LAST, Name').withLimit(remainingBudget);

            List<Voce_di_Spesa__c> spese = (List<Voce_di_Spesa__c>) qb.execute();
            for (Voce_di_Spesa__c vs : spese) {
                if (result.rows.size() >= VIEWER_RECORDS_LIMIT) { result.truncated = true; break; }
                result.rows.add(buildSpesaRow(vs));
            }
        }

        return result;
    }

    private static void applyViewerScope(QueryBuilder qb, Id programId, Id partnerAccountId) {
        if (programId != null) {
            qb.whereEq('Overview_Budget_per_Anno__r.Budget__c', programId);
        } else {
            qb.whereEq('Overview_Budget_per_Anno__r.Budget__r.Partner__c', partnerAccountId);
        }
    }

    private static void applyViewerCommonFilters(QueryBuilder qb, String annoStr, String categoria, Date filterDate) {
        if (String.isNotBlank(annoStr)) qb.whereEq('Overview_Budget_per_Anno__r.Anno__c', annoStr);
        if (String.isNotBlank(categoria)) qb.whereEq('Categoria__c', categoria);
        if (filterDate != null) qb.whereDateOrBefore('Data__c', filterDate);
    }

    private static ViewerRecord buildIncassoRow(Voce_di_Incasso__c vi) {
        ViewerRecord row = new ViewerRecord();
        row.tipo = 'Incasso';
        row.recordId = vi.Id;
        row.name = vi.Name;
        row.url = '/' + vi.Id;
        if (vi.Overview_Budget_per_Anno__r != null) {
            row.programId = vi.Overview_Budget_per_Anno__r.Budget__c;
            if (vi.Overview_Budget_per_Anno__r.Budget__r != null) {
                row.programName = vi.Overview_Budget_per_Anno__r.Budget__r.Program__r != null && String.isNotBlank(vi.Overview_Budget_per_Anno__r.Budget__r.Program__r.Name)
                    ? vi.Overview_Budget_per_Anno__r.Budget__r.Program__r.Name
                    : vi.Overview_Budget_per_Anno__r.Budget__r.Name;
            }
            row.programUrl = row.programId != null ? '/' + row.programId : null;
        }
        row.anno = vi.Overview_Budget_per_Anno__r != null ? vi.Overview_Budget_per_Anno__r.Anno__c : null;
        row.categoria = vi.Categoria__c;
        row.stato = vi.Stato__c;
        row.ammontare = vi.Ammontare__c;
        row.data = vi.Data__c;
        row.transazioneId = vi.Transazione__c;
        row.transazioneName = vi.Transazione__r != null ? vi.Transazione__r.Name : null;
        row.transazioneUrl = vi.Transazione__c != null ? '/' + vi.Transazione__c : null;
        row.budgetYearId = vi.Overview_Budget_per_Anno__c;
        row.budgetYearName = vi.Overview_Budget_per_Anno__r != null ? vi.Overview_Budget_per_Anno__r.Name : null;
        return row;
    }

    private static ViewerRecord buildSpesaRow(Voce_di_Spesa__c vs) {
        ViewerRecord row = new ViewerRecord();
        row.tipo = 'Spesa';
        row.recordId = vs.Id;
        row.name = vs.Name;
        row.url = '/' + vs.Id;
        if (vs.Overview_Budget_per_Anno__r != null) {
            row.programId = vs.Overview_Budget_per_Anno__r.Budget__c;
            if (vs.Overview_Budget_per_Anno__r.Budget__r != null) {
                row.programName = vs.Overview_Budget_per_Anno__r.Budget__r.Program__r != null && String.isNotBlank(vs.Overview_Budget_per_Anno__r.Budget__r.Program__r.Name)
                    ? vs.Overview_Budget_per_Anno__r.Budget__r.Program__r.Name
                    : vs.Overview_Budget_per_Anno__r.Budget__r.Name;
            }
            row.programUrl = row.programId != null ? '/' + row.programId : null;
        }
        row.anno = vs.Overview_Budget_per_Anno__r != null ? vs.Overview_Budget_per_Anno__r.Anno__c : null;
        row.categoria = vs.Categoria__c;
        row.sottocategoria = vs.Sottocategoria__c;
        row.note = vs.Note__c;
        row.stato = vs.Stato__c;
        row.ammontare = vs.Ammontare__c;
        row.data = vs.Data__c;
        row.budgetYearId = vs.Overview_Budget_per_Anno__c;
        row.budgetYearName = vs.Overview_Budget_per_Anno__r != null ? vs.Overview_Budget_per_Anno__r.Name : null;
        return row;
    }

    public class IncassoRow {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String name;
        @AuraEnabled public String url;
        @AuraEnabled public String anno;
        @AuraEnabled public String categoria;
        @AuraEnabled public String stato;
        @AuraEnabled public Decimal ammontare;
        @AuraEnabled public Date data;
        @AuraEnabled public Id transazioneId;
        @AuraEnabled public String transazioneName;
        @AuraEnabled public String transazioneUrl;
        @AuraEnabled public Id budgetYearId;
        @AuraEnabled public String budgetYearName;
    }

    public class SpesaRow {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String name;
        @AuraEnabled public String url;
        @AuraEnabled public String anno;
        @AuraEnabled public String categoria;
        @AuraEnabled public String sottocategoria;
        @AuraEnabled public String note;
        @AuraEnabled public String stato;
        @AuraEnabled public Decimal ammontare;
        @AuraEnabled public Date data;
        @AuraEnabled public Id budgetYearId;
        @AuraEnabled public String budgetYearName;
    }

    public class RecordsViewerData {
        @AuraEnabled public List<IncassoRow> incassi;
        @AuraEnabled public List<SpesaRow> spese;
        @AuraEnabled public String programName;
        @AuraEnabled public String anno;
        @AuraEnabled public String filterDate;

        public RecordsViewerData() {
            this.incassi = new List<IncassoRow>();
            this.spese = new List<SpesaRow>();
        }
    }

    @AuraEnabled(cacheable=true)
    public static RecordsViewerData getRecordsForViewer(Id programId, String anno, String selectedDateStr) {
        RecordsViewerData result = new RecordsViewerData();
        if (programId == null) return result;

        Date filterDate = null;
        if (String.isNotBlank(selectedDateStr)) {
            try { filterDate = Date.valueOf(selectedDateStr); } catch (Exception e) { /* ignore */ }
        }
        result.filterDate = filterDate == null ? null : String.valueOf(filterDate);
        result.anno = anno;

        List<GiftDesignation> programs = [SELECT Id, Name, Program__r.Name FROM GiftDesignation WHERE Id = :programId LIMIT 1];
        if (!programs.isEmpty()) {
            result.programName = programs[0].Program__r != null ? programs[0].Program__r.Name : programs[0].Name;
        }

        Boolean hasYear = String.isNotBlank(anno);
        String annoStr = hasYear ? anno.trim() : null;

        for (Voce_di_Incasso__c vi : [
            SELECT Id, Name, Categoria__c, Stato__c, Ammontare__c, Data__c,
                   Transazione__c, Transazione__r.Name,
                   Overview_Budget_per_Anno__c, Overview_Budget_per_Anno__r.Name, Overview_Budget_per_Anno__r.Anno__c, Overview_Budget_per_Anno__r.Budget__c, Overview_Budget_per_Anno__r.Budget__r.Name, Overview_Budget_per_Anno__r.Budget__r.Program__r.Name
            FROM Voce_di_Incasso__c
            WHERE Overview_Budget_per_Anno__r.Budget__c = :programId
            ORDER BY Data__c DESC NULLS LAST, Name
        ]) {
            if (filterDate != null && vi.Data__c != null && vi.Data__c > filterDate) continue;
            if (hasYear) {
                String a = vi.Overview_Budget_per_Anno__r != null ? vi.Overview_Budget_per_Anno__r.Anno__c : null;
                if (String.isBlank(a) || a != annoStr) continue;
            }
            IncassoRow row = new IncassoRow();
            row.recordId = vi.Id;
            row.name = vi.Name;
            row.url = '/' + vi.Id;
            row.anno = vi.Overview_Budget_per_Anno__r != null ? vi.Overview_Budget_per_Anno__r.Anno__c : null;
            row.categoria = vi.Categoria__c;
            row.stato = vi.Stato__c;
            row.ammontare = vi.Ammontare__c;
            row.data = vi.Data__c;
            row.transazioneId = vi.Transazione__c;
            row.transazioneName = vi.Transazione__r != null ? vi.Transazione__r.Name : null;
            row.transazioneUrl = vi.Transazione__c != null ? '/' + vi.Transazione__c : null;
            row.budgetYearId = vi.Overview_Budget_per_Anno__c;
            row.budgetYearName = vi.Overview_Budget_per_Anno__r != null ? vi.Overview_Budget_per_Anno__r.Name : null;
            result.incassi.add(row);
        }

        for (Voce_di_Spesa__c vs : [
            SELECT Id, Name, Categoria__c, Sottocategoria__c, Note__c, Stato__c, Ammontare__c, Data__c, Anno__c,
                   Overview_Budget_per_Anno__c, Overview_Budget_per_Anno__r.Name, Overview_Budget_per_Anno__r.Anno__c, Overview_Budget_per_Anno__r.Budget__c, Overview_Budget_per_Anno__r.Budget__r.Name, Overview_Budget_per_Anno__r.Budget__r.Program__r.Name
            FROM Voce_di_Spesa__c
            WHERE Overview_Budget_per_Anno__r.Budget__c = :programId
            ORDER BY Data__c DESC NULLS LAST, Name
        ]) {
            if (filterDate != null && vs.Data__c != null && vs.Data__c > filterDate) continue;
            if (hasYear) {
                String a = vs.Overview_Budget_per_Anno__r != null ? vs.Overview_Budget_per_Anno__r.Anno__c : null;
                if (String.isBlank(a) || a != annoStr) continue;
            }
            SpesaRow row = new SpesaRow();
            row.recordId = vs.Id;
            row.name = vs.Name;
            row.url = '/' + vs.Id;
            row.anno = vs.Overview_Budget_per_Anno__r != null ? vs.Overview_Budget_per_Anno__r.Anno__c : null;
            row.categoria = vs.Categoria__c;
            row.sottocategoria = vs.Sottocategoria__c;
            row.note = vs.Note__c;
            row.stato = vs.Stato__c;
            row.ammontare = vs.Ammontare__c;
            row.data = vs.Data__c;
            row.budgetYearId = vs.Overview_Budget_per_Anno__c;
            row.budgetYearName = vs.Overview_Budget_per_Anno__r != null ? vs.Overview_Budget_per_Anno__r.Name : null;
            result.spese.add(row);
        }

        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<YearSummary> getProgramDetailsData(Id programId, String selectedDateStr) {
        List<YearSummary> results = new List<YearSummary>();
        if (programId == null) return results;

        Date filterDate = parseDate(selectedDateStr);
        Map<String, YearSummary> yearToTypeToCatToSummary = new Map<String, YearSummary>();
        Map<String, BudgetAggregator.AmountPair> pairByKey = new Map<String, BudgetAggregator.AmountPair>();

        for (Voce_di_Incasso__c vi : [
            SELECT Categoria__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__r.Anno__c
            FROM Voce_di_Incasso__c
            WHERE Overview_Budget_per_Anno__r.Budget__c = :programId
        ]) {
            if (!BudgetAggregator.isInDateScope(vi.Data__c, filterDate)) continue;

            String anno = String.isBlank(vi.Overview_Budget_per_Anno__r.Anno__c) ? 'N/A' : vi.Overview_Budget_per_Anno__r.Anno__c;
            String cat = BudgetAggregator.normalizeCategoria(vi.Categoria__c);
            String key = anno + '_Incasso_' + cat;
            if (!yearToTypeToCatToSummary.containsKey(key)) {
                yearToTypeToCatToSummary.put(key, new YearSummary(anno, 'Incasso', cat));
                pairByKey.put(key, new BudgetAggregator.AmountPair());
            }
            BudgetAggregator.accumulate(pairByKey.get(key), vi.Stato__c, vi.Stato_Precedente__c, vi.Ammontare__c);
        }

        for (Voce_di_Spesa__c vs : [
            SELECT Categoria__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c, Overview_Budget_per_Anno__r.Anno__c
            FROM Voce_di_Spesa__c
            WHERE Overview_Budget_per_Anno__r.Budget__c = :programId
        ]) {
            if (!BudgetAggregator.isInDateScope(vs.Data__c, filterDate)) continue;

            String anno = String.isBlank(vs.Overview_Budget_per_Anno__r.Anno__c) ? 'N/A' : vs.Overview_Budget_per_Anno__r.Anno__c;
            String cat = BudgetAggregator.normalizeCategoria(vs.Categoria__c);
            String key = anno + '_Spesa_' + cat;
            if (!yearToTypeToCatToSummary.containsKey(key)) {
                yearToTypeToCatToSummary.put(key, new YearSummary(anno, 'Spesa', cat));
                pairByKey.put(key, new BudgetAggregator.AmountPair());
            }
            BudgetAggregator.accumulate(pairByKey.get(key), vs.Stato__c, vs.Stato_Precedente__c, vs.Ammontare__c);
        }

        for (String key : yearToTypeToCatToSummary.keySet()) {
            YearSummary ys = yearToTypeToCatToSummary.get(key);
            BudgetAggregator.AmountPair p = pairByKey.get(key);
            BudgetAggregator.finalizePair(p);
            ys.previsto = p.previsto;
            ys.effettivo = p.effettivo;
            if (ys.effettivo != 0 || ys.previsto != 0) results.add(ys);
        }

        return results;
    }

    public class ViewerTotalRow {
        @AuraEnabled public String id;
        @AuraEnabled public String tipo;
        @AuraEnabled public String categoria;
        @AuraEnabled public Decimal previsto;
        @AuraEnabled public Decimal effettivo;
        @AuraEnabled public Decimal avanzamento;
        @AuraEnabled public String cssClass;
    }

    @AuraEnabled(cacheable=true)
    public static List<ViewerTotalRow> getViewerTotals(Id programId, String anno, String tipo, String categoria, String sottocategoria, String selectedDateStr) {
        List<ViewerTotalRow> rows = new List<ViewerTotalRow>();

        Id partnerAccountId = null;
        if (programId == null) {
            List<Account> accs = [SELECT Id FROM Account WHERE Name = 'Lab00' LIMIT 1];
            if (accs.isEmpty()) return rows;
            partnerAccountId = accs[0].Id;
        }

        Date filterDate = parseDate(selectedDateStr);
        String annoStr = String.isNotBlank(anno) ? anno.trim() : null;
        String tipoNorm = String.isBlank(tipo) ? null : tipo;
        Boolean wantIncasso = tipoNorm == null || tipoNorm == 'Incasso';
        Boolean wantSpesa = tipoNorm == null || tipoNorm == 'Spesa';

        Map<String, BudgetAggregator.AmountPair> incassiByCat = new Map<String, BudgetAggregator.AmountPair>();
        Map<String, BudgetAggregator.AmountPair> speseByCat = new Map<String, BudgetAggregator.AmountPair>();

        if (wantIncasso) {
            QueryBuilder qb = new QueryBuilder('Voce_di_Incasso__c')
                .withFields('Categoria__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c')
                .withLimit(VIEWER_TOTALS_LIMIT);
            applyViewerScope(qb, programId, partnerAccountId);
            applyViewerCommonFilters(qb, annoStr, categoria, filterDate);
            List<Voce_di_Incasso__c> incassi = (List<Voce_di_Incasso__c>) qb.execute();
            for (Voce_di_Incasso__c vi : incassi) {
                String cat = BudgetAggregator.normalizeCategoria(vi.Categoria__c);
                if (!incassiByCat.containsKey(cat)) incassiByCat.put(cat, new BudgetAggregator.AmountPair());
                BudgetAggregator.accumulate(incassiByCat.get(cat), vi.Stato__c, vi.Stato_Precedente__c, vi.Ammontare__c);
            }
        }

        if (wantSpesa) {
            QueryBuilder qb = new QueryBuilder('Voce_di_Spesa__c')
                .withFields('Categoria__c, Sottocategoria__c, Stato__c, Stato_Precedente__c, Ammontare__c, Data__c')
                .withLimit(VIEWER_TOTALS_LIMIT);
            applyViewerScope(qb, programId, partnerAccountId);
            applyViewerCommonFilters(qb, annoStr, categoria, filterDate);
            if (String.isNotBlank(sottocategoria)) qb.whereEq('Sottocategoria__c', sottocategoria);
            List<Voce_di_Spesa__c> spese = (List<Voce_di_Spesa__c>) qb.execute();
            for (Voce_di_Spesa__c vs : spese) {
                String cat = BudgetAggregator.normalizeCategoria(vs.Categoria__c);
                if (!speseByCat.containsKey(cat)) speseByCat.put(cat, new BudgetAggregator.AmountPair());
                BudgetAggregator.accumulate(speseByCat.get(cat), vs.Stato__c, vs.Stato_Precedente__c, vs.Ammontare__c);
            }
        }

        List<String> incCats = new List<String>(incassiByCat.keySet());
        incCats.sort();
        Decimal totIncPrev = 0, totIncEff = 0;
        for (String cat : incCats) {
            BudgetAggregator.AmountPair p = incassiByCat.get(cat);
            BudgetAggregator.finalizePair(p);
            if (p.previsto == 0 && p.effettivo == 0) continue;
            rows.add(buildTotalRow('Incasso', cat, p, 'slds-text-color_success'));
            totIncPrev += p.previsto;
            totIncEff += p.effettivo;
        }

        List<String> speCats = new List<String>(speseByCat.keySet());
        speCats.sort();
        Decimal totSpePrev = 0, totSpeEff = 0;
        for (String cat : speCats) {
            BudgetAggregator.AmountPair p = speseByCat.get(cat);
            BudgetAggregator.finalizePair(p);
            if (p.previsto == 0 && p.effettivo == 0) continue;
            rows.add(buildTotalRow('Spesa', cat, p, 'slds-text-color_error'));
            totSpePrev += p.previsto;
            totSpeEff += p.effettivo;
        }

        if (!rows.isEmpty()) {
            BudgetAggregator.AmountPair cashFlow = new BudgetAggregator.AmountPair();
            cashFlow.previsto = totIncPrev - totSpePrev;
            cashFlow.effettivo = totIncEff - totSpeEff;
            ViewerTotalRow cashRow = new ViewerTotalRow();
            cashRow.id = 'tot_cashflow';
            cashRow.tipo = 'CASH FLOW TOTALE';
            cashRow.categoria = '';
            cashRow.previsto = cashFlow.previsto;
            cashRow.effettivo = cashFlow.effettivo;
            cashRow.avanzamento = computeAvanzamento(cashFlow.effettivo, cashFlow.previsto);
            cashRow.cssClass = 'slds-text-title_bold slds-theme_shade';
            rows.add(cashRow);
        }

        return rows;
    }

    private static ViewerTotalRow buildTotalRow(String tipo, String categoria, BudgetAggregator.AmountPair p, String cssClass) {
        ViewerTotalRow row = new ViewerTotalRow();
        row.id = 'agg_' + tipo + '_' + categoria;
        row.tipo = tipo;
        row.categoria = categoria;
        row.previsto = p.previsto;
        row.effettivo = p.effettivo;
        row.avanzamento = computeAvanzamento(p.effettivo, p.previsto);
        row.cssClass = cssClass;
        return row;
    }

    private static Decimal computeAvanzamento(Decimal effettivo, Decimal previsto) {
        Decimal eff = effettivo == null ? 0 : effettivo;
        Decimal prev = previsto == null ? 0 : previsto;
        if (prev > 0) return eff / prev;
        if (prev == 0) return eff / 100;
        return eff / Math.abs(prev);
    }
}
