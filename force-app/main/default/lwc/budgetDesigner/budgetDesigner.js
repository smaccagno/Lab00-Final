import { LightningElement, track, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { getPicklistValues } from 'lightning/uiObjectInfoApi';
import INCASSO_OBJECT from '@salesforce/schema/Voce_di_Incasso__c';
import SPESA_OBJECT from '@salesforce/schema/Voce_di_Spesa__c';
import INCASSO_CATEGORIA from '@salesforce/schema/Voce_di_Incasso__c.Categoria__c';
import SPESA_CATEGORIA from '@salesforce/schema/Voce_di_Spesa__c.Categoria__c';
import SPESA_SOTTOCATEGORIA from '@salesforce/schema/Voce_di_Spesa__c.Sottocategoria__c';

const STORAGE_KEY = 'budgetDesigner.draft.v2';
const LEGACY_STORAGE_KEY = 'budgetDesigner.draft.v1';

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
    @track annoOptions = [];

    // Record type ids resolved from the object info (needed by getPicklistValues).
    _incassoRecordTypeId;
    _spesaRecordTypeId;

    // Draft "nuova riga" sempre presente in fondo a ciascuna griglia.
    @track draftIncasso = this.blankIncassoRow();
    @track draftSpesa = this.blankSpesaRow();

    @track saveToast = '';
    @track confirmReset = false;

    // Menu azioni riga (aperto tramite pulsante ⋮ a destra di ogni riga).
    @track rowMenuOpen = false;
    @track rowMenuInfo = null; // { kind: 'incasso'|'spesa', id }
    @track rowMenuStyle = '';
    _rowClipboard = null; // { kind, payload }

    connectedCallback() {
        this.restoreDraft();
        // Year options are independent from picklist loading.
        this.annoOptions = this.buildYearOptions([]);
        this._windowClickHandler = this.handleWindowClick.bind(this);
        window.addEventListener('click', this._windowClickHandler);
    }

    disconnectedCallback() {
        if (this._windowClickHandler) {
            window.removeEventListener('click', this._windowClickHandler);
        }
    }

    handleWindowClick(event) {
        if (!this.rowMenuOpen) return;
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const hit = path.some(n => n && n.classList && (
            n.classList.contains('sheet-row-menu') ||
            n.classList.contains('sheet-row-menu-btn')
        ));
        if (!hit) this.closeRowMenu();
    }

    // ── Object info: used to obtain the master record type id so that
    //    getPicklistValues returns every value defined on the picklist.
    @wire(getObjectInfo, { objectApiName: INCASSO_OBJECT })
    wiredIncassoInfo({ data }) {
        if (data) {
            this._incassoRecordTypeId = data.defaultRecordTypeId;
        }
    }

    @wire(getObjectInfo, { objectApiName: SPESA_OBJECT })
    wiredSpesaInfo({ data }) {
        if (data) {
            this._spesaRecordTypeId = data.defaultRecordTypeId;
        }
    }

    // ── Picklist values via the UI API (same pattern as Salesforce's own UI)
    @wire(getPicklistValues, {
        recordTypeId: '$_incassoRecordTypeId',
        fieldApiName: INCASSO_CATEGORIA
    })
    wiredIncassoCategoria({ data }) {
        if (data && data.values) {
            this.categorieIncasso = data.values.map(v => v.value);
            this.maybeMarkReady();
        }
    }

    @wire(getPicklistValues, {
        recordTypeId: '$_spesaRecordTypeId',
        fieldApiName: SPESA_CATEGORIA
    })
    wiredSpesaCategoria({ data }) {
        if (data && data.values) {
            this.categorieSpesa = data.values.map(v => v.value);
            this.maybeMarkReady();
        }
    }

    @wire(getPicklistValues, {
        recordTypeId: '$_spesaRecordTypeId',
        fieldApiName: SPESA_SOTTOCATEGORIA
    })
    wiredSpesaSottocategoria({ data }) {
        if (data && data.values && data.controllerValues) {
            // data.controllerValues: { "<Categoria name>": <index> }
            // data.values[i].validFor: [<index>, ...]
            const indexToCategoria = {};
            for (const [catName, idx] of Object.entries(data.controllerValues)) {
                indexToCategoria[idx] = catName;
            }
            const out = {};
            for (const v of data.values) {
                if (!Array.isArray(v.validFor)) continue;
                for (const idx of v.validFor) {
                    const cat = indexToCategoria[idx];
                    if (!cat) continue;
                    if (!out[cat]) out[cat] = [];
                    out[cat].push(v.value);
                }
            }
            this.sottocategorieByCategoria = out;
            this.maybeMarkReady();
        }
    }

    maybeMarkReady() {
        if (this.categorieIncasso.length && this.categorieSpesa.length) {
            this.optionsReady = true;
        }
    }

    buildYearOptions(fromServer) {
        const set = new Set(fromServer.map(String));
        const base = Number(this.anno) || Number(currentYear());
        for (let y = base - 2; y <= base + 10; y++) set.add(String(y));
        return Array.from(set).sort().reverse().map(y => ({ label: y, value: y }));
    }

    blankIncassoRow() {
        return { categoria: '', name: '', data: '', ammontare: '' };
    }

    blankSpesaRow() {
        return { categoria: '', sottocategoria: '', name: '', data: '', ammontare: '', note: '' };
    }

    // Options per combobox
    get incassoCategoriaOptions() {
        return [
            { label: '— Scegli —', value: '' },
            ...this.categorieIncasso.map(c => ({ label: c, value: c }))
        ];
    }

    get speseCategoriaOptions() {
        return [
            { label: '— Scegli —', value: '' },
            ...this.categorieSpesa.map(c => ({ label: c, value: c }))
        ];
    }

    subOptionsFor(categoria) {
        const subs = this.sottocategorieByCategoria[categoria] || [];
        return [
            { label: 'Nessuna', value: '' },
            ...subs.map(s => ({ label: s, value: s }))
        ];
    }

    // Raggruppa le righe per categoria, preservando l'ordine di inserimento
    // (la prima voce di una categoria determina la posizione del gruppo).
    groupByCategoria(rows, childDecorator) {
        const groupsMap = new Map();
        for (const r of rows) {
            const key = r.categoria || '';
            if (!groupsMap.has(key)) {
                groupsMap.set(key, {
                    key: 'grp-' + (key || 'nocat'),
                    categoria: key,
                    categoriaLabel: key || 'Senza categoria',
                    children: [],
                    subtotal: 0
                });
            }
            const g = groupsMap.get(key);
            const row = childDecorator(r);
            row.isChild = true;
            row.rowClass = 'sheet-row sheet-row--child';
            g.children.push(row);
            g.subtotal += Number(r.ammontare) || 0;
        }
        const groups = Array.from(groupsMap.values());
        for (const g of groups) {
            g.hasMultiple = g.children.length > 1;
            g.showGroupHeader = g.hasMultiple;
            g.subtotalFormatted = this.formatCurrency(g.subtotal);
            g.countLabel = `${g.children.length} voci`;
            // Se il gruppo è singleton, la riga resta visivamente piatta.
            if (!g.hasMultiple) {
                for (const c of g.children) {
                    c.rowClass = 'sheet-row';
                    c.isChild = false;
                }
            }
        }
        return groups;
    }

    // Righe materializzate (flat) — tenute per eventuale uso futuro
    get incassiRows() {
        return this.incassi.map(r => this.decorateIncasso(r));
    }

    get speseRows() {
        return this.spese.map(r => this.decorateSpesa(r));
    }

    decorateIncasso(r) {
        return {
            ...r,
            categoriaOptions: this.incassoCategoriaOptions,
            formattedAmount: this.formatCurrency(r.ammontare)
        };
    }

    decorateSpesa(r) {
        return {
            ...r,
            categoriaOptions: this.speseCategoriaOptions,
            subOptions: this.subOptionsFor(r.categoria),
            subDisabled: !(this.sottocategorieByCategoria[r.categoria] && this.sottocategorieByCategoria[r.categoria].length),
            formattedAmount: this.formatCurrency(r.ammontare)
        };
    }

    get incassiGroups() {
        return this.groupByCategoria(this.incassi, r => this.decorateIncasso(r));
    }

    get speseGroups() {
        return this.groupByCategoria(this.spese, r => this.decorateSpesa(r));
    }

    get draftIncassoView() {
        return {
            ...this.draftIncasso,
            categoriaOptions: this.incassoCategoriaOptions,
            canAdd: this.isIncassoDraftValid(this.draftIncasso)
        };
    }

    get draftSpesaView() {
        return {
            ...this.draftSpesa,
            categoriaOptions: this.speseCategoriaOptions,
            subOptions: this.subOptionsFor(this.draftSpesa.categoria),
            subDisabled: !(this.sottocategorieByCategoria[this.draftSpesa.categoria] && this.sottocategorieByCategoria[this.draftSpesa.categoria].length),
            canAdd: this.isSpesaDraftValid(this.draftSpesa)
        };
    }

    get draftIncassoAddDisabled() { return !this.draftIncassoView.canAdd; }
    get draftSpesaAddDisabled() { return !this.draftSpesaView.canAdd; }

    isIncassoDraftValid(r) {
        const a = Number(r.ammontare);
        return !!r.categoria && Number.isFinite(a) && a > 0;
    }

    isSpesaDraftValid(r) {
        const a = Number(r.ammontare);
        return !!r.categoria && Number.isFinite(a) && a > 0;
    }

    // Totals

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

    // Aggregates per overview-bars (per categoria)
    get incassiByCategoryBars() {
        const total = this.totalIncassi;
        if (total === 0) return [];
        const map = new Map();
        for (const r of this.incassi) {
            const k = r.categoria || 'Non categorizzato';
            map.set(k, (map.get(k) || 0) + (Number(r.ammontare) || 0));
        }
        return Array.from(map.entries())
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, val], idx) => ({
                key: 'incbar-' + idx,
                categoria: cat,
                formattedTotal: this.formatCurrency(val),
                style: `width: ${Math.max(2, (val / total) * 100)}%`
            }));
    }

    get speseByCategoryBars() {
        const total = this.totalSpese;
        if (total === 0) return [];
        const map = new Map();
        for (const r of this.spese) {
            const k = r.categoria || 'Non categorizzato';
            map.set(k, (map.get(k) || 0) + (Number(r.ammontare) || 0));
        }
        return Array.from(map.entries())
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, val], idx) => ({
                key: 'spebar-' + idx,
                categoria: cat,
                formattedTotal: this.formatCurrency(val),
                style: `width: ${Math.max(2, (val / total) * 100)}%`
            }));
    }

    // Handlers setup

    handleAnnoChange(event) {
        this.anno = event.detail.value;
        this.persistDraft();
    }

    handleDataTargetChange(event) {
        this.dataTarget = event.target.value || todayISO();
        this.persistDraft();
    }

    // Handlers celle incassi esistenti
    handleIncassoCellChange(event) {
        const { id, field } = event.currentTarget.dataset;
        const value = this.readEventValue(event);
        this.incassi = this.incassi.map(r => r.id === id ? { ...r, [field]: value } : r);
        this.persistDraft();
    }

    handleIncassoRemove(event) {
        const id = event.currentTarget.dataset.id;
        this.incassi = this.incassi.filter(r => r.id !== id);
        this.persistDraft();
    }

    // Handlers celle draft incasso
    handleDraftIncassoChange(event) {
        const field = event.currentTarget.dataset.field;
        const value = this.readEventValue(event);
        this.draftIncasso = { ...this.draftIncasso, [field]: value };
    }

    handleDraftIncassoSubmit() {
        if (!this.isIncassoDraftValid(this.draftIncasso)) return;
        const r = this.draftIncasso;
        this.incassi = [...this.incassi, {
            id: newId(),
            categoria: r.categoria,
            name: (r.name || r.categoria).trim(),
            data: r.data || this.dataTarget,
            ammontare: Number(r.ammontare),
            note: ''
        }];
        this.draftIncasso = this.blankIncassoRow();
        this.persistDraft();
        this.flashSaveToast('Voce aggiunta');
        this.focusAfterAdd('incasso');
    }

    // Handlers celle spese esistenti
    handleSpesaCellChange(event) {
        const { id, field } = event.currentTarget.dataset;
        const value = this.readEventValue(event);
        this.spese = this.spese.map(r => {
            if (r.id !== id) return r;
            const updated = { ...r, [field]: value };
            if (field === 'categoria' && r.categoria !== value) updated.sottocategoria = '';
            return updated;
        });
        this.persistDraft();
    }

    handleSpesaRemove(event) {
        const id = event.currentTarget.dataset.id;
        this.spese = this.spese.filter(r => r.id !== id);
        this.persistDraft();
    }

    handleDraftSpesaChange(event) {
        const field = event.currentTarget.dataset.field;
        const value = this.readEventValue(event);
        const updated = { ...this.draftSpesa, [field]: value };
        if (field === 'categoria' && this.draftSpesa.categoria !== value) {
            updated.sottocategoria = '';
        }
        this.draftSpesa = updated;
    }

    handleDraftSpesaSubmit() {
        if (!this.isSpesaDraftValid(this.draftSpesa)) return;
        const r = this.draftSpesa;
        this.spese = [...this.spese, {
            id: newId(),
            categoria: r.categoria,
            sottocategoria: r.sottocategoria || null,
            name: (r.name || r.categoria).trim(),
            data: r.data || this.dataTarget,
            ammontare: Number(r.ammontare),
            note: (r.note || '').trim()
        }];
        this.draftSpesa = this.blankSpesaRow();
        this.persistDraft();
        this.flashSaveToast('Voce aggiunta');
        this.focusAfterAdd('spesa');
    }

    readEventValue(event) {
        if (event.detail && 'value' in event.detail) return event.detail.value;
        if (event.target) return event.target.value;
        return undefined;
    }

    focusAfterAdd(which) {
        // Riporta il cursore sulla prima cella del draft (UX da spreadsheet).
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            const selector = which === 'incasso'
                ? '[data-scope="draft-incasso"][data-field="categoria"]'
                : '[data-scope="draft-spesa"][data-field="categoria"]';
            const el = this.template.querySelector(selector);
            if (el && typeof el.focus === 'function') el.focus();
        }, 40);
    }

    handleResetClick() {
        this.confirmReset = true;
    }

    handleResetConfirm() {
        this.incassi = [];
        this.spese = [];
        this.draftIncasso = this.blankIncassoRow();
        this.draftSpesa = this.blankSpesaRow();
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
        } catch (e) { /* quota/private-mode, ignora */ }
    }

    restoreDraft() {
        try {
            let raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (!raw) return;
            const draft = JSON.parse(raw);
            if (draft.anno) this.anno = draft.anno;
            if (draft.dataTarget) this.dataTarget = draft.dataTarget;
            if (Array.isArray(draft.incassi)) this.incassi = draft.incassi;
            if (Array.isArray(draft.spese)) this.spese = draft.spese;
        } catch (e) { /* payload corrotto: ignora */ }
    }

    flashSaveToast(msg) {
        this.saveToast = msg;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { this.saveToast = ''; }, 1800);
    }

    // Formatters

    formatCurrency(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '';
        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0
        }).format(n);
    }

    // ── Row action menu ────────────────────────────────────────────────
    handleRowMenuOpen(event) {
        event.stopPropagation();
        const { id, kind } = event.currentTarget.dataset;
        if (!id || !kind) return;

        const rect = event.currentTarget.getBoundingClientRect();
        const menuWidth = 180;
        const menuHeight = 150;
        const vw = window.innerWidth || 0;
        const vh = window.innerHeight || 0;
        let left = rect.right - menuWidth;
        let top = rect.bottom + 4;
        if (left < 8) left = 8;
        if (top + menuHeight > vh - 8) top = Math.max(8, rect.top - menuHeight - 4);

        this.rowMenuInfo = { id, kind };
        this.rowMenuStyle = `top: ${top}px; left: ${left}px;`;
        this.rowMenuOpen = true;
    }

    handleRowMenuClick(event) {
        event.stopPropagation();
    }

    closeRowMenu() {
        this.rowMenuOpen = false;
        this.rowMenuInfo = null;
        this.rowMenuStyle = '';
    }

    findRowByInfo(info) {
        if (!info) return null;
        const list = info.kind === 'incasso' ? this.incassi : this.spese;
        return list.find(r => r.id === info.id) || null;
    }

    handleRowDuplicate(event) {
        event.stopPropagation();
        const info = this.rowMenuInfo;
        const row = this.findRowByInfo(info);
        this.closeRowMenu();
        if (!row) return;

        if (info.kind === 'incasso') {
            const copy = { ...row, id: newId() };
            const idx = this.incassi.findIndex(r => r.id === row.id);
            this.incassi = [
                ...this.incassi.slice(0, idx + 1),
                copy,
                ...this.incassi.slice(idx + 1)
            ];
        } else {
            const copy = { ...row, id: newId() };
            const idx = this.spese.findIndex(r => r.id === row.id);
            this.spese = [
                ...this.spese.slice(0, idx + 1),
                copy,
                ...this.spese.slice(idx + 1)
            ];
        }
        this.persistDraft();
        this.flashSaveToast('Riga duplicata');
    }

    handleRowCopy(event) {
        event.stopPropagation();
        const info = this.rowMenuInfo;
        const row = this.findRowByInfo(info);
        this.closeRowMenu();
        if (!row) return;

        const { id, ...payload } = row;
        this._rowClipboard = { kind: info.kind, payload };
        this.flashSaveToast('Riga copiata');
    }

    handleRowPaste(event) {
        event.stopPropagation();
        const info = this.rowMenuInfo;
        const target = this.findRowByInfo(info);
        this.closeRowMenu();
        if (!target || !this._rowClipboard) {
            if (!this._rowClipboard) this.flashSaveToast('Nessuna riga copiata');
            return;
        }
        if (this._rowClipboard.kind !== info.kind) {
            this.flashSaveToast('La riga copiata è di un tipo diverso');
            return;
        }
        const patched = { ...target, ...this._rowClipboard.payload };
        if (info.kind === 'incasso') {
            this.incassi = this.incassi.map(r => r.id === target.id ? patched : r);
        } else {
            this.spese = this.spese.map(r => r.id === target.id ? patched : r);
        }
        this.persistDraft();
        this.flashSaveToast('Riga incollata');
    }
}
