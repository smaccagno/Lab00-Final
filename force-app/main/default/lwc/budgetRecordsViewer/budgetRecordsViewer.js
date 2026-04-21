import { LightningElement, wire, track } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import getViewerOptions from '@salesforce/apex/BudgetAppDashboardController.getViewerOptions';
import getViewerRecords from '@salesforce/apex/BudgetAppDashboardController.getViewerRecords';
import getViewerTotals from '@salesforce/apex/BudgetAppDashboardController.getViewerTotals';

const PROGRAMMA_COLUMN = { label: 'Programma', fieldName: 'programUrl', type: 'url',
    typeAttributes: { label: { fieldName: 'programName' }, target: '_blank' } };

const INCASSO_COLUMNS = [
    { label: 'Nome', fieldName: 'url', type: 'url',
      typeAttributes: { label: { fieldName: 'name' }, target: '_blank' } },
    PROGRAMMA_COLUMN,
    { label: 'Anno', fieldName: 'anno', type: 'text', initialWidth: 80 },
    { label: 'Data', fieldName: 'data', type: 'date-local',
      typeAttributes: { day: '2-digit', month: '2-digit', year: 'numeric' }, initialWidth: 110 },
    { label: 'Categoria', fieldName: 'categoria', type: 'text' },
    { label: 'Stato', fieldName: 'stato', type: 'text', initialWidth: 110 },
    { label: 'Ammontare', fieldName: 'ammontare', type: 'currency',
      typeAttributes: { currencyCode: 'EUR' }, initialWidth: 130 },
    { label: 'Transazione', fieldName: 'transazioneUrl', type: 'url',
      typeAttributes: { label: { fieldName: 'transazioneName' }, target: '_blank' } },
    { label: 'Budget Anno', fieldName: 'budgetYearName', type: 'text' }
];

const SPESA_COLUMNS = [
    { label: 'Nome', fieldName: 'url', type: 'url',
      typeAttributes: { label: { fieldName: 'name' }, target: '_blank' } },
    PROGRAMMA_COLUMN,
    { label: 'Anno', fieldName: 'anno', type: 'text', initialWidth: 80 },
    { label: 'Data', fieldName: 'data', type: 'date-local',
      typeAttributes: { day: '2-digit', month: '2-digit', year: 'numeric' }, initialWidth: 110 },
    { label: 'Categoria', fieldName: 'categoria', type: 'text' },
    { label: 'Sottocategoria', fieldName: 'sottocategoria', type: 'text' },
    { label: 'Note', fieldName: 'note', type: 'text', wrapText: true },
    { label: 'Stato', fieldName: 'stato', type: 'text', initialWidth: 110 },
    { label: 'Ammontare', fieldName: 'ammontare', type: 'currency',
      typeAttributes: { currencyCode: 'EUR' }, initialWidth: 130 },
    { label: 'Budget Anno', fieldName: 'budgetYearName', type: 'text' }
];

const MIXED_COLUMNS = [
    { label: 'Tipo', fieldName: 'tipo', type: 'text', initialWidth: 90 },
    { label: 'Nome', fieldName: 'url', type: 'url',
      typeAttributes: { label: { fieldName: 'name' }, target: '_blank' } },
    PROGRAMMA_COLUMN,
    { label: 'Anno', fieldName: 'anno', type: 'text', initialWidth: 80 },
    { label: 'Data', fieldName: 'data', type: 'date-local',
      typeAttributes: { day: '2-digit', month: '2-digit', year: 'numeric' }, initialWidth: 110 },
    { label: 'Categoria', fieldName: 'categoria', type: 'text' },
    { label: 'Sottocategoria', fieldName: 'sottocategoria', type: 'text' },
    { label: 'Note', fieldName: 'note', type: 'text', wrapText: true },
    { label: 'Stato', fieldName: 'stato', type: 'text', initialWidth: 110 },
    { label: 'Ammontare', fieldName: 'ammontare', type: 'currency',
      typeAttributes: { currencyCode: 'EUR' }, initialWidth: 130 },
    { label: 'Transazione', fieldName: 'transazioneUrl', type: 'url',
      typeAttributes: { label: { fieldName: 'transazioneName' }, target: '_blank' } },
    { label: 'Budget Anno', fieldName: 'budgetYearName', type: 'text' }
];

export default class BudgetRecordsViewer extends LightningElement {
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

    totalsColumns = [
        { label: 'Tipo', fieldName: 'tipo', type: 'text', cellAttributes: { class: { fieldName: 'cssClass' } } },
        { label: 'Categoria', fieldName: 'categoria', type: 'text', cellAttributes: { class: { fieldName: 'cssClass' } } },
        { label: 'Previsto', fieldName: 'previsto', type: 'currency', typeAttributes: { currencyCode: 'EUR' }, cellAttributes: { class: { fieldName: 'cssClass' } } },
        { label: 'Effettivo', fieldName: 'effettivo', type: 'currency', typeAttributes: { currencyCode: 'EUR' }, cellAttributes: { class: { fieldName: 'cssClass' } } },
        { label: 'Avanzamento', fieldName: 'avanzamento', type: 'percent', typeAttributes: { minimumFractionDigits: 1, maximumFractionDigits: 1 }, cellAttributes: { class: { fieldName: 'cssClass' } } }
    ];

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

    get columns() {
        if (this.tipo === 'Incasso') return INCASSO_COLUMNS;
        if (this.tipo === 'Spesa') return SPESA_COLUMNS;
        return MIXED_COLUMNS;
    }

    get hasRecords() {
        return this.records && this.records.length > 0;
    }

    get recordsCountLabel() {
        const tipoLabel = this.tipo || 'Voci';
        return `${tipoLabel === 'Voci' ? 'Voci' : 'Voci di ' + tipoLabel} (${this.records.length})`;
    }

    get headerSubtitle() {
        const parts = [];
        if (!this.programId) {
            parts.push('Tutti i programmi');
        } else {
            const program = this.programOptions.find(p => p.value === this.programId);
            if (program) parts.push(program.label);
        }
        if (this.anno) parts.push(`Anno ${this.anno}`); else parts.push('Tutti gli anni');
        if (this.tipo) parts.push(this.tipo);
        if (this.categoria) parts.push(this.categoria);
        if (this.sottocategoria) parts.push(this.sottocategoria);
        if (this.filterDate) parts.push(`fino al ${this.formatDate(this.filterDate)}`);
        return parts.join(' · ');
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
                this.records = data || [];
            })
            .catch(err => {
                console.error(err);
                this.error = (err && err.body && err.body.message) || 'Errore nel caricamento dei dati.';
                this.records = [];
            })
            .finally(() => {
                this.loading = false;
            });
    }
}
