import { LightningElement, wire, track } from 'lwc';
import getViewerOptions from '@salesforce/apex/BudgetAppDashboardController.getViewerOptions';

const STORAGE_KEY = 'budgetDesigner.draft.v1';

function newId() {
    return 'item-' + Math.random().toString(36).slice(2, 10);
}

function currentYear() {
    return String(new Date().getFullYear());
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

export default class BudgetDesigner extends LightningElement {
    @track anno = currentYear();
    @track dataTarget = todayISO();

    @track incassi = [];   // [{ id, categoria, name, data, ammontare, note }]
    @track spese = [];     // [{ id, categoria, sottocategoria, name, data, ammontare, note }]

    @track optionsReady = false;
    @track categorieIncasso = [];
    @track categorieSpesa = [];
    @track sottocategorieByCategoria = {};
    @track programOptions = [];
    @track annoOptions = [];

    // Form state per "aggiungi voce"
    @track activeFormCategoryType = null;  // 'Incasso' | 'Spesa'
    @track activeFormCategory = null;
    @track formName = '';
    @track formData = todayISO();
    @track formAmount = '';
    @track formSottocategoria = '';
    @track formNote = '';

    @track saveToast = '';
    @track confirmReset = false;

    connectedCallback() {
        this.restoreDraft();
    }

    @wire(getViewerOptions)
    wiredOptions({ data, error }) {
        if (data) {
            this.categorieIncasso = data.categorieIncasso || [];
            this.categorieSpesa = data.categorieSpesa || [];
            this.sottocategorieByCategoria = data.sottocategorieByCategoria || {};
            this.programOptions = (data.programs || []).map(p => ({ label: p.label, value: p.value }));
            this.annoOptions = this.buildYearOptions(data.anni || []);
            this.optionsReady = true;
        } else if (error) {
            console.error(error);
        }
    }

    buildYearOptions(fromServer) {
        const set = new Set(fromServer.map(String));
        const base = Number(this.anno) || Number(currentYear());
        for (let y = base - 2; y <= base + 10; y++) set.add(String(y));
        return Array.from(set).sort().reverse().map(y => ({ label: y, value: y }));
    }

    // Getter per render

    get incassiCategoryCards() {
        return this.categorieIncasso.map(cat => {
            const items = this.incassi.filter(i => i.categoria === cat);
            const total = items.reduce((sum, i) => sum + (Number(i.ammontare) || 0), 0);
            const isFormOpen = this.activeFormCategoryType === 'Incasso' && this.activeFormCategory === cat;
            return {
                key: 'inc-' + cat,
                categoria: cat,
                items: items.map(i => ({ ...i, formattedAmount: this.formatCurrency(i.ammontare), formattedDate: this.formatDate(i.data) })),
                total,
                formattedTotal: this.formatCurrency(total),
                count: items.length,
                hasItems: items.length > 0,
                isFormOpen,
                addButtonLabel: isFormOpen ? 'Chiudi' : '+ Aggiungi voce'
            };
        });
    }

    get speseCategoryCards() {
        return this.categorieSpesa.map(cat => {
            const items = this.spese.filter(i => i.categoria === cat);
            const total = items.reduce((sum, i) => sum + (Number(i.ammontare) || 0), 0);
            const isFormOpen = this.activeFormCategoryType === 'Spesa' && this.activeFormCategory === cat;
            const subOptions = (this.sottocategorieByCategoria[cat] || []).map(s => ({ label: s, value: s }));
            return {
                key: 'spe-' + cat,
                categoria: cat,
                items: items.map(i => ({
                    ...i,
                    formattedAmount: this.formatCurrency(i.ammontare),
                    formattedDate: this.formatDate(i.data),
                    subLabel: i.sottocategoria || '—'
                })),
                total,
                formattedTotal: this.formatCurrency(total),
                count: items.length,
                hasItems: items.length > 0,
                hasSubs: subOptions.length > 0,
                subOptions: [{ label: 'Nessuna', value: '' }, ...subOptions],
                isFormOpen,
                addButtonLabel: isFormOpen ? 'Chiudi' : '+ Aggiungi voce'
            };
        });
    }

    get totalIncassi() {
        return this.incassi.reduce((s, i) => s + (Number(i.ammontare) || 0), 0);
    }

    get totalSpese() {
        return this.spese.reduce((s, i) => s + (Number(i.ammontare) || 0), 0);
    }

    get cashFlow() {
        return this.totalIncassi - this.totalSpese;
    }

    get cashFlowPositive() {
        return this.cashFlow >= 0;
    }

    get cashFlowCardClass() {
        return this.cashFlowPositive
            ? 'kpi-card kpi-card--cashflow kpi-card--positive'
            : 'kpi-card kpi-card--cashflow kpi-card--negative';
    }

    get cashFlowValueClass() {
        return this.cashFlowPositive ? 'kpi-value kpi-value--positive' : 'kpi-value kpi-value--negative';
    }

    get totalIncassiLabel() { return this.formatCurrency(this.totalIncassi); }
    get totalSpeseLabel() { return this.formatCurrency(this.totalSpese); }
    get cashFlowLabel() { return this.formatCurrency(this.cashFlow); }
    get totalItems() { return this.incassi.length + this.spese.length; }

    get hasDraftItems() {
        return this.totalItems > 0;
    }

    get incassiByCategoryBars() {
        const total = this.totalIncassi;
        if (total === 0) return [];
        return this.incassiCategoryCards
            .filter(c => c.count > 0)
            .map(c => ({
                key: c.key,
                categoria: c.categoria,
                formattedTotal: c.formattedTotal,
                percent: (c.total / total) * 100,
                style: `width: ${Math.max(2, (c.total / total) * 100)}%`
            }));
    }

    get speseByCategoryBars() {
        const total = this.totalSpese;
        if (total === 0) return [];
        return this.speseCategoryCards
            .filter(c => c.count > 0)
            .map(c => ({
                key: c.key,
                categoria: c.categoria,
                formattedTotal: c.formattedTotal,
                percent: (c.total / total) * 100,
                style: `width: ${Math.max(2, (c.total / total) * 100)}%`
            }));
    }

    get formTitle() {
        if (!this.activeFormCategoryType || !this.activeFormCategory) return '';
        return `Nuova voce ${this.activeFormCategoryType} · ${this.activeFormCategory}`;
    }

    get isFormSpesa() {
        return this.activeFormCategoryType === 'Spesa';
    }

    get activeFormSubOptions() {
        if (!this.isFormSpesa || !this.activeFormCategory) return [];
        const subs = this.sottocategorieByCategoria[this.activeFormCategory] || [];
        return [{ label: 'Nessuna', value: '' }, ...subs.map(s => ({ label: s, value: s }))];
    }

    get activeFormHasSubs() {
        return this.activeFormSubOptions.length > 1;
    }

    get canSubmitForm() {
        const a = Number(this.formAmount);
        return Number.isFinite(a) && a > 0;
    }

    get canSubmitFormDisabled() {
        return !this.canSubmitForm;
    }

    // Handlers

    handleAnnoChange(event) {
        this.anno = event.detail.value;
        this.persistDraft();
    }

    handleDataTargetChange(event) {
        this.dataTarget = event.target.value || todayISO();
        // Aggiorna il default del form corrente
        this.formData = this.dataTarget;
        this.persistDraft();
    }

    handleToggleForm(event) {
        const { type, categoria } = event.currentTarget.dataset;
        if (this.activeFormCategoryType === type && this.activeFormCategory === categoria) {
            this.closeForm();
            return;
        }
        this.activeFormCategoryType = type;
        this.activeFormCategory = categoria;
        this.formName = '';
        this.formAmount = '';
        this.formData = this.dataTarget;
        this.formSottocategoria = '';
        this.formNote = '';
    }

    closeForm() {
        this.activeFormCategoryType = null;
        this.activeFormCategory = null;
        this.formName = '';
        this.formAmount = '';
        this.formSottocategoria = '';
        this.formNote = '';
    }

    handleFormNameChange(event) { this.formName = event.target.value; }
    handleFormDataChange(event) { this.formData = event.target.value; }
    handleFormAmountChange(event) { this.formAmount = event.target.value; }
    handleFormSottoChange(event) { this.formSottocategoria = event.detail.value; }
    handleFormNoteChange(event) { this.formNote = event.target.value; }

    handleSubmitForm() {
        if (!this.canSubmitForm) return;
        const amount = Number(this.formAmount);
        if (this.activeFormCategoryType === 'Incasso') {
            this.incassi = [...this.incassi, {
                id: newId(),
                categoria: this.activeFormCategory,
                name: (this.formName || this.activeFormCategory).trim(),
                data: this.formData || this.dataTarget,
                ammontare: amount,
                note: ''
            }];
        } else {
            this.spese = [...this.spese, {
                id: newId(),
                categoria: this.activeFormCategory,
                sottocategoria: this.formSottocategoria || null,
                name: (this.formName || this.activeFormCategory).trim(),
                data: this.formData || this.dataTarget,
                ammontare: amount,
                note: (this.formNote || '').trim()
            }];
        }
        this.persistDraft();
        this.flashSaveToast('Voce aggiunta');
        // Mantieni il form aperto per inserimenti multipli veloci: pulisci i soli campi.
        this.formName = '';
        this.formAmount = '';
        this.formSottocategoria = '';
        this.formNote = '';
    }

    handleRemoveItem(event) {
        const { id, type } = event.currentTarget.dataset;
        if (type === 'Incasso') {
            this.incassi = this.incassi.filter(i => i.id !== id);
        } else {
            this.spese = this.spese.filter(i => i.id !== id);
        }
        this.persistDraft();
    }

    handleResetClick() {
        this.confirmReset = true;
    }

    handleResetConfirm() {
        this.incassi = [];
        this.spese = [];
        this.closeForm();
        this.persistDraft();
        this.confirmReset = false;
        this.flashSaveToast('Progetto svuotato');
    }

    handleResetCancel() {
        this.confirmReset = false;
    }

    handleExportJson() {
        const payload = this.buildDraftPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `budget-progetto-${this.anno}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Persistence

    buildDraftPayload() {
        return {
            anno: this.anno,
            dataTarget: this.dataTarget,
            incassi: this.incassi,
            spese: this.spese,
            savedAt: new Date().toISOString()
        };
    }

    persistDraft() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.buildDraftPayload()));
        } catch (e) {
            // Se localStorage non disponibile (incognito policy), non bloccare.
        }
    }

    restoreDraft() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const draft = JSON.parse(raw);
            if (draft.anno) this.anno = draft.anno;
            if (draft.dataTarget) this.dataTarget = draft.dataTarget;
            if (Array.isArray(draft.incassi)) this.incassi = draft.incassi;
            if (Array.isArray(draft.spese)) this.spese = draft.spese;
        } catch (e) {
            // Ignora payload corrotto.
        }
    }

    flashSaveToast(msg) {
        this.saveToast = msg;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { this.saveToast = ''; }, 1800);
    }

    // Formatters

    formatCurrency(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '€ 0';
        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0
        }).format(n);
    }

    formatDate(value) {
        if (!value) return '';
        const parts = String(value).slice(0, 10).split('-');
        if (parts.length !== 3) return value;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
}
