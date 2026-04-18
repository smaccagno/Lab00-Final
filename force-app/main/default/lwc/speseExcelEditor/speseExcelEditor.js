import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { openTab } from 'lightning/platformWorkspaceApi';

import getCategoriaValues from '@salesforce/apex/SpeseExcelEditorController.getCategoriaValues';
import getSottocategorieByCategoria from '@salesforce/apex/SpeseExcelEditorController.getSottocategorieByCategoria';
import getStatoValues from '@salesforce/apex/SpeseExcelEditorController.getStatoValues';
import createSpeseFromFlow from '@salesforce/apex/SpeseExcelEditorController.createSpeseFromFlow';

export default class SpeseExcelEditor extends LightningElement {
    @track rows = [];

    categoriaOptions = [];
    statoOptions = [];
    sottocategorieByCategoria = {};

    @track isValidating = false;
    isSaving = false;
    picklistsReady = false;

    @track showResults = false;
    @track saveResults = [];

    selectedRowKey = null;

    get isNoRowSelected() {
        return !this.selectedRowKey;
    }

    get isTableEmpty() {
        return !this.rows || this.rows.length === 0;
    }

    get isCreatingDisabled() {
        return (
            this.isSaving ||
            this.isValidating ||
            !this.rows.length ||
            this.rows.some(r => r.hasErrors) ||
            !this.rows.some(r => !this.isRowEmpty(r))
        );
    }

    connectedCallback() {
        this.initPicklists()
            .then(() => {
                if (!this.rows.length) this.handleAddRow();
            })
            .catch(() => {
                // initPicklists gestisce già toasts in caso di errore
            });
    }

    async initPicklists() {
        try {
            const [cats, sottosMap, st] = await Promise.all([
                getCategoriaValues(),
                getSottocategorieByCategoria(),
                getStatoValues()
            ]);

            // Combobox expects {label, value}
            this.categoriaOptions = (cats || []).map(v => ({ label: v, value: v }));
            this.statoOptions = (st || []).map(v => ({ label: v, value: v }));
            this.sottocategorieByCategoria = sottosMap || {};
            this.picklistsReady = true;
        } catch (e) {
            this.picklistsReady = false;
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Errore',
                    message: e?.body?.message || e.message || 'Impossibile caricare le picklist',
                    variant: 'error'
                })
            );
        }
    }

    handlePastedTextChange(event) {
        this.pastedText = event.target.value;
    }

    handleCreateRows() {
        if (!this.picklistsReady) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Picklist non pronte',
                    message: 'Attendi che le picklist vengano caricate.',
                    variant: 'warning'
                })
            );
            return;
        }
        const text = (this.pastedText || '').trim();
        if (!text) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Attenzione',
                    message: 'Incolla prima i dati da Excel.',
                    variant: 'warning'
                })
            );
            return;
        }

        const parsed = this.parseClipboardText(text);
        if (!parsed.length) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Nessuna riga trovata',
                    message: 'Impossibile estrarre righe dai dati incollati.',
                    variant: 'warning'
                })
            );
            return;
        }

        this.rows = parsed.map((p, idx) => this.buildRow(p, idx + 1));
    }

    handleAddRow() {
        this.showResults = false;
        this.selectedRowKey = null;
        const rowNumber = this.rows.length + 1;
        this.rows = [
            ...this.rows,
            this.buildRow(
                { anno: null, categoria: null, sottocategoria: null, note: '', data: null, ammontare: null, stato: null },
                rowNumber
            )
        ];
        this.recomputeRowClasses();
    }

    selectRow(event) {
        const rowKey = event.currentTarget.dataset.rowkey;
        this.selectedRowKey = rowKey || null;
        this.recomputeRowClasses();
    }

    deleteSelectedRow() {
        if (!this.selectedRowKey) return;

        this.rows = this.rows.filter(r => r.rowKey !== this.selectedRowKey);
        this.selectedRowKey = null;
        this.rows = this.rows.map((r, idx) => ({ ...r, rowNumber: idx + 1 }));

        this.showResults = false;
        this.saveResults = [];
        this.recomputeRowClasses();
    }

    deleteAllRows() {
        this.rows = [];
        this.selectedRowKey = null;
        this.showResults = false;
        this.saveResults = [];
    }

    startNewEntry() {
        this.rows = [];
        this.selectedRowKey = null;
        this.showResults = false;
        this.saveResults = [];
        this.handleAddRow();
    }

    async pasteFromClipboard() {
        if (!this.picklistsReady) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Picklist non pronte',
                    message: 'Attendi che le picklist vengano caricate.',
                    variant: 'warning'
                })
            );
            return;
        }

        this.isValidating = true;
        this.showResults = false;
        this.saveResults = [];

        try {
            if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
                throw new Error('API clipboard non disponibile');
            }

            const clipboardText = await navigator.clipboard.readText();
            if (!clipboardText || !clipboardText.trim()) {
                throw new Error('Clipboard vuota');
            }

            const parsed = this.parseClipboardText(clipboardText);
            if (!parsed.length) {
                throw new Error('Nessun dato valido trovato nella clipboard.');
            }

            if (!this.rows.length) {
                this.handleAddRow();
            }

            let firstEmptyRowIndex = this.rows.findIndex(r => this.isRowEmpty(r));
            if (firstEmptyRowIndex === -1) firstEmptyRowIndex = this.rows.length;

            // Assicura abbastanza righe
            while (this.rows.length < firstEmptyRowIndex + parsed.length) {
                this.handleAddRow();
            }

            const updatedRows = [...this.rows];
            for (let i = 0; i < parsed.length; i++) {
                const rowIndex = firstEmptyRowIndex + i;
                if (rowIndex >= updatedRows.length) break;
                updatedRows[rowIndex] = this.applyParsedToRow(updatedRows[rowIndex], parsed[i], rowIndex + 1);
            }

            this.rows = updatedRows;
            this.selectedRowKey = null;
            this.recomputeRowClasses();

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Successo',
                    message: `Incollati ${parsed.length} riga/e a partire dalla riga ${firstEmptyRowIndex + 1}.`,
                    variant: 'success'
                })
            );
        } catch (e) {
            const msg = e?.message || e?.body?.message || 'Errore durante la lettura della clipboard';
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Errore',
                    message: msg,
                    variant: 'error'
                })
            );
        } finally {
            this.isValidating = false;
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
            // Fallback: apri in una nuova scheda (non sempre in console)
            const url = `/lightning/r/Voce_di_Spesa__c/${spesaId}/view`;
            window.open(url, '_blank');
            // In console, openTab dovrebbe essere sufficiente.
        }
    }

    recomputeRowClasses() {
        const selected = this.selectedRowKey;
        this.rows = (this.rows || []).map(r => {
            const parts = [];
            if (selected && r.rowKey === selected) parts.push('selected-row');
            if (r.hasErrors) parts.push('row-error');
            return { ...r, rowClass: parts.join(' ') };
        });
    }

    isRowEmpty(row) {
        const annoEmpty = row.anno === null || row.anno === undefined || row.anno === '';
        const categoriaEmpty = !row.categoria;
        const sottocategoriaEmpty = !row.sottocategoria;
        const noteEmpty = !row.note || String(row.note).trim() === '';
        const dataEmpty = !row.data;
        const ammontareEmpty = row.ammontare === null || row.ammontare === undefined || row.ammontare === '';
        const statoEmpty = !row.stato;

        return (
            annoEmpty &&
            categoriaEmpty &&
            sottocategoriaEmpty &&
            noteEmpty &&
            dataEmpty &&
            ammontareEmpty &&
            statoEmpty
        );
    }

    applyParsedToRow(row, p, rowNumber) {
        const next = { ...row };
        next.rowNumber = rowNumber;
        next.anno = p.anno ?? null;
        next.categoria = p.categoria ?? null;
        next.sottocategoria = p.sottocategoria ?? null;
        next.note = p.note ?? '';
        next.data = p.data ?? null;
        next.ammontare = p.ammontare ?? null;
        next.stato = p.stato ?? null;

        const sottos = (next.categoria && this.sottocategorieByCategoria[next.categoria]) ? this.sottocategorieByCategoria[next.categoria] : [];
        next.sottocategoriaOptions = sottos.map(v => ({ label: v, value: v }));
        if (next.sottocategoria && !sottos.includes(next.sottocategoria)) next.sottocategoria = null;

        return this.validateRow(next);
    }

    handleDeleteRow(event) {
        const rowKey = event.currentTarget.dataset.rowkey;
        this.rows = this.rows.filter(r => r.rowKey !== rowKey);
        // Ricalcolo rowNumber per coerenza con la risposta Apex
        this.rows = this.rows.map((r, idx) => ({ ...r, rowNumber: idx + 1 }));
    }

    handleCellChange(event) {
        const rowKey = event.currentTarget.dataset.rowkey;
        const field = event.currentTarget.dataset.field;
        const value = event.detail ? event.detail.value : event.currentTarget.value;

        this.rows = this.rows.map(r => {
            if (r.rowKey !== rowKey) return r;

            let next = { ...r };

            // Normalizza alcuni campi
            if (field === 'note') next.note = value ?? '';
            else if (field === 'anno') next.anno = value === '' ? null : Number(value);
            else if (field === 'ammontare') next.ammontare = value === '' ? null : this.parseDecimal(value);
            else if (field === 'data') next.data = value || null;
            else if (field === 'categoria') {
                next.categoria = value || null;
                // Dependent picklist: reset sottocategoria se non più valida
                const opts = this.sottocategorieByCategoria[next.categoria] || [];
                next.sottocategoriaOptions = opts.map(v => ({ label: v, value: v }));
                if (next.sottocategoria && !opts.includes(next.sottocategoria)) next.sottocategoria = null;
            } else if (field === 'sottocategoria') next.sottocategoria = value || null;
            else if (field === 'stato') next.stato = value || null;

            next = this.validateRow(next);
            return next;
        });

        this.showResults = false;
        this.recomputeRowClasses();
    }

    async handleSave() {
        this.showResults = false;
        this.saveResults = [];
        this.recomputeRowClasses();

        // Validazione finale client-side
        const invalid = this.rows.filter(r => r.hasErrors);
        if (invalid.length) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Correggi errori',
                    message: 'Ci sono righe con valori non validi.',
                    variant: 'error'
                })
            );
            return;
        }

        this.isSaving = true;
        try {
            const rowsToSave = this.rows.filter(r => !this.isRowEmpty(r));
            if (!rowsToSave.length) {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Attenzione',
                        message: 'Nessuna riga compilata da salvare.',
                        variant: 'warning'
                    })
                );
                return;
            }

            const payload = rowsToSave.map(r => ({
                rowNumber: r.rowNumber,
                anno: r.anno,
                categoria: r.categoria,
                sottocategoria: r.sottocategoria,
                note: r.note,
                data: r.data,
                ammontare: r.ammontare,
                stato: r.stato
            }));

            const res = await createSpeseFromFlow({ speseDataJson: JSON.stringify(payload) });
            const spesaResults = res?.spesaResults || [];

            this.saveResults = spesaResults.map((r, idx) => ({
                id: `res_${idx}`,
                ...r
            }));
            this.showResults = true;

            // Mappa risultati su rows
            this.rows = this.rows.map(r => {
                const hit = spesaResults.find(x => Number(x.rowNumber) === Number(r.rowNumber));
                if (!hit) return r;

                const isOk = hit.isSuccess === true || hit.status === 'success';
                return {
                    ...r,
                    hasErrors: !isOk,
                    errorMessage: isOk ? null : (hit.errorMessage || 'Errore durante il salvataggio'),
                    spesaId: isOk ? hit.spesaId : null,
                    spesaName: isOk ? hit.spesaName : null
                };
            });

            const createdCount = res?.createdCount || 0;
            const errorCount = this.rows.filter(r => r.hasErrors).length;
            if (createdCount > 0 && errorCount === 0) {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Successo',
                        message: `${createdCount} spesa/e create con successo.`,
                        variant: 'success'
                    })
                );
            } else {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Risultato parziale',
                        message: `Creazione completata: ${createdCount} successi, ${errorCount} errori.`,
                        variant: errorCount ? 'error' : 'success'
                    })
                );
            }

            this.recomputeRowClasses();
        } catch (e) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Errore',
                    message: e?.body?.message || e.message || 'Errore durante il salvataggio',
                    variant: 'error'
                })
            );
        } finally {
            this.isSaving = false;
        }
    }

    // ----------------------------
    // Parsing & validation helpers
    // ----------------------------

    parseClipboardText(text) {
        const lines = text
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const rows = [];
        for (let line of lines) {
            // Accetta tab, oppure ; se l'utente incolla da locale diverso
            let cols = line.split('\t');
            if (cols.length < 7) cols = line.split(';');
            if (cols.length < 7) cols = line.split(',');
            if (cols.length < 7) continue;

            // Skipa header
            const first = (cols[0] || '').toString().trim().toLowerCase();
            if (first === 'anno' || first === 'year') continue;

            const anno = this.parseInteger(cols[0]);
            const categoria = (cols[1] || '').toString().trim();
            const sottocategoria = (cols[2] || '').toString().trim();
            const note = (cols[3] || '').toString().trim();
            const data = this.parseDateToIso(cols[4]);
            const ammontare = this.parseDecimal(cols[5]);
            const stato = (cols[6] || '').toString().trim();

            rows.push({ anno, categoria, sottocategoria, note, data, ammontare, stato });
        }
        return rows;
    }

    parseInteger(v) {
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        if (!s) return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    }

    parseDecimal(v) {
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        if (!s) return null;
        const cleaned = s.replace(/\s/g, '');

        let normalized = cleaned;
        // Caso italiano: migliaia con '.' e decimali con ','
        if (cleaned.includes(',') && cleaned.includes('.')) {
            normalized = cleaned.replace(/\./g, '').replace(',', '.');
        } else if (cleaned.includes(',') && !cleaned.includes('.')) {
            // Decimali con ','
            normalized = cleaned.replace(',', '.');
        } else if (!cleaned.includes(',') && cleaned.includes('.')) {
            // Decimali con '.': rimuovi eventuali migliaia (solo se ci sono piu' punti)
            const parts = cleaned.split('.');
            if (parts.length > 2) {
                normalized = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
            } else {
                normalized = cleaned;
            }
        }

        const n = Number(normalized);
        return Number.isFinite(n) ? n : null;
    }

    parseDateToIso(v) {
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        if (!s) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        if (s.includes('/')) {
            const parts = s.split('/');
            if (parts.length === 3) {
                const dd = parts[0].padStart(2, '0');
                const mm = parts[1].padStart(2, '0');
                const yyyy = parts[2];
                if (/^\d{4}$/.test(yyyy)) return `${yyyy}-${mm}-${dd}`;
            }
        }
        return null;
    }

    buildRow(p, rowNumber) {
        const rowKey = `row_${rowNumber}_${Math.random().toString(16).slice(2)}`;
        const sottos = (p.categoria && this.sottocategorieByCategoria[p.categoria]) ? this.sottocategorieByCategoria[p.categoria] : [];
        const sottocategoriaOptions = sottos.map(v => ({ label: v, value: v }));

        const row = {
            rowKey,
            rowNumber,
            anno: p.anno ?? null,
            categoria: p.categoria ?? null,
            sottocategoria: p.sottocategoria ?? null,
            sottocategoriaOptions,
            note: p.note ?? '',
            data: p.data ?? null,
            ammontare: p.ammontare ?? null,
            stato: p.stato ?? null,
            hasErrors: false,
            errorMessage: null
        };

        return this.validateRow(row);
    }

    validateRow(row) {
        // Validazione leggera lato UI (Apex resta "source of truth")
        // Se la riga è vuota, non considerarla in errori e non bloccare il salvataggio.
        if (this.isRowEmpty(row)) {
            return {
                ...row,
                hasErrors: false,
                errorMessage: null,
                rowClass: ''
            };
        }

        const errors = [];

        if (row.anno === null || row.anno === undefined || !Number.isFinite(row.anno)) errors.push('Anno non valido');

        const categoriaOk = !!row.categoria && this.categoriaOptions.some(o => o.value === row.categoria);
        if (!categoriaOk) errors.push('Categoria non valida');

        const sottos = this.sottocategorieByCategoria[row.categoria] || [];
        const sottosOk = !!row.sottocategoria && sottos.includes(row.sottocategoria);
        if (!sottosOk) errors.push('Sottocategoria non valida per la Categoria selezionata');

        if (!row.data) errors.push('Data non valida');
        if (row.ammontare === null || row.ammontare === undefined || !Number.isFinite(row.ammontare)) errors.push('Ammontare non valido');

        const statoOk = !!row.stato && this.statoOptions.some(o => o.value === row.stato);
        if (!statoOk) errors.push('Stato non valido');

        const hasErrors = errors.length > 0;
        return {
            ...row,
            hasErrors,
            errorMessage: hasErrors ? errors.join(' - ') : null,
            rowClass: hasErrors ? 'row-error' : ''
        };
    }
}

