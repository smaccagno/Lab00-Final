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

    // Clipboard per "Copia riga". Quando si entra in copy mode, l'icona
    // Copia si trasforma in Incolla su tutte le righe della stessa
    // sezione (Incassi o Spese).
    _rowClipboard = null; // { kind: 'incasso'|'spesa', payload }
    @track copyMode = null; // null | 'incasso' | 'spesa'

    // Ordinamento custom delle categorie per ciascuna sezione (persistito).
    @track incassiCategoryOrder = [];
    @track speseCategoryOrder = [];

    // Drag state (per riordinare righe + header di categoria).
    _dragRowId = null;
    _dragRowKind = null;
    _dragGroupKey = null;
    _dragGroupKind = null;

    connectedCallback() {
        this.restoreDraft();
        // Year options are independent from picklist loading.
        this.annoOptions = this.buildYearOptions([]);
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

    // Raggruppa le righe per categoria rispettando il categoryOrder
    // passato (se la categoria non è in order, va in fondo in ordine di
    // comparsa). L'header + subtotale sono sempre visibili anche con
    // una sola riga.
    groupByCategoria(rows, childDecorator, kind, categoryOrder) {
        const groupsMap = new Map();
        const appearanceOrder = [];
        for (const r of rows) {
            const key = r.categoria || '';
            if (!groupsMap.has(key)) {
                groupsMap.set(key, {
                    key: 'grp-' + (key || 'nocat'),
                    kind,
                    categoria: key,
                    categoriaLabel: key || 'Senza categoria',
                    children: [],
                    subtotal: 0
                });
                appearanceOrder.push(key);
            }
            const g = groupsMap.get(key);
            const row = childDecorator(r);
            row.kind = kind;
            row.rowClass = 'sheet-row sheet-row--child';
            // Ogni riga espone se deve mostrare Paste o Copy (copy mode).
            row.showPaste = this.copyMode === kind;
            row.showCopy = !row.showPaste;
            row.pasteDisabled = false;
            g.children.push(row);
            g.subtotal += Number(r.ammontare) || 0;
        }
        const groups = Array.from(groupsMap.values());
        for (const g of groups) {
            g.subtotalFormatted = this.formatCurrency(g.subtotal);
            g.countLabel = `${g.children.length} voci`;
        }

        // Ordina secondo categoryOrder, poi le categorie non listate in
        // ordine di comparsa.
        const orderIndex = new Map();
        (categoryOrder || []).forEach((c, i) => orderIndex.set(c, i));
        groups.sort((a, b) => {
            const ia = orderIndex.has(a.categoria) ? orderIndex.get(a.categoria) : Number.POSITIVE_INFINITY;
            const ib = orderIndex.has(b.categoria) ? orderIndex.get(b.categoria) : Number.POSITIVE_INFINITY;
            if (ia !== ib) return ia - ib;
            return appearanceOrder.indexOf(a.categoria) - appearanceOrder.indexOf(b.categoria);
        });
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
        return this.groupByCategoria(
            this.incassi,
            r => this.decorateIncasso(r),
            'incasso',
            this.incassiCategoryOrder
        );
    }

    get speseGroups() {
        return this.groupByCategoria(
            this.spese,
            r => this.decorateSpesa(r),
            'spesa',
            this.speseCategoryOrder
        );
    }

    get incassiCopyBanner() { return this.copyMode === 'incasso'; }
    get speseCopyBanner() { return this.copyMode === 'spesa'; }

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
        // Disponibilità reale: senza Incassi Previsti la disponibilità
        // pianificata è 0 (niente "buco" da progettare). Altrimenti
        // Incassi − Spese.
        if (this.totalIncassi === 0) return 0;
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
            incassiCategoryOrder: this.incassiCategoryOrder,
            speseCategoryOrder: this.speseCategoryOrder,
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
            if (Array.isArray(draft.incassiCategoryOrder)) this.incassiCategoryOrder = draft.incassiCategoryOrder;
            if (Array.isArray(draft.speseCategoryOrder)) this.speseCategoryOrder = draft.speseCategoryOrder;
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

    // ── Row actions (icons, in-row) ────────────────────────────────────
    _findRowByInfo(id, kind) {
        if (!id || !kind) return null;
        const list = kind === 'incasso' ? this.incassi : this.spese;
        return list.find(r => r.id === id) || null;
    }

    // Duplica: appende una copia in fondo alla sezione (mantiene categoria
    // originale). In copy mode esce dal mode per coerenza UX.
    handleRowDuplicateInline(event) {
        event.stopPropagation();
        const { id, kind } = event.currentTarget.dataset;
        const row = this._findRowByInfo(id, kind);
        if (!row) return;
        const copy = { ...row, id: newId() };
        if (kind === 'incasso') this.incassi = [...this.incassi, copy];
        else this.spese = [...this.spese, copy];
        this.persistDraft();
        this.flashSaveToast('Riga duplicata');
    }

    // Copia: memorizza payload e attiva copy mode per la sezione.
    handleRowCopyInline(event) {
        event.stopPropagation();
        const { id, kind } = event.currentTarget.dataset;
        const row = this._findRowByInfo(id, kind);
        if (!row) return;
        const { id: _omit, ...payload } = row;
        this._rowClipboard = { kind, payload };
        this.copyMode = kind;
        this.flashSaveToast('Riga copiata: scegli dove incollare');
    }

    // Incolla: sovrascrive la riga target (esclude id), e chiude copy mode.
    handleRowPasteInline(event) {
        event.stopPropagation();
        const { id, kind } = event.currentTarget.dataset;
        if (!this._rowClipboard || this._rowClipboard.kind !== kind) return;
        const target = this._findRowByInfo(id, kind);
        if (!target) return;
        const patched = { ...target, ...this._rowClipboard.payload };
        if (kind === 'incasso') {
            this.incassi = this.incassi.map(r => r.id === target.id ? patched : r);
        } else {
            this.spese = this.spese.map(r => r.id === target.id ? patched : r);
        }
        this.copyMode = null;
        this._rowClipboard = null;
        this.persistDraft();
        this.flashSaveToast('Riga incollata');
    }

    handleCancelCopyMode(event) {
        if (event) event.stopPropagation();
        this.copyMode = null;
        this._rowClipboard = null;
    }

    // ── Drag & drop ───────────────────────────────────────────────────
    handleRowDragStart(event) {
        const { id, kind } = event.currentTarget.dataset;
        this._dragRowId = id;
        this._dragRowKind = kind;
        this._dragGroupKey = null;
        this._dragGroupKind = null;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            // Firefox richiede un setData per far partire il drag.
            try { event.dataTransfer.setData('text/plain', id); } catch (_) {}
        }
    }

    handleRowDragOver(event) {
        if (!this._dragRowId && !this._dragGroupKey) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }

    // Drop su una riga: la riga trascinata viene spostata subito prima
    // della riga target. Se le categorie differiscono, la categoria cambia
    // e (per Spese) la sottocategoria viene svuotata.
    handleRowDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        const targetId = event.currentTarget.dataset.id;
        const targetKind = event.currentTarget.dataset.kind;
        const draggedId = this._dragRowId;
        const draggedKind = this._dragRowKind;
        this._resetDragState();
        if (!draggedId || draggedKind !== targetKind || draggedId === targetId) return;

        const list = draggedKind === 'incasso' ? [...this.incassi] : [...this.spese];
        const fromIdx = list.findIndex(r => r.id === draggedId);
        const toIdx = list.findIndex(r => r.id === targetId);
        if (fromIdx < 0 || toIdx < 0) return;

        const [moved] = list.splice(fromIdx, 1);
        const targetRow = list[toIdx > fromIdx ? toIdx - 1 : toIdx];
        if (targetRow && targetRow.categoria !== moved.categoria) {
            moved.categoria = targetRow.categoria;
            if (draggedKind === 'spesa') moved.sottocategoria = '';
        }
        list.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, moved);

        if (draggedKind === 'incasso') this.incassi = list;
        else this.spese = list;
        this.persistDraft();
    }

    // Drop su header di categoria: la riga si sposta in fondo al gruppo
    // della categoria target (e cambia categoria se diversa).
    handleGroupHeaderDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        const targetCategoria = event.currentTarget.dataset.categoria;
        const targetKind = event.currentTarget.dataset.kind;
        const draggedRowId = this._dragRowId;
        const draggedRowKind = this._dragRowKind;
        const draggedGroupKey = this._dragGroupKey;
        const draggedGroupKind = this._dragGroupKind;
        this._resetDragState();

        // Se sto trascinando un'intera CATEGORIA: riordino l'order array.
        if (draggedGroupKey && draggedGroupKind === targetKind) {
            const orderList = targetKind === 'incasso'
                ? [...(this.incassiCategoryOrder.length ? this.incassiCategoryOrder : this._currentCategoryOrder('incasso'))]
                : [...(this.speseCategoryOrder.length ? this.speseCategoryOrder : this._currentCategoryOrder('spesa'))];
            const draggedCat = draggedGroupKey.replace(/^grp-/, '');
            const draggedActualCat = draggedCat === 'nocat' ? '' : draggedCat;
            const fromI = orderList.indexOf(draggedActualCat);
            const toI = orderList.indexOf(targetCategoria);
            // Se una delle due non è in order, ricostruisco con gli appearance.
            if (fromI < 0 || toI < 0) return;
            const [moved] = orderList.splice(fromI, 1);
            orderList.splice(toI, 0, moved);
            if (targetKind === 'incasso') this.incassiCategoryOrder = orderList;
            else this.speseCategoryOrder = orderList;
            this.persistDraft();
            return;
        }

        // Altrimenti è una riga droppata su un header: sposto in fondo al
        // gruppo della categoria target e cambio categoria se diversa.
        if (!draggedRowId || draggedRowKind !== targetKind) return;
        const list = draggedRowKind === 'incasso' ? [...this.incassi] : [...this.spese];
        const fromIdx = list.findIndex(r => r.id === draggedRowId);
        if (fromIdx < 0) return;
        const [moved] = list.splice(fromIdx, 1);
        if (moved.categoria !== targetCategoria) {
            moved.categoria = targetCategoria;
            if (draggedRowKind === 'spesa') moved.sottocategoria = '';
        }
        // Trova l'ultima riga della categoria target; se non esiste, aggiunge in fondo.
        let lastIdxOfCat = -1;
        list.forEach((r, i) => { if (r.categoria === targetCategoria) lastIdxOfCat = i; });
        const insertAt = lastIdxOfCat >= 0 ? lastIdxOfCat + 1 : list.length;
        list.splice(insertAt, 0, moved);
        if (draggedRowKind === 'incasso') this.incassi = list;
        else this.spese = list;
        this.persistDraft();
    }

    handleGroupDragStart(event) {
        event.stopPropagation();
        const { key, kind } = event.currentTarget.dataset;
        this._dragGroupKey = key;
        this._dragGroupKind = kind;
        this._dragRowId = null;
        this._dragRowKind = null;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            try { event.dataTransfer.setData('text/plain', key); } catch (_) {}
        }
    }

    handleRowDragEnd() { this._resetDragState(); }

    _resetDragState() {
        this._dragRowId = null;
        this._dragRowKind = null;
        this._dragGroupKey = null;
        this._dragGroupKind = null;
    }

    _currentCategoryOrder(kind) {
        const list = kind === 'incasso' ? this.incassi : this.spese;
        const seen = [];
        for (const r of list) {
            const c = r.categoria || '';
            if (!seen.includes(c)) seen.push(c);
        }
        return seen;
    }
}
