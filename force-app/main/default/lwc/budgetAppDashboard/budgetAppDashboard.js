import { LightningElement, wire, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { IsConsoleNavigation, getFocusedTabInfo, openSubtab, openTab } from 'lightning/platformWorkspaceApi';
import getDashboardData from '@salesforce/apex/BudgetAppDashboardController.getDashboardData';
import getProgramItems from '@salesforce/apex/BudgetAppDashboardController.getProgramItems';
import getProgramsScaleValues from '@salesforce/apex/BudgetAppDashboardController.getProgramsScaleValues';

const ALL_PROGRAMS_VALUE = 'ALL_PROGRAMS';

export default class BudgetAppDashboard extends NavigationMixin(LightningElement) {
    accountId;
    programs = [];
    programOptions = [];
    selectedProgramId;
    @track yearlyData = null;
    @track programSummaryData = null;
    rawProgramItems = [];
    programScaleReady = false;
    globalProgramMaxVal = null;
    globalProgramCategoriesMaxVal = null;
    globalProgramCashFlowMaxVal = null;
    isConsoleNavigation = false;
    globalDate = new Date().toISOString().split('T')[0];
    activeAccordionSections = ['overview', 'programs'];
    quickDateActionsRaw = [
        { key: 'today', label: 'Oggi' },
        { key: 'q1', label: 'Primo Trimestre' },
        { key: 'q2', label: 'Secondo Trimestre' },
        { key: 'q3', label: 'Terzo Trimestre' },
        { key: 'q4', label: 'Quarto Trimestre' }
    ];
    monthOptions = [
        { label: 'Gennaio', value: '1' },
        { label: 'Febbraio', value: '2' },
        { label: 'Marzo', value: '3' },
        { label: 'Aprile', value: '4' },
        { label: 'Maggio', value: '5' },
        { label: 'Giugno', value: '6' },
        { label: 'Luglio', value: '7' },
        { label: 'Agosto', value: '8' },
        { label: 'Settembre', value: '9' },
        { label: 'Ottobre', value: '10' },
        { label: 'Novembre', value: '11' },
        { label: 'Dicembre', value: '12' }
    ];

    get selectedYear() {
        return this.getSelectedYear();
    }

    get quickDateActions() {
        const activeKey = this.getActiveQuickDateKey();
        return this.quickDateActionsRaw.map(a => ({
            ...a,
            buttonClass: a.key === activeKey
                ? 'slds-button slds-button_brand dashboard-date-button is-active'
                : 'slds-button slds-button_neutral dashboard-date-button'
        }));
    }

    getActiveQuickDateKey() {
        const d = this.globalDate;
        if (!d) return null;
        if (d === this.getTodayDate()) return 'today';
        const year = String(d).split('-')[0];
        if (d === `${year}-03-31`) return 'q1';
        if (d === `${year}-06-30`) return 'q2';
        if (d === `${year}-09-30`) return 'q3';
        if (d === `${year}-12-31`) return 'q4';
        return null;
    }

    get activeChips() {
        const chips = [];
        const year = this.getSelectedYear();
        if (year) {
            chips.push({ key: 'year', label: `Anno ${year}`, removable: false });
        }
        const quickKey = this.getActiveQuickDateKey();
        if (quickKey) {
            const action = this.quickDateActionsRaw.find(a => a.key === quickKey);
            if (action) chips.push({ key: `qd-${quickKey}`, label: action.label, removable: true });
        } else if (this.globalDate) {
            chips.push({
                key: 'date',
                label: `al ${this.formatDateForLabel(this.globalDate)}`,
                removable: true
            });
        }
        return chips;
    }

    get hasActiveChips() {
        return this.activeChips.length > 0;
    }

    get formattedGlobalDate() {
        return this.formatDateForLabel(this.globalDate) || '—';
    }

    handleChipRemove(event) {
        const key = event.currentTarget.dataset.chip;
        if (key && (key === 'date' || key.startsWith('qd-'))) {
            this.globalDate = this.getTodayDate();
            this.programScaleReady = false;
            this.rebuildTables();
        }
    }

    get yearOptions() {
        const selectedYear = Number(this.getSelectedYear()) || new Date().getFullYear();
        const options = [];
        for (let year = selectedYear + 5; year >= selectedYear - 5; year -= 1) {
            options.push({
                label: String(year),
                value: String(year)
            });
        }
        return options;
    }

    get isAllProgramsSelected() {
        return this.selectedProgramId === ALL_PROGRAMS_VALUE;
    }

    get requestProgramId() {
        return this.isAllProgramsSelected ? null : this.selectedProgramId;
    }

    get requestAccountId() {
        return this.isAllProgramsSelected ? this.accountId : null;
    }

    get hasProgramSelection() {
        return !!this.selectedProgramId;
    }

    get programSummaryTitle() {
        const base = this.isAllProgramsSelected
            ? 'Totali Tutti i Programmi'
            : 'Totali Programma';
        const formatted = this.formatDateForLabel(this.globalDate);
        return formatted
            ? `${base} (Tutti gli anni da inizio programma alla data: ${formatted})`
            : `${base} (Tutti gli anni)`;
    }

    formatDateForLabel(value) {
        const d = this.parseDateOnly(value);
        if (!d) return '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    }

    get programButtons() {
        return (this.programs || []).map(p => {
            const isSelected = p.Id === this.selectedProgramId;
            return {
                ...p,
                buttonClass: isSelected
                    ? 'slds-button slds-button_brand program-switcher-button is-selected'
                    : 'slds-button slds-button_neutral program-switcher-button'
            };
        });
    }

    get selectedProgramName() {
        return this.getProgramDisplayName(this.selectedProgramId);
    }

    get selectedProgramButtonLabel() {
        return `Vai al budget ${this.selectedProgramName}`;
    }

    columns = [
        { label: 'Tipo', fieldName: 'tipo', type: 'text', cellAttributes: { class: { fieldName: 'cssClass' } } },
        { label: 'Categoria', fieldName: 'categoria', type: 'text', cellAttributes: { class: { fieldName: 'cssClass' } } },
        { label: 'Previsto', fieldName: 'previsto', type: 'currency', typeAttributes: { currencyCode: 'EUR' }, cellAttributes: { class: { fieldName: 'cssClass' } } },
        { label: 'Effettivo', fieldName: 'effettivo', type: 'currency', typeAttributes: { currencyCode: 'EUR' }, cellAttributes: { class: { fieldName: 'cssClass' } } },
        { label: 'Avanzamento', fieldName: 'avanzamento', type: 'percent', typeAttributes: { minimumFractionDigits: 1, maximumFractionDigits: 1 }, cellAttributes: { class: { fieldName: 'cssClass' } } }
    ];

    @wire(getDashboardData)
    wiredData({ error, data }) {
        if (data) {
            this.accountId = data.accountId;
            if (data.programs) {
                this.programs = data.programs.map(p => {
                    const displayName = p.Program__r ? p.Program__r.Name : p.Name;
                    return {
                        ...p,
                        DisplayName: displayName,
                        ProgramBudgetButtonLabel: `Vai al budget ${displayName}`
                    };
                });
                this.programOptions = this.programs.map(p => {
                    return { label: p.DisplayName, value: p.Id };
                });
                if (!this.selectedProgramId && this.programs.length > 0) {
                    this.selectedProgramId = this.programs[0].Id;
                }
            }
        } else if (error) {
            console.error(error);
        }
    }

    @wire(IsConsoleNavigation)
    wiredIsConsoleNavigation(result) {
        this.isConsoleNavigation = !!(result && result.data);
    }

    @wire(getProgramsScaleValues, { accountId: '$accountId', selectedDateStr: '$globalDate' })
    wiredProgramScales({ error, data }) {
        if (data) {
            this.globalProgramMaxVal = data.maxGlobalVal || null;
            const maxIncassi = Number(data.maxIncassiVal) || 0;
            const maxSpese = Number(data.maxSpeseVal) || 0;
            this.globalProgramCategoriesMaxVal = Math.max(maxIncassi, maxSpese) || null;
            this.globalProgramCashFlowMaxVal = Number(data.maxCashFlowVal) || null;
            this.programScaleReady = true;
        } else if (error) {
            console.error(error);
            this.globalProgramMaxVal = null;
            this.globalProgramCategoriesMaxVal = null;
            this.globalProgramCashFlowMaxVal = null;
            this.programScaleReady = true;
        }
    }

    @wire(getProgramItems, { programId: '$requestProgramId', accountId: '$requestAccountId' })
    wiredProgramItems({ error, data }) {
        if (data) {
            this.rawProgramItems = data;
            this.rebuildTables();
        } else if (error) {
            console.error(error);
            this.rawProgramItems = [];
            this.yearlyData = null;
            this.programSummaryData = null;
        }
    }

    handleGlobalDateChange(event) {
        this.globalDate = event.target.value;
        this.programScaleReady = false;
        this.rebuildTables();
    }

    getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }

    getSelectedYear() {
        if (this.globalDate) {
            const year = String(this.globalDate).split('-')[0];
            if (/^\d{4}$/.test(year)) {
                return year;
            }
        }
        return String(new Date().getFullYear());
    }

    rebaseDateToYear(targetYear) {
        const safeYear = Number(targetYear);
        const sourceDate = this.globalDate || this.getTodayDate();
        const parts = String(sourceDate).split('-');
        const month = Number(parts[1]) || 1;
        const day = Number(parts[2]) || 1;
        if (!safeYear) {
            return this.getTodayDate();
        }
        const lastDay = new Date(safeYear, month, 0).getDate();
        const safeDay = Math.min(day, lastDay);
        return `${safeYear}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
    }

    buildQuarterDate(actionKey) {
        const year = this.getSelectedYear();
        const quarterMap = {
            q1: `${year}-03-31`,
            q2: `${year}-06-30`,
            q3: `${year}-09-30`,
            q4: `${year}-12-31`
        };
        return quarterMap[actionKey] || this.getTodayDate();
    }

    buildMonthEndDate(monthValue) {
        const year = Number(this.getSelectedYear());
        const month = Number(monthValue);
        if (!year || !month || month < 1 || month > 12) {
            return this.getTodayDate();
        }
        const lastDay = new Date(year, month, 0).getDate();
        return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    handleQuickDateClick(event) {
        const actionKey = event.currentTarget.dataset.action;
        this.globalDate = actionKey === 'today' ? this.getTodayDate() : this.buildQuarterDate(actionKey);
        this.programScaleReady = false;
        this.rebuildTables();
    }

    handleMonthShortcutChange(event) {
        this.globalDate = this.buildMonthEndDate(event.detail.value);
        this.programScaleReady = false;
        this.rebuildTables();
    }

    handleYearChange(event) {
        this.globalDate = this.rebaseDateToYear(event.detail.value);
        this.programScaleReady = false;
        this.rebuildTables();
    }

    handleProgramChange(event) {
        this.selectedProgramId = event.detail.value;
        this.rawProgramItems = [];
        this.yearlyData = null;
        this.programSummaryData = null;
    }

    handleAccordionToggle(event) {
        const openSections = event.detail.openSections;
        this.activeAccordionSections = Array.isArray(openSections)
            ? openSections
            : (openSections ? [openSections] : []);
    }

    handleProgramButtonClick(event) {
        const programId = event.currentTarget.dataset.programId;
        if (!programId || programId === this.selectedProgramId) {
            return;
        }
        this.selectedProgramId = programId;
        this.rawProgramItems = [];
        this.yearlyData = null;
        this.programSummaryData = null;
    }

    buildProgramPageReference(programId) {
        return {
            type: 'standard__recordPage',
            attributes: {
                recordId: programId,
                objectApiName: 'GiftDesignation',
                actionName: 'view'
            }
        };
    }

    buildBudgetYearPageReference(budgetYearId) {
        return {
            type: 'standard__recordPage',
            attributes: {
                recordId: budgetYearId,
                objectApiName: 'Overview_Budget_per_Anno__c',
                actionName: 'view'
            }
        };
    }

    getProgramDisplayName(programId) {
        if (programId === ALL_PROGRAMS_VALUE) {
            return 'Tutti i Programmi';
        }
        const program = (this.programs || []).find(item => item.Id === programId);
        return program ? program.DisplayName : 'Programma';
    }

    async openInConsoleOrNavigate(pageReference) {
        try {
            if (this.isConsoleNavigation) {
                const focusedTabInfo = await getFocusedTabInfo();
                if (focusedTabInfo && focusedTabInfo.tabId) {
                    await openSubtab(focusedTabInfo.tabId, {
                        pageReference,
                        focus: true
                    });
                    return;
                }
                await openTab({
                    pageReference,
                    focus: true
                });
                return;
            }
        } catch (error) {
            // Fallback to standard navigation below.
            // eslint-disable-next-line no-console
            console.error(error);
        }

        this[NavigationMixin.Navigate](pageReference);
    }

    async handleGoToProgramBudget(event) {
        const programId = event.currentTarget.dataset.programId;
        if (!programId) {
            return;
        }
        await this.openInConsoleOrNavigate(this.buildProgramPageReference(programId));
    }

    async handleGoToYearBudget(event) {
        const budgetYearId = event.currentTarget.dataset.budgetYearId;
        if (!budgetYearId) {
            return;
        }
        await this.openInConsoleOrNavigate(this.buildBudgetYearPageReference(budgetYearId));
    }

    buildRecordsViewerPageReference(anno) {
        const state = {
            c__programId: this.selectedProgramId,
            c__filterDate: this.globalDate || ''
        };
        if (anno) {
            state.c__anno = String(anno);
        }
        return {
            type: 'standard__navItemPage',
            attributes: { apiName: 'Budget_Records_Viewer' },
            state
        };
    }

    async openRecordsViewer(anno) {
        if (!this.selectedProgramId) return;
        const pageRef = this.buildRecordsViewerPageReference(anno);
        try {
            if (this.isConsoleNavigation) {
                await openTab({ pageReference: pageRef, focus: true });
                return;
            }
        } catch (err) {
            console.error(err);
        }
        this[NavigationMixin.Navigate](pageRef);
    }

    handleOpenRecordsViewerAllYears() {
        this.openRecordsViewer(null);
    }

    handleOpenRecordsViewerYear(event) {
        const anno = event.currentTarget.dataset.anno;
        this.openRecordsViewer(anno);
    }

    parseDateOnly(value) {
        if (!value) {
            return null;
        }

        let datePart;
        if (value instanceof Date) {
            datePart = value.toISOString().slice(0, 10);
        } else if (typeof value === 'string') {
            // Supports both 'YYYY-MM-DD' and ISO datetime strings.
            datePart = value.slice(0, 10);
        } else {
            return null;
        }

        const parsed = new Date(`${datePart}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    calculateProgress(effettivo, previsto) {
        const eff = Number(effettivo) || 0;
        const prev = Number(previsto) || 0;
        if (prev > 0) {
            return eff / prev;
        }
        if (prev === 0) {
            // In percent format, 2 => 200%. Keep zero-denominator case readable.
            return eff / 100;
        }
        return eff / Math.abs(prev);
    }

    rebuildTables() {
        if (!this.selectedProgramId || !this.rawProgramItems || this.rawProgramItems.length === 0) {
            this.yearlyData = null;
            this.programSummaryData = null;
            return;
        }

        const filterDate = this.parseDateOnly(this.globalDate);
        const aggregateMap = {};
        const yearBudgetIdMap = {};
        const selectedProgramName = this.getProgramDisplayName(this.selectedProgramId);
        const isAllPrograms = this.isAllProgramsSelected;

        this.rawProgramItems.forEach(item => {
            const anno = item.anno || 'N/A';
            const tipo = item.tipo || 'N/A';
            const categoria = item.categoria || 'Non categorizzato';
            const stato = item.stato || '';
            const amount = Number(item.ammontare) || 0;
            const budgetYearId = item.budgetYearId;

            if (budgetYearId && !isAllPrograms && !yearBudgetIdMap[anno]) {
                yearBudgetIdMap[anno] = budgetYearId;
            }
            if (isAllPrograms) {
                yearBudgetIdMap[anno] = null;
            }

            if (filterDate) {
                const itemDate = this.parseDateOnly(item.itemDate);
                // Date is now the strict driver for tabular logic.
                // Exclude any item without date or with date after the selected one.
                if (!itemDate || itemDate > filterDate) {
                    return;
                }
            }

            const key = `${anno}_${tipo}_${categoria}`;
            if (!aggregateMap[key]) {
                aggregateMap[key] = {
                    anno,
                    tipo,
                    categoria,
                    previsto: 0,
                    effettivo: 0
                };
            }

            if (stato === 'Effettiva') {
                aggregateMap[key].effettivo += amount;
            } else if (stato === 'Prevista') {
                aggregateMap[key].previsto += amount;
            } else if (stato === 'Annullata') {
                aggregateMap[key].previsto -= amount;
            }
        });

        const normalizedRows = [];
        Object.values(aggregateMap).forEach(row => {
            let previsto = row.previsto;
            let effettivo = row.effettivo;

            if (previsto < 0) {
                effettivo += previsto;
                previsto = 0;
            }
            if (effettivo < 0) {
                effettivo = 0;
            }
            if (effettivo === 0 && previsto === 0) {
                return;
            }

            let rowClass = '';
            if (row.tipo === 'Incasso') rowClass = 'slds-text-color_success';
            else if (row.tipo === 'Spesa') rowClass = 'slds-text-color_error';

            normalizedRows.push({
                ...row,
                previsto,
                effettivo,
                avanzamento: this.calculateProgress(effettivo, previsto),
                cssClass: rowClass
            });
        });

        const programTotals = {};
        let totalIncassiPrev = 0, totalIncassiEff = 0;
        let totalSpesePrev = 0, totalSpeseEff = 0;
        const groupedByYear = {};

        normalizedRows.forEach(item => {
            if (!groupedByYear[item.anno]) {
                groupedByYear[item.anno] = [];
            }
            groupedByYear[item.anno].push({ ...item });

            const key = `${item.tipo}_${item.categoria}`;
            if (!programTotals[key]) {
                programTotals[key] = {
                    id: `tot_${key}`,
                    tipo: item.tipo,
                    categoria: item.categoria,
                    previsto: 0,
                    effettivo: 0,
                    cssClass: item.cssClass
                };
            }
            programTotals[key].previsto += item.previsto;
            programTotals[key].effettivo += item.effettivo;

            if (item.tipo === 'Incasso') {
                totalIncassiPrev += item.previsto;
                totalIncassiEff += item.effettivo;
            } else if (item.tipo === 'Spesa') {
                totalSpesePrev += item.previsto;
                totalSpeseEff += item.effettivo;
            }
        });

        let summaryData = Object.values(programTotals);
        summaryData = summaryData.map(row => {
            return {
                ...row,
                avanzamento: this.calculateProgress(row.effettivo, row.previsto)
            };
        });
        summaryData.sort((a, b) => {
            if (a.tipo !== b.tipo) {
                if (a.tipo === 'Incasso') return -1;
                if (b.tipo === 'Incasso') return 1;
                return a.tipo.localeCompare(b.tipo);
            }
            return a.categoria.localeCompare(b.categoria);
        });

        if (summaryData.length > 0) {
            summaryData.push({
                id: 'tot_cashflow',
                tipo: 'CASH FLOW TOTALE',
                categoria: '',
                previsto: totalIncassiPrev - totalSpesePrev,
                effettivo: totalIncassiEff - totalSpeseEff,
                avanzamento: this.calculateProgress(totalIncassiEff - totalSpeseEff, totalIncassiPrev - totalSpesePrev),
                cssClass: 'slds-text-title_bold slds-theme_shade'
            });
            this.programSummaryData = summaryData;
        } else {
            this.programSummaryData = null;
        }

        const yearlyDataArray = [];
        Object.keys(groupedByYear).forEach(anno => {
            const yearRecords = groupedByYear[anno];
            yearRecords.sort((a, b) => {
                if (a.tipo !== b.tipo) {
                    if (a.tipo === 'Incasso') return -1;
                    if (b.tipo === 'Incasso') return 1;
                    return a.tipo.localeCompare(b.tipo);
                }
                return a.categoria.localeCompare(b.categoria);
            });

            let incassiPrev = 0, incassiEff = 0, spesePrev = 0, speseEff = 0;
            yearRecords.forEach(r => {
                if (r.tipo === 'Incasso') {
                    incassiPrev += r.previsto;
                    incassiEff += r.effettivo;
                } else if (r.tipo === 'Spesa') {
                    spesePrev += r.previsto;
                    speseEff += r.effettivo;
                }
            });

            yearRecords.push({
                id: `summary_${anno}`,
                tipo: 'CASH FLOW',
                categoria: '',
                previsto: incassiPrev - spesePrev,
                effettivo: incassiEff - speseEff,
                avanzamento: this.calculateProgress(incassiEff - speseEff, incassiPrev - spesePrev),
                cssClass: 'slds-text-title_bold slds-theme_shade'
            });

            yearRecords.forEach((r, idx) => {
                if (!r.id) r.id = `${anno}_${idx}`;
            });

            yearlyDataArray.push({ anno, data: yearRecords });
            const yearEntry = yearlyDataArray[yearlyDataArray.length - 1];
            const annoNumber = Number(anno);
            const formattedDate = this.formatDateForLabel(this.globalDate);
            if (filterDate && annoNumber && !Number.isNaN(annoNumber)) {
                const endOfYear = new Date(annoNumber, 11, 31);
                yearEntry.label = filterDate >= endOfYear
                    ? `Anno: ${anno}`
                    : `Anno: ${anno} fino alla data ${formattedDate}`;
            } else {
                yearEntry.label = `Anno: ${anno}`;
            }
            yearEntry.budgetYearId = yearBudgetIdMap[anno] || null;
            yearEntry.navigateLabel = isAllPrograms
                ? `Vista aggregata ${anno}: navigazione non disponibile`
                : `Vai al budget ${anno} di ${selectedProgramName}`;
            yearEntry.disableNavigate = !yearEntry.budgetYearId;
        });

        yearlyDataArray.sort((a, b) => b.anno.localeCompare(a.anno));
        this.yearlyData = yearlyDataArray.length > 0 ? yearlyDataArray : null;
    }
}
