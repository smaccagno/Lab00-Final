import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { openTab } from 'lightning/platformWorkspaceApi';

import getCategoriaValues from '@salesforce/apex/SpeseExcelEditorController.getCategoriaValues';
import getSottocategorieByCategoria from '@salesforce/apex/SpeseExcelEditorController.getSottocategorieByCategoria';
import getStatoValues from '@salesforce/apex/SpeseExcelEditorController.getStatoValues';
import createSpeseFromFlow from '@salesforce/apex/SpeseExcelEditorController.createSpeseFromFlow';

export default class SpeseExcelEditor extends LightningElement {
    @track rows = [];
    @track isValidating = false;
    @track showResults = false;
    @track saveResults = [];

    isSaving = false;
    picklistsReady = false;

    categoriaOptions = [];
    statoOptions = [];
    sottocategorieByCategoria = {};

    selectedRowIndex = -1;

    @track cellActionMenuOpen = false;
    @track cellActionMenuStyle = '';
    cellActionMenuInfo = null; // {rowIndex, field}

    @track editorOpen = false;
    @track editorStyle = '';
    @track editorType = 'text';
    @track editorValue = '';
    @track editorFilter = '';
    @track editorOptions = [];
    @track editorHelpText = '';
    editorRowIndex = -1;
    editorField = '';

    _windowClickHandler;

    connectedCallback() {
        this._windowClickHandler = this.handleWindowClick.bind(this);
        window.addEventListener('click', this._windowClickHandler);

        this.initPicklists()
            .then(() => {
                if (!this.rows.length) this.addRow();
            })
            .catch(() => {
                // handled in initPicklists
            });
    }

    disconnectedCallback() {
        if (this._windowClickHandler) {
            window.removeEventListener('click', this._windowClickHandler);
        }
    }

    get isNoRowSelected() {
        return this.selectedRowIndex === -1;
    }

    get isTableEmpty() {
        return this.rows.length === 0 || (this.rows.length === 1 && this.isRowEmpty(this.rows[0]));
    }

    get isCreatingDisabled() {
        return (
            this.isSaving ||
            this.isValidating ||
            this.rows.length === 0 ||
            !this.rows.some(row => !this.isRowEmpty(row)) ||
            this.rows.some(row => row.hasErrors)
        );
    }

    get isEditorDropdown() {
        return this.editorOpen && this.editorType === 'dropdown';
    }

    get isEditorTextarea() {
        return this.editorOpen && this.editorType === 'textarea';
    }

    get isEditorInput() {
        return this.editorOpen && (this.editorType === 'text' || this.editorType === 'date');
    }

    get editorPlaceholder() {
        if (this.editorField === 'anno') return 'Inserisci l\'anno';
        if (this.editorField === 'ammontare') return 'Inserisci l\'ammontare';
        if (this.editorField === 'data') return 'Es. 31/12/2026, 2026-12-31, 31 dic 26';
        if (this.editorField === 'note') return 'Inserisci le note';
        return 'Inserisci valore';
    }

    get filteredEditorOptions() {
        const filter = (this.editorFilter || '').trim().toLowerCase();
        if (!filter) return this.editorOptions;
        return (this.editorOptions || []).filter(option => {
            const label = (option.label || '').toLowerCase();
            const value = (option.value || '').toLowerCase();
            return label.includes(filter) || value.includes(filter);
        });
    }

    get hasFilteredEditorOptions() {
        return this.filteredEditorOptions.length > 0;
    }

    async initPicklists() {
        try {
            const [cats, sottosMap, st] = await Promise.all([
                getCategoriaValues(),
                getSottocategorieByCategoria(),
                getStatoValues()
            ]);

            this.categoriaOptions = (cats || []).map(v => ({ label: v, value: v }));
            this.statoOptions = (st || []).map(v => ({ label: v, value: v }));
            this.sottocategorieByCategoria = sottosMap || {};
            this.picklistsReady = true;
        } catch (e) {
            this.picklistsReady = false;
            this.showToast('Errore', e?.body?.message || e.message || 'Impossibile caricare le picklist', 'error');
        }
    }

    handleWindowClick(event) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const hitsComponent = path.some(node => {
            if (!node || node.nodeType !== 1) return false;
            const cls = node.classList;
            if (!cls) return false;
            return (
                cls.contains('cell-action-menu') ||
                cls.contains('cell-editor-overlay') ||
                cls.contains('editable-cell') ||
                cls.contains('note-cell') ||
                cls.contains('row-number-cell') ||
                node.tagName === 'C-SPESE-EXCEL-EDITOR'
            );
        });
        if (!hitsComponent) {
            if (this.cellActionMenuOpen) this.closeCellActionMenu();
            if (this.editorOpen) this.closeEditor();
        }
    }

    addRow(values = {}) {
        const row = {
            rowKey: `row_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            anno: values.anno || '',
            categoria: values.categoria || '',
            sottocategoria: values.sottocategoria || '',
            note: values.note || '',
            data: values.data || '',
            ammontare: values.ammontare || '',
            stato: values.stato || ''
        };

        this.rows = [...this.rows, row];
        this.recomputeRows();
    }

    handleAddRow() {
        this.showResults = false;
        this.saveResults = [];
        this.closeCellActionMenu();
        this.closeEditor();
        this.addRow();
    }

    startNewEntry() {
        this.rows = [];
        this.selectedRowIndex = -1;
        this.showResults = false;
        this.saveResults = [];
        this.closeCellActionMenu();
        this.closeEditor();
        this.addRow();
    }

    selectRow(event) {
        const rowIndex = parseInt(event.currentTarget.dataset.rowIndex, 10);
        this.selectedRowIndex = Number.isInteger(rowIndex) ? rowIndex : -1;
        this.recomputeRows();
    }

    handleCellClick(event) {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'BUTTON' || event.target.closest('button')) {
            return;
        }

        let cell = event.currentTarget;
        if (!cell || cell.tagName !== 'TD') {
            cell = event.target.closest('td');
        }
        if (!cell) return;

        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        const field = cell.dataset.field;

        this.selectedRowIndex = rowIndex;
        this.recomputeRows();

        if (!field) return;

        event.stopPropagation();

        // Per le picklist apriamo direttamente il dropdown, come nei massivi esistenti.
        if (['categoria', 'sottocategoria', 'stato'].includes(field)) {
            this.openEditorForCell(rowIndex, field, cell);
            return;
        }

        this.openCellActionMenu(rowIndex, field, cell);
    }

    handleCellDblClick(event) {
        let cell = event.currentTarget;
        if (!cell || cell.tagName !== 'TD') {
            cell = event.target.closest('td');
        }
        if (!cell) return;

        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        const field = cell.dataset.field;
        if (!field) return;

        event.stopPropagation();
        this.selectedRowIndex = rowIndex;
        this.recomputeRows();
        this.openEditorForCell(rowIndex, field, cell);
    }

    openCellActionMenu(rowIndex, field, cell) {
        this.closeEditor();
        this.cellActionMenuInfo = { rowIndex, field };
        const rect = cell.getBoundingClientRect();
        this.cellActionMenuStyle = `top: ${rect.bottom + 4}px; left: ${rect.left}px;`;
        this.cellActionMenuOpen = true;
    }

    closeCellActionMenu() {
        this.cellActionMenuOpen = false;
        this.cellActionMenuInfo = null;
        this.cellActionMenuStyle = '';
    }

    openEditorForCell(rowIndex, field, cell) {
        const row = this.rows[rowIndex];
        if (!row) return;

        this.closeCellActionMenu();

        let editorType = 'text';
        let editorOptions = [];
        let editorHelpText = '';

        if (['categoria', 'sottocategoria', 'stato'].includes(field)) {
            editorType = 'dropdown';
            editorOptions = this.getEditorOptions(rowIndex, field);
        } else if (field === 'note') {
            editorType = 'textarea';
        } else if (field === 'data') {
            editorType = 'date';
            editorHelpText = 'Formati accettati: 31/12/2026, 2026-12-31, 31 dic 26.';
        }

        const rect = cell.getBoundingClientRect();
        this.editorOpen = true;
        this.editorRowIndex = rowIndex;
        this.editorField = field;
        this.editorType = editorType;
        this.editorValue = row[field] || '';
        this.editorFilter = '';
        this.editorOptions = editorOptions;
        this.editorHelpText = editorHelpText;
        this.editorStyle = `top: ${Math.max(8, rect.top)}px; left: ${Math.max(8, rect.left)}px; min-width: ${Math.max(rect.width, field === 'note' ? 320 : 220)}px;`;

        setTimeout(() => {
            if (editorType === 'dropdown') {
                const filter = this.template.querySelector('.cell-editor-filter');
                if (filter) filter.focus();
            } else if (editorType === 'textarea') {
                const textarea = this.template.querySelector('.cell-editor-textarea');
                if (textarea) textarea.focus();
            } else {
                const input = this.template.querySelector('.cell-editor-input');
                if (input) {
                    input.focus();
                    input.select();
                }
            }
        }, 50);
    }

    closeEditor() {
        this.editorOpen = false;
        this.editorStyle = '';
        this.editorType = 'text';
        this.editorValue = '';
        this.editorFilter = '';
        this.editorOptions = [];
        this.editorHelpText = '';
        this.editorRowIndex = -1;
        this.editorField = '';
    }

    getEditorOptions(rowIndex, field) {
        if (field === 'categoria') return this.categoriaOptions;
        if (field === 'stato') return this.statoOptions;
        if (field === 'sottocategoria') {
            const row = this.rows[rowIndex];
            const values = this.getSubcategoriesForCategory(row?.categoria);
            return values.map(v => ({ label: v, value: v }));
        }
        return [];
    }

    handleEditorInput(event) {
        this.editorValue = event.target.value;
    }

    handleEditorFilterInput(event) {
        this.editorFilter = event.target.value;
    }

    handleEditorKeyDown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.closeEditor();
            return;
        }

        if (event.key === 'Enter' && this.editorType !== 'textarea' && this.editorType !== 'dropdown') {
            event.preventDefault();
            this.handleEditorConfirm();
            return;
        }

        if (event.key === 'Enter' && this.editorType === 'textarea' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            this.handleEditorConfirm();
        }
    }

    handleEditorOptionSelect(event) {
        const value = event.currentTarget.dataset.value;
        this.updateRowData(this.editorRowIndex, this.editorField, value);
        this.closeEditor();
    }

    handleEditorConfirm() {
        this.updateRowData(this.editorRowIndex, this.editorField, this.editorValue);
        this.closeEditor();
    }

    handleEditorCancel() {
        this.closeEditor();
    }

    clearCellContent(event) {
        event.stopPropagation();
        const rowIndex = parseInt(event.currentTarget.dataset.rowIndex, 10);
        const field = event.currentTarget.dataset.field;
        this.closeCellActionMenu();
        this.closeEditor();
        this.updateRowData(rowIndex, field, '');
    }

    getCellValueForCopy(rowIndex, field) {
        const row = this.rows[rowIndex];
        if (!row) return '';
        return row[field] || '';
    }

    handleCellCopyClick(event) {
        event.stopPropagation();
        const info = this.cellActionMenuInfo;
        if (!info) return;
        const value = this.getCellValueForCopy(info.rowIndex, info.field);
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            this.showToast('Errore', 'Clipboard non disponibile.', 'error');
            return;
        }
        navigator.clipboard.writeText(value).then(() => {
            this.showToast('Copia', 'Valore copiato negli appunti', 'success');
        }).catch(() => {
            this.showToast('Errore', 'Impossibile copiare negli appunti', 'error');
        });
        this.closeCellActionMenu();
    }

    async handleCellPasteClick(event) {
        event.stopPropagation();
        const info = this.cellActionMenuInfo;
        if (!info) return;

        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                this.showToast('Info', 'Nessun testo negli appunti', 'info');
                return;
            }

            const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() || line.includes('\t'));
            if (lines.length > 1 || (lines.length === 1 && lines[0].includes('\t'))) {
                this.selectedRowIndex = info.rowIndex;
                await this.pasteFromClipboard(info.rowIndex);
            } else {
                const value = lines[0] ? lines[0].trim() : '';
                this.updateRowData(info.rowIndex, info.field, value);
                this.showToast('Incolla', 'Valore incollato', 'success');
            }
        } catch (err) {
            this.showToast('Errore', 'Impossibile leggere dagli appunti. Verifica i permessi del browser.', 'error');
        }

        this.closeCellActionMenu();
    }

    async handleEditorCopyClick(event) {
        event.stopPropagation();
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            this.showToast('Errore', 'Clipboard non disponibile.', 'error');
            return;
        }
        try {
            await navigator.clipboard.writeText(this.editorValue || '');
            this.showToast('Copia', 'Valore copiato negli appunti', 'success');
        } catch {
            this.showToast('Errore', 'Impossibile copiare negli appunti', 'error');
        }
    }

    async handleEditorPasteClick(event) {
        event.stopPropagation();
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                this.showToast('Info', 'Nessun testo negli appunti', 'info');
                return;
            }

            const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim() || line.includes('\t'));
            if (lines.length > 1 || (lines.length === 1 && lines[0].includes('\t'))) {
                this.selectedRowIndex = this.editorRowIndex;
                this.closeEditor();
                await this.pasteFromClipboard(this.editorRowIndex);
            } else {
                this.editorValue = lines[0] ? lines[0].trim() : '';
            }
        } catch (err) {
            this.showToast('Errore', 'Impossibile leggere dagli appunti. Verifica i permessi del browser.', 'error');
        }
    }

    deleteSelectedRow() {
        if (this.selectedRowIndex === -1) return;
        const rows = [...this.rows];
        rows.splice(this.selectedRowIndex, 1);
        this.rows = rows;
        this.selectedRowIndex = -1;
        this.showResults = false;
        this.saveResults = [];
        if (this.rows.length === 0) {
            this.addRow();
        } else {
            this.recomputeRows();
        }
    }

    deleteAllRows() {
        this.rows = [];
        this.selectedRowIndex = -1;
        this.showResults = false;
        this.saveResults = [];
        this.closeCellActionMenu();
        this.closeEditor();
        this.addRow();
    }

    updateRowData(rowIndex, field, value) {
        if (rowIndex < 0 || rowIndex >= this.rows.length) return;

        const rows = [...this.rows];
        const row = { ...rows[rowIndex] };
        const trimmed = value === null || value === undefined ? '' : String(value).trim();

        if (field === 'anno') {
            row.anno = !trimmed ? '' : (this.parseInteger(trimmed) || trimmed);
        } else if (field === 'ammontare') {
            row.ammontare = !trimmed ? '' : (this.parseCurrency(trimmed) || trimmed);
        } else if (field === 'data') {
            row.data = !trimmed ? '' : (this.parseDate(trimmed) || trimmed);
        } else if (field === 'categoria') {
            row.categoria = !trimmed ? '' : (this.matchOptionValue(this.categoriaOptions, trimmed) || trimmed);
        } else if (field === 'sottocategoria') {
            const options = this.getSubcategoriesForCategory(row.categoria);
            row.sottocategoria = !trimmed ? '' : (this.matchStringValue(options, trimmed) || trimmed);
        } else if (field === 'stato') {
            row.stato = !trimmed ? '' : (this.matchOptionValue(this.statoOptions, trimmed) || trimmed);
        } else if (field === 'note') {
            row.note = value == null ? '' : String(value);
        }

        row.saveErrorMessage = '';
        rows[rowIndex] = row;
        this.rows = rows;
        this.showResults = false;
        this.saveResults = [];
        this.recomputeRows();
    }

    async pasteFromClipboard(startRowIndex = null) {
        if (!this.picklistsReady) {
            this.showToast('Attenzione', 'Attendi che le picklist vengano caricate.', 'warning');
            return;
        }

        this.isValidating = true;
        this.closeCellActionMenu();
        this.closeEditor();
        this.showResults = false;
        this.saveResults = [];

        try {
            if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
                throw new Error('API clipboard non disponibile.');
            }

            const clipboardText = await navigator.clipboard.readText();
            if (!clipboardText || !clipboardText.trim()) {
                throw new Error('Nessun dato trovato nella clipboard.');
            }

            const parsedRows = this.parseClipboardText(clipboardText);
            if (parsedRows.length === 0) {
                throw new Error('Nessuna riga valida trovata nella clipboard.');
            }

            let insertIndex = Number.isInteger(startRowIndex) && startRowIndex >= 0 ? startRowIndex : this.rows.findIndex(r => this.isRowEmpty(r));
            if (insertIndex === -1) insertIndex = this.rows.length;

            while (this.rows.length < insertIndex + parsedRows.length) {
                this.rows = [...this.rows, this.buildEmptyRow()];
            }

            const rows = [...this.rows];
            parsedRows.forEach((parsedRow, idx) => {
                rows[insertIndex + idx] = {
                    ...rows[insertIndex + idx],
                    ...parsedRow
                };
            });

            this.rows = rows;
            this.selectedRowIndex = insertIndex;
            this.recomputeRows();
            this.showToast('Successo', `${parsedRows.length} righe incollate con successo`, 'success');
        } catch (error) {
            this.showToast('Errore', error?.message || 'Impossibile leggere dagli appunti.', 'error');
        } finally {
            this.isValidating = false;
        }
    }

    async handleSave() {
        this.closeCellActionMenu();
        this.closeEditor();
        this.showResults = false;
        this.saveResults = [];
        this.recomputeRows();

        const rowsToSave = this.rows.filter(row => !this.isRowEmpty(row));
        if (!rowsToSave.length) {
            this.showToast('Attenzione', 'Nessuna riga compilata da salvare.', 'warning');
            return;
        }

        const invalidRows = rowsToSave.filter(row => row.hasErrors);
        if (invalidRows.length > 0) {
            this.showToast('Errore', 'Correggi prima le celle evidenziate in rosso.', 'error');
            return;
        }

        this.isSaving = true;
        try {
            const payload = rowsToSave.map(row => ({
                rowNumber: row.rowNumber,
                anno: row.anno,
                categoria: row.categoria,
                sottocategoria: row.sottocategoria,
                note: row.note,
                data: row.data,
                ammontare: row.ammontare,
                stato: row.stato
            }));

            const res = await createSpeseFromFlow({ speseDataJson: JSON.stringify(payload) });
            const spesaResults = res?.spesaResults || [];

            this.saveResults = spesaResults.map((row, index) => ({
                id: `result_${index}`,
                isSuccess: row.isSuccess === true || row.status === 'success',
                ...row
            }));
            this.showResults = true;

            const errorMap = {};
            spesaResults.forEach(result => {
                if (result.status !== 'success' && result.errorMessage) {
                    errorMap[Number(result.rowNumber)] = result.errorMessage;
                }
            });

            this.rows = this.rows.map(row => ({
                ...row,
                saveErrorMessage: errorMap[row.rowNumber] || ''
            }));
            this.recomputeRows();

            const createdCount = res?.createdCount || 0;
            const errorCount = spesaResults.filter(result => result.status !== 'success').length;

            if (createdCount > 0 && errorCount === 0) {
                this.showToast('Successo', `${createdCount} spesa/e create con successo.`, 'success');
            } else {
                this.showToast('Risultato parziale', `Creazione completata: ${createdCount} successi, ${errorCount} errori.`, errorCount ? 'error' : 'success');
            }
        } catch (e) {
            this.showToast('Errore', e?.body?.message || e.message || 'Errore durante il salvataggio', 'error');
        } finally {
            this.isSaving = false;
        }
    }

    async openSpesaRecord(event) {
        const spesaId = event.currentTarget.dataset.spesaId;
        if (!spesaId) return;

        try {
            await openTab({
                recordId: spesaId,
                focus: true
            });
        } catch (error) {
            window.open(`/lightning/r/Voce_di_Spesa__c/${spesaId}/view`, '_blank');
        }
    }

    recomputeRows() {
        this.rows = this.rows.map((row, index) => this.decorateRow(row, index));
    }

    decorateRow(row, index) {
        const validationErrors = this.getValidationErrors(row);
        const hasErrors = Object.values(validationErrors).some(Boolean);
        const errorParts = [];
        if (validationErrors.anno) errorParts.push('Anno non valido');
        if (validationErrors.categoria) errorParts.push('Categoria non valida');
        if (validationErrors.sottocategoria) errorParts.push('Sottocategoria non valida');
        if (validationErrors.data) errorParts.push('Data non valida');
        if (validationErrors.ammontare) errorParts.push('Ammontare non valido');
        if (validationErrors.stato) errorParts.push('Stato non valido');
        if (row.saveErrorMessage) errorParts.push(row.saveErrorMessage);

        return {
            ...row,
            rowIndex: index,
            rowNumber: index + 1,
            validationErrors,
            hasErrors,
            errorMessage: errorParts.join(' - '),
            rowClass: this.selectedRowIndex === index ? 'selected-row' : '',
            annoClass: this.getCellClass(validationErrors.anno),
            categoriaClass: this.getCellClass(validationErrors.categoria),
            sottocategoriaClass: this.getCellClass(validationErrors.sottocategoria),
            noteClass: this.getCellClass(false, 'editable-cell note-cell'),
            dataClass: this.getCellClass(validationErrors.data),
            ammontareClass: this.getCellClass(validationErrors.ammontare),
            statoClass: this.getCellClass(validationErrors.stato)
        };
    }

    getCellClass(hasError, base = 'editable-cell') {
        return `${base}${hasError ? ' invalid-cell' : ''}`;
    }

    buildEmptyRow() {
        return {
            rowKey: `row_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            anno: '',
            categoria: '',
            sottocategoria: '',
            note: '',
            data: '',
            ammontare: '',
            stato: '',
            saveErrorMessage: ''
        };
    }

    isRowEmpty(row) {
        return !row.anno && !row.categoria && !row.sottocategoria && !row.note && !row.data && !row.ammontare && !row.stato;
    }

    getValidationErrors(row) {
        if (this.isRowEmpty(row)) {
            return {
                anno: false,
                categoria: false,
                sottocategoria: false,
                data: false,
                ammontare: false,
                stato: false
            };
        }

        const categoriaOk = this.isValueInOptions(row.categoria, this.categoriaOptions);
        const subcategories = this.getSubcategoriesForCategory(row.categoria);
        const sottocategoriaOk = !!row.sottocategoria && subcategories.includes(row.sottocategoria);
        const statoOk = this.isValueInOptions(row.stato, this.statoOptions);

        return {
            anno: !row.anno || !/^\d{4}$/.test(String(row.anno).trim()),
            categoria: !categoriaOk,
            sottocategoria: !sottocategoriaOk,
            data: !row.data || !this.parseDate(row.data),
            ammontare: !row.ammontare || !this.parseCurrency(row.ammontare),
            stato: !statoOk
        };
    }

    isValueInOptions(value, options) {
        if (!value) return false;
        return options.some(option => option.value === value || option.label === value);
    }

    getSubcategoriesForCategory(category) {
        if (!category) return [];
        return this.sottocategorieByCategoria[category] || [];
    }

    matchOptionValue(options, input) {
        if (!input) return '';
        const normalizedInput = String(input).trim().toLowerCase();
        const exact = (options || []).find(option => {
            const label = String(option.label || '').trim().toLowerCase();
            const value = String(option.value || '').trim().toLowerCase();
            return label === normalizedInput || value === normalizedInput;
        });
        return exact ? exact.value : '';
    }

    matchStringValue(values, input) {
        if (!input) return '';
        const normalizedInput = String(input).trim().toLowerCase();
        const exact = (values || []).find(value => String(value).trim().toLowerCase() === normalizedInput);
        return exact || '';
    }

    parseClipboardText(text) {
        const lines = text
            .split(/\r?\n/)
            .map(line => line.replace(/\r/g, ''))
            .filter(line => line.trim() || line.includes('\t'));

        const rows = [];
        for (const line of lines) {
            const values = line.split('\t');
            if (values.length < 7) continue;

            const first = (values[0] || '').trim().toLowerCase();
            if (first === 'anno' || first === 'year') continue;

            rows.push({
                anno: this.normalizePastedField('anno', values[0]),
                categoria: this.normalizePastedField('categoria', values[1]),
                sottocategoria: this.normalizePastedField('sottocategoria', values[2], values[1]),
                note: this.normalizePastedField('note', values[3]),
                data: this.normalizePastedField('data', values[4]),
                ammontare: this.normalizePastedField('ammontare', values[5]),
                stato: this.normalizePastedField('stato', values[6]),
                saveErrorMessage: ''
            });
        }

        return rows;
    }

    normalizePastedField(field, value, categoryHint = null) {
        const trimmed = value == null ? '' : String(value).trim();
        if (!trimmed) return '';

        if (field === 'anno') return this.parseInteger(trimmed) || trimmed;
        if (field === 'ammontare') return this.parseCurrency(trimmed) || trimmed;
        if (field === 'data') return this.parseDate(trimmed) || trimmed;
        if (field === 'categoria') return this.matchOptionValue(this.categoriaOptions, trimmed) || trimmed;
        if (field === 'stato') return this.matchOptionValue(this.statoOptions, trimmed) || trimmed;
        if (field === 'sottocategoria') {
            const category = this.matchOptionValue(this.categoriaOptions, categoryHint || '') || (categoryHint ? String(categoryHint).trim() : '');
            const subcategories = this.getSubcategoriesForCategory(category);
            return this.matchStringValue(subcategories, trimmed) || trimmed;
        }
        return trimmed;
    }

    parseInteger(value) {
        if (!value && value !== 0) return '';
        const clean = String(value).trim().replace(/[^\d-]/g, '');
        if (!clean || !/^-?\d+$/.test(clean)) return '';
        return String(parseInt(clean, 10));
    }

    parseCurrency(value) {
        if (!value && value !== 0) return '';
        if (typeof value === 'number') return value.toString();
        let cleanVal = value.toString().replace(/€/g, '').replace(/\s/g, '').trim();
        cleanVal = cleanVal.replace(/[^\d.,-]/g, '');
        if (!cleanVal) return '';

        const lastComma = cleanVal.lastIndexOf(',');
        const lastDot = cleanVal.lastIndexOf('.');

        if (lastComma > -1 && lastDot > -1) {
            if (lastComma > lastDot) {
                cleanVal = cleanVal.replace(/\./g, '').replace(',', '.');
            } else {
                cleanVal = cleanVal.replace(/,/g, '');
            }
        } else if (lastComma > -1) {
            const afterComma = cleanVal.substring(lastComma + 1);
            if (afterComma.length === 3 && /^\d{3}$/.test(afterComma)) {
                cleanVal = cleanVal.replace(/,/g, '');
            } else {
                cleanVal = cleanVal.replace(',', '.');
            }
        } else if (lastDot > -1) {
            const afterDot = cleanVal.substring(lastDot + 1);
            if (afterDot.length === 3 && /^\d{3}$/.test(afterDot)) {
                cleanVal = cleanVal.replace(/\./g, '');
            }
        }

        return cleanVal.replace(/[^\d.-]/g, '') || '';
    }

    parseDate(val) {
        if (!val) return '';
        val = String(val).trim();
        if (!val) return '';

        const pad = n => String(n).padStart(2, '0');
        const monthMap = {
            gen: 1, genn: 1, gennaio: 1, jan: 1, january: 1,
            feb: 2, febbraio: 2, february: 2,
            mar: 3, marzo: 3, marz: 3, march: 3,
            apr: 4, aprile: 4, april: 4,
            mag: 5, maggio: 5, may: 5,
            giu: 6, giugno: 6, jun: 6, june: 6,
            lug: 7, luglio: 7, july: 7,
            ago: 8, agosto: 8, aug: 8, august: 8,
            set: 9, settembre: 9, sett: 9, sep: 9, sept: 9, september: 9,
            ott: 10, ottobre: 10, oct: 10, october: 10,
            nov: 11, novembre: 11, november: 11,
            dic: 12, dicembre: 12, dec: 12, december: 12
        };

        const parse2DigitYear = yy => {
            const n = parseInt(yy, 10);
            if (isNaN(n)) return null;
            if (yy.length === 4) return n;
            return n >= 0 && n <= 49 ? 2000 + n : n >= 50 && n <= 99 ? 1900 + n : n;
        };

        const isValidDate = (y, m, d) => {
            if (!y || !m || !d) return false;
            const yr = parseInt(y, 10);
            const mo = parseInt(m, 10);
            const dy = parseInt(d, 10);
            if (isNaN(yr) || isNaN(mo) || isNaN(dy)) return false;
            if (mo < 1 || mo > 12) return false;
            const lastDay = new Date(yr, mo, 0).getDate();
            return dy >= 1 && dy <= lastDay;
        };

        const toYMD = (y, m, d) => {
            const yr = String(y);
            const mo = pad(m);
            const dy = pad(d);
            if (!isValidDate(yr, mo, dy)) return '';
            return `${yr}-${mo}-${dy}`;
        };

        let match = val.match(/^(\d{4})[\/\-.\s,](\d{1,2})[\/\-.\s,](\d{1,2})$/);
        if (match) return toYMD(match[1], match[2], match[3]);

        match = val.match(/^(\d{1,2})[\/\-.\s,](\d{1,2})[\/\-.\s,](\d{2,4})$/);
        if (match) {
            const y = parse2DigitYear(match[3]);
            if (y) return toYMD(y, match[2], match[1]);
        }

        const monthRegex = Object.keys(monthMap).sort((a, b) => b.length - a.length).join('|');
        match = val.match(new RegExp(`^(\\d{1,2})[\\/\\-.\\s,]+(${monthRegex})[\\/\\-.\\s,]+(\\d{2,4})$`, 'i'));
        if (match) {
            const monthNum = monthMap[match[2].toLowerCase()];
            const y = parse2DigitYear(match[3]);
            if (monthNum && y) return toYMD(y, monthNum, match[1]);
        }

        match = val.match(new RegExp(`^(${monthRegex})[\\/\\-.\\s,]+(\\d{1,2})[\\/\\-.\\s,]+(\\d{2,4})$`, 'i'));
        if (match) {
            const monthNum = monthMap[match[1].toLowerCase()];
            const y = parse2DigitYear(match[3]);
            if (monthNum && y) return toYMD(y, monthNum, match[2]);
        }

        const dateObj = new Date(val);
        if (!isNaN(dateObj.getTime())) {
            return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
        }

        return '';
    }

    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant
            })
        );
    }
}

