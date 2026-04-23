import { LightningElement, track, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { getPicklistValues } from 'lightning/uiObjectInfoApi';
import { refreshApex } from '@salesforce/apex';
import INCASSO_OBJECT from '@salesforce/schema/Voce_di_Incasso__c';
import SPESA_OBJECT from '@salesforce/schema/Voce_di_Spesa__c';
import INCASSO_CATEGORIA from '@salesforce/schema/Voce_di_Incasso__c.Categoria__c';
import SPESA_CATEGORIA from '@salesforce/schema/Voce_di_Spesa__c.Categoria__c';
import SPESA_SOTTOCATEGORIA from '@salesforce/schema/Voce_di_Spesa__c.Sottocategoria__c';

import getVersionsByYear from '@salesforce/apex/BudgetVersionController.getVersionsByYear';
import getVersionDetail from '@salesforce/apex/BudgetVersionController.getVersionDetail';
import createVersion from '@salesforce/apex/BudgetVersionController.createVersion';
import forkVersion from '@salesforce/apex/BudgetVersionController.forkVersion';
import updateVersionHeader from '@salesforce/apex/BudgetVersionController.updateVersionHeader';
import trashVersion from '@salesforce/apex/BudgetVersionController.trashVersion';
import promoteVersion from '@salesforce/apex/BudgetVersionController.promoteVersion';
import upsertItem from '@salesforce/apex/BudgetVersionController.upsertItem';
import deleteItem from '@salesforce/apex/BudgetVersionController.deleteItem';
import reorderItems from '@salesforce/apex/BudgetVersionController.reorderItems';
import getActivePrograms from '@salesforce/apex/BudgetVersionController.getActivePrograms';

function currentYear() {
    return String(new Date().getFullYear());
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

export default class BudgetDesigner extends LightningElement {
    @track anno = currentYear();
    @track dataTarget = todayISO();

    @track incassi = [];   // [{ id, programmaId, programmaName, categoria, name, data, ammontare, sortOrder, ... }]
    @track spese = [];     // [{ id, programmaId, programmaName, categoria, sottocategoria, name, data, ammontare, note, sortOrder, ... }]

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

    // Clipboard per "Copia riga". Quando si entra in copy mode, l'icona
    // Copia si trasforma in Incolla su tutte le righe della stessa
    // sezione (Incassi o Spese).
    _rowClipboard = null; // { kind: 'incasso'|'spesa', payload }
    @track copyMode = null; // null | 'incasso' | 'spesa'

    // Ordinamento custom delle categorie per ciascuna sezione.
    @track incassiCategoryOrder = [];
    @track speseCategoryOrder = [];

    // Drag state (per riordinare righe + header di categoria).
    _dragRowId = null;
    _dragRowKind = null;
    _dragGroupKey = null;
    _dragGroupKind = null;

    // ── Budget Version state ──────────────────────────────────────────
    @track selectedVersionId = null;
    @track versionOptions = [];         // [{label, value}]
    @track currentVersion = null;       // DTO header
    @track editingRowIds = new Set();   // ids Budget_Version_Item__c attualmente in Edit
    @track pendingRowEdits = new Map(); // Map<Id, {original, current}>
    @track showCreateVersionDialog = false;
    @track showRenameVersionDialog = false;
    @track showTrashVersionDialog = false;
    @track showConfirmBudgetDialog = false;
    @track showForkConfirmDialog = false;
    @track dialogNome = '';
    @track dialogDescrizione = '';
    @track programmaOptions = [{ label: '— Scegli —', value: '' }];
    _wiredVersions;
    _wiredDetail;

    @track _programmaLoadError = null;

    connectedCallback() {
        // Year options are independent from picklist loading.
        this.annoOptions = this.buildYearOptions([]);
        // Imperative fetch bypasses Lightning Data Service cache
        // (prevents a stale empty-list cached from an earlier wire call).
        // eslint-disable-next-line no-console
        console.log('[budgetDesigner] requesting getActivePrograms…');
        getActivePrograms()
            .then((data) => {
                // eslint-disable-next-line no-console
                console.log('[budgetDesigner] getActivePrograms OK:', data && data.length, data);
                const list = Array.isArray(data) ? data : [];
                this.programmaOptions = [
                    { label: '— Scegli —', value: '' },
                    ...list.map((p) => ({ label: p.Name, value: p.Id }))
                ];
                this._programmaLoadError = list.length === 0 ? 'Nessun Programma attivo trovato.' : null;
                this._remapRowsFromCache();
            })
            .catch((err) => {
                const msg = (err && err.body && err.body.message) || (err && err.message) || JSON.stringify(err);
                // eslint-disable-next-line no-console
                console.error('[budgetDesigner] getActivePrograms FAILED:', msg, err);
                this._programmaLoadError = 'Errore caricamento Programmi: ' + msg;
                this.programmaOptions = [{ label: '— Scegli —', value: '' }];
            });
    }

    get programmaBanner() { return this._programmaLoadError; }
    get programmaOptionsReady() { return this.programmaOptions && this.programmaOptions.length > 1; }

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

    // ── Budget Version wires ──────────────────────────────────────────
    @wire(getVersionsByYear, { anno: '$annoInt' })
    wiredVersions(result) {
        this._wiredVersions = result;
        if (result.data) {
            this.versionOptions = result.data.map(v => ({
                label: this.formatVersionLabel(v),
                value: v.id
            }));
            // Autoselezione: Ufficiale > prima della lista (già ordinata desc)
            if (!this.selectedVersionId && result.data.length > 0) {
                const ufficiale = result.data.find(v => v.stato === 'Ufficiale');
                const defaultV = ufficiale || result.data[0];
                this.selectedVersionId = defaultV.id;
            } else if (this.selectedVersionId && !result.data.find(v => v.id === this.selectedVersionId)) {
                this.selectedVersionId = result.data[0] ? result.data[0].id : null;
            }
        } else if (result.error) {
            this.currentVersion = null;
            this.versionOptions = [];
        }
    }

@wire(getVersionDetail, { versionId: '$selectedVersionId' })
    wiredDetail(result) {
        this._wiredDetail = result;
        if (result.data) {
            this.currentVersion = result.data.header;
            this._remapRowsFromCache();
        } else if (result.error) {
            this.currentVersion = null;
            this.incassi = [];
            this.spese = [];
        }
    }

    _remapRowsFromCache() {
        if (!this._wiredDetail || !this._wiredDetail.data) return;
        const items = this._wiredDetail.data.items || [];
        this.incassi = items.filter(i => i.Tipo__c === 'Incasso').map(this.itemToIncassoRow.bind(this));
        this.spese = items.filter(i => i.Tipo__c === 'Spesa').map(this.itemToSpesaRow.bind(this));
    }

    // Builds an options list annotated with 'selected' flags so native
    // <select> / <option selected> knows which option to highlight.
    _progOptsFor(selectedId) {
        return (this.programmaOptions || []).map(o => ({
            ...o,
            selected: (o.value || '') === (selectedId || '')
        }));
    }

    itemToIncassoRow(it) {
        const progId = it.Programma__c || null;
        return {
            id: it.Id,
            programmaId: progId,
            programmaName: (it.Programma__r && it.Programma__r.Name) || '',
            programmaOptions: this._progOptsFor(progId),
            categoria: it.Categoria__c || '',
            name: it.Nome__c || '',
            data: it.Data__c || null,
            ammontare: it.Ammontare__c,
            ammontareFmt: this.formatCurrency(it.Ammontare__c),
            note: it.Note__c || '',
            sortOrder: it.Sort_Order__c,
            isEditing: this.editingRowIds.has(it.Id),
            categoriaOptions: this.incassoCategoriaOptions
        };
    }

    itemToSpesaRow(it) {
        const progId = it.Programma__c || null;
        return {
            id: it.Id,
            programmaId: progId,
            programmaName: (it.Programma__r && it.Programma__r.Name) || '',
            programmaOptions: this._progOptsFor(progId),
            categoria: it.Categoria__c || '',
            sottocategoria: it.Sottocategoria__c || '',
            name: it.Nome__c || '',
            data: it.Data__c || null,
            ammontare: it.Ammontare__c,
            ammontareFmt: this.formatCurrency(it.Ammontare__c),
            note: it.Note__c || '',
            sortOrder: it.Sort_Order__c,
            isEditing: this.editingRowIds.has(it.Id),
            categoriaOptions: this.speseCategoriaOptions,
            subOptions: this.subOptionsFor(it.Categoria__c || '')
        };
    }

    get annoInt() {
        const n = parseInt(this.anno, 10);
        return Number.isFinite(n) ? n : null;
    }

    formatVersionLabel(v) {
        const prefix = `v${v.numeroVersione} — ${v.stato}`;
        if (v.nome) return `${prefix} — ${v.nome}`;
        return prefix;
    }

    get versionOptionsWithNew() {
        return [
            ...this.versionOptions,
            { label: '+ Nuova versione per questo anno', value: '__new__' }
        ];
    }

    get versionBannerClass() {
        if (!this.currentVersion) return 'designer-hero designer-hero--empty';
        const map = {
            'Provvisorio': 'designer-hero designer-hero--provvisorio',
            'Ufficiale': 'designer-hero designer-hero--ufficiale',
            'Storicizzata': 'designer-hero designer-hero--storicizzata'
        };
        return map[this.currentVersion.stato] || 'designer-hero';
    }

    get isVersionEditable() {
        return this.currentVersion && this.currentVersion.stato === 'Provvisorio';
    }

    get isVersionUfficiale() {
        return this.currentVersion && this.currentVersion.stato === 'Ufficiale';
    }

    get versionHeadline() {
        if (!this.annoInt) return 'Budget Designer';
        const base = `Definizione Budget per l'Anno ${this.annoInt}`;
        if (this.currentVersion) return `${base} — Versione ${this.currentVersion.numeroVersione}`;
        return base;
    }

    get confirmBudgetDisabled() {
        return !this.isVersionEditable || this.editingRowIds.size > 0;
    }

    buildYearOptions(fromServer) {
        const set = new Set(fromServer.map(String));
        const base = Number(this.anno) || Number(currentYear());
        for (let y = base - 2; y <= base + 10; y++) set.add(String(y));
        return Array.from(set).sort().reverse().map(y => ({ label: y, value: y }));
    }

    blankIncassoRow() {
        return { programmaId: '', categoria: '', name: '', data: '', ammontare: '', note: '' };
    }

    blankSpesaRow() {
        return { programmaId: '', categoria: '', sottocategoria: '', name: '', data: '', ammontare: '', note: '' };
    }

    emptyDraftIncasso() { return this.blankIncassoRow(); }
    emptyDraftSpesa() { return this.blankSpesaRow(); }

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

    // Raggruppa le righe per categoria rispettando il categoryOrder.
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

    // Righe materializzate (flat)
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
            programmaOptions: this._progOptsFor(this.draftIncasso.programmaId),
            canAdd: this.isIncassoDraftValid(this.draftIncasso)
        };
    }

    get draftSpesaView() {
        return {
            ...this.draftSpesa,
            categoriaOptions: this.speseCategoriaOptions,
            programmaOptions: this._progOptsFor(this.draftSpesa.programmaId),
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
        // Reset version selection so the new year's wire picks the default.
        this.selectedVersionId = null;
        this.currentVersion = null;
    }

    handleDataTargetChange(event) {
        this.dataTarget = event.target.value || todayISO();
    }

    // ── Budget Version handlers ───────────────────────────────────────
    handleVersionChange(e) {
        const val = e.detail.value;
        if (val === '__new__') {
            this.dialogNome = '';
            this.dialogDescrizione = '';
            this.showCreateVersionDialog = true;
            return;
        }
        if (this.editingRowIds.size > 0) {
            // eslint-disable-next-line no-alert
            if (!confirm('Hai modifiche non salvate. Cambiando versione le perderai. Continuare?')) {
                return;
            }
            this.editingRowIds = new Set();
            this.pendingRowEdits = new Map();
        }
        this.selectedVersionId = val;
    }

    handleOpenCreateVersion() {
        this.dialogNome = '';
        this.dialogDescrizione = '';
        this.showCreateVersionDialog = true;
    }

    async handleConfirmCreateVersion() {
        try {
            const id = await createVersion({
                anno: this.annoInt,
                nome: this.dialogNome || null,
                descrizione: this.dialogDescrizione || null
            });
            this.showCreateVersionDialog = false;
            this.selectedVersionId = id;
            await refreshApex(this._wiredVersions);
        } catch (e) { this.showError(e); }
    }

    handleCancelCreateVersion() { this.showCreateVersionDialog = false; }

    handleOpenRename() {
        this.dialogNome = this.currentVersion ? (this.currentVersion.nome || '') : '';
        this.dialogDescrizione = this.currentVersion ? (this.currentVersion.descrizione || '') : '';
        this.showRenameVersionDialog = true;
    }

    async handleConfirmRename() {
        try {
            await updateVersionHeader({
                versionId: this.selectedVersionId,
                nome: this.dialogNome,
                descrizione: this.dialogDescrizione
            });
            this.showRenameVersionDialog = false;
            await refreshApex(this._wiredDetail);
            await refreshApex(this._wiredVersions);
        } catch (e) { this.showError(e); }
    }

    handleCancelRename() { this.showRenameVersionDialog = false; }

    handleOpenTrash() { this.showTrashVersionDialog = true; }

    async handleConfirmTrash() {
        try {
            await trashVersion({ versionId: this.selectedVersionId });
            this.showTrashVersionDialog = false;
            this.selectedVersionId = null;
            await refreshApex(this._wiredVersions);
        } catch (e) { this.showError(e); }
    }

    handleCancelTrash() { this.showTrashVersionDialog = false; }

    handleOpenConfirmBudget() { this.showConfirmBudgetDialog = true; }

    async handleConfirmPromote() {
        try {
            await promoteVersion({ versionId: this.selectedVersionId });
            this.showConfirmBudgetDialog = false;
            await refreshApex(this._wiredVersions);
            await refreshApex(this._wiredDetail);
        } catch (e) { this.showError(e); }
    }

    handleCancelPromote() { this.showConfirmBudgetDialog = false; }

    handleOpenForkConfirm() { this.showForkConfirmDialog = true; }

    async handleConfirmFork() {
        try {
            const newId = await forkVersion({ sourceVersionId: this.selectedVersionId });
            this.showForkConfirmDialog = false;
            this.selectedVersionId = newId;
            await refreshApex(this._wiredVersions);
        } catch (e) { this.showError(e); }
    }

    handleCancelFork() { this.showForkConfirmDialog = false; }

    handleDialogNomeChange(e) { this.dialogNome = e.detail.value; }
    handleDialogDescChange(e) { this.dialogDescrizione = e.detail.value; }

    showError(e) {
        const msg = (e && e.body && e.body.message) || (e && e.message) || 'Errore sconosciuto';
        // eslint-disable-next-line no-alert
        alert(msg);
    }

    // ── Row View/Edit cycle ───────────────────────────────────────────
    handleRowBeginEdit(e) {
        if (!this.isVersionEditable) {
            this.handleOpenForkConfirm();
            return;
        }
        const id = e.currentTarget.dataset.id;
        const kind = e.currentTarget.dataset.kind;
        this._snapshotRow(id, kind);
        const set = new Set(this.editingRowIds);
        set.add(id);
        this.editingRowIds = set;
        this._remapRowsFromCache();
    }

    _snapshotRow(id, kind) {
        const row = this._findRow(id, kind);
        if (!row) return;
        const snap = { ...row };
        const m = new Map(this.pendingRowEdits);
        m.set(id, { original: snap, current: { ...row } });
        this.pendingRowEdits = m;
    }

    _findRow(id, kind) {
        const list = kind === 'incasso' ? this.incassi : this.spese;
        return list.find(r => r.id === id);
    }

    handleRowCellChange(e) {
        const id = e.currentTarget.dataset.id;
        const field = e.currentTarget.dataset.field;
        const value = this.readEventValue(e);
        const m = new Map(this.pendingRowEdits);
        const entry = m.get(id);
        if (!entry) return;
        entry.current = { ...entry.current, [field]: value };
        m.set(id, entry);
        this.pendingRowEdits = m;
    }

    async handleRowConfirm(e) {
        const id = e.currentTarget.dataset.id;
        const kind = e.currentTarget.dataset.kind;
        const entry = this.pendingRowEdits.get(id);
        if (!entry) return;
        const cur = entry.current;
        const payload = {
            Id: id,
            Budget_Version__c: this.selectedVersionId,
            Tipo__c: kind === 'incasso' ? 'Incasso' : 'Spesa',
            Programma__c: cur.programmaId || null,
            Categoria__c: cur.categoria || null,
            Sottocategoria__c: kind === 'spesa' ? (cur.sottocategoria || null) : null,
            Nome__c: cur.name || null,
            Data__c: cur.data || null,
            Ammontare__c: cur.ammontare || 0,
            Note__c: cur.note || null,
            Sort_Order__c: cur.sortOrder || null
        };
        try {
            await upsertItem({ item: payload });
            const s = new Set(this.editingRowIds); s.delete(id); this.editingRowIds = s;
            const m = new Map(this.pendingRowEdits); m.delete(id); this.pendingRowEdits = m;
            await refreshApex(this._wiredDetail);
            this._remapRowsFromCache();
        } catch (err) { this.showError(err); }
    }

    handleRowCancelEdit(e) {
        const id = e.currentTarget.dataset.id;
        const s = new Set(this.editingRowIds); s.delete(id); this.editingRowIds = s;
        const m = new Map(this.pendingRowEdits); m.delete(id); this.pendingRowEdits = m;
        this._remapRowsFromCache();
    }

    async handleRowDelete(e) {
        const id = e.currentTarget.dataset.id;
        // eslint-disable-next-line no-alert
        if (!confirm('Rimuovere la riga?')) return;
        try {
            await deleteItem({ itemId: id });
            await refreshApex(this._wiredDetail);
        } catch (err) { this.showError(err); }
    }

    // Handlers celle incassi esistenti (legacy in-row edit — resta per compatibilità HTML corrente)
    handleIncassoCellChange(event) {
        const { id, field } = event.currentTarget.dataset;
        const value = this.readEventValue(event);
        this.incassi = this.incassi.map(r => r.id === id ? { ...r, [field]: value } : r);
    }

    handleIncassoRemove(event) {
        const id = event.currentTarget.dataset.id;
        this.incassi = this.incassi.filter(r => r.id !== id);
    }

    // Handlers celle draft incasso
    handleDraftIncassoChange(event) {
        const field = event.currentTarget.dataset.field;
        const value = this.readEventValue(event);
        this.draftIncasso = { ...this.draftIncasso, [field]: value };
    }

    async _persistDraftIncasso() {
        if (!this.isVersionEditable) return false;
        if (!this.isIncassoDraftValid(this.draftIncasso)) return false;
        const d = this.draftIncasso;
        const payload = {
            Budget_Version__c: this.selectedVersionId,
            Tipo__c: 'Incasso',
            Programma__c: d.programmaId || null,
            Categoria__c: d.categoria || null,
            Nome__c: d.name || null,
            Data__c: d.data || this.dataTarget || null,
            Ammontare__c: d.ammontare || 0,
            Note__c: d.note || null,
            Sort_Order__c: (this.incassi.length + 1)
        };
        try {
            await upsertItem({ item: payload });
            this.draftIncasso = this.emptyDraftIncasso();
            await refreshApex(this._wiredDetail);
            return true;
        } catch (e) { this.showError(e); return false; }
    }

    async handleDraftIncassoSubmit() {
        const ok = await this._persistDraftIncasso();
        if (ok) this.focusAfterAdd('incasso');
    }

    async handleDraftIncassoConfirm() {
        await this._persistDraftIncasso();
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
    }

    handleSpesaRemove(event) {
        const id = event.currentTarget.dataset.id;
        this.spese = this.spese.filter(r => r.id !== id);
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

    async _persistDraftSpesa() {
        if (!this.isVersionEditable) return false;
        if (!this.isSpesaDraftValid(this.draftSpesa)) return false;
        const d = this.draftSpesa;
        const payload = {
            Budget_Version__c: this.selectedVersionId,
            Tipo__c: 'Spesa',
            Programma__c: d.programmaId || null,
            Categoria__c: d.categoria || null,
            Sottocategoria__c: d.sottocategoria || null,
            Nome__c: d.name || null,
            Data__c: d.data || this.dataTarget || null,
            Ammontare__c: d.ammontare || 0,
            Note__c: d.note || null,
            Sort_Order__c: (this.spese.length + 1)
        };
        try {
            await upsertItem({ item: payload });
            this.draftSpesa = this.emptyDraftSpesa();
            await refreshApex(this._wiredDetail);
            return true;
        } catch (e) { this.showError(e); return false; }
    }

    async handleDraftSpesaSubmit() {
        const ok = await this._persistDraftSpesa();
        if (ok) this.focusAfterAdd('spesa');
    }

    async handleDraftSpesaConfirm() {
        await this._persistDraftSpesa();
    }

    readEventValue(event) {
        if (event.detail && 'value' in event.detail) return event.detail.value;
        if (event.target) return event.target.value;
        return undefined;
    }

    focusAfterAdd(which) {
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            const selector = which === 'incasso'
                ? '[data-scope="draft-incasso"][data-field="categoria"]'
                : '[data-scope="draft-spesa"][data-field="categoria"]';
            const el = this.template.querySelector(selector);
            if (el && typeof el.focus === 'function') el.focus();
        }, 40);
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

    // Duplica: clona la riga via upsertItem server-side.
    async handleRowDuplicateInline(event) {
        event.stopPropagation();
        if (!this.isVersionEditable) { this.handleOpenForkConfirm(); return; }
        const { id, kind } = event.currentTarget.dataset;
        const row = this._findRowByInfo(id, kind);
        if (!row) return;
        const payload = {
            Budget_Version__c: this.selectedVersionId,
            Tipo__c: kind === 'incasso' ? 'Incasso' : 'Spesa',
            Programma__c: row.programmaId || null,
            Categoria__c: row.categoria || null,
            Sottocategoria__c: kind === 'spesa' ? (row.sottocategoria || null) : null,
            Nome__c: row.name || null,
            Data__c: row.data || null,
            Ammontare__c: row.ammontare || 0,
            Note__c: kind === 'spesa' ? (row.note || null) : null,
            Sort_Order__c: (kind === 'incasso' ? this.incassi.length : this.spese.length) + 1
        };
        try {
            await upsertItem({ item: payload });
            await refreshApex(this._wiredDetail);
        } catch (e) { this.showError(e); }
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
    }

    // Incolla: sovrascrive la riga target via upsertItem (tenendo l'Id target).
    async handleRowPasteInline(event) {
        event.stopPropagation();
        if (!this.isVersionEditable) { this.handleOpenForkConfirm(); return; }
        const { id, kind } = event.currentTarget.dataset;
        if (!this._rowClipboard || this._rowClipboard.kind !== kind) return;
        const target = this._findRowByInfo(id, kind);
        if (!target) return;
        const merged = { ...target, ...this._rowClipboard.payload };
        const payload = {
            Id: target.id,
            Budget_Version__c: this.selectedVersionId,
            Tipo__c: kind === 'incasso' ? 'Incasso' : 'Spesa',
            Programma__c: merged.programmaId || null,
            Categoria__c: merged.categoria || null,
            Sottocategoria__c: kind === 'spesa' ? (merged.sottocategoria || null) : null,
            Nome__c: merged.name || null,
            Data__c: merged.data || null,
            Ammontare__c: merged.ammontare || 0,
            Note__c: kind === 'spesa' ? (merged.note || null) : null,
            Sort_Order__c: merged.sortOrder || null
        };
        try {
            await upsertItem({ item: payload });
            this.copyMode = null;
            this._rowClipboard = null;
            await refreshApex(this._wiredDetail);
        } catch (e) { this.showError(e); }
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
            try { event.dataTransfer.setData('text/plain', id); } catch (_) {}
        }
    }

    handleRowDragOver(event) {
        if (!this._dragRowId && !this._dragGroupKey) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }

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

        this._persistReorder(draggedKind);
    }

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

        // Trascinamento di una CATEGORIA intera
        if (draggedGroupKey && draggedGroupKind === targetKind) {
            const orderList = targetKind === 'incasso'
                ? [...(this.incassiCategoryOrder.length ? this.incassiCategoryOrder : this._currentCategoryOrder('incasso'))]
                : [...(this.speseCategoryOrder.length ? this.speseCategoryOrder : this._currentCategoryOrder('spesa'))];
            const draggedCat = draggedGroupKey.replace(/^grp-/, '');
            const draggedActualCat = draggedCat === 'nocat' ? '' : draggedCat;
            const fromI = orderList.indexOf(draggedActualCat);
            const toI = orderList.indexOf(targetCategoria);
            if (fromI < 0 || toI < 0) return;
            const [moved] = orderList.splice(fromI, 1);
            orderList.splice(toI, 0, moved);
            if (targetKind === 'incasso') this.incassiCategoryOrder = orderList;
            else this.speseCategoryOrder = orderList;
            return;
        }

        // Riga droppata su header
        if (!draggedRowId || draggedRowKind !== targetKind) return;
        const list = draggedRowKind === 'incasso' ? [...this.incassi] : [...this.spese];
        const fromIdx = list.findIndex(r => r.id === draggedRowId);
        if (fromIdx < 0) return;
        const [moved] = list.splice(fromIdx, 1);
        if (moved.categoria !== targetCategoria) {
            moved.categoria = targetCategoria;
            if (draggedRowKind === 'spesa') moved.sottocategoria = '';
        }
        let lastIdxOfCat = -1;
        list.forEach((r, i) => { if (r.categoria === targetCategoria) lastIdxOfCat = i; });
        const insertAt = lastIdxOfCat >= 0 ? lastIdxOfCat + 1 : list.length;
        list.splice(insertAt, 0, moved);
        if (draggedRowKind === 'incasso') this.incassi = list;
        else this.spese = list;

        this._persistReorder(draggedRowKind);
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

    async _persistReorder(kind) {
        const list = kind === 'incasso' ? this.incassi : this.spese;
        const orders = list
            .filter(r => r && r.id)
            .map((r, i) => ({ itemId: r.id, sortOrder: i + 1 }));
        if (orders.length === 0) return;
        try {
            await reorderItems({ orders });
        } catch (e) { this.showError(e); }
    }
}
