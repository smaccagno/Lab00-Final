import { LightningElement, wire, track } from 'lwc';
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation';
import { IsConsoleNavigation, getFocusedTabInfo, openSubtab, openTab } from 'lightning/platformWorkspaceApi';
import getViewerOptions from '@salesforce/apex/BudgetAppDashboardController.getViewerOptions';
import getViewerRecords from '@salesforce/apex/BudgetAppDashboardController.getViewerRecords';
import getViewerTotals from '@salesforce/apex/BudgetAppDashboardController.getViewerTotals';

const EURO_FORMATTER = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const PERCENT_FORMATTER = new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default class BudgetRecordsViewer extends NavigationMixin(LightningElement) {
    @track programId = '';
    @track anno = '';
    @track tipo = '';
    @track categoria = '';
    @track sottocategoria = '';
    @track filterDate = '';

    @track records = [];
    @track totalsRows = [];
    @track loading = false;
    @track error;
    @track truncated = false;
    @track recordsLimit = 0;
    isConsoleNavigation = false;

    @wire(IsConsoleNavigation)
    wiredIsConsoleNavigation(result) {
        this.isConsoleNavigation = !!(result && result.data);
    }

    programOptions = [];
    annoOptions = [];
    categorieIncasso = [];
    categorieSpesa = [];
    sottocategorieByCategoria = {};
    optionsReady = false;
    pendingState = null;

    tipoOptions = [
        { label: 'Tutti', value: '' },
        { label: 'Incasso', value: 'Incasso' },
        { label: 'Spesa', value: 'Spesa' }
    ];

    @wire(CurrentPageReference)
    wiredPageReference(ref) {
        if (!ref) return;
        const state = ref.state || {};
        const incoming = {
            programId: state.c__programId || state.programId || '',
            anno: state.c__anno || state.anno || '',
            tipo: state.c__tipo || state.tipo || '',
            categoria: state.c__categoria || state.categoria || '',
            sottocategoria: state.c__sottocategoria || state.sottocategoria || '',
            filterDate: state.c__filterDate || state.filterDate || ''
        };
        if (this.optionsReady) {
            this.applyIncomingState(incoming);
        } else {
            this.pendingState = incoming;
        }
    }

    @wire(getViewerOptions)
    wiredOptions({ data, error }) {
        if (data) {
            this.programOptions = [
                { label: 'Tutti i programmi', value: '' },
                ...(data.programs || []).map(p => ({ label: p.label, value: p.value }))
            ];
            this.annoOptions = [
                { label: 'Tutti', value: '' },
                ...(data.anni || []).map(a => ({ label: a, value: a }))
            ];
            this.categorieIncasso = data.categorieIncasso || [];
            this.categorieSpesa = data.categorieSpesa || [];
            this.sottocategorieByCategoria = data.sottocategorieByCategoria || {};
            this.optionsReady = true;
            if (this.pendingState) {
                const s = this.pendingState;
                this.pendingState = null;
                this.applyIncomingState(s);
            } else {
                this.fetchData();
            }
        } else if (error) {
            console.error(error);
            this.error = (error && error.body && error.body.message) || 'Errore nel caricamento delle opzioni.';
        }
    }

    applyIncomingState(state) {
        this.programId = state.programId || '';
        this.anno = state.anno || '';
        this.tipo = state.tipo || '';
        this.categoria = state.categoria || '';
        this.sottocategoria = state.sottocategoria || '';
        this.filterDate = state.filterDate || '';
        this.fetchData();
    }

    get categoriaOptions() {
        let cats = [];
        if (this.tipo === 'Incasso') cats = this.categorieIncasso;
        else if (this.tipo === 'Spesa') cats = this.categorieSpesa;
        else cats = Array.from(new Set([...this.categorieIncasso, ...this.categorieSpesa])).sort();
        return [
            { label: 'Tutte', value: '' },
            ...cats.map(c => ({ label: c, value: c }))
        ];
    }

    get sottocategoriaOptions() {
        const subs = (this.categoria && this.sottocategorieByCategoria[this.categoria]) || [];
        return [
            { label: 'Tutte', value: '' },
            ...subs.map(s => ({ label: s, value: s }))
        ];
    }

    get sottocategoriaDisabled() {
        // Sottocategoria è significativa solo per le Spese.
        if (this.tipo === 'Incasso') return true;
        if (!this.categoria) return true;
        const subs = this.sottocategorieByCategoria[this.categoria];
        return !subs || subs.length === 0;
    }

    get showTipoColumn() { return !this.tipo; }
    get showSottocategoriaColumn() { return this.tipo !== 'Incasso'; }
    get showNoteColumn() { return this.tipo !== 'Incasso'; }
    get showTransazioneColumn() { return this.tipo !== 'Spesa'; }

    get hasRecords() {
        return this.records && this.records.length > 0;
    }

    formatEuro(value) {
        if (value == null || value === '') return '';
        const n = Number(value);
        return EURO_FORMATTER.format(Number.isFinite(n) ? n : 0);
    }

    formatPercentValue(value) {
        const n = Number(value);
        return PERCENT_FORMATTER.format(Number.isFinite(n) ? n : 0);
    }

    statoMeta(stato) {
        switch (stato) {
            case 'Effettiva':
                return { pillClass: 'rv-status rv-status--effettiva', label: 'Effettiva' };
            case 'Prevista':
                return { pillClass: 'rv-status rv-status--prevista', label: 'Prevista' };
            case 'Annullata':
                return { pillClass: 'rv-status rv-status--annullata', label: 'Annullata' };
            default:
                return { pillClass: 'rv-status rv-status--neutral', label: stato || '—' };
        }
    }

    tipoMeta(tipo) {
        if (tipo === 'Incasso') return { pillClass: 'rv-type rv-type--incasso', label: 'Incasso' };
        if (tipo === 'Spesa') return { pillClass: 'rv-type rv-type--spesa', label: 'Spesa' };
        return { pillClass: 'rv-type rv-type--neutral', label: tipo || '—' };
    }

    get displayRecords() {
        return (this.records || []).map(r => {
            const stato = this.statoMeta(r.stato);
            const tipo = this.tipoMeta(r.tipo);
            const isSpesa = r.tipo === 'Spesa';
            const amountClass = isSpesa ? 'rv-amount rv-amount--spesa' : 'rv-amount rv-amount--incasso';
            return {
                ...r,
                tipoLabel: tipo.label,
                tipoPillClass: tipo.pillClass,
                statoLabel: stato.label,
                statoPillClass: stato.pillClass,
                dataFormatted: this.formatDate(r.data),
                ammontareFormatted: this.formatEuro(r.ammontare),
                amountClass,
                canOpenRecord: !!r.recordId,
                canOpenProgram: !!r.programId,
                canOpenTransazione: !!r.transazioneId
            };
        });
    }

    get displayTotals() {
        return (this.totalsRows || []).map(row => {
            const isCashflow = row.tipo === 'CASH FLOW TOTALE' || row.tipo === 'CASH FLOW';
            const isIncasso = row.tipo === 'Incasso';
            const isSpesa = row.tipo === 'Spesa';

            let pillClass = 'rv-type';
            let progressFillClass = 'rv-progress-fill';
            let typeLabel = row.tipo;

            if (isIncasso) {
                pillClass += ' rv-type--incasso';
                progressFillClass += ' rv-progress-fill--incasso';
            } else if (isSpesa) {
                pillClass += ' rv-type--spesa';
                progressFillClass += ' rv-progress-fill--spesa';
            } else if (isCashflow) {
                pillClass += ' rv-type--cashflow';
                progressFillClass += ' rv-progress-fill--cashflow';
                typeLabel = row.tipo === 'CASH FLOW TOTALE' ? 'TOTALE' : 'CASH FLOW';
            } else {
                pillClass += ' rv-type--neutral';
            }

            const avanzamento = Number(row.avanzamento) || 0;
            const clamped = Math.min(100, Math.max(0, avanzamento * 100));

            return {
                ...row,
                isCashflow,
                typeLabel,
                pillClass,
                rowClass: isCashflow ? 'rv-totals-row rv-totals-row--cashflow' : 'rv-totals-row',
                previstoFmt: this.formatEuro(row.previsto),
                effettivoFmt: this.formatEuro(row.effettivo),
                avanzamentoFmt: this.formatPercentValue(avanzamento),
                progressStyle: `width: ${clamped}%`,
                progressFillClass
            };
        });
    }

    get recordsCountLabel() {
        const tipoLabel = this.tipo || 'Voci';
        return `${tipoLabel === 'Voci' ? 'Voci' : 'Voci di ' + tipoLabel} (${this.records.length})`;
    }

    get headerSubtitle() {
        return this.breadcrumbItems.map(b => b.label).join(' · ');
    }

    get breadcrumbItems() {
        const parts = [];
        if (!this.programId) {
            parts.push({ key: 'program', label: 'Tutti i programmi' });
        } else {
            const program = this.programOptions.find(p => p.value === this.programId);
            if (program) parts.push({ key: 'program', label: program.label });
        }
        parts.push({ key: 'anno', label: this.anno ? `Anno ${this.anno}` : 'Tutti gli anni' });
        if (this.tipo) parts.push({ key: 'tipo', label: this.tipo });
        if (this.categoria) parts.push({ key: 'categoria', label: this.categoria });
        if (this.sottocategoria) parts.push({ key: 'sotto', label: this.sottocategoria });
        if (this.filterDate) parts.push({ key: 'date', label: `fino al ${this.formatDate(this.filterDate)}` });
        return parts.map((p, idx) => ({ ...p, isLast: idx === parts.length - 1 }));
    }

    get hasActiveFilters() {
        return !!(this.programId || this.anno || this.tipo || this.categoria || this.sottocategoria || this.filterDate);
    }

    get truncatedMessage() {
        if (!this.truncated) return '';
        const limit = this.recordsLimit || this.records.length;
        return `Risultato troncato ai primi ${limit.toLocaleString('it-IT')} record. Restringi i filtri per vedere i rimanenti.`;
    }

    get exportFileName() {
        const program = this.programOptions.find(p => p.value === this.programId);
        const safeProgram = ((program && program.label) || 'Programma').replace(/[^\w\-]+/g, '_');
        const tipoPart = this.tipo ? `_${this.tipo}` : '';
        const yearPart = this.anno ? `_${this.anno}` : '';
        const datePart = this.filterDate ? `_alla_${this.filterDate}` : '';
        return `Voci${tipoPart}_${safeProgram}${yearPart}${datePart}`;
    }

    get exportData() {
        return this.records.map(r => {
            if (this.tipo === 'Incasso') {
                return {
                    Nome: r.name || '',
                    Programma: r.programName || '',
                    Anno: r.anno || '',
                    Data: r.data || '',
                    Categoria: r.categoria || '',
                    Stato: r.stato || '',
                    Ammontare: r.ammontare != null ? r.ammontare : '',
                    Transazione: r.transazioneName || '',
                    'Budget Anno': r.budgetYearName || ''
                };
            }
            if (this.tipo === 'Spesa') {
                return {
                    Nome: r.name || '',
                    Programma: r.programName || '',
                    Anno: r.anno || '',
                    Data: r.data || '',
                    Categoria: r.categoria || '',
                    Sottocategoria: r.sottocategoria || '',
                    Note: r.note || '',
                    Stato: r.stato || '',
                    Ammontare: r.ammontare != null ? r.ammontare : '',
                    'Budget Anno': r.budgetYearName || ''
                };
            }
            return {
                Tipo: r.tipo || '',
                Nome: r.name || '',
                Programma: r.programName || '',
                Anno: r.anno || '',
                Data: r.data || '',
                Categoria: r.categoria || '',
                Sottocategoria: r.sottocategoria || '',
                Note: r.note || '',
                Stato: r.stato || '',
                Ammontare: r.ammontare != null ? r.ammontare : '',
                Transazione: r.transazioneName || '',
                'Budget Anno': r.budgetYearName || ''
            };
        });
    }

    formatDate(value) {
        if (!value) return '';
        const parts = String(value).slice(0, 10).split('-');
        if (parts.length !== 3) return value;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    handleProgramChange(event) {
        this.programId = event.detail.value;
        this.fetchData();
    }

    handleAnnoChange(event) {
        this.anno = event.detail.value;
        this.fetchData();
    }

    handleTipoChange(event) {
        this.tipo = event.detail.value;
        // Reset categoria/sottocategoria se non più valida nel set corrente.
        if (this.categoria) {
            const allowed = this.tipo === 'Incasso'
                ? this.categorieIncasso
                : (this.tipo === 'Spesa' ? this.categorieSpesa : null);
            if (allowed && !allowed.includes(this.categoria)) {
                this.categoria = '';
                this.sottocategoria = '';
            }
        }
        if (this.tipo === 'Incasso') this.sottocategoria = '';
        this.fetchData();
    }

    handleCategoriaChange(event) {
        this.categoria = event.detail.value;
        this.sottocategoria = '';
        this.fetchData();
    }

    handleSottocategoriaChange(event) {
        this.sottocategoria = event.detail.value;
        this.fetchData();
    }

    handleDateChange(event) {
        this.filterDate = event.detail.value || '';
        this.fetchData();
    }

    handleResetFilters() {
        this.programId = '';
        this.anno = '';
        this.tipo = '';
        this.categoria = '';
        this.sottocategoria = '';
        this.filterDate = '';
        this.fetchData();
    }

    get hasTotals() {
        return this.totalsRows && this.totalsRows.length > 0;
    }

    @wire(getViewerTotals, {
        programId: '$programId',
        anno: '$anno',
        tipo: '$tipo',
        categoria: '$categoria',
        sottocategoria: '$sottocategoria',
        selectedDateStr: '$filterDate'
    })
    wiredTotals({ data, error }) {
        if (!this.optionsReady) return;
        if (data) {
            this.totalsRows = data;
        } else if (error) {
            console.error(error);
            this.totalsRows = [];
        }
    }

    handleOpenRecord(event) {
        const recordId = event.currentTarget.dataset.recordId;
        const tipo = event.currentTarget.dataset.tipo;
        if (!recordId) return;
        const objectApiName = tipo === 'Spesa' ? 'Voce_di_Spesa__c' : 'Voce_di_Incasso__c';
        this.openInConsoleOrNavigate({
            type: 'standard__recordPage',
            attributes: { recordId, objectApiName, actionName: 'view' }
        });
    }

    handleOpenProgram(event) {
        const programId = event.currentTarget.dataset.programId;
        if (!programId) return;
        this.openInConsoleOrNavigate({
            type: 'standard__recordPage',
            attributes: { recordId: programId, objectApiName: 'GiftDesignation', actionName: 'view' }
        });
    }

    handleOpenTransazione(event) {
        const transazioneId = event.currentTarget.dataset.transazioneId;
        if (!transazioneId) return;
        this.openInConsoleOrNavigate({
            type: 'standard__recordPage',
            attributes: { recordId: transazioneId, objectApiName: 'GiftTransaction', actionName: 'view' }
        });
    }

    async openInConsoleOrNavigate(pageReference) {
        try {
            if (this.isConsoleNavigation) {
                const focusedTabInfo = await getFocusedTabInfo();
                if (focusedTabInfo && focusedTabInfo.tabId) {
                    await openSubtab(focusedTabInfo.tabId, { pageReference, focus: true });
                    return;
                }
                await openTab({ pageReference, focus: true });
                return;
            }
        } catch (err) {
            console.error(err);
        }
        this[NavigationMixin.Navigate](pageReference);
    }

    fetchData() {
        if (!this.optionsReady) return;
        this.loading = true;
        this.error = undefined;
        getViewerRecords({
            programId: this.programId || null,
            anno: this.anno || null,
            tipo: this.tipo || null,
            categoria: this.categoria || null,
            sottocategoria: this.sottocategoria || null,
            selectedDateStr: this.filterDate || null
        })
            .then(data => {
                if (data && Array.isArray(data.rows)) {
                    this.records = data.rows;
                    this.truncated = !!data.truncated;
                    this.recordsLimit = data.limitApplied || 0;
                } else {
                    this.records = [];
                    this.truncated = false;
                    this.recordsLimit = 0;
                }
            })
            .catch(err => {
                console.error(err);
                this.error = (err && err.body && err.body.message) || 'Errore nel caricamento dei dati.';
                this.records = [];
                this.truncated = false;
                this.recordsLimit = 0;
            })
            .finally(() => {
                this.loading = false;
            });
    }
}
