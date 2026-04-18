import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import getCategoriaValues from '@salesforce/apex/SpeseExcelEditorController.getCategoriaValues';
import getSottocategorieByCategoria from '@salesforce/apex/SpeseExcelEditorController.getSottocategorieByCategoria';
import getStatoValues from '@salesforce/apex/SpeseExcelEditorController.getStatoValues';
import createSpeseFromFlow from '@salesforce/apex/SpeseExcelEditorController.createSpeseFromFlow';

export default class SpeseExcelEditor extends LightningElement {
    @track pastedText = '';
    @track rows = [];

    categoriaOptions = [];
    statoOptions = [];
    sottocategorieByCategoria = {};

    isSaving = false;
    picklistsReady = false;

    get isSaveDisabled() {
        return this.isSaving || !this.rows.length || this.rows.some(r => r.hasErrors);
    }

    connectedCallback() {
        this.initPicklists();
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
        const rowNumber = this.rows.length + 1;
        this.rows = [
            ...this.rows,
            this.buildRow(
                { anno: null, categoria: null, sottocategoria: null, note: '', data: null, ammontare: null, stato: null },
                rowNumber
            )
        ];
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
    }

    async handleSave() {
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
            const payload = this.rows.map(r => ({
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

            // Mappa risultati su rows
            this.rows = this.rows.map(r => {
                const hit = spesaResults.find(x => Number(x.rowNumber) === Number(r.rowNumber));
                if (!hit) return r;

                const isOk = hit.isSuccess === true || hit.status === 'success';
                return {
                    ...r,
                    hasErrors: !isOk,
                    errorMessage: isOk ? null : (hit.errorMessage || 'Errore durante il salvataggio'),
                    spesaId: isOk ? hit.spesaId : null
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
            errorMessage: hasErrors ? errors.join(' - ') : null
        };
    }
}

