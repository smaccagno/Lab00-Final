import { api, LightningElement, track } from 'lwc';

// Flag per evitare che addRow venga chiamato dopo deleteAllRows quando il Flow ri-monta il componente
let _skipNextInitialAddRow = false;
import { FlowAttributeChangeEvent, FlowNavigationNextEvent } from 'lightning/flowSupport';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import createDonations from '@salesforce/apex/DonationCreationController.createDonations';
import getDonorsForProgram from '@salesforce/apex/DonationCreationController.getDonorsForProgram';
import getActivePrograms from '@salesforce/apex/DonationCreationController.getActivePrograms';
import getPaymentMethods from '@salesforce/apex/DonationCreationController.getPaymentMethods';
import getBudgets from '@salesforce/apex/DonationCreationController.getBudgets';

export default class DonationTableEditor extends LightningElement {
    @api availableProgramsJson = '[]';
    @api availablePaymentMethodsJson = '[]';
    @api availableDonorTypesJson = '[]';
    @api programId;
    @api recordTypeId;
    @api populatedRowsCount = '0';
    @api createdDonationIds = '';
    @api firstCreatedDonationId = '';
    @api donationsCreated = 'false';
    
    @track rows = [];
    @track availablePrograms = [];
    @track availablePaymentMethods = [];
    @track availableDonorTypes = [];
    @track availableBudgets = [];
    @track isLoading = false;
    @track isCreating = false;
    
    nextRowId = 1;
    selectedRowIndex = -1;
    
    // Stato calendario date
    @track datePickerOpen = null; // {rowIndex: number, field: string, value: string}
    
    // Stato dropdown
    @track dropdownOpen = false;
    @track dropdownFilter = '';
    @track dropdownFilteredOptions = [];
    @track dropdownStyle = '';
    currentDropdownInfo = null; // { rowIndex, field, options }
    
    // Stato modal numerici e testo
    @track ammontareModalValue = '';
    @track percentualeModalValue = '';
    @track trattenutaModalValue = '';
    @track descrizioneModalValue = '';
    
    // Menu azioni cella (Copia/Incolla)
    @track cellActionMenuOpen = false;
    @track cellActionMenuStyle = '';
    cellActionMenuInfo = null; // { rowIndex, field }
    
    async connectedCallback() {
        // Parse JSON inputs
        try {
            const programsJson = this.availableProgramsJson || '[]';
            const paymentMethodsJson = this.availablePaymentMethodsJson || '[]';
            const donorTypesJson = this.availableDonorTypesJson || '[]';
            
            this.availablePrograms = JSON.parse(programsJson);
            this.availablePaymentMethods = JSON.parse(paymentMethodsJson);
            this.availableDonorTypes = JSON.parse(donorTypesJson);
            
            if (!Array.isArray(this.availablePrograms) || this.availablePrograms.length === 0) {
                this.availablePrograms = [];
            }
            if (!Array.isArray(this.availablePaymentMethods) || this.availablePaymentMethods.length === 0) {
                this.availablePaymentMethods = [];
            }
            if (!Array.isArray(this.availableDonorTypes) || this.availableDonorTypes.length === 0) {
                this.availableDonorTypes = [];
            }
        } catch (e) {
            console.error('Error parsing JSON inputs:', e);
            this.availablePrograms = [];
            this.availablePaymentMethods = [];
            this.availableDonorTypes = [];
        }
        
        // Se avviato standalone come Tab, carica tramite Apex
        if (this.availablePrograms.length === 0) {
            try {
                const programs = await getActivePrograms();
                if (programs && programs.length > 0) {
                    this.availablePrograms = programs;
                    // Se non c'è un programId e siamo standalone, prendi il primo o lascialo nullo per caricarli tutti
                    if (!this.programId) {
                        this.programId = programs[0].value;
                    }
                }
            } catch (e) {
                console.error('Error loading programs standalone:', e);
            }
        }
        if (this.availablePaymentMethods.length === 0) {
            try {
                const pms = await getPaymentMethods();
                if (pms && pms.length > 0) {
                    this.availablePaymentMethods = pms;
                }
            } catch (e) {
                console.error('Error loading payment methods standalone:', e);
            }
        }
        
        try {
            const budgets = await getBudgets();
            if (budgets && budgets.length > 0) {
                this.availableBudgets = budgets;
            }
        } catch (e) {
            console.error('Error loading budgets:', e);
        }
        
        // Donatori: caricati per programma tramite getDonorsForProgram al momento dell'apertura dropdown
        
        // Inizializza con una riga vuota (salta se l'utente ha appena svuotato con Elimina tutte)
        if (_skipNextInitialAddRow) {
            _skipNextInitialAddRow = false;
        } else {
            this.addRow();
        }
    }
    
    addRow() {
        const newRow = {
            id: `row-${this.nextRowId++}`,
            rowNumber: this.rows.length + 1,
            Donatore: '',
            DonatoreName: '',
            Nome_della_Donazione: '',
            Data_di_ricezione: '',
            Trattenuta: '',
            Programma: '',
            ProgrammaName: '',
            Ammontare: '',
            AmmontareVisual: '',
            Data_di_Competenza: '',
            Metodo_di_pagamento: '',
            Partner_Allocato: '',
            Partner_AllocatoName: '',
            Percentuale_Allocazione: '',
            Valore_Distribuito: '',
            Valore_Distribuito_Raw: 0,
            percentualeClass: '',
            valoreDistribuitoClass: '',
            percentualeClassFull: 'editable-cell',
            valoreDistribuitoClassFull: 'readonly-cell',
            isEditingAmmontare: false,
            isEditingPercentuale: false,
            isEditingTrattenuta: false,
            isEditingDescrizione: false,
            selected: false,
            selectedClass: ''
        };
        // Inserisci sempre in fondo alla tabella
        const insertIndex = this.rows.length;
        const newRows = [...this.rows];
        newRows.splice(insertIndex, 0, newRow);
        newRows.forEach((r, i) => { r.rowNumber = i + 1; });
        this.rows = newRows;
        this.selectedRowIndex = insertIndex;
        this.reorderAndColorizeRows();
    }
    
    getProgramName(progId) {
        if (!progId) return '';
        const opt = this.availablePrograms.find(p => p.value === progId);
        return opt ? opt.label : progId;
    }
    
    selectRow(event) {
        const rowIndex = parseInt(event.currentTarget.dataset.rowIndex, 10);
        this.selectedRowIndex = rowIndex;
        this._applySelectionAndMergedCellsClasses();
    }
    
    _applySelectionAndMergedCellsClasses() {
        const firstRowOfSelectedGroup = this._getFirstRowOfSelectedGroup();
        this.rows = this.rows.map((row, index) => {
            const isSelected = index === this.selectedRowIndex;
            const selClass = isSelected
                ? (row.isFirstInGroup
                    ? (row.rowSpan > 1 ? 'selected-row-first-multi' : 'selected-row')
                    : 'selected-row-allocation-only')
                : '';
            let classes = [];
            if (selClass) classes.push(selClass);
            if (firstRowOfSelectedGroup === index) classes.push('merged-cells-selected');
            if (row.rowClass) {
                if (row.rowClass.includes('group-color-1')) classes.push('group-color-1');
                if (row.rowClass.includes('group-color-2')) classes.push('group-color-2');
                if (row.rowClass.includes('group-error')) classes.push('group-error');
                if (row.rowClass.includes('first-in-group')) classes.push('first-in-group');
                if (row.rowClass.includes('last-in-group')) classes.push('last-in-group');
            }
            return {
                ...row,
                selected: isSelected,
                selectedClass: selClass,
                rowClass: classes.join(' ')
            };
        });
    }
    
    _getFirstRowOfSelectedGroup(rows) {
        const r = rows || this.rows;
        if (this.selectedRowIndex < 0 || !r[this.selectedRowIndex]) return -1;
        const selRow = r[this.selectedRowIndex];
        if (selRow.isFirstInGroup) return -1;
        let idx = this.selectedRowIndex;
        while (idx >= 0 && !r[idx].isFirstInGroup) idx--;
        return idx >= 0 ? idx : -1;
    }

    _getFirstRowOfGroup(rowIndex, rows) {
        const r = rows || this.rows;
        if (rowIndex < 0 || rowIndex >= r.length || !r[rowIndex]) return -1;
        if (r[rowIndex].isFirstInGroup) return rowIndex;
        let idx = rowIndex;
        while (idx >= 0 && !r[idx].isFirstInGroup) idx--;
        return idx >= 0 ? idx : -1;
    }

    _getProgrammaForRow(rowIndex, rows) {
        const r = rows || this.rows;
        const firstIdx = this._getFirstRowOfGroup(rowIndex, r);
        if (firstIdx < 0) return null;
        return r[firstIdx].Programma || null;
    }
    
    deleteSelectedRow() {
        if (this.selectedRowIndex === -1) return;
        
        const newRows = [...this.rows];
        newRows.splice(this.selectedRowIndex, 1);
        
        // Rinumera
        newRows.forEach((row, index) => {
            row.rowNumber = index + 1;
        });
        
        this.rows = newRows;
        this.selectedRowIndex = -1;
        this.reorderAndColorizeRows();
    }

    deleteEntireDonation() {
        if (this.selectedRowIndex === -1) return;
        
        const firstIdx = this._getFirstRowOfGroup(this.selectedRowIndex);
        if (firstIdx < 0) return;
        
        const row = this.rows[firstIdx];
        const count = row.rowSpan || 1;
        
        const newRows = [...this.rows];
        newRows.splice(firstIdx, count);
        
        newRows.forEach((r, i) => { r.rowNumber = i + 1; });
        
        this.rows = newRows;
        this.selectedRowIndex = -1;
        this.reorderAndColorizeRows();
    }
    
    deleteAllRows() {
        _skipNextInitialAddRow = true; // Evita che addRow venga chiamato se il Flow ri-monta il componente
        this.dropdownOpen = false;
        this.dropdownFilter = '';
        this.dropdownFilteredOptions = [];
        this.datePickerOpen = null;
        this.cellActionMenuOpen = false;
        this.cellActionMenuInfo = null;
        this.ammontareModalValue = '';
        this.percentualeModalValue = '';
        this.trattenutaModalValue = '';
        this.descrizioneModalValue = '';
        this.selectedRowIndex = -1;
        this.nextRowId = 1;
        this.rows = [];
        this.updateFlowOutput();
    }
    
    get isNoRowSelected() {
        return this.selectedRowIndex === -1;
    }
    
    get isTableEmpty() {
        return this.rows.length === 0 ||
               (this.rows.length === 1 && this.isRowEmpty(this.rows[0]));
    }
    
    handleCellClick(event) {
        // Ignora se si clicca su input o pulsanti
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON' || event.target.closest('button')) {
            return;
        }

        // Il click avviene solitamente sul td o sul div/span interno
        let cell = event.currentTarget; // Questo sarà il <td> grazie al gestore onclick sul <td>
        
        // Se l'evento non ha currentTarget o non è un td (es. chiamato in modo improprio), cerca il closest td
        if (!cell || cell.tagName !== 'TD') {
            cell = event.target.closest('td');
        }

        if (!cell) return;

        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        const field = cell.dataset.field;
        const row = this.rows[rowIndex];
        if (row && row.rowDisabled && field !== 'Programma') {
            if (this.selectedRowIndex !== rowIndex) {
                this.selectedRowIndex = rowIndex;
                this._applySelectionAndMergedCellsClasses();
            }
            return;
        }
        
        // Se la cella è già in modalità modifica, non fare nulla sul click (ma il menu azioni può restare)
        if (cell.querySelector('span[contenteditable="true"]') || cell.querySelector('.numeric-field-edit-box')) {
            // Mantieni il menu azioni se siamo in edit mode
            const field = cell.dataset.field;
            if (field && !['Valore_Distribuito'].includes(field)) {
                const rowIndex = parseInt(cell.dataset.rowIndex, 10);
                this.cellActionMenuInfo = { rowIndex, field };
                const rect = cell.getBoundingClientRect();
                this.cellActionMenuStyle = `top: ${rect.bottom + 4}px; left: ${rect.left}px;`;
                this.cellActionMenuOpen = true;
            }
            return;
        }

        // Rimuovi focus da altre celle
        const cells = this.template.querySelectorAll('.cell-focused');
        cells.forEach(c => c.classList.remove('cell-focused'));
        
        cell.classList.add('cell-focused');
        
        // Apri menu azioni (Copia/Incolla) posizionato vicino alla cella
        if (field && !['Valore_Distribuito'].includes(field)) {
            this.cellActionMenuInfo = { rowIndex, field };
            const rect = cell.getBoundingClientRect();
            this.cellActionMenuStyle = `top: ${rect.bottom + 4}px; left: ${rect.left}px;`;
            this.cellActionMenuOpen = true;
        }
        
        if (this.selectedRowIndex !== rowIndex) {
            this.selectedRowIndex = rowIndex;
            this._applySelectionAndMergedCellsClasses();
        }
    }
    
    get isDatePickerOpen() {
        return this.datePickerOpen !== null;
    }

    get currentDatePickerValue() {
        return this.datePickerOpen ? this.datePickerOpen.value : '';
    }

    get currentDatePickerField() {
        return this.datePickerOpen ? this.datePickerOpen.field : '';
    }

    openDatePickerCustom(event) {
        let cell = event.currentTarget;
        if (!cell || cell.tagName !== 'TD') {
            cell = event.target.closest('td');
        }
        if (!cell) return;

        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);

        event.preventDefault();
        event.stopPropagation();

        if (this.dropdownOpen) this.closeDropdown();
        this.closeDatePicker();

        // Evidenzia la cella
        const cells = this.template.querySelectorAll('.cell-focused');
        cells.forEach(c => c.classList.remove('cell-focused'));
        cell.classList.add('cell-focused');

        const currentValue = this.rows[rowIndex] ? this.rows[rowIndex][field] || '' : '';
        let dateValue = '';
        if (currentValue) {
            const parsedDate = this.parseDate(currentValue);
            if (parsedDate) {
                dateValue = parsedDate;
            } else {
                const dateObj = new Date(currentValue);
                if (!isNaN(dateObj.getTime())) {
                    dateValue = dateObj.toISOString().split('T')[0];
                }
            }
        }

        this.datePickerOpen = { rowIndex, field, value: dateValue };
        this.closeCellActionMenu();

        setTimeout(() => {
            const dateInput = this.template.querySelector('.date-picker-input');
            if (dateInput && cell) {
                const cellRect = cell.getBoundingClientRect();
                dateInput.style.position = 'fixed';
                dateInput.style.top = `${cellRect.top}px`;
                dateInput.style.left = `${cellRect.left}px`;
                dateInput.style.width = `${Math.max(cellRect.width, 150)}px`;
                dateInput.style.zIndex = '1001';
                
                dateInput.focus();
                if (dateInput.showPicker) {
                    try { dateInput.showPicker(); } catch(e) {}
                }
            }
        }, 50);
    }

    closeDatePicker() {
        this.datePickerOpen = null;
        const cells = this.template.querySelectorAll('.cell-focused');
        cells.forEach(c => c.classList.remove('cell-focused'));
    }

    handleDateChange(event) {
        if (!this.datePickerOpen) return;

        const newDate = event.target.value;
        const rowIndex = this.datePickerOpen.rowIndex;
        const field = this.datePickerOpen.field;

        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            this.updateRowData(rowIndex, field, newDate);
        }

        setTimeout(() => {
            this.closeDatePicker();
        }, 100);
    }

    handleCellDblClick(event) {
        // Il click avviene solitamente sul td o sul div/span interno
        let cell = event.currentTarget; // Questo sarà il <td> grazie al gestore ondblclick sul <td>
        
        if (!cell || cell.tagName !== 'TD') {
            cell = event.target.closest('td');
        }

        if (!cell) return;

        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        const row = this.rows[rowIndex];
        if (row && row.rowDisabled && field !== 'Programma') return;
        
        if (['Donatore', 'Programma', 'Metodo_di_pagamento', 'Partner_Allocato'].includes(field)) {
            this.openDropdown(event);
        } else if (['Ammontare', 'Percentuale_Allocazione', 'Trattenuta', 'Nome_della_Donazione'].includes(field)) {
            this.openNumericFieldModal(rowIndex, field);
        } else if (['Data_di_ricezione', 'Data_di_Competenza'].includes(field)) {
            this.openDatePickerCustom(event);
        }
    }
    
    handleCellBlur(event) {
        let node = event.currentTarget; // Questo è lo span con onblur
        let cell = node.closest('td'); // Risaliamo al td per rimuovere il focus
        
        node.setAttribute('contenteditable', 'false');
        if (cell) cell.classList.remove('cell-focused');
        
        // Risaliamo al wrapper o al td per trovare i dataset
        let datasetNode = node.closest('.cell-content-wrapper') || cell;
        if (!datasetNode || !datasetNode.dataset.field) {
            datasetNode = cell; // fallback
        }
        
        if (!datasetNode || !datasetNode.dataset.field) return;

        const field = datasetNode.dataset.field;
        const rowIndex = parseInt(datasetNode.dataset.rowIndex, 10);
        
        // Estraiamo solo il testo dal nodo principale senza i figli (es. bottoni X)
        // Nel nostro caso stiamo facendo blur sullo <span>, che contiene solo il testo
        let value = node.textContent.trim();
        
        if (field === 'Ammontare' || field === 'Percentuale_Allocazione') {
            value = this.parseCurrency(value);
        }
        
        this.updateRowData(rowIndex, field, value);
    }
    
    handleCellInput(event) {
        // Preveniamo a capo
        if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
            event.preventDefault();
            return;
        }
    }
    
    clearCellContent(event) {
        event.stopPropagation(); // Evita di triggerare il cell click o dblclick
        const field = event.currentTarget.dataset.field;
        const rowIndex = parseInt(event.currentTarget.dataset.rowIndex, 10);
        const row = this.rows[rowIndex];
        if (row && row.rowDisabled && field !== 'Programma') return;
        
        if (this.dropdownOpen) {
            this.closeDropdown();
        }
        
        this.updateRowData(rowIndex, field, '');
    }

    closeCellActionMenu() {
        this.cellActionMenuOpen = false;
        this.cellActionMenuInfo = null;
    }

    getCellValueForCopy(rowIndex, field) {
        if (rowIndex < 0 || rowIndex >= this.rows.length) return '';
        const row = this.rows[rowIndex];
        const displayFields = { Donatore: 'DonatoreName', Programma: 'ProgrammaName', Partner_Allocato: 'Partner_AllocatoName', Metodo_di_pagamento: 'Metodo_di_pagamento' };
        const displayField = displayFields[field];
        if (displayField && row[displayField]) return row[displayField];
        if (field === 'Ammontare') return row.AmmontareVisual || row.Ammontare || '';
        return row[field] || '';
    }

    handleCellCopyClick(event) {
        event.stopPropagation();
        let rowIndex, field;
        if (this.cellActionMenuInfo) {
            rowIndex = this.cellActionMenuInfo.rowIndex;
            field = this.cellActionMenuInfo.field;
        } else {
            const btn = event.currentTarget;
            field = btn.dataset.field;
            const container = btn.closest('[data-row-index]');
            rowIndex = container ? parseInt(container.dataset.rowIndex, 10) : -1;
        }
        const value = this.getCellValueForCopy(rowIndex, field);
        if (value && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(() => {
                this.showToast('Copia', 'Valore copiato negli appunti', 'success');
            }).catch(() => {
                this.showToast('Errore', 'Impossibile copiare negli appunti', 'error');
            });
        }
        this.closeCellActionMenu();
    }

    async handleCellPasteClick(event) {
        event.stopPropagation();
        let rowIndex, field;
        if (this.cellActionMenuInfo) {
            rowIndex = this.cellActionMenuInfo.rowIndex;
            field = this.cellActionMenuInfo.field;
        } else {
            const btn = event.currentTarget;
            field = btn.dataset.field;
            const container = btn.closest('[data-row-index]');
            rowIndex = container ? parseInt(container.dataset.rowIndex, 10) : -1;
        }
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                this.showToast('Info', 'Nessun testo negli appunti', 'info');
                return;
            }
            const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim() || l.includes('\t'));
            if (lines.length > 1 || (lines.length === 1 && lines[0].includes('\t'))) {
                if (rowIndex >= 0) this.selectedRowIndex = rowIndex;
                await this.pasteFromClipboard();
            } else {
                const val = lines[0] ? lines[0].trim() : '';
                if (['Ammontare', 'Percentuale_Allocazione', 'Trattenuta'].includes(field)) {
                    const modalField = field === 'Ammontare' ? 'ammontareModalValue' : field === 'Percentuale_Allocazione' ? 'percentualeModalValue' : 'trattenutaModalValue';
                    if (this.rows[rowIndex]?.isEditingAmmontare || this.rows[rowIndex]?.isEditingPercentuale || this.rows[rowIndex]?.isEditingTrattenuta) {
                        this[modalField] = val;
                    } else {
                        this.updateRowData(rowIndex, field, val);
                    }
                } else if (field === 'Nome_della_Donazione') {
                    if (this.rows[rowIndex]?.isEditingDescrizione) {
                        this.descrizioneModalValue = val;
                    } else {
                        this.updateRowData(rowIndex, field, val);
                    }
                } else {
                    this.updateRowData(rowIndex, field, val);
                }
                this.showToast('Incolla', 'Valore incollato', 'success');
            }
        } catch (err) {
            this.showToast('Errore', 'Impossibile leggere dagli appunti. Verifica i permessi del browser.', 'error');
        }
        this.closeCellActionMenu();
    }

    // GESTIONE NUMERIC INLINE BOX
    openNumericFieldModal(rowIndex, field) {
        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            const updatedRows = [...this.rows];
            const row = updatedRows[rowIndex];
            
            // Chiudi modali precedenti
            updatedRows.forEach(r => {
                r.isEditingAmmontare = false;
                r.isEditingPercentuale = false;
                r.isEditingTrattenuta = false;
                r.isEditingDescrizione = false;
            });
            
            if (field === 'Ammontare') {
                row.isEditingAmmontare = true;
                this.ammontareModalValue = row.Ammontare || '';
            } else if (field === 'Percentuale_Allocazione') {
                row.isEditingPercentuale = true;
                this.percentualeModalValue = row.Percentuale_Allocazione || '';
            } else if (field === 'Trattenuta') {
                row.isEditingTrattenuta = true;
                this.trattenutaModalValue = row.Trattenuta || '';
            } else             if (field === 'Nome_della_Donazione') {
                row.isEditingDescrizione = true;
                this.descrizioneModalValue = row.Nome_della_Donazione || '';
            }
            
            this.closeCellActionMenu();
            this.rows = updatedRows;
            
            // Focus sul campo input dopo il rendering
            setTimeout(() => {
                const input = this.template.querySelector(`.numeric-field-edit-input[data-field="${field}"], .text-field-edit-input[data-field="${field}"]`);
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 50);
        }
    }

    handleNumericFieldModalInput(event) {
        const field = event.target.dataset.field;
        let val = event.target.value;
        if (field === 'Nome_della_Donazione') {
            this.descrizioneModalValue = val;
        } else {
            // Tieni solo numeri, punto, virgola, meno
            val = val.replace(/[^\d.,-]/g, '');
            event.target.value = val;
            if (field === 'Ammontare') this.ammontareModalValue = val;
            else if (field === 'Percentuale_Allocazione') this.percentualeModalValue = val;
            else if (field === 'Trattenuta') this.trattenutaModalValue = val;
        }
    }

    handleNumericFieldModalKeyDown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.handleNumericFieldConfirmClick(event);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.handleNumericFieldCancelClick(event);
        }
    }

    handleNumericFieldEditBoxClick(event) {
        event.stopPropagation();
    }

    handleNumericFieldConfirmClick(event) {
        event.stopPropagation();
        const field = event.currentTarget.dataset.field;
        const rowIndex = this.rows.findIndex(r => r.isEditingAmmontare || r.isEditingPercentuale || r.isEditingTrattenuta || r.isEditingDescrizione);
        if (rowIndex !== -1) {
            const valToSave = field === 'Ammontare' ? this.ammontareModalValue : 
                              field === 'Percentuale_Allocazione' ? this.percentualeModalValue : 
                              field === 'Trattenuta' ? this.trattenutaModalValue :
                              this.descrizioneModalValue;
            
            const updatedRows = [...this.rows];
            if (field === 'Ammontare') updatedRows[rowIndex].isEditingAmmontare = false;
            if (field === 'Percentuale_Allocazione') updatedRows[rowIndex].isEditingPercentuale = false;
            if (field === 'Trattenuta') updatedRows[rowIndex].isEditingTrattenuta = false;
            if (field === 'Nome_della_Donazione') updatedRows[rowIndex].isEditingDescrizione = false;
            this.rows = updatedRows;
            
            this.updateRowData(rowIndex, field, valToSave);
        }
    }

    handleNumericFieldCancelClick(event) {
        event.stopPropagation();
        const updatedRows = [...this.rows];
        updatedRows.forEach(r => {
            r.isEditingAmmontare = false;
            r.isEditingPercentuale = false;
            r.isEditingTrattenuta = false;
            r.isEditingDescrizione = false;
        });
        this.rows = updatedRows;
    }
    
    updateRowData(rowIndex, field, value) {
        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            if (['Ammontare', 'Percentuale_Allocazione', 'Trattenuta'].includes(field) && value) {
                const parsed = this.parseCurrency(value);
                if (parsed) value = parsed;
            }
            if (['Data_di_ricezione', 'Data_di_Competenza'].includes(field) && value) {
                const parsed = this.parseDate(value);
                if (parsed) value = parsed;
            }
            const row = this.rows[rowIndex];
            const lookupPairs = { Donatore: 'DonatoreName', Programma: 'ProgrammaName', Partner_Allocato: 'Partner_AllocatoName' };
            const nameField = lookupPairs[field];
            
            const groupFields = ['Donatore', 'DonatoreName', 'Nome_della_Donazione', 'Data_di_ricezione', 'Trattenuta', 'Programma', 'ProgrammaName', 'Ammontare', 'Data_di_Competenza', 'Metodo_di_pagamento'];
            
            if (groupFields.includes(field) && row.isFirstInGroup) {
                // Aggiorna tutte le righe del gruppo
                for (let i = 0; i < row.rowSpan; i++) {
                    const targetRow = this.rows[rowIndex + i];
                    targetRow[field] = value;
                    if (nameField) targetRow[nameField] = value;
                    
                    if (field === 'Data_di_ricezione' && value && !targetRow.Data_di_Competenza) {
                        targetRow.Data_di_Competenza = value;
                        // Aggiorna DOM per ogni riga
                        const compCell = this.template.querySelector(`td[data-field="Data_di_Competenza"][data-row-index="${rowIndex + i}"]`);
                        if (compCell) compCell.innerText = value;
                    }
                }
            } else {
                row[field] = value;
                if (nameField) row[nameField] = value;
                if (field === 'Data_di_ricezione' && value && !row.Data_di_Competenza) {
                    row.Data_di_Competenza = value;
                    const compCell = this.template.querySelector(`td[data-field="Data_di_Competenza"][data-row-index="${rowIndex}"]`);
                    if (compCell) compCell.innerText = value;
                }
            }
            
            if (['Nome_della_Donazione', 'Ammontare', 'Percentuale_Allocazione', 'Programma', 'Trattenuta'].includes(field)) {
                this.reorderAndColorizeRows();
            } else {
                // Forza rerender
                this.rows = [...this.rows];
                this.updateFlowOutput();
            }
        }
    }
    
    reorderAndColorizeRows() {
        // Raggruppa le righe non vuote per Nome_della_Donazione
        const emptyRows = [];
        const groups = new Map();
        
        this.rows.forEach(row => {
            if (this.isRowEmpty(row) && !row.Nome_della_Donazione) {
                emptyRows.push(row);
            } else {
                const key = row.Nome_della_Donazione ? row.Nome_della_Donazione.trim().toLowerCase() : 'unnamed';
                if (!groups.has(key)) {
                    groups.set(key, []);
                }
                groups.get(key).push(row);
            }
        });
        
        // Ordina e colora i gruppi
        let newRows = [];
        let colorIndex = 0;
        
        // Ordina le chiavi alfabeticamente
        const sortedKeys = Array.from(groups.keys()).sort();
        
        sortedKeys.forEach(key => {
            const groupRows = groups.get(key);
            // Assegna colore (alterna 2 colori pastello)
            const colorClass = key === 'unnamed' ? '' : `group-color-${(colorIndex % 2) + 1}`;
            
            let hasAllocations = false;
            let totalPercent = 0;
            let totalAmountStr = groupRows[0].Ammontare;
            let totalAmount = parseFloat(this.parseCurrency(totalAmountStr)) || 0;
            const trattenutaPct = parseFloat(this.parseCurrency(groupRows[0].Trattenuta)) || 20;
            const netAmount = totalAmount > 0 ? totalAmount * (1 - trattenutaPct / 100) : 0;
            let totalValDist = 0;

            groupRows.forEach(r => {
                let perc = parseFloat(this.parseCurrency(r.Percentuale_Allocazione));
                if (!isNaN(perc)) {
                    hasAllocations = true;
                    totalPercent += perc;
                    let valDist = (netAmount * perc) / 100;
                    r.Valore_Distribuito_Raw = valDist;
                    totalValDist += valDist;
                } else {
                    r.Valore_Distribuito_Raw = 0;
                }
            });

            let isPercentValid = hasAllocations && Math.abs(totalPercent - 100) < 0.01;
            let isAmountValid = hasAllocations && Math.abs(totalValDist - netAmount) < 0.01 && netAmount > 0;

            const percClass = key === 'unnamed' || !hasAllocations ? '' : (isPercentValid ? 'text-success' : 'text-error');
            const valClass = key === 'unnamed' || !hasAllocations ? '' : (isAmountValid ? 'text-success' : 'text-error');
            
            const hasProgramma = !!groupRows[0].Programma;
            groupRows.forEach((r, index) => {
                let rowClasses = [];
                if (!hasProgramma) rowClasses.push('row-no-progetto');
                if (colorClass) rowClasses.push(colorClass);
                if (index === 0) rowClasses.push('first-in-group');
                if (index === groupRows.length - 1) rowClasses.push('last-in-group');
                
                r.rowDisabled = !hasProgramma;
                r.rowClass = rowClasses.join(' ');
                r.isFirstInGroup = index === 0;
                r.rowSpan = index === 0 ? groupRows.length : 1;
                
                // Classi di validazione per singole celle
                r.donatoreClass = !r.Donatore ? 'editable-cell dropdown-cell invalid-cell' : 'editable-cell dropdown-cell';
                if (!r.Donatore && r.DonatoreName) r.donatoreClass += ' error-value';

                r.descrizioneClass = !r.Nome_della_Donazione ? 'editable-cell invalid-cell' : 'editable-cell';
                r.dataRicezioneClass = !r.Data_di_ricezione ? 'editable-cell invalid-cell' : 'editable-cell';
                
                r.programmaClass = !r.Programma ? 'editable-cell dropdown-cell invalid-cell' : 'editable-cell dropdown-cell';
                if (!r.Programma && r.ProgrammaName) r.programmaClass += ' error-value';

                r.ammontareClass = !r.Ammontare ? 'editable-cell invalid-cell' : 'editable-cell';
                r.dataCompetenzaClass = !r.Data_di_Competenza ? 'editable-cell invalid-cell' : 'editable-cell';
                r.metodoPagamentoClass = !r.Metodo_di_pagamento ? 'editable-cell dropdown-cell invalid-cell' : 'editable-cell dropdown-cell';
                
                r.partnerClass = (hasAllocations && !r.Partner_Allocato) ? 'editable-cell dropdown-cell invalid-cell' : 'editable-cell dropdown-cell';
                if (hasAllocations && !r.Partner_Allocato && r.Partner_AllocatoName) r.partnerClass += ' error-value';

                r.percentualeClass = percClass;
                r.valoreDistribuitoClass = valClass;
                // Se la percentuale non quadra, mettiamo invalid-cell
                r.percentualeClassFull = percClass ? `editable-cell ${percClass} ${isPercentValid ? '' : 'invalid-cell'}` : 'editable-cell';
                r.valoreDistribuitoClassFull = valClass ? `readonly-cell ${valClass} ${isAmountValid ? '' : 'invalid-cell'}` : 'readonly-cell';
                
                r.Valore_Distribuito = this.formatCurrency(r.Valore_Distribuito_Raw);
                r.AmmontareVisual = this.formatCurrency(r.Ammontare);
            });
            
            newRows = newRows.concat(groupRows);
            if (key !== 'unnamed') colorIndex++;
        });
        
        emptyRows.forEach(r => {
            let rowClasses = [];
            if (!r.Programma) rowClasses.push('row-no-progetto');
            if (r.selectedClass) rowClasses.push(r.selectedClass);
            rowClasses.push('first-in-group');
            rowClasses.push('last-in-group');
            
            r.rowDisabled = !r.Programma;
            r.rowClass = rowClasses.join(' ');
            r.isFirstInGroup = true;
            r.rowSpan = 1;
            
            r.donatoreClass = 'editable-cell dropdown-cell';
            r.descrizioneClass = 'editable-cell';
            r.dataRicezioneClass = 'editable-cell';
            r.programmaClass = 'editable-cell dropdown-cell';
            r.ammontareClass = 'editable-cell';
            r.dataCompetenzaClass = 'editable-cell';
            r.metodoPagamentoClass = 'editable-cell dropdown-cell';
            r.partnerClass = 'editable-cell dropdown-cell';
            
            r.percentualeClass = '';
            r.valoreDistribuitoClass = '';
            r.percentualeClassFull = 'editable-cell';
            r.valoreDistribuitoClassFull = 'readonly-cell';
            r.Valore_Distribuito = '';
            r.AmmontareVisual = this.formatCurrency(r.Ammontare);
        });
        
        newRows = newRows.concat(emptyRows);
        
        // Aggiorna selectedRowIndex se l'ordine è cambiato (preserva selezione per id)
        if (this.selectedRowIndex >= 0 && this.rows[this.selectedRowIndex]) {
            const selectedId = this.rows[this.selectedRowIndex].id;
            const newIdx = newRows.findIndex(r => r.id === selectedId);
            if (newIdx >= 0) this.selectedRowIndex = newIdx;
        }
        
        // Rinumera e aggiorna selectedClass per la riga selezionata
        const firstRowOfSelectedGroup = this._getFirstRowOfSelectedGroup(newRows);
        newRows.forEach((row, index) => {
            row.rowNumber = index + 1;
            const isSelected = index === this.selectedRowIndex;
            const selClass = isSelected
                ? (row.isFirstInGroup
                    ? (row.rowSpan > 1 ? 'selected-row-first-multi' : 'selected-row')
                    : 'selected-row-allocation-only')
                : '';
            row.selected = isSelected;
            row.selectedClass = selClass;
            let rowClasses = [...(row.rowClass ? row.rowClass.split(' ').filter(c => c && !c.startsWith('selected-row') && c !== 'merged-cells-selected') : [])];
            if (selClass) rowClasses.push(selClass);
            if (firstRowOfSelectedGroup === index) rowClasses.push('merged-cells-selected');
            row.rowClass = rowClasses.join(' ');
        });
        
        this.rows = newRows;
        this.updateFlowOutput();
        
        // Verifica coerenza Donatore/Partner con Programma (async, evidenzia bordo rosso se incoerenti)
        this.validateProgramCoherence();
    }
    
    /**
     * Verifica che Donatore e Distribuzione al Partner siano coerenti con il Programma selezionato.
     * Evidenzia con bordo rosso le celle incoerenti.
     */
    async validateProgramCoherence() {
        const rows = this.rows;
        if (!rows || rows.length === 0) return;
        
        const programIds = [...new Set(rows.filter(r => r.Programma).map(r => r.Programma))];
        if (programIds.length === 0) {
            rows.forEach(r => {
                r.donatoreProgramMismatch = false;
                r.partnerProgramMismatch = false;
                if (r.donatoreClass && r.donatoreClass.includes('error-program-mismatch')) {
                    r.donatoreClass = r.donatoreClass.replace(/\s*error-program-mismatch/g, '');
                }
                if (r.partnerClass && r.partnerClass.includes('error-program-mismatch')) {
                    r.partnerClass = r.partnerClass.replace(/\s*error-program-mismatch/g, '');
                }
            });
            this.rows = [...this.rows];
            return;
        }
        
        const donorsByProgram = {};
        try {
            await Promise.all(programIds.map(async (programId) => {
                const donors = await getDonorsForProgram({ programId, recordTypeId: this.recordTypeId || null });
                donorsByProgram[programId] = new Set((donors || []).map(d => d.Id));
            }));
        } catch (e) {
            console.error('Errore durante validazione coerenza programma:', e);
            return;
        }
        
        let hasChanges = false;
        rows.forEach((row) => {
            const programId = row.Programma;
            if (!programId) {
                row.donatoreProgramMismatch = false;
                row.partnerProgramMismatch = false;
                return;
            }
            
            const validDonorIds = donorsByProgram[programId];
            const validPartnerIds = this.availableBudgets
                .filter(b => b.programId === programId)
                .map(b => b.value);
            
            const donatoreMismatch = row.Donatore && validDonorIds && !validDonorIds.has(row.Donatore);
            const partnerMismatch = row.Partner_Allocato && validPartnerIds.length > 0 && !validPartnerIds.includes(row.Partner_Allocato);
            
            row.donatoreProgramMismatch = !!donatoreMismatch;
            row.partnerProgramMismatch = !!partnerMismatch;
            
            const addMismatchClass = (cls) => {
                if (!cls) return cls;
                return cls.includes('error-program-mismatch') ? cls : cls + ' error-program-mismatch';
            };
            const removeMismatchClass = (cls) => {
                if (!cls) return cls;
                return cls.replace(/\s*error-program-mismatch/g, '');
            };
            
            const prevDonorClass = row.donatoreClass;
            const prevPartnerClass = row.partnerClass;
            row.donatoreClass = donatoreMismatch ? addMismatchClass(row.donatoreClass) : removeMismatchClass(row.donatoreClass);
            row.partnerClass = partnerMismatch ? addMismatchClass(row.partnerClass) : removeMismatchClass(row.partnerClass);
            if (row.donatoreClass !== prevDonorClass || row.partnerClass !== prevPartnerClass) hasChanges = true;
        });
        
        if (hasChanges) {
            this.rows = [...this.rows];
        }
    }
    
    // DROPDOWN LOGIC
    async openDropdown(event) {
        const cell = event.currentTarget;
        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        const rect = cell.getBoundingClientRect();
        
        let options = [];
        if (field === 'Programma') {
            options = this.availablePrograms;
        } else if (field === 'Metodo_di_pagamento') {
            options = this.availablePaymentMethods;
        } else if (field === 'Donatore') {
            const programId = this._getProgrammaForRow(rowIndex);
            if (programId) {
                try {
                    const donors = await getDonorsForProgram({ programId, recordTypeId: this.recordTypeId || null });
                    options = (donors || []).map(d => ({ label: d.Name, value: d.Id }));
                } catch (e) {
                    this.showToast('Errore', 'Impossibile caricare i donatori: ' + (e.body?.message || e.message), 'error');
                }
            } else {
                options = []; // Seleziona prima il Programma
            }
        } else if (field === 'Partner_Allocato') {
            const row = this.rows[rowIndex];
            if (row.Programma) {
                options = this.availableBudgets.filter(b => b.programId === row.Programma);
            } else {
                options = this.availableBudgets;
            }
        }
        
        this.currentDropdownInfo = { rowIndex, field, options };
        this.dropdownFilteredOptions = [...options];
        this.dropdownFilter = '';
        this.closeCellActionMenu();
        
        // Calcola stile
        this.dropdownStyle = `top: ${rect.bottom}px; left: ${rect.left}px; min-width: ${rect.width}px;`;
        this.dropdownOpen = true;
        
        setTimeout(() => {
            const filterInput = this.template.querySelector('.dropdown-filter');
            if (filterInput) filterInput.focus();
        }, 50);
    }
    
    handleDropdownFilter(event) {
        this.dropdownFilter = event.target.value.toLowerCase();
        if (this.currentDropdownInfo && this.currentDropdownInfo.options) {
            this.dropdownFilteredOptions = this.currentDropdownInfo.options.filter(opt => 
                opt.label.toLowerCase().includes(this.dropdownFilter)
            );
        }
    }
    
    selectDropdownOption(event) {
        const selectedValue = event.currentTarget.dataset.value;
        const selectedLabel = event.currentTarget.innerText.trim();
        
        if (this.currentDropdownInfo) {
            const { rowIndex, field } = this.currentDropdownInfo;
            
            const row = this.rows[rowIndex];
            if (field === 'Programma') {
                if (row.isFirstInGroup) {
                    for (let i = 0; i < row.rowSpan; i++) {
                        this.rows[rowIndex + i].Programma = selectedValue;
                        this.rows[rowIndex + i].ProgrammaName = selectedLabel;
                    }
                } else {
                    row.Programma = selectedValue;
                    row.ProgrammaName = selectedLabel;
                }
            } else if (field === 'Metodo_di_pagamento') {
                if (row.isFirstInGroup) {
                    for (let i = 0; i < row.rowSpan; i++) {
                        this.rows[rowIndex + i].Metodo_di_pagamento = selectedValue;
                    }
                } else {
                    row.Metodo_di_pagamento = selectedValue;
                }
            } else if (field === 'Donatore') {
                if (row.isFirstInGroup) {
                    for (let i = 0; i < row.rowSpan; i++) {
                        this.rows[rowIndex + i].Donatore = selectedValue;
                        this.rows[rowIndex + i].DonatoreName = selectedLabel;
                    }
                } else {
                    row.Donatore = selectedValue;
                    row.DonatoreName = selectedLabel;
                }
            } else if (field === 'Partner_Allocato') {
                row.Partner_Allocato = selectedValue;
                row.Partner_AllocatoName = selectedLabel;
            }
            
            if (field === 'Programma') {
                this.reorderAndColorizeRows();
            } else {
                this.rows = [...this.rows];
                this.updateFlowOutput();
            }
        }
        this.closeDropdown();
    }
    
    handleDropdownBlur(event) {
        // Se il click avviene sulla tendina stessa non chiudere (gestito da mousedown)
        setTimeout(() => {
            this.closeDropdown();
        }, 150);
    }
    
    closeDropdown() {
        this.dropdownOpen = false;
        this.currentDropdownInfo = null;
    }
    
    // COPY PASTE LOGIC
    async pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                this.showToast('Info', 'Nessun testo trovato negli appunti', 'info');
                return;
            }
            
            // Supporta incolla sia da excel/sheets (tab-separated) sia da testo normale
            const lines = text.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0);
            
            let addedCount = 0;
            let startingRowIndex = this.selectedRowIndex > -1 ? this.selectedRowIndex : (this.rows.length > 0 && this.isRowEmpty(this.rows[this.rows.length - 1]) ? this.rows.length - 1 : this.rows.length);
            
            let currentRows = [...this.rows];
            const programIdsToFetch = new Set();
            const rowsWithDonorText = [];

            for (let i = 0; i < lines.length; i++) {
                let values = lines[i].split('\t');
                if (values.length === 1 && lines[i].includes(';')) {
                    values = lines[i].split(';');
                }
                
                const targetRowIndex = startingRowIndex + i;
                
                let row;
                if (targetRowIndex < currentRows.length) {
                    row = currentRows[targetRowIndex];
                } else {
                    row = {
                        id: `row-${this.nextRowId++}`,
                        rowNumber: currentRows.length + 1,
                        Donatore: '',
                        DonatoreName: '',
                        Nome_della_Donazione: '',
                        Data_di_ricezione: '',
                        Trattenuta: '',
                        Programma: '',
                        ProgrammaName: '',
                        Ammontare: '',
                        AmmontareVisual: '',
                        Data_di_Competenza: '',
                        Metodo_di_pagamento: '',
                        Partner_Allocato: '',
                        Partner_AllocatoName: '',
                        Percentuale_Allocazione: '',
                        Valore_Distribuito: '',
                        Valore_Distribuito_Raw: 0,
                        percentualeClass: '',
                        valoreDistribuitoClass: '',
                        selected: false,
                        selectedClass: ''
                    };
                    currentRows.push(row);
                }
                
                // Mappa i valori incollati alle colonne (ordine = colonne tabella: Programma | Donatore | Descrizione | Data ricezione | Trattenuta | Ammontare | Data Competenza | Metodo | Partner | Percentuale)
                const v = i => (values[i] || '').trim();
                if (values.length > 0) {
                    const matchedProg = this.findDropdownMatch(this.availablePrograms, v(0));
                    if (matchedProg) {
                        row.Programma = matchedProg.value;
                        row.ProgrammaName = matchedProg.label;
                    }
                }
                if (values.length > 1 && v(1) && row.Programma) {
                    programIdsToFetch.add(row.Programma);
                    rowsWithDonorText.push({ row, donorText: v(1) });
                } else if (values.length > 1 && v(1)) {
                    row.DonatoreName = v(1);
                }
                if (values.length > 2) row.Nome_della_Donazione = v(2) || row.Nome_della_Donazione;
                if (values.length > 3) {
                    let d = this.parseDate(v(3));
                    row.Data_di_ricezione = d || row.Data_di_ricezione;
                    if (d && !row.Data_di_Competenza) row.Data_di_Competenza = d;
                }
                if (values.length > 4) {
                    const trat = this.parseCurrency(v(4));
                    if (trat) row.Trattenuta = trat;
                }
                if (values.length > 5) {
                    let amt = this.parseCurrency(v(5));
                    if (amt) row.Ammontare = amt;
                }
                if (values.length > 6) {
                    let d = this.parseDate(v(6));
                    row.Data_di_Competenza = d || row.Data_di_Competenza;
                }
                if (values.length > 7) {
                    const matchedMetodo = this.findDropdownMatch(this.availablePaymentMethods, v(7));
                    if (matchedMetodo) row.Metodo_di_pagamento = matchedMetodo.value;
                }
                if (values.length > 8) {
                    const availBudgetsForProg = row.Programma ? this.availableBudgets.filter(b => b.programId === row.Programma) : this.availableBudgets;
                    const matchedBudget = this.findDropdownMatch(availBudgetsForProg, v(8));
                    if (matchedBudget) {
                        row.Partner_Allocato = matchedBudget.value;
                        row.Partner_AllocatoName = matchedBudget.label;
                    } else {
                        row.Partner_AllocatoName = v(8);
                    }
                }
                if (values.length > 9) {
                    const perc = this.parseCurrency(v(9));
                    if (perc) row.Percentuale_Allocazione = perc;
                }
                
                addedCount++;
            }

            // Match Donatore contro donatori compatibili con il programma
            if (programIdsToFetch.size > 0 && rowsWithDonorText.length > 0) {
                const donorsByProgram = {};
                await Promise.all([...programIdsToFetch].map(async (programId) => {
                    try {
                        const donors = await getDonorsForProgram({ programId, recordTypeId: this.recordTypeId || null });
                        donorsByProgram[programId] = (donors || []).map(d => ({ label: d.Name, value: d.Id }));
                    } catch (e) {
                        donorsByProgram[programId] = [];
                    }
                }));
                for (const { row, donorText } of rowsWithDonorText) {
                    const options = donorsByProgram[row.Programma] || [];
                    const matched = this.findDropdownMatch(options, donorText);
                    if (matched) {
                        row.Donatore = matched.value;
                        row.DonatoreName = matched.label;
                    } else {
                        row.DonatoreName = donorText;
                    }
                }
            }
            
            this.rows = currentRows;
            this.reorderAndColorizeRows();
            
            this.showToast('Successo', `${addedCount} righe incollate con successo`, 'success');
            
        } catch (error) {
            console.error('Errore durante incollamento', error);
            this.showToast('Errore', 'Impossibile leggere dagli appunti. Assicurati di aver dato i permessi al browser.', 'error');
        }
    }
    
    isRowEmpty(row) {
        return !row.Nome_della_Donazione && !row.Data_di_ricezione && !row.Ammontare;
    }
    
    /**
     * Riconosce e normalizza date in vari formati.
     * Restituisce sempre YYYY-MM-DD o '' se non valido.
     * Supporta: mese testuale (IT/EN), numerico, separatori / - . spazio virgola, anno 2 o 4 cifre.
     */
    parseDate(val) {
        if (!val) return '';
        val = String(val).trim();
        if (!val) return '';
        
        const pad = (n) => String(n).padStart(2, '0');
        
        // Mappa mesi testuali (italiano e inglese)
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
        
        const parse2DigitYear = (yy) => {
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
        
        // 1) ISO / YYYY-MM-DD
        let m = val.match(/^(\d{4})[\/\-.\s,](\d{1,2})[\/\-.\s,](\d{1,2})$/);
        if (m) return toYMD(m[1], m[2], m[3]);
        
        // 2) DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD MM YYYY, DD,MM,YYYY
        m = val.match(/^(\d{1,2})[\/\-.\s,](\d{1,2})[\/\-.\s,](\d{2,4})$/);
        if (m) {
            const y = parse2DigitYear(m[3]);
            if (y) return toYMD(y, m[2], m[1]);
        }
        
        // 3) DD month YYYY, DD month YY, DD-month-YYYY, DD month YYYY (mese testuale)
        const monthRegex = Object.keys(monthMap).sort((a, b) => b.length - a.length).join('|');
        m = val.match(new RegExp(`^(\\d{1,2})[\\/\\-.\\s,]+(${monthRegex})[\\/\\-.\\s,]+(\\d{2,4})$`, 'i'));
        if (m) {
            const monthNum = monthMap[m[2].toLowerCase()];
            const y = parse2DigitYear(m[3]);
            if (monthNum && y) return toYMD(y, monthNum, m[1]);
        }
        
        // 4) month DD YYYY, month DD YY (mese prima)
        m = val.match(new RegExp(`^(${monthRegex})[\\/\\-.\\s,]+(\\d{1,2})[\\/\\-.\\s,]+(\\d{2,4})$`, 'i'));
        if (m) {
            const monthNum = monthMap[m[1].toLowerCase()];
            const y = parse2DigitYear(m[3]);
            if (monthNum && y) return toYMD(y, monthNum, m[2]);
        }
        
        // 5) YYYY month DD
        m = val.match(new RegExp(`^(\\d{4})[\\/\\-.\\s,]+(${monthRegex})[\\/\\-.\\s,]+(\\d{1,2})$`, 'i'));
        if (m) {
            const monthNum = monthMap[m[2].toLowerCase()];
            if (monthNum) return toYMD(m[1], monthNum, m[3]);
        }
        
        // 6) DD/MM/YY con anno 2 cifre
        m = val.match(/^(\d{1,2})[\/\-.\s,](\d{1,2})[\/\-.\s,](\d{2})$/);
        if (m) {
            const y = parse2DigitYear(m[3]);
            if (y) return toYMD(y, m[2], m[1]);
        }
        
        // 7) Fallback: Date nativo (es. "15 Jan 2024")
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        }
        
        return '';
    }
    
    findDropdownMatch(options, val) {
        if (!val) return null;
        val = val.trim().toLowerCase();
        return options.find(opt => opt.label.toLowerCase().includes(val) || opt.value.toLowerCase() === val);
    }
    
    updateFlowOutput() {
        const populatedRows = this.rows.filter(row => 
            (row.Nome_della_Donazione && row.Nome_della_Donazione.trim()) || 
            (row.Data_di_ricezione && row.Data_di_ricezione.trim()) || 
            (row.Programma && row.Programma.trim()) || 
            (row.Ammontare && row.Ammontare !== '') || 
            (row.Data_di_Competenza && row.Data_di_Competenza.trim()) || 
            (row.Metodo_di_pagamento && row.Metodo_di_pagamento.trim())
        );
        
        const groupedMap = new Map();
        populatedRows.forEach(row => {
            const key = row.Nome_della_Donazione ? row.Nome_della_Donazione.trim() : row.id;
            if (!groupedMap.has(key)) {
                groupedMap.set(key, {
                    Donatore: row.Donatore,
                    Nome_della_Donazione: row.Nome_della_Donazione,
                    Data_di_ricezione: row.Data_di_ricezione,
                    Trattenuta: row.Trattenuta ? parseFloat(row.Trattenuta) : 20,
                    Programma: row.Programma,
                    Ammontare: row.Ammontare ? parseFloat(row.Ammontare) : null,
                    Data_di_Competenza: row.Data_di_Competenza,
                    Metodo_di_pagamento: row.Metodo_di_pagamento,
                    Allocazioni: []
                });
            }
            
            if (row.Partner_Allocato && row.Percentuale_Allocazione) {
                groupedMap.get(key).Allocazioni.push({
                    Partner: row.Partner_Allocato,
                    Percentuale: parseFloat(row.Percentuale_Allocazione)
                });
            }
        });
        
        const jsonString = JSON.stringify(Array.from(groupedMap.values()));
        
        const attributeChangeEvent = new FlowAttributeChangeEvent('donationsDataJson', jsonString);
        this.dispatchEvent(attributeChangeEvent);
        
        const countEvent = new FlowAttributeChangeEvent('populatedRowsCount', String(groupedMap.size));
        this.dispatchEvent(countEvent);
    }
    
    async loadDonorsForProgram(programId) {
        this.isLoading = true;
        try {
            this.donors = await getDonorsForProgram({ programId: programId, recordTypeId: null });
        } catch (error) {
            this.showToast('Errore', 'Errore nel caricamento dei donatori: ' + error.body.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    handleDonorSelection(event) {
        this.selectedDonorId = event.detail.value;
        const selectedDonor = this.donors.find(d => d.Id === this.selectedDonorId);
        if (selectedDonor) {
            this.selectedDonorName = selectedDonor.Name;
        }
        this.updateFlowOutput();
    }
    
    async handleCreateDonations() {
        // Raggruppa come reorderAndColorizeRows: le righe di allocazione (solo Partner+Percentuale)
        // senza Nome_della_Donazione appartengono al gruppo precedente
        const groupedMap = new Map();
        let currentGroupKey = null;
        
        for (const row of this.rows) {
            const hasDonationData = (row.Nome_della_Donazione && row.Nome_della_Donazione.trim()) &&
                row.Donatore && (row.Data_di_ricezione && row.Data_di_ricezione.trim()) &&
                (row.Programma && row.Programma.trim()) && (row.Ammontare && row.Ammontare !== '') &&
                (row.Data_di_Competenza && row.Data_di_Competenza.trim()) &&
                (row.Metodo_di_pagamento && row.Metodo_di_pagamento.trim());
            
            const hasAllocationOnly = row.Partner_Allocato && row.Percentuale_Allocazione && !hasDonationData;
            
            if (hasDonationData) {
                currentGroupKey = row.Nome_della_Donazione.trim();
                if (!groupedMap.has(currentGroupKey)) {
                    groupedMap.set(currentGroupKey, {
                        Donatore: row.Donatore,
                        Nome_della_Donazione: row.Nome_della_Donazione,
                        Data_di_ricezione: row.Data_di_ricezione,
                        Trattenuta: row.Trattenuta ? parseFloat(row.Trattenuta) : 20,
                        Programma: row.Programma,
                        Ammontare: row.Ammontare ? parseFloat(row.Ammontare) : null,
                        Data_di_Competenza: row.Data_di_Competenza,
                        Metodo_di_pagamento: row.Metodo_di_pagamento,
                        Allocazioni: []
                    });
                }
                if (row.Partner_Allocato && row.Percentuale_Allocazione) {
                    groupedMap.get(currentGroupKey).Allocazioni.push({
                        Partner: row.Partner_Allocato,
                        Percentuale: parseFloat(row.Percentuale_Allocazione)
                    });
                }
            } else if (hasAllocationOnly && currentGroupKey && groupedMap.has(currentGroupKey)) {
                groupedMap.get(currentGroupKey).Allocazioni.push({
                    Partner: row.Partner_Allocato,
                    Percentuale: parseFloat(row.Percentuale_Allocazione)
                });
            }
        }
        
        if (groupedMap.size === 0) {
            this.showToast('Errore', 'Nessuna riga completamente popolata. Compila tutti i campi obbligatori per almeno una riga.', 'error');
            return;
        }
        
        let totalPercentError = false;
        const donationsList = Array.from(groupedMap.values());
        
        // Verifica che la somma delle percentuali faccia 100 per le donazioni con allocazioni
        for (let don of donationsList) {
            if (don.Allocazioni && don.Allocazioni.length > 0) {
                const sum = don.Allocazioni.reduce((acc, curr) => acc + curr.Percentuale, 0);
                // Permettiamo una piccola tolleranza per i decimali se necessario, ma idealmente 100
                if (Math.abs(sum - 100) > 0.01) {
                    this.showToast('Errore Percentuali', `La somma delle allocazioni per la donazione "${don.Nome_della_Donazione}" è ${sum}%, deve essere 100%.`, 'error');
                    totalPercentError = true;
                    break;
                }
            }
        }
        
        if (totalPercentError) return;
        
        const donationsDataJson = JSON.stringify(donationsList);
        
        this.isCreating = true;
        try {
            const result = await createDonations({
                donationsData: donationsDataJson,
                donorId: '',
                donorName: ''
            });
            
            if (result.success) {
                const countEvent = new FlowAttributeChangeEvent('populatedRowsCount', String(result.createdCount));
                this.dispatchEvent(countEvent);
                
                const idsEvent = new FlowAttributeChangeEvent('createdDonationIds', JSON.stringify(result.createdDonationIds));
                this.dispatchEvent(idsEvent);
                
                const firstId = result.createdDonationIds && result.createdDonationIds.length > 0 
                    ? result.createdDonationIds[0] 
                    : '';
                const firstIdEvent = new FlowAttributeChangeEvent('firstCreatedDonationId', firstId);
                this.dispatchEvent(firstIdEvent);
                
                const successEvent = new FlowAttributeChangeEvent('donationsCreated', 'true');
                this.dispatchEvent(successEvent);
                
                const message = result.createdCount === 1 
                    ? 'Donazione creata con successo!' 
                    : `${result.createdCount} donazioni create con successo!`;
                this.showToast('Successo', message, 'success');
                
                const navigateNextEvent = new FlowNavigationNextEvent();
                this.dispatchEvent(navigateNextEvent);
            } else {
                this.showToast('Errore', result.errorMessage || 'Errore nella creazione delle donazioni', 'error');
            }
        } catch (error) {
            this.showToast('Errore', 'Errore nella creazione: ' + (error.body ? error.body.message : error.message), 'error');
        } finally {
            this.isCreating = false;
        }
    }
    
    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(evt);
    }
    
    get donorOptions() {
        return this.donors.map(donor => ({
            label: donor.Name,
            value: donor.Id
        }));
    }
    
    get isCreatingDisabled() {
        return this.isCreating || this.isLoading || this.hasValidationErrors;
    }
    
    /**
     * Verifica se ci sono errori di validazione che impediscono la creazione donazioni.
     * Stessa logica di handleCreateDonations: raggruppa righe, controlla completezza e percentuali.
     */
    get hasValidationErrors() {
        if (!this.rows || this.rows.length === 0) return true;
        
        const groupedMap = new Map();
        let currentGroupKey = null;
        
        for (const row of this.rows) {
            const hasDonationData = (row.Nome_della_Donazione && row.Nome_della_Donazione.trim()) &&
                row.Donatore && (row.Data_di_ricezione && row.Data_di_ricezione.trim()) &&
                (row.Programma && row.Programma.trim()) && (row.Ammontare && row.Ammontare !== '') &&
                (row.Data_di_Competenza && row.Data_di_Competenza.trim()) &&
                (row.Metodo_di_pagamento && row.Metodo_di_pagamento.trim());
            
            const hasAllocationOnly = row.Partner_Allocato && row.Percentuale_Allocazione && !hasDonationData;
            
            // error-value: nome incollato ma ID non risolto (Donatore, Programma, Partner)
            const hasErrorValue = (!row.Donatore && row.DonatoreName) || (!row.Programma && row.ProgrammaName) ||
                (row.Partner_AllocatoName && !row.Partner_Allocato);
            if (hasErrorValue) return true;
            
            if (hasDonationData) {
                currentGroupKey = row.Nome_della_Donazione.trim();
                if (!groupedMap.has(currentGroupKey)) {
                    groupedMap.set(currentGroupKey, { Allocazioni: [] });
                }
                if (row.Partner_Allocato && row.Percentuale_Allocazione) {
                    groupedMap.get(currentGroupKey).Allocazioni.push({
                        Percentuale: parseFloat(this.parseCurrency(row.Percentuale_Allocazione)) || 0
                    });
                }
            } else if (hasAllocationOnly && currentGroupKey && groupedMap.has(currentGroupKey)) {
                groupedMap.get(currentGroupKey).Allocazioni.push({
                    Percentuale: parseFloat(this.parseCurrency(row.Percentuale_Allocazione)) || 0
                });
            }
        }
        
        if (groupedMap.size === 0) return true;
        
        for (const don of groupedMap.values()) {
            if (don.Allocazioni && don.Allocazioni.length > 0) {
                const sum = don.Allocazioni.reduce((acc, curr) => acc + curr.Percentuale, 0);
                if (Math.abs(sum - 100) > 0.01) return true;
            }
        }
        
        // Donatore o Partner incoerenti con il Programma
        if (this.rows.some(r => r.donatoreProgramMismatch || r.partnerProgramMismatch)) return true;
        
        return false;
    }
    
    formatCurrency(value) {
        if (value === null || value === undefined || value === '') return '';
        const parsed = this.parseCurrency(value);
        if (!parsed) return '';
        const num = parseFloat(parsed);
        if (isNaN(num)) return String(value);
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 10 }).format(num);
    }
    
    /**
     * Riconosce e normalizza valori numerici/valuta da formato italiano o inglese.
     * Italiano: 1.000,50 (punto=migliaia, virgola=decimali)
     * Inglese:  1,000.50 (virgola=migliaia, punto=decimali)
     * Restituisce stringa numerica pronta per parseFloat (es. "1000.5").
     */
    parseCurrency(value) {
        if (!value && value !== 0) return '';
        if (typeof value === 'number') return value.toString();
        let cleanVal = value.toString().replace(/€/g, '').replace(/\s/g, '').trim();
        cleanVal = cleanVal.replace(/[^\d.,-]/g, '');
        if (!cleanVal) return '';
        
        const lastComma = cleanVal.lastIndexOf(',');
        const lastDot = cleanVal.lastIndexOf('.');
        
        if (lastComma > -1 && lastDot > -1) {
            // Entrambi presenti: l'ultimo è il separatore decimale
            if (lastComma > lastDot) {
                // Italiano: 1.000,50
                cleanVal = cleanVal.replace(/\./g, '').replace(',', '.');
            } else {
                // Inglese: 1,000.50
                cleanVal = cleanVal.replace(/,/g, '');
            }
        } else if (lastComma > -1) {
            // Solo virgola: migliaia (1,000) o decimali (1,50)
            const afterComma = cleanVal.substring(lastComma + 1);
            if (afterComma.length === 3 && /^\d{3}$/.test(afterComma)) {
                cleanVal = cleanVal.replace(/,/g, ''); // migliaia EN
            } else {
                cleanVal = cleanVal.replace(',', '.'); // decimali IT
            }
        } else if (lastDot > -1) {
            // Solo punto: migliaia (1.000) o decimali (1.50)
            const afterDot = cleanVal.substring(lastDot + 1);
            if (afterDot.length === 3 && /^\d{3}$/.test(afterDot)) {
                cleanVal = cleanVal.replace(/\./g, ''); // migliaia IT
            }
            // altrimenti punto già decimale (EN)
        }
        
        return cleanVal.replace(/[^\d.-]/g, '') || '';
    }
}