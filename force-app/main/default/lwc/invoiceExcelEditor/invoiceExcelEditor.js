import { api, LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { CurrentPageReference } from 'lightning/navigation';
import { NavigationMixin } from 'lightning/navigation';
import { openTab } from 'lightning/platformWorkspaceApi';
import createInvoicesFromFlow from '@salesforce/apex/InvoiceExcelEditorController.createInvoicesFromFlow';
import generateInvoiceNumber from '@salesforce/apex/InvoiceExcelEditorController.generateInvoiceNumber';
import checkInvoiceNumbersUniqueness from '@salesforce/apex/InvoiceExcelEditorController.checkInvoiceNumbersUniqueness';
import getTipoVisite from '@salesforce/apex/InvoiceCreationController.getTipiVisita';
import getBeneficiaryTypes from '@salesforce/apex/VisiteMediche.getBeneficiaryTypes';
import getComune from '@salesforce/apex/InvoiceCreationController.getComune';
import getMedicalCenters from '@salesforce/apex/InvoiceCreationController.getMedicalCenters';
import getSignalingNonProfits from '@salesforce/apex/InvoiceCreationController.getSignalingNonProfits';
import getPartnerAccount from '@salesforce/apex/InvoiceExcelEditorController.getPartnerAccount';
import getFreeAccount from '@salesforce/apex/InvoiceExcelEditorController.getFreeAccount';
import getEnrolledPrograms from '@salesforce/apex/InvoiceExcelEditorController.getEnrolledPrograms';
import getAvailableBudgetsForProgram from '@salesforce/apex/InvoiceExcelEditorController.getAvailableBudgetsForProgram';
import checkBudgetForProgram from '@salesforce/apex/InvoiceExcelEditorController.checkBudgetForProgram';
import getPartnersForProgram from '@salesforce/apex/InvoiceExcelEditorController.getPartnersForProgram';

export default class InvoiceExcelEditor extends NavigationMixin(LightningElement) {
    @track rows = [];
    @track hasError = false;
    @track errorMessage = '';
    @track hasSuccess = false;
    @track successMessage = '';
    @track tipoVisite = [];
    @track beneficiaryTypeOptions = [];
    @track comuni = [];
    @track provinceSet = new Set();
    @track regioniSet = new Set();
    @track provinceList = [];
    @track regioniList = [];
    @track medicalCenters = [];
    @track nonProfits = []; // Lista di oggetti {Name, Ente_Categoria__c}
    @track categoryOptions = []; // Opzioni per le categorie degli enti no profit
    @track partners = []; // Lista di partner (donatori) con Program Enrollment attivo per il programma selezionato
    nextRowId = 1;
    selectedRowIndex = -1;
    isPasting = false;
    pendingInvoiceNumberCorrection = null; // Traccia la correzione automatica pendente per il numero fattura
    pasteStartRow = -1;
    pasteStartCol = -1;
    // Stato dropdown
    dropdownOpen = null; // {rowIndex: number, field: string}
    dropdownFilter = '';
    dropdownFilteredOptions = [];
    @track showConfirmButton = false; // Mostra pulsante "Conferma Valore" per comune
    isConfirmingValue = false; // Flag per prevenire blur quando si conferma un valore
    skipNextConfirmClick = false; // Evita doppia esecuzione quando usiamo mousedown+click sul bottone
    // Stato calendario date
    datePickerOpen = null; // {rowIndex: number, field: string}
    // Stato modal editing Invoice Number
    @track invoiceNumberModalOpen = null; // {rowIndex: number} o null
    invoiceNumberModalValue = ''; // Valore temporaneo nel modal
    // Stato modal editing altri campi numerici
    @track numeroVisiteModalOpen = null; // {rowIndex: number} o null
    numeroVisiteModalValue = ''; // Valore temporaneo nel modal
    @track totaleMinutiModalOpen = null; // {rowIndex: number} o null
    totaleMinutiModalValue = ''; // Valore temporaneo nel modal
    @track amountModalOpen = null; // {rowIndex: number} o null
    amountModalValue = ''; // Valore temporaneo nel modal
    // Stato selezione programma e partner
    @track showProgramSelection = false;
    @track showPartnerSelection = false;
    @track programs = [];
    @track selectedProgramId = null;
    @track selectedProgramName = null;
    @track partnerAccountId = null;
    @track availableBudgets = [];
    @track selectedPartnerBudgetId = null;
    @track isLoadingPrograms = false;
    @track isLoadingBudgets = false;
    // Stato vista organizzata
    @track showOrganizedView = false;
    @track organizedInvoices = []; // Array di {invoice: {...}, visits: [...]}
    // Stato salvataggio e risultati
    @track isSaving = false;
    @track isValidating = false; // Spinner durante le validazioni
    @track validatingCells = {}; // Oggetto per tracciare le celle in validazione: { "rowIndex-field": true }
    @track showResults = false;
    @track saveResults = []; // Array di risultati per ogni fattura
    @track expandedInvoices = {}; // Oggetto per tracciare lo stato di espansione delle fatture

    // Valori passati dal Flow (come screen component) o tramite URL state quando aperto come Navigation Item
    @api programId;
    @api partnerBudgetId;
    _incomingContextApplied = false;

    @wire(CurrentPageReference)
    wiredPageRef(pageRef) {
        if (!pageRef) return;
        // applyIncomingContext è async, ma @wire non può essere async
        // Il caricamento dei partner verrà gestito in initializeProgramSelection
        this.applyIncomingContext(pageRef?.state);
    }

    get showConfigCard() {
        // Se Programma/Budget sono già determinati (da user/flow), non mostrare la sezione di selezione
        return this.showProgramSelection || this.showPartnerSelection;
    }


    get isTableEmpty() {
        return this.rows.length === 0 || 
               (this.rows.length === 1 && this.isRowEmpty(this.rows[0]));
    }

    get hasSaveResults() {
        if (!this.showOrganizedView || !this.organizedInvoices || this.organizedInvoices.length === 0) {
            return false;
        }
        
        // Verifica se almeno una fattura ha uno stato di salvataggio
        return this.organizedInvoices.some(invoiceGroup => {
            return invoiceGroup.invoice && invoiceGroup.invoice.saveStatus;
        });
    }

    get hasValidationErrors() {
        if (!this.showOrganizedView || !this.organizedInvoices || this.organizedInvoices.length === 0) {
            return false;
        }
        
        // Verifica se ci sono errori nelle fatture o nelle visite organizzate
        return this.organizedInvoices.some(invoiceGroup => {
            // Verifica errori nella fattura
            if (invoiceGroup.invoice && invoiceGroup.invoice.hasErrors) {
                return true;
            }
            // Verifica errori nelle visite
            if (invoiceGroup.visits && invoiceGroup.visits.some(visit => visit.hasErrors === true)) {
                return true;
            }
            return false;
        });
    }

    /**
     * Raggruppa i risultati per fattura per mostrare una sola riga per fattura
     * con tutte le informazioni sulla riga principale
     */
    get groupedSaveResults() {
        if (!this.saveResults || this.saveResults.length === 0) {
            return [];
        }

        // Raggruppa i risultati per invoiceId
        const groupedByInvoice = new Map();
        
        this.saveResults.forEach(result => {
            const invoiceKey = result.invoiceId || `error-${result.rowNumber}`;
            
            if (!groupedByInvoice.has(invoiceKey)) {
                // Crea la riga principale della fattura con tutti i dettagli
                groupedByInvoice.set(invoiceKey, {
                    id: `invoice-${invoiceKey}`,
                    invoiceKey: invoiceKey,
                    isInvoice: true,
                    invoiceId: result.invoiceId,
                    invoiceName: result.invoiceName,
                    invoiceNumber: result.invoiceNumber || '',
                    invoiceDate: result.invoiceDate || '',
                    dataCompetenza: result.dataCompetenza || '',
                    medicalCenter: result.medicalCenter || '',
                    partnerName: result.partnerName || '',
                    enteNoProfit: result.enteNoProfit || '',
                    noProfitCategory: result.noProfitCategory || '',
                    prestazioneGratuita: result.prestazioneGratuita || false,
                    localita: result.localita || '',
                    status: result.status,
                    isSuccess: result.isSuccess,
                    errorMessage: result.errorMessage,
                    totalQuantity: 0,
                    totalMinutes: 0,
                    totalCost: 0,
                    visitsCreated: 0,
                    visitsFailed: 0,
                    visitError: result.visitError,
                    visits: [] // Dettagli delle visite (per riferimento, non più mostrate come righe separate)
                });
            }
            
            const invoiceGroup = groupedByInvoice.get(invoiceKey);
            
            // Aggiungi i dettagli delle visite se presenti (per riferimento)
            if (result.visitDetails && Array.isArray(result.visitDetails)) {
                invoiceGroup.visits.push(...result.visitDetails);
            }
            
            // Aggiorna i totali della fattura (solo se la riga è di successo)
            if (result.isSuccess) {
                invoiceGroup.totalQuantity += result.totalQuantity || 0;
                invoiceGroup.totalMinutes += result.totalMinutes || 0;
                invoiceGroup.totalCost += result.totalCost || 0;
                invoiceGroup.visitsCreated += result.visitsCreated || 0;
                invoiceGroup.visitsFailed += result.visitsFailed || 0;
            }
        });
        
        // Converti la mappa in array e formatta i totali
        const groupedArray = Array.from(groupedByInvoice.values()).map(invoiceGroup => {
            // Formatta il totale costo della fattura
            invoiceGroup.totalCostFormatted = this.formatCurrency(invoiceGroup.totalCost);
            
            // Verifica se ci sono visite
            invoiceGroup.hasVisits = invoiceGroup.visits && invoiceGroup.visits.length > 0;
            
            // Verifica se ci sono errori nelle visite
            invoiceGroup.hasVisitErrors = invoiceGroup.visitError && invoiceGroup.visitError.trim() !== '' || 
                                         (invoiceGroup.visitsFailed && invoiceGroup.visitsFailed > 0);
            
            return invoiceGroup;
        });
        
        return groupedArray;
    }

    /**
     * Gestisce l'espansione/collasso delle visite di una fattura
     */
    toggleInvoiceExpansion(event) {
        const invoiceKey = event.currentTarget.dataset.invoiceKey;
        if (!invoiceKey) return;
        
        // Toggle lo stato di espansione
        this.expandedInvoices[invoiceKey] = !this.expandedInvoices[invoiceKey];
        
        // Forza il re-render creando un nuovo oggetto
        this.expandedInvoices = { ...this.expandedInvoices };
    }

    /**
     * Apre un record visita in un nuovo tab della console
     */
    async openVisitRecord(event) {
        const visitId = event.currentTarget.dataset.visitId;
        if (!visitId) return;
        
        try {
            await openTab({
                recordId: visitId,
                focus: true
            });
        } catch (error) {
            console.error('Errore apertura tab console:', error);
            this.showError('Errore nell\'apertura del record visita.');
        }
    }

    getInvoiceErrorClass(invoiceGroup, field) {
        if (invoiceGroup && invoiceGroup.invoice && invoiceGroup.invoice.hasErrors && invoiceGroup.invoice.errors && invoiceGroup.invoice.errors[field]) {
            return 'error-value';
        }
        return '';
    }

    getVisitErrorClass(visit, field) {
        if (visit && visit.hasErrors && visit.errors && visit.errors[field]) {
            return 'slds-truncate error-value';
        }
        return 'slds-truncate';
    }

    hasInvoiceError(invoiceGroup, field) {
        return invoiceGroup && invoiceGroup.invoice && invoiceGroup.invoice.hasErrors && invoiceGroup.invoice.errors && invoiceGroup.invoice.errors[field] === true;
    }

    hasVisitError(visit, field) {
        return visit && visit.hasErrors && visit.errors && visit.errors[field] === true;
    }

    get isNoRowSelected() {
        return this.selectedRowIndex === -1;
    }

    getRowClass(row) {
        return row.selected ? 'selected-row' : '';
    }

    isRowEmpty(row) {
        return !row.partner &&
               !row.invoiceDate && 
               !row.competenceDate && 
               !row.invoiceNumber && 
               !row.medicalCenter && 
               !row.noProfit && 
               !row.noProfitCategory &&
               !row.isFree &&
               !row.noInvoiceAvailable &&
               !row.tipoVisita &&
               !row.beneficiaryType &&
               !row.numeroVisite &&
               !row.totaleMinuti &&
               !row.amount &&
               !row.dataVisita &&
               !row.comune;
    }

    /**
     * Verifica se una riga contiene errori di validazione
     */
    hasRowErrors(row) {
        if (!row || !row.validationErrors) {
            return false;
        }
        return Object.values(row.validationErrors).some(error => error === true);
    }

    /**
     * Verifica se una cella specifica è in validazione
     */
    isCellValidating(rowIndex, field) {
        const key = `${rowIndex}-${field}`;
        return this.validatingCells[key] === true;
    }

    /**
     * Imposta lo stato di validazione per una cella
     */
    setCellValidating(rowIndex, field, isValidating) {
        const key = `${rowIndex}-${field}`;
        if (isValidating) {
            this.validatingCells = { ...this.validatingCells, [key]: true };
            // Aggiorna anche la proprietà isValidating sull'oggetto row
            if (this.rows[rowIndex]) {
                if (!this.rows[rowIndex].isValidating) {
                    this.rows[rowIndex].isValidating = {};
                }
                this.rows[rowIndex].isValidating[field] = true;
            }
        } else {
            const updated = { ...this.validatingCells };
            delete updated[key];
            this.validatingCells = updated;
            // Rimuovi anche la proprietà isValidating dall'oggetto row
            if (this.rows[rowIndex] && this.rows[rowIndex].isValidating) {
                const rowValidating = { ...this.rows[rowIndex].isValidating };
                delete rowValidating[field];
                this.rows[rowIndex].isValidating = rowValidating;
            }
        }
        // Forza il rerender aggiornando l'array rows
        this.rows = [...this.rows];
    }

    /**
     * Verifica se una cella ha contenuto
     */
    hasCellContent(field, row) {
        if (!row || !field) return false;
        const value = row[field];
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim() !== '';
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'boolean') return value === true;
        return false;
    }

    /**
     * Cancella il contenuto di una cella
     */
    clearCellContent(event) {
        event.stopPropagation();
        event.preventDefault();
        
        const button = event.currentTarget;
        const cell = button.closest('td[data-field]');
        if (!cell) return;
        
        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        
        if (rowIndex < 0 || rowIndex >= this.rows.length) return;
        
        // Modifica direttamente la riga esistente invece di creare un nuovo array
        // Questo preserva i getter computed
        const row = this.rows[rowIndex];
        
        // Cancella il valore nel modello dati
        if (field === 'invoiceNumber') {
            // Per invoiceNumber, gestisci lo span interno
            row.invoiceNumber = '';
            // Rimuovi errori di validazione
            if (row.validationErrors) {
                row.validationErrors.invoiceNumber = false;
            }
            // Aggiorna anche il DOM della cella
            setTimeout(() => {
                const invoiceCell = this.template.querySelector(
                    `td[data-field="invoiceNumber"][data-row-index="${rowIndex}"]`
                );
                if (invoiceCell) {
                    const invoiceValueSpan = invoiceCell.querySelector('.invoice-number-value');
                    if (invoiceValueSpan) {
                        invoiceValueSpan.textContent = '';
                    }
                    this.updateCellValidationState(invoiceCell, row, 'invoiceNumber');
                }
            }, 0);
        } else if (field === 'isFree' || field === 'noInvoiceAvailable') {
            // Per i checkbox, imposta a false
            row[field] = false;
        } else if (field === 'partnerId') {
            // Per partnerId, cancella anche partner
            row.partner = '';
            row.partnerId = '';
            if (row.validationErrors) {
                row.validationErrors.partner = false;
            }
        } else if (field === 'tipoVisitaId') {
            // Per tipoVisitaId, cancella anche tipoVisita
            row.tipoVisita = '';
            row.tipoVisitaId = '';
            if (row.validationErrors) {
                row.validationErrors.tipoVisita = false;
            }
        } else if (field === 'numeroVisite' || field === 'totaleMinuti' || field === 'amount') {
            // Per i campi numerici, imposta a stringa vuota
            row[field] = '';
            // Rimuovi errori di validazione
            if (row.validationErrors) {
                row.validationErrors[field] = false;
            }
        } else {
            // Per tutti gli altri campi, cancella il valore
            row[field] = '';
            // Rimuovi errori di validazione
            if (row.validationErrors) {
                row.validationErrors[field] = false;
            }
        }
        
        // Forza il re-render aggiornando l'array senza perdere i getter computed
        // Usa setTimeout per permettere a LWC di gestire il re-render correttamente
        setTimeout(() => {
            // Aggiorna lo stato di validazione visiva
            this.updateCellValidationState(cell, row, field);
            
            // Forza il re-render dell'array per aggiornare la UI
            // Questo permette a LWC di aggiornare il DOM correttamente senza perdere i getter
            this.rows = [...this.rows];
        }, 0);
    }

    addRow() {
        const newRow = {
            id: `row-${this.nextRowId++}`,
            rowNumber: this.rows.length + 1,
            partner: '', // Nome del partner (donatore)
            partnerId: '', // ID del partner (donatore)
            previousPartner: '', // Valore precedente del partner (prima dell'impostazione automatica per prestazione gratuita)
            previousPartnerId: '', // ID precedente del partner
            invoiceDate: '',
            competenceDate: '',
            invoiceNumber: '',
            previousInvoiceNumber: '', // Valore precedente del numero fattura (prima della generazione automatica)
            medicalCenter: '',
            noProfit: '',
            noProfitCategory: '',
            isFree: false,
            noInvoiceAvailable: false,
            // Campi visite mediche
            tipoVisita: '',
            tipoVisitaId: '',
            beneficiaryType: '',
            numeroVisite: '',
            totaleMinuti: '',
            amount: '',
            dataVisita: '',
            comune: '',
            provincia: '',
            regione: '',
            comuneIsNew: false, // Flag per indicare se il comune è nuovo e deve essere creato
            medicalCenterIsNew: false, // Flag per indicare se il centro medico è nuovo
            noProfitIsNew: false, // Flag per indicare se l'ente no profit è nuovo e deve essere creato
            noProfitCategoryIsNew: false, // Flag per indicare se la categoria ente è nuova e deve essere creata
            tipoVisitaIsNew: false, // Flag per indicare se il tipo visita è nuovo e deve essere creato
            selected: false,
            // Stato validazione campi
            validationErrors: {
                partner: false,
                tipoVisita: false,
                beneficiaryType: false,
                comune: false,
                provincia: false,
                regione: false,
                medicalCenter: false,
                noProfit: false,
                noProfitCategory: false,
                invoiceNumber: false // Errore per numero fattura duplicato
            },
            hasErrors: false, // Flag per indicare se la riga contiene errori
            isValidating: {}, // Oggetto per tracciare lo stato di validazione per ogni campo
            isEditing: {}, // Oggetto per tracciare quali campi sono in modifica
            isEditingInvoiceNumber: false, // Flag per indicare se il box di editing per Invoice Number è aperto
            isEditingNumeroVisite: false, // Flag per indicare se il box di editing per Numero Visite è aperto
            isEditingTotaleMinuti: false, // Flag per indicare se il box di editing per Totale Minuti è aperto
            isEditingAmount: false // Flag per indicare se il box di editing per Ammontare è aperto
        };
        // Aggiungi getter per selectedClass
        Object.defineProperty(newRow, 'selectedClass', {
            get: function() {
                return this.selected ? 'selected-row' : '';
            },
            enumerable: true,
            configurable: true
        });
        // Aggiungi getter per verificare se i campi hanno contenuto
        Object.defineProperty(newRow, 'hasNumeroVisite', {
            get: function() {
                return this.numeroVisite !== null && this.numeroVisite !== undefined && this.numeroVisite !== '';
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(newRow, 'hasTotaleMinuti', {
            get: function() {
                return this.totaleMinuti !== null && this.totaleMinuti !== undefined && this.totaleMinuti !== '';
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(newRow, 'hasAmount', {
            get: function() {
                return this.amount !== null && this.amount !== undefined && this.amount !== '';
            },
            enumerable: true,
            configurable: true
        });
        this.rows = [...this.rows, newRow];
        
        // Formatta le date dopo l'aggiunta della riga (con un timeout più lungo per assicurarsi che il DOM sia pronto)
        setTimeout(() => {
            this.formatDatesInTable();
        }, 100);
    }
    
    /**
     * Formatta tutte le date nella tabella nel formato visualizzato "18 Nov 2025"
     */
    formatDatesInTable() {
        this.rows.forEach((row, rowIndex) => {
            ['invoiceDate', 'competenceDate', 'dataVisita'].forEach(field => {
                const cell = this.template.querySelector(
                    `td[data-field="${field}"][data-row-index="${rowIndex}"]`
                );
                if (cell) {
                    if (row[field]) {
                        // Prima prova a parsare la data se non è già in formato YYYY-MM-DD
                        let dateToFormat = row[field];
                        const isISOFormat = /^\d{4}-\d{1,2}-\d{1,2}$/.test(dateToFormat);
                        
                        if (!isISOFormat) {
                            // Se non è in formato ISO, prova a parsarla
                            let parsedDate = this.parseDate(dateToFormat);
                            if (!parsedDate) {
                                // Se parseDate fallisce, prova a parsare dal formato visualizzato
                                parsedDate = this.parseDateFromDisplayFormat(dateToFormat);
                            }
                            if (parsedDate) {
                                dateToFormat = parsedDate;
                                // Aggiorna anche il valore nel modello dati
                                row[field] = parsedDate;
                            }
                        }
                        
                        // Formatta la data per la visualizzazione
                        const formattedDate = this.formatDateForDisplay(dateToFormat);
                        if (formattedDate) {
                            // Sempre aggiorna la cella con la data formattata
                            cell.textContent = formattedDate;
                        }
                    } else {
                        // Se il campo è vuoto, assicurati che la cella sia vuota
                        if (cell.textContent.trim() !== '') {
                            cell.textContent = '';
                        }
                    }
                }
            });
        });
    }

    deleteSelectedRow() {
        if (this.selectedRowIndex >= 0 && this.selectedRowIndex < this.rows.length) {
            // Rimuovi la riga selezionata
            this.rows.splice(this.selectedRowIndex, 1);
            // Rinumera le righe
            this.rows.forEach((row, index) => {
                row.rowNumber = index + 1;
            });
            // Forza il re-render
            this.rows = [...this.rows];
            this.selectedRowIndex = -1;
        }
    }

    deleteAllRows() {
        // Chiudi eventuali dropdown o date picker aperti
        this.dropdownOpen = null;
        this.datePickerOpen = null;
        this.dropdownFilter = '';
        this.dropdownFilteredOptions = [];
        this.showConfirmButton = false;
        this.isConfirmingValue = false;
        
        // Resetta la vista organizzata se attiva
        this.showOrganizedView = false;
        this.organizedInvoices = [];
        
        // Resetta messaggi di errore/successo
        this.hasError = false;
        this.errorMessage = '';
        this.hasSuccess = false;
        this.successMessage = '';
        
        // Resetta l'indice della riga selezionata
        this.selectedRowIndex = -1;
        
        // Resetta il contatore delle righe
        this.nextRowId = 1;
        
        // Svuota completamente l'array
        this.rows = [];
        
        // Usa setTimeout per assicurarsi che il DOM sia aggiornato prima di aggiungere la nuova riga
        // Questo evita problemi con la reattività di LWC
        setTimeout(() => {
            // Aggiungi una riga vuota iniziale usando addRow che gestisce correttamente i getter
            this.addRow();
        }, 0);
    }

    selectRow(event) {
        event.stopPropagation(); // Previeni propagazione per evitare conflitti
        const rowIndex = parseInt(event.currentTarget.dataset.rowIndex, 10);
        this.selectedRowIndex = rowIndex;
        // Aggiorna rows con selected e ricrea i getter computed
        this.rows = this.rows.map((row, index) => {
            const updatedRow = {
                ...row,
                selected: index === rowIndex
            };
            // Ricrea tutti i getter computed
            Object.defineProperty(updatedRow, 'selectedClass', {
                get: function() {
                    return this.selected ? 'selected-row' : '';
                },
                enumerable: true,
                configurable: true
            });
            Object.defineProperty(updatedRow, 'hasNumeroVisite', {
                get: function() {
                    return this.numeroVisite !== null && this.numeroVisite !== undefined && this.numeroVisite !== '';
                },
                enumerable: true,
                configurable: true
            });
            Object.defineProperty(updatedRow, 'hasTotaleMinuti', {
                get: function() {
                    return this.totaleMinuti !== null && this.totaleMinuti !== undefined && this.totaleMinuti !== '';
                },
                enumerable: true,
                configurable: true
            });
            Object.defineProperty(updatedRow, 'hasAmount', {
                get: function() {
                    return this.amount !== null && this.amount !== undefined && this.amount !== '';
                },
                enumerable: true,
                configurable: true
            });
            Object.defineProperty(updatedRow, 'hasPartnerContent', {
                get: function() { return this.partner && this.partner.trim() !== ''; },
                enumerable: true, configurable: true
            });
            return updatedRow;
        });
    }

    refreshValidationBordersInTable() {
        // Re-applica le classi invalid-cell quando la tabella viene rerenderizzata (es. ritorno da Summary)
        if (this.showOrganizedView) return;
        if (!this.rows || this.rows.length === 0) return;

        this.rows.forEach((row, rowIndex) => {
            const fields = row && row.validationErrors ? Object.keys(row.validationErrors) : [];
            fields.forEach((field) => {
                const cell = this.template.querySelector(
                    `td[data-field="${field}"][data-row-index="${rowIndex}"]`
                );
                if (cell) {
                    this.updateCellValidationState(cell, row, field);
                }
            });
        });
    }

    async handleKeyDown(event) {
        // Gestione navigazione con frecce
        const rowIndex = parseInt(event.currentTarget.dataset.rowIndex, 10);
        let cell = event.target;
        
        // Se l'evento viene dallo span interno (invoice-number-value), risali alla cella td
        if (cell.classList && cell.classList.contains('invoice-number-value')) {
            cell = cell.closest('td[data-field]');
        }
        
        if (event.key === 'ArrowDown' && rowIndex < this.rows.length - 1) {
            event.preventDefault();
            // Prima conferma il valore corrente
            await this.confirmCurrentCellValue(cell);
            // Poi vai alla riga successiva
            const nextRow = this.template.querySelector(`tr[data-row-index="${rowIndex + 1}"]`);
            if (nextRow) {
                const nextCell = nextRow.querySelector(`td[data-field="${cell.dataset.field}"]`);
                if (nextCell) {
                    nextCell.focus();
                }
            }
        } else if (event.key === 'ArrowUp' && rowIndex > 0) {
            event.preventDefault();
            // Prima conferma il valore corrente
            await this.confirmCurrentCellValue(cell);
            // Poi vai alla riga precedente
            const prevRow = this.template.querySelector(`tr[data-row-index="${rowIndex - 1}"]`);
            if (prevRow) {
                const prevCell = prevRow.querySelector(`td[data-field="${cell.dataset.field}"]`);
                if (prevCell) {
                    prevCell.focus();
                }
            }
        } else if (event.key === 'Tab') {
            // Navigazione orizzontale già gestita dal browser
            // Ma prima conferma il valore corrente
            await this.confirmCurrentCellValue(cell);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            // Prima conferma il valore corrente
            await this.confirmCurrentCellValue(cell);
            // Poi vai alla riga successiva, stessa colonna
            if (rowIndex < this.rows.length - 1) {
                const nextRow = this.template.querySelector(`tr[data-row-index="${rowIndex + 1}"]`);
                if (nextRow) {
                    const nextCell = nextRow.querySelector(`td[data-field="${cell.dataset.field}"]`);
                    if (nextCell) {
                        nextCell.focus();
                    }
                }
            } else {
                // Aggiungi nuova riga se siamo all'ultima
                this.addRow();
                setTimeout(() => {
                    const newRow = this.template.querySelector(`tr[data-row-index="${this.rows.length - 1}"]`);
                    if (newRow) {
                        const newCell = newRow.querySelector(`td[data-field="${cell.dataset.field}"]`);
                        if (newCell) {
                            newCell.focus();
                        }
                    }
                }, 0);
            }
        }
    }
    
    /**
     * Conferma il valore della cella corrente (simula blur)
     */
    async confirmCurrentCellValue(cell) {
        // Crea un evento blur sintetico
        const blurEvent = {
            currentTarget: cell,
            preventDefault: () => {}
        };
        await this.handleCellBlur(blurEvent);
    }

    handleCellFocus(event) {
        let cell = event.currentTarget;
        // Se l'evento viene dallo span interno (invoice-number-value), risali alla cella td
        if (cell.classList && cell.classList.contains('invoice-number-value')) {
            cell = cell.closest('td[data-field]');
        }
        const field = cell.dataset.field;
        
        // Per Invoice Number, Numero Visite, Totale Minuti e Ammontare, apri il box di editing invece del contenteditable normale
        if (field === 'invoiceNumber' || field === 'numeroVisite' || field === 'totaleMinuti' || field === 'amount') {
            const rowIndex = parseInt(cell.dataset.rowIndex, 10);
            event.preventDefault();
            
            // Chiudi eventuali altri box aperti prima di aprirne uno nuovo
            if (field === 'invoiceNumber') {
                if (this.invoiceNumberModalOpen && this.invoiceNumberModalOpen.rowIndex === rowIndex) {
                    return;
                }
                if (this.invoiceNumberModalOpen) {
                    this.closeInvoiceNumberModal();
                }
                if (rowIndex >= 0 && rowIndex < this.rows.length) {
                    this.openInvoiceNumberModal(rowIndex);
                }
            } else if (field === 'numeroVisite') {
                if (this.numeroVisiteModalOpen && this.numeroVisiteModalOpen.rowIndex === rowIndex) {
                    return;
                }
                this.closeAllEditingModals();
                if (rowIndex >= 0 && rowIndex < this.rows.length) {
                    this.openNumericFieldModal(rowIndex, 'numeroVisite');
                }
            } else if (field === 'totaleMinuti') {
                if (this.totaleMinutiModalOpen && this.totaleMinutiModalOpen.rowIndex === rowIndex) {
                    return;
                }
                this.closeAllEditingModals();
                if (rowIndex >= 0 && rowIndex < this.rows.length) {
                    this.openNumericFieldModal(rowIndex, 'totaleMinuti');
                }
            } else if (field === 'amount') {
                if (this.amountModalOpen && this.amountModalOpen.rowIndex === rowIndex) {
                    return;
                }
                this.closeAllEditingModals();
                if (rowIndex >= 0 && rowIndex < this.rows.length) {
                    this.openNumericFieldModal(rowIndex, 'amount');
                }
            }
            return;
        }
        
        // Per le celle date, non fare focus normale ma apri il calendario
        if (this.isDateField(field)) {
            event.preventDefault();
            this.openDatePicker(event);
            return;
        }
        
        // Posiziona il cursore alla fine del testo invece di selezionare tutto
        const textElement = cell.querySelector('.invoice-number-value') || cell;
        if (textElement.textContent) {
            // Posiziona il cursore alla fine del testo
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(textElement);
            range.collapse(false); // Collapse alla fine
            selection.removeAllRanges();
            selection.addRange(range);
        }
        
        // Aggiungi classe per il bordo blu
        cell.classList.add('cell-focused');
        
        // Salva il valore iniziale per la correzione automatica
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            const row = this.rows[rowIndex];
            cell.dataset.initialValue = row[field] || '';
        }
    }

    /**
     * Apre il box di editing inline per Invoice Number
     */
    openInvoiceNumberModal(rowIndex) {
        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            const updatedRows = [...this.rows];
            const row = updatedRows[rowIndex];
            
            // Chiudi eventuali altri box aperti
            updatedRows.forEach((r, idx) => {
                if (r.isEditingInvoiceNumber) {
                    r.isEditingInvoiceNumber = false;
                }
            });
            
            // Apri il box per questa riga
            row.isEditingInvoiceNumber = true;
            this.invoiceNumberModalOpen = { rowIndex: rowIndex };
            this.invoiceNumberModalValue = row.invoiceNumber || '';
            this.rows = updatedRows;
            
            // Posiziona la box sopra la cella dopo che il DOM è stato aggiornato
            setTimeout(() => {
                const cell = this.template.querySelector(`td[data-field="invoiceNumber"][data-row-index="${rowIndex}"]`);
                const editBox = this.template.querySelector(`td[data-field="invoiceNumber"][data-row-index="${rowIndex}"] .invoice-number-edit-box`);
                const input = this.template.querySelector(`td[data-field="invoiceNumber"][data-row-index="${rowIndex}"] .invoice-number-edit-input`);
                
                if (cell && editBox) {
                    // Funzione per posizionare la box
                    const positionEditBox = () => {
                        const cellRect = cell.getBoundingClientRect();
                        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                        
                        // Posiziona la box sopra la cella
                        editBox.style.top = `${cellRect.top + scrollTop}px`;
                        editBox.style.left = `${cellRect.left + scrollLeft}px`;
                        editBox.style.width = `${Math.max(cellRect.width, 200)}px`;
                    };
                    
                    // Posiziona inizialmente
                    positionEditBox();
                    
                    // Aggiungi listener per scroll e resize (rimuovili quando si chiude il box)
                    this._invoiceNumberEditBoxPositionHandler = positionEditBox;
                    window.addEventListener('scroll', positionEditBox, true);
                    window.addEventListener('resize', positionEditBox);
                }
                
                if (input) {
                    input.focus();
                    // Posiziona il cursore alla fine del testo
                    input.setSelectionRange(input.value.length, input.value.length);
                }
            }, 100);
        }
    }

    /**
     * Chiude il box di editing per Invoice Number senza salvare
     */
    closeInvoiceNumberModal(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        
        // Rimuovi i listener di scroll e resize
        if (this._invoiceNumberEditBoxPositionHandler) {
            window.removeEventListener('scroll', this._invoiceNumberEditBoxPositionHandler, true);
            window.removeEventListener('resize', this._invoiceNumberEditBoxPositionHandler);
            this._invoiceNumberEditBoxPositionHandler = null;
        }
        
        // Chiudi anche gli altri modali aperti
        this.closeAllEditingModals();
        
        if (this.invoiceNumberModalOpen && this.invoiceNumberModalOpen.rowIndex >= 0) {
            const rowIndex = this.invoiceNumberModalOpen.rowIndex;
            if (rowIndex < this.rows.length) {
                const updatedRows = [...this.rows];
                const row = updatedRows[rowIndex];
                row.isEditingInvoiceNumber = false;
                this.rows = updatedRows;
            }
        }
        this.invoiceNumberModalOpen = null;
        this.invoiceNumberModalValue = '';
    }

    /**
     * Conferma il valore nel box di editing e lo applica alla cella
     */
    async confirmInvoiceNumberModal(event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        
        if (this.invoiceNumberModalOpen && this.invoiceNumberModalOpen.rowIndex >= 0) {
            const rowIndex = this.invoiceNumberModalOpen.rowIndex;
            const newValue = this.invoiceNumberModalValue.trim();
            
            if (rowIndex < this.rows.length) {
                const updatedRows = [...this.rows];
                const row = updatedRows[rowIndex];
                const oldValue = row.invoiceNumber || '';
                
                // Aggiorna il valore nella riga
                row.invoiceNumber = newValue;
                
                // Rimuovi i listener di scroll e resize
                if (this._invoiceNumberEditBoxPositionHandler) {
                    window.removeEventListener('scroll', this._invoiceNumberEditBoxPositionHandler, true);
                    window.removeEventListener('resize', this._invoiceNumberEditBoxPositionHandler);
                    this._invoiceNumberEditBoxPositionHandler = null;
                }
                
                // Chiudi il box di editing prima di aggiornare
                row.isEditingInvoiceNumber = false;
                this.invoiceNumberModalOpen = null;
                this.invoiceNumberModalValue = '';
                
                // Aggiorna l'array rows per forzare il rerender
                this.rows = updatedRows;
                
                // Salva il valore iniziale per la correzione automatica
                const invoiceCell = this.template.querySelector(
                    `td[data-field="invoiceNumber"][data-row-index="${rowIndex}"]`
                );
                if (invoiceCell) {
                    invoiceCell.dataset.initialValue = oldValue;
                }
                
                // Per numero fattura, traccia la modifica per correggere dopo la validazione
                if (oldValue && oldValue.trim().toLowerCase() !== newValue.trim().toLowerCase()) {
                    this.pendingInvoiceNumberCorrection = {
                        oldValue: oldValue.trim().toLowerCase(),
                        newValue: newValue,
                        rowIndex: rowIndex,
                        invoiceDate: row.invoiceDate,
                        medicalCenter: row.medicalCenter || ''
                    };
                }
                
                // Imposta lo spinner di validazione
                this.setCellValidating(rowIndex, 'invoiceNumber', true);
                
                // Validazione campo
                this.validateField(row, 'invoiceNumber', newValue);
                
                // Aggiorna lo stato visivo della cella
                if (invoiceCell) {
                    this.updateCellValidationState(invoiceCell, row, 'invoiceNumber');
                }
                
                // Forza un rerender per aggiornare la visualizzazione
                this.rows = [...this.rows];
                
                // Verifica unicità numeri fattura (questo aggiornerà anche le altre celle duplicate)
                setTimeout(async () => {
                    try {
                        await this.checkInvoiceNumbersUniqueness();
                    } finally {
                        this.setCellValidating(rowIndex, 'invoiceNumber', false);
                    }
                }, 50);
            } else {
                // Chiudi il box di editing anche se c'è un errore
                this.closeInvoiceNumberModal();
            }
        }
    }

    /**
     * Gestisce l'input nel box di editing di Invoice Number
     */
    handleInvoiceNumberModalInput(event) {
        this.invoiceNumberModalValue = event.target.value;
    }

    /**
     * Gestisce il keydown nel box di editing di Invoice Number (Enter per confermare, Escape per chiudere)
     */
    handleInvoiceNumberModalKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            this.confirmInvoiceNumberModal(event);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.closeInvoiceNumberModal(event);
        }
    }

    /**
     * Gestisce il click sul box di editing per evitare che si apra di nuovo il modal
     */
    handleInvoiceNumberEditBoxClick(event) {
        event.stopPropagation();
    }

    /**
     * Chiude tutti i modali di editing aperti
     */
    closeAllEditingModals() {
        // Chiudi Invoice Number senza chiamare closeAllEditingModals per evitare loop infinito
        if (this.invoiceNumberModalOpen) {
            // Rimuovi i listener di scroll e resize
            if (this._invoiceNumberEditBoxPositionHandler) {
                window.removeEventListener('scroll', this._invoiceNumberEditBoxPositionHandler, true);
                window.removeEventListener('resize', this._invoiceNumberEditBoxPositionHandler);
                this._invoiceNumberEditBoxPositionHandler = null;
            }
            
            const rowIndex = this.invoiceNumberModalOpen.rowIndex;
            if (rowIndex >= 0 && rowIndex < this.rows.length) {
                const updatedRows = [...this.rows];
                const row = updatedRows[rowIndex];
                row.isEditingInvoiceNumber = false;
                this.rows = updatedRows;
            }
            this.invoiceNumberModalOpen = null;
            this.invoiceNumberModalValue = '';
        }
        
        // Chiudi gli altri modali
        if (this.numeroVisiteModalOpen) {
            this.closeNumericFieldModal('numeroVisite');
        }
        if (this.totaleMinutiModalOpen) {
            this.closeNumericFieldModal('totaleMinuti');
        }
        if (this.amountModalOpen) {
            this.closeNumericFieldModal('amount');
        }
    }

    /**
     * Apre il box di editing per un campo numerico (numeroVisite, totaleMinuti, amount)
     */
    openNumericFieldModal(rowIndex, field) {
        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            const updatedRows = [...this.rows];
            const row = updatedRows[rowIndex];
            
            // Chiudi eventuali altri box aperti per questo campo
            updatedRows.forEach((r, idx) => {
                if (field === 'numeroVisite' && r.isEditingNumeroVisite) {
                    r.isEditingNumeroVisite = false;
                } else if (field === 'totaleMinuti' && r.isEditingTotaleMinuti) {
                    r.isEditingTotaleMinuti = false;
                } else if (field === 'amount' && r.isEditingAmount) {
                    r.isEditingAmount = false;
                }
            });
            
            // Apri il box per questa riga
            if (field === 'numeroVisite') {
                row.isEditingNumeroVisite = true;
                this.numeroVisiteModalOpen = { rowIndex: rowIndex };
                this.numeroVisiteModalValue = row.numeroVisite || '';
            } else if (field === 'totaleMinuti') {
                row.isEditingTotaleMinuti = true;
                this.totaleMinutiModalOpen = { rowIndex: rowIndex };
                this.totaleMinutiModalValue = row.totaleMinuti || '';
            } else if (field === 'amount') {
                row.isEditingAmount = true;
                this.amountModalOpen = { rowIndex: rowIndex };
                this.amountModalValue = row.amount || '';
            }
            this.rows = updatedRows;
            
            // Posiziona la box sopra la cella dopo che il DOM è stato aggiornato
            setTimeout(() => {
                const cell = this.template.querySelector(`td[data-field="${field}"][data-row-index="${rowIndex}"]`);
                const editBox = this.template.querySelector(`td[data-field="${field}"][data-row-index="${rowIndex}"] .numeric-field-edit-box`);
                const input = this.template.querySelector(`td[data-field="${field}"][data-row-index="${rowIndex}"] .numeric-field-edit-input`);
                
                if (cell && editBox) {
                    // Funzione per posizionare la box
                    const positionEditBox = () => {
                        const cellRect = cell.getBoundingClientRect();
                        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                        
                        // Posiziona la box sopra la cella
                        editBox.style.top = `${cellRect.top + scrollTop}px`;
                        editBox.style.left = `${cellRect.left + scrollLeft}px`;
                        editBox.style.width = `${Math.max(cellRect.width, 200)}px`;
                    };
                    
                    // Posiziona inizialmente
                    positionEditBox();
                    
                    // Aggiungi listener per scroll e resize (rimuovili quando si chiude il box)
                    const handlerKey = `_${field}EditBoxPositionHandler`;
                    this[handlerKey] = positionEditBox;
                    window.addEventListener('scroll', positionEditBox, true);
                    window.addEventListener('resize', positionEditBox);
                }
                
                if (input) {
                    input.focus();
                    // Posiziona il cursore alla fine del testo
                    input.setSelectionRange(input.value.length, input.value.length);
                }
            }, 100);
        }
    }

    /**
     * Chiude il box di editing per un campo numerico senza salvare
     */
    closeNumericFieldModal(field) {
        // Rimuovi i listener di scroll e resize
        const handlerKey = `_${field}EditBoxPositionHandler`;
        if (this[handlerKey]) {
            window.removeEventListener('scroll', this[handlerKey], true);
            window.removeEventListener('resize', this[handlerKey]);
            this[handlerKey] = null;
        }
        
        if (field === 'numeroVisite' && this.numeroVisiteModalOpen && this.numeroVisiteModalOpen.rowIndex >= 0) {
            const rowIndex = this.numeroVisiteModalOpen.rowIndex;
            if (rowIndex < this.rows.length) {
                const updatedRows = [...this.rows];
                const row = updatedRows[rowIndex];
                row.isEditingNumeroVisite = false;
                this.rows = updatedRows;
            }
            this.numeroVisiteModalOpen = null;
            this.numeroVisiteModalValue = '';
        } else if (field === 'totaleMinuti' && this.totaleMinutiModalOpen && this.totaleMinutiModalOpen.rowIndex >= 0) {
            const rowIndex = this.totaleMinutiModalOpen.rowIndex;
            if (rowIndex < this.rows.length) {
                const updatedRows = [...this.rows];
                const row = updatedRows[rowIndex];
                row.isEditingTotaleMinuti = false;
                this.rows = updatedRows;
            }
            this.totaleMinutiModalOpen = null;
            this.totaleMinutiModalValue = '';
        } else if (field === 'amount' && this.amountModalOpen && this.amountModalOpen.rowIndex >= 0) {
            const rowIndex = this.amountModalOpen.rowIndex;
            if (rowIndex < this.rows.length) {
                const updatedRows = [...this.rows];
                const row = updatedRows[rowIndex];
                row.isEditingAmount = false;
                this.rows = updatedRows;
            }
            this.amountModalOpen = null;
            this.amountModalValue = '';
        }
    }

    /**
     * Conferma il valore nel box di editing per un campo numerico e lo applica alla cella
     */
    async confirmNumericFieldModal(field) {
        let modalOpen, modalValue, rowIndex, newValue;
        
        if (field === 'numeroVisite' && this.numeroVisiteModalOpen && this.numeroVisiteModalOpen.rowIndex >= 0) {
            modalOpen = this.numeroVisiteModalOpen;
            modalValue = this.numeroVisiteModalValue;
            rowIndex = modalOpen.rowIndex;
            newValue = modalValue.trim();
        } else if (field === 'totaleMinuti' && this.totaleMinutiModalOpen && this.totaleMinutiModalOpen.rowIndex >= 0) {
            modalOpen = this.totaleMinutiModalOpen;
            modalValue = this.totaleMinutiModalValue;
            rowIndex = modalOpen.rowIndex;
            newValue = modalValue.trim();
        } else if (field === 'amount' && this.amountModalOpen && this.amountModalOpen.rowIndex >= 0) {
            modalOpen = this.amountModalOpen;
            modalValue = this.amountModalValue;
            rowIndex = modalOpen.rowIndex;
            newValue = modalValue.trim();
        } else {
            return;
        }
        
        if (rowIndex < this.rows.length) {
            const updatedRows = [...this.rows];
            const row = updatedRows[rowIndex];
            const oldValue = row[field] || '';
            
            // Rimuovi i listener di scroll e resize
            const handlerKey = `_${field}EditBoxPositionHandler`;
            if (this[handlerKey]) {
                window.removeEventListener('scroll', this[handlerKey], true);
                window.removeEventListener('resize', this[handlerKey]);
                this[handlerKey] = null;
            }
            
            // Chiudi il box di editing prima di aggiornare
            if (field === 'numeroVisite') {
                row.isEditingNumeroVisite = false;
                this.numeroVisiteModalOpen = null;
                this.numeroVisiteModalValue = '';
            } else if (field === 'totaleMinuti') {
                row.isEditingTotaleMinuti = false;
                this.totaleMinutiModalOpen = null;
                this.totaleMinutiModalValue = '';
            } else if (field === 'amount') {
                row.isEditingAmount = false;
                this.amountModalOpen = null;
                this.amountModalValue = '';
            }
            
            // Processa il valore in base al tipo di campo
            if (field === 'numeroVisite' || field === 'totaleMinuti') {
                const numValue = this.parseInteger(newValue);
                row[field] = numValue !== null ? numValue : newValue;
            } else if (field === 'amount') {
                const currencyValue = this.parseCurrency(newValue);
                row[field] = currencyValue !== null ? currencyValue : newValue;
            } else {
                row[field] = newValue;
            }
            
            // Aggiorna l'array rows per forzare il rerender
            this.rows = updatedRows;
            
            // Validazione campo
            this.validateField(row, field, row[field]);
            
            // Aggiorna lo stato visivo della cella
            const cell = this.template.querySelector(`td[data-field="${field}"][data-row-index="${rowIndex}"]`);
            if (cell) {
                this.updateCellValidationState(cell, row, field);
            }
            
            // Forza un rerender per aggiornare la visualizzazione
            this.rows = [...this.rows];
        }
    }

    /**
     * Gestisce l'input nel box di editing per un campo numerico
     */
    handleNumericFieldModalInput(event) {
        const field = event.currentTarget.dataset.field;
        if (field === 'numeroVisite') {
            this.numeroVisiteModalValue = event.target.value;
        } else if (field === 'totaleMinuti') {
            this.totaleMinutiModalValue = event.target.value;
        } else if (field === 'amount') {
            this.amountModalValue = event.target.value;
        }
    }

    /**
     * Gestisce il keydown nel box di editing per un campo numerico (Enter per confermare, Escape per chiudere)
     */
    handleNumericFieldModalKeyDown(event) {
        const field = event.currentTarget.dataset.field;
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            this.confirmNumericFieldModal(field);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            this.closeNumericFieldModal(field);
        }
    }

    /**
     * Gestisce il click sul box di editing per evitare che si apra di nuovo il modal
     */
    handleNumericFieldEditBoxClick(event) {
        event.stopPropagation();
    }

    /**
     * Gestisce il click sul pulsante di conferma per un campo numerico
     */
    handleNumericFieldConfirmClick(event) {
        event.stopPropagation();
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        this.confirmNumericFieldModal(field);
    }

    /**
     * Gestisce il click sul pulsante di annullamento per un campo numerico
     */
    handleNumericFieldCancelClick(event) {
        event.stopPropagation();
        event.preventDefault();
        const field = event.currentTarget.dataset.field;
        this.closeNumericFieldModal(field);
    }
    
    /**
     * Gestisce l'input in tempo reale durante la modifica della cella
     */
    handleCellInput(event) {
        // Questo metodo viene chiamato durante la modifica, ma la correzione automatica
        // avverrà solo quando si conferma il valore (blur o Enter)
        // Qui possiamo solo tracciare che la cella è stata modificata
        let cell = event.currentTarget;
        if (cell.classList && cell.classList.contains('invoice-number-value')) {
            cell = cell.closest('td[data-field]');
        }
        
        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        
        // Imposta lo stato di modifica per questa cella
        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            const row = this.rows[rowIndex];
            if (!row.isEditing) {
                row.isEditing = {};
            }
            row.isEditing[field] = true;
            // Forza il rerender per mostrare il pulsante di conferma
            this.rows = [...this.rows];
        }
        
        // Se la picklist è aperta per questa cella, aggiorna il filtro e le opzioni
        if (this.dropdownOpen && 
            this.dropdownOpen.field === field && 
            this.dropdownOpen.rowIndex === rowIndex) {
            // Ottieni il valore corrente dalla cella
            const textElement = field === 'invoiceNumber' && cell.querySelector('.invoice-number-value')
                ? cell.querySelector('.invoice-number-value')
                : cell;
            const currentValue = textElement.textContent.trim();
            
            // Aggiorna il filtro del dropdown
            this.dropdownFilter = currentValue;
            
            // Aggiorna le opzioni filtrate
            this.updateFilteredOptions();
        }
        
        // La correzione automatica avverrà in handleCellBlur
    }

    /**
     * Conferma il valore di una cella e forza la validazione e il rendering
     */
    async confirmCellValue(rowIndex, field) {
        if (rowIndex < 0 || rowIndex >= this.rows.length) {
            return;
        }
        
        const cell = this.template.querySelector(
            `td[data-field="${field}"][data-row-index="${rowIndex}"]`
        );
        
        if (!cell) {
            return;
        }
        
        // Imposta il flag per prevenire il blur normale
        this.isConfirmingValue = true;
        
        // Rimuovi classe per il bordo blu
        cell.classList.remove('cell-focused');
        
        // Per invoiceNumber, prendi il valore dallo span interno, altrimenti dalla cella
        const textElement = field === 'invoiceNumber' && cell.querySelector('.invoice-number-value') 
            ? cell.querySelector('.invoice-number-value') 
            : cell;
        const value = textElement.textContent.trim();

        const updatedRows = [...this.rows];
        const row = updatedRows[rowIndex];

        // Gestione dei diversi tipi di campo (stessa logica di handleCellBlur)
        if (field === 'invoiceDate' || field === 'competenceDate' || field === 'dataVisita') {
            // Validazione data
            const dateValue = this.parseDate(value);
            if (dateValue) {
                row[field] = dateValue;
                const formattedDate = this.formatDateForDisplay(dateValue);
                cell.textContent = formattedDate;
            } else {
                row[field] = value;
            }
        } else if (field === 'isFree' || field === 'noInvoiceAvailable') {
            // I checkbox sono gestiti separatamente
            this.isConfirmingValue = false;
            return;
        } else if (field === 'numeroVisite' || field === 'totaleMinuti') {
            // Validazione numeri interi
            const numValue = this.parseInteger(value);
            row[field] = numValue !== null ? numValue : value;
        } else if (field === 'amount') {
            // Validazione currency (rimuove simbolo €)
            const currencyValue = this.parseCurrency(value);
            row[field] = currencyValue !== null ? currencyValue : value;
        } else {
            // Sostituisci con il valore esatto dal dataset se disponibile
            const exactValue = this.getExactValueFromDataset(field, value);
            const initialValue = cell.dataset.initialValue !== undefined ? cell.dataset.initialValue : (row[field] || '');
            const oldValueInRow = row[field];
            const oldValueHadError = row.validationErrors && row.validationErrors[field] === true;
            row[field] = exactValue;
            
            // Per il campo partner, imposta anche partnerId se trovato
            if (field === 'partner' && exactValue) {
                const partner = this.partners.find(
                    p => p.Name && p.Name.toLowerCase() === exactValue.toLowerCase()
                );
                if (partner && partner.Id) {
                    row.partnerId = partner.Id;
                } else {
                    const partnerOriginal = this.partners.find(
                        p => p.Name && p.Name.toLowerCase() === value.trim().toLowerCase()
                    );
                    if (partnerOriginal && partnerOriginal.Id) {
                        row.partnerId = partnerOriginal.Id;
                    } else {
                        row.partnerId = null;
                    }
                }
            }
            
            // Per comune, provincia e regione, NON fare correzione automatica delle altre celle
            if (field === 'comune' || field === 'provincia' || field === 'regione') {
                // Non fare nulla, solo aggiornare questa cella
            } else {
                // Verifica se il valore iniziale era errato (non nel dataset)
                const wasInitialValueIncorrect = initialValue && !this.isValueInDataset(field, initialValue);
                // Verifica se il nuovo valore è corretto (è nel dataset)
                const isNewValueValid = this.isValueInDataset(field, exactValue);
                
                // Per numero fattura, traccia la modifica per correggere dopo la validazione
                if (field === 'invoiceNumber' && initialValue && initialValue.trim().toLowerCase() !== value.trim().toLowerCase()) {
                    this.pendingInvoiceNumberCorrection = {
                        oldValue: initialValue.trim().toLowerCase(),
                        newValue: exactValue,
                        rowIndex: rowIndex,
                        invoiceDate: row.invoiceDate,
                        medicalCenter: row.medicalCenter || ''
                    };
                } else if (wasInitialValueIncorrect && isNewValueValid && exactValue !== initialValue && 
                    this.hasValidation(field)) {
                    // Per tutti gli altri campi validati, correggi tutte le celle della stessa colonna
                    const valueToFind = initialValue.trim().toLowerCase();
                    updatedRows.forEach((otherRow, otherIndex) => {
                        if (otherIndex !== rowIndex && otherRow[field]) {
                            const otherValue = String(otherRow[field]).trim().toLowerCase();
                            const otherValueHasError = otherRow.validationErrors && otherRow.validationErrors[field] === true;
                            if (otherValue === valueToFind && otherValueHasError) {
                                otherRow[field] = exactValue;
                                this.validateField(otherRow, field, exactValue);
                            }
                        }
                    });
                }
            }
            
            // Pulisci il valore iniziale dopo l'uso
            delete cell.dataset.initialValue;
        }

        // Imposta lo spinner di validazione per questa cella
        if (this.hasValidation(field)) {
            this.setCellValidating(rowIndex, field, true);
        }
        
        // Validazione campi specifici
        this.validateField(row, field, row[field]);
        
        // Se è stato modificato comune, provincia o regione, valida anche gli altri due campi correlati
        if (field === 'comune') {
            if (row.provincia) {
                this.validateField(row, 'provincia', row.provincia);
            }
            if (row.regione) {
                this.validateField(row, 'regione', row.regione);
            }
        } else if (field === 'provincia') {
            if (row.comune) {
                this.validateField(row, 'comune', row.comune);
            }
            if (row.regione) {
                this.validateField(row, 'regione', row.regione);
            }
        } else if (field === 'regione') {
            if (row.comune) {
                this.validateField(row, 'comune', row.comune);
            }
            if (row.provincia) {
                this.validateField(row, 'provincia', row.provincia);
            }
        }
        
        // Rimuovi lo spinner di validazione per questa cella (validazione sincrona completata)
        if (this.hasValidation(field)) {
            this.setCellValidating(rowIndex, field, false);
        }
        
        // Aggiorna lo stato visivo della cella
        this.updateCellValidationState(cell, row, field);
        
        // Se è stato modificato comune, provincia o regione, aggiorna anche lo stato visivo degli altri due campi correlati
        if (field === 'comune' || field === 'provincia' || field === 'regione') {
            setTimeout(() => {
                const comuneCell = this.template.querySelector(`td[data-field="comune"][data-row-index="${rowIndex}"]`);
                const provinciaCell = this.template.querySelector(`td[data-field="provincia"][data-row-index="${rowIndex}"]`);
                const regioneCell = this.template.querySelector(`td[data-field="regione"][data-row-index="${rowIndex}"]`);
                
                if (comuneCell) {
                    this.updateCellValidationState(comuneCell, row, 'comune');
                }
                if (provinciaCell) {
                    this.updateCellValidationState(provinciaCell, row, 'provincia');
                }
                if (regioneCell) {
                    this.updateCellValidationState(regioneCell, row, 'regione');
                }
            }, 50);
        }
        
        // Aggiorna il contenuto della cella nel DOM se il valore è stato sostituito
        const targetElement = field === 'invoiceNumber' && cell.querySelector('.invoice-number-value')
            ? cell.querySelector('.invoice-number-value')
            : cell;
        if (row[field] !== value && targetElement.textContent !== row[field]) {
            targetElement.textContent = row[field] || '';
        }

        // Rimuovi lo stato di modifica
        if (row.isEditing) {
            row.isEditing[field] = false;
        }

        this.rows = updatedRows;
        
        // Aggiorna le celle corrette nel DOM dopo un breve delay
        // Escludi comune, provincia e regione dalla correzione automatica
        if (field !== 'invoiceDate' && field !== 'competenceDate' && field !== 'dataVisita' &&
            field !== 'isFree' && field !== 'noInvoiceAvailable' &&
            field !== 'numeroVisite' && field !== 'totaleMinuti' && field !== 'amount' &&
            field !== 'comune' && field !== 'provincia' && field !== 'regione') {
            setTimeout(() => {
                updatedRows.forEach((otherRow, otherIndex) => {
                    if (otherIndex !== rowIndex) {
                        const otherCell = this.template.querySelector(
                            `td[data-field="${field}"][data-row-index="${otherIndex}"]`
                        );
                        if (otherCell) {
                            const otherCellElement = field === 'invoiceNumber' && otherCell.querySelector('.invoice-number-value')
                                ? otherCell.querySelector('.invoice-number-value')
                                : otherCell;
                            const currentDisplayValue = otherCellElement.textContent.trim();
                            const correctValue = otherRow[field] || '';
                            
                            if (currentDisplayValue.toLowerCase() === value.trim().toLowerCase() && 
                                currentDisplayValue !== correctValue) {
                                otherCellElement.textContent = correctValue;
                                this.updateCellValidationState(otherCell, otherRow, field);
                            }
                        }
                    }
                });
            }, 100);
        }
        
        // Verifica unicità numeri fattura se sono stati modificati campi rilevanti
        if (field === 'invoiceNumber' || field === 'invoiceDate' || field === 'medicalCenter') {
            this.setCellValidating(rowIndex, field, true);
            setTimeout(async () => {
                try {
                    await this.checkInvoiceNumbersUniqueness();
                } finally {
                    this.setCellValidating(rowIndex, field, false);
                }
            }, 50);
        }
        
        // Formatta le date dopo la modifica
        if (field === 'invoiceDate' || field === 'competenceDate' || field === 'dataVisita') {
            setTimeout(() => {
                this.formatDatesInTable();
            }, 0);
        }
        
        // Reset del flag dopo un breve delay
        setTimeout(() => {
            this.isConfirmingValue = false;
        }, 100);
    }

    /**
     * Gestisce il click sul pulsante di conferma
     */
    handleConfirmButtonClick(event) {
        event.stopPropagation();
        event.preventDefault();
        
        const rowIndex = parseInt(event.currentTarget.dataset.rowIndex, 10);
        const field = event.currentTarget.dataset.field;
        
        // Per i campi che supportano la conferma di nuovi valori, usa confirmNewComune
        // Per gli altri campi, usa confirmCellValue
        if (['comune', 'medicalCenter', 'noProfit', 'noProfitCategory', 'tipoVisita'].includes(field)) {
            // Se il dropdown è aperto per questo campo, usa confirmNewComune
            if (this.dropdownOpen && 
                this.dropdownOpen.field === field && 
                this.dropdownOpen.rowIndex === rowIndex) {
                // Crea un evento fittizio per confirmNewComune
                const fakeEvent = {
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    type: 'click'
                };
                this.confirmNewComune(fakeEvent);
            } else {
                // Se il dropdown non è aperto, apri il dropdown e poi conferma
                // Oppure usa confirmCellValue come fallback
                this.confirmCellValue(rowIndex, field);
            }
        } else {
            this.confirmCellValue(rowIndex, field);
        }
    }

    async handleCellBlur(event) {
        // Se stiamo confermando un valore, ignora il blur event
        if (this.isConfirmingValue) {
            return;
        }
        
        let cell = event.currentTarget;
        // Se l'evento viene dallo span interno (invoice-number-value), risali alla cella td
        if (cell.classList && cell.classList.contains('invoice-number-value')) {
            cell = cell.closest('td[data-field]');
        }
        
        // Rimuovi classe per il bordo blu
        cell.classList.remove('cell-focused');
        
        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        // Per invoiceNumber, prendi il valore dallo span interno, altrimenti dalla cella
        const textElement = field === 'invoiceNumber' && cell.querySelector('.invoice-number-value') 
            ? cell.querySelector('.invoice-number-value') 
            : cell;
        const value = textElement.textContent.trim();

        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            const updatedRows = [...this.rows];
            const row = updatedRows[rowIndex];

            // Gestione dei diversi tipi di campo
            if (field === 'invoiceDate' || field === 'competenceDate' || field === 'dataVisita') {
                // Validazione data
                const dateValue = this.parseDate(value);
                if (dateValue) {
                    // Salva il valore in formato YYYY-MM-DD per Salesforce
                    row[field] = dateValue;
                    // Formatta per la visualizzazione
                    const formattedDate = this.formatDateForDisplay(dateValue);
                    cell.textContent = formattedDate;
                } else {
                    row[field] = value;
                }
            } else if (field === 'isFree' || field === 'noInvoiceAvailable') {
                // I checkbox sono gestiti separatamente
                return;
            } else if (field === 'numeroVisite' || field === 'totaleMinuti') {
                // Validazione numeri interi
                const numValue = this.parseInteger(value);
                row[field] = numValue !== null ? numValue : value;
            } else if (field === 'amount') {
                // Validazione currency (rimuove simbolo €)
                const currencyValue = this.parseCurrency(value);
                row[field] = currencyValue !== null ? currencyValue : value;
            } else {
                // Sostituisci con il valore esatto dal dataset se disponibile
                const exactValue = this.getExactValueFromDataset(field, value);
                // Usa il valore iniziale salvato durante il focus, altrimenti usa il valore corrente della riga
                const initialValue = cell.dataset.initialValue !== undefined ? cell.dataset.initialValue : (row[field] || '');
                const oldValueInRow = row[field]; // Valore attuale nel modello dati della riga
                const oldValueHadError = row.validationErrors && row.validationErrors[field] === true;
                row[field] = exactValue;
                
                // Per il campo partner, imposta anche partnerId se trovato
                if (field === 'partner' && exactValue) {
                    const partner = this.partners.find(
                        p => p.Name && p.Name.toLowerCase() === exactValue.toLowerCase()
                    );
                    if (partner && partner.Id) {
                        row.partnerId = partner.Id;
                        console.log('[handleCellChange] Partner trovato durante modifica manuale:', partner.Name, 'ID:', partner.Id);
                    } else {
                        // Se non trovato con exactValue, prova con il valore originale
                        const partnerOriginal = this.partners.find(
                            p => p.Name && p.Name.toLowerCase() === value.trim().toLowerCase()
                        );
                        if (partnerOriginal && partnerOriginal.Id) {
                            row.partnerId = partnerOriginal.Id;
                            console.log('[handleCellChange] Partner trovato durante modifica manuale (con valore originale):', partnerOriginal.Name, 'ID:', partnerOriginal.Id);
                        } else {
                            row.partnerId = null;
                            console.log('[handleCellChange] Partner NON trovato durante modifica manuale per valore:', exactValue);
                        }
                    }
                }
                
                // Per comune, provincia e regione, NON fare correzione automatica delle altre celle
                if (field === 'comune' || field === 'provincia' || field === 'regione') {
                    // Non fare nulla, solo aggiornare questa cella
                } else {
                    // Verifica se il valore iniziale era errato (non nel dataset)
                    const wasInitialValueIncorrect = initialValue && !this.isValueInDataset(field, initialValue);
                    // Verifica se il nuovo valore è corretto (è nel dataset)
                    const isNewValueValid = this.isValueInDataset(field, exactValue);
                    
                    // Per numero fattura, traccia la modifica per correggere dopo la validazione
                    // La correzione automatica avverrà dopo checkInvoiceNumbersUniqueness
                    if (field === 'invoiceNumber' && initialValue && initialValue.trim().toLowerCase() !== value.trim().toLowerCase()) {
                        // Salva le informazioni per la correzione automatica dopo la validazione
                        this.pendingInvoiceNumberCorrection = {
                            oldValue: initialValue.trim().toLowerCase(),
                            newValue: exactValue,
                            rowIndex: rowIndex,
                            invoiceDate: row.invoiceDate,
                            medicalCenter: row.medicalCenter || ''
                        };
                    } else if (wasInitialValueIncorrect && isNewValueValid && exactValue !== initialValue && 
                        this.hasValidation(field)) {
                        // Per tutti gli altri campi validati, correggi tutte le celle della stessa colonna
                        // Usa initialValue (valore iniziale salvato durante il focus) per cercare le celle da correggere
                        const valueToFind = initialValue.trim().toLowerCase();
                        updatedRows.forEach((otherRow, otherIndex) => {
                            if (otherIndex !== rowIndex && otherRow[field]) {
                                const otherValue = String(otherRow[field]).trim().toLowerCase();
                                // Correggi solo se il valore è errato (non nel dataset) e corrisponde al valore iniziale
                                const otherValueHasError = otherRow.validationErrors && otherRow.validationErrors[field] === true;
                                if (otherValue === valueToFind && otherValueHasError) {
                                    // Correggi il valore
                                    otherRow[field] = exactValue;
                                    // Aggiorna anche la validazione
                                    this.validateField(otherRow, field, exactValue);
                                }
                            }
                        });
                    }
                }
                
                // Pulisci il valore iniziale dopo l'uso
                delete cell.dataset.initialValue;
            }

            // Imposta lo spinner di validazione per questa cella
            if (this.hasValidation(field)) {
                this.setCellValidating(rowIndex, field, true);
            }
            
            // Validazione campi specifici
            this.validateField(row, field, row[field]);
            
            // Se è stato modificato comune, provincia o regione, valida anche gli altri due campi correlati
            if (field === 'comune') {
                if (row.provincia) {
                    this.validateField(row, 'provincia', row.provincia);
                }
                if (row.regione) {
                    this.validateField(row, 'regione', row.regione);
                }
            } else if (field === 'provincia') {
                if (row.comune) {
                    this.validateField(row, 'comune', row.comune);
                }
                if (row.regione) {
                    this.validateField(row, 'regione', row.regione);
                }
            } else if (field === 'regione') {
                if (row.comune) {
                    this.validateField(row, 'comune', row.comune);
                }
                if (row.provincia) {
                    this.validateField(row, 'provincia', row.provincia);
                }
            }
            
            // Rimuovi lo spinner di validazione per questa cella (validazione sincrona completata)
            if (this.hasValidation(field)) {
                this.setCellValidating(rowIndex, field, false);
            }
            
            // Aggiorna lo stato visivo della cella
            this.updateCellValidationState(cell, row, field);
            
            // Se è stato modificato comune, provincia o regione, aggiorna anche lo stato visivo degli altri due campi correlati
            if (field === 'comune' || field === 'provincia' || field === 'regione') {
                setTimeout(() => {
                    const comuneCell = this.template.querySelector(`td[data-field="comune"][data-row-index="${rowIndex}"]`);
                    const provinciaCell = this.template.querySelector(`td[data-field="provincia"][data-row-index="${rowIndex}"]`);
                    const regioneCell = this.template.querySelector(`td[data-field="regione"][data-row-index="${rowIndex}"]`);
                    
                    if (comuneCell) {
                        this.updateCellValidationState(comuneCell, row, 'comune');
                    }
                    if (provinciaCell) {
                        this.updateCellValidationState(provinciaCell, row, 'provincia');
                    }
                    if (regioneCell) {
                        this.updateCellValidationState(regioneCell, row, 'regione');
                    }
                }, 50);
            }
            
            // Aggiorna il contenuto della cella nel DOM se il valore è stato sostituito
            const targetElement = field === 'invoiceNumber' && cell.querySelector('.invoice-number-value')
                ? cell.querySelector('.invoice-number-value')
                : cell;
            if (row[field] !== value && targetElement.textContent !== row[field]) {
                targetElement.textContent = row[field] || '';
            }

            this.rows = updatedRows;
            
            // Aggiorna le celle corrette nel DOM dopo un breve delay
            // Escludi comune, provincia e regione dalla correzione automatica
            if (field !== 'invoiceDate' && field !== 'competenceDate' && field !== 'dataVisita' &&
                field !== 'isFree' && field !== 'noInvoiceAvailable' &&
                field !== 'numeroVisite' && field !== 'totaleMinuti' && field !== 'amount' &&
                field !== 'comune' && field !== 'provincia' && field !== 'regione') {
                setTimeout(() => {
                    updatedRows.forEach((otherRow, otherIndex) => {
                        if (otherIndex !== rowIndex) {
                            const otherCell = this.template.querySelector(
                                `td[data-field="${field}"][data-row-index="${otherIndex}"]`
                            );
                            if (otherCell) {
                                const otherCellElement = field === 'invoiceNumber' && otherCell.querySelector('.invoice-number-value')
                                    ? otherCell.querySelector('.invoice-number-value')
                                    : otherCell;
                                const currentDisplayValue = otherCellElement.textContent.trim();
                                const correctValue = otherRow[field] || '';
                                
                                // Se il valore visualizzato è diverso dal valore corretto, aggiornalo
                                if (currentDisplayValue.toLowerCase() === value.trim().toLowerCase() && 
                                    currentDisplayValue !== correctValue) {
                                    otherCellElement.textContent = correctValue;
                                    this.updateCellValidationState(otherCell, otherRow, field);
                                }
                            }
                        }
                    });
                }, 100);
            }
            
            // Verifica unicità numeri fattura se sono stati modificati campi rilevanti
            // Usa setTimeout per assicurarsi che il DOM sia aggiornato prima del controllo
            if (field === 'invoiceNumber' || field === 'invoiceDate' || field === 'medicalCenter') {
                // Imposta lo spinner per la validazione asincrona
                this.setCellValidating(rowIndex, field, true);
                setTimeout(async () => {
                    try {
                        await this.checkInvoiceNumbersUniqueness();
                    } finally {
                        // Rimuovi lo spinner quando la validazione asincrona è completata
                        this.setCellValidating(rowIndex, field, false);
                    }
                }, 50);
            }
            
            // Formatta le date dopo la modifica
            if (field === 'invoiceDate' || field === 'competenceDate' || field === 'dataVisita') {
                setTimeout(() => {
                    this.formatDatesInTable();
                }, 0);
            }
            
            // Rimuovi lo stato di modifica quando si esce dalla cella
            if (row.isEditing) {
                row.isEditing[field] = false;
                // Forza il rerender per nascondere il pulsante di conferma
                this.rows = [...updatedRows];
            }
        }
    }

    handlePaste(event) {
        event.preventDefault();
        let cell = event.currentTarget;
        // Se l'evento viene dallo span interno (invoice-number-value), risali alla cella td
        if (cell.classList && cell.classList.contains('invoice-number-value')) {
            cell = cell.closest('td[data-field]');
        }
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        const colIndex = this.getColumnIndex(cell.dataset.field);
        
        const pasteData = (event.clipboardData || window.clipboardData).getData('text');
        const lines = pasteData.split('\n').map(line => line.replace(/\r/g, '')).filter(line => line.trim() || line.includes('\t'));
        
        if (lines.length > 1 || (lines.length === 1 && lines[0].includes('\t'))) {
            // Incolla multiplo: gestisci come tabella
            this.pasteMultipleRows(lines, rowIndex, colIndex);
        } else {
            // Incolla singolo: solo nella cella corrente
            const values = pasteData.split('\t');
            if (values.length > 0) {
                this.updateCellValue(rowIndex, colIndex, values[0].trim());
            }
        }
    }


    /**
     * Incolla i valori dalla clipboard a partire dalla prima riga vuota
     */
    async pasteFromClipboard() {
        console.log('=== INIZIO pasteFromClipboard ===');
        console.log('navigator.clipboard disponibile:', !!navigator.clipboard);
        console.log('navigator.clipboard.readText disponibile:', typeof navigator.clipboard?.readText === 'function');
        console.log('Numero righe attuali:', this.rows.length);
        console.log('window.location.protocol:', window.location.protocol);
        console.log('window.location.hostname:', window.location.hostname);
        
        // Attiva lo spinner all'inizio
        this.isValidating = true;
        
        try {
            // Verifica che l'API clipboard sia disponibile
            if (!navigator.clipboard) {
                console.error('ERRORE: navigator.clipboard non disponibile');
                throw new Error('API clipboard non disponibile. Il browser potrebbe non supportarla o la pagina non è servita via HTTPS.');
            }
            
            if (typeof navigator.clipboard.readText !== 'function') {
                console.error('ERRORE: navigator.clipboard.readText non è una funzione');
                throw new Error('Metodo readText non disponibile sull\'oggetto clipboard.');
            }
            
            console.log('Tentativo di lettura dalla clipboard...');
            
            // Leggi il contenuto dalla clipboard
            const clipboardText = await navigator.clipboard.readText();
            
            console.log('Contenuto clipboard letto con successo');
            console.log('Lunghezza contenuto:', clipboardText ? clipboardText.length : 0);
            console.log('Primi 200 caratteri del contenuto:', clipboardText ? clipboardText.substring(0, 200) : 'null/undefined');
            console.log('Tipo contenuto:', typeof clipboardText);
            
            if (!clipboardText || !clipboardText.trim()) {
                console.warn('Clipboard vuota o contiene solo spazi');
                this.showError('Nessun contenuto trovato nella clipboard.');
                this.isValidating = false;
                return;
            }

            // Trova la prima riga vuota
            let firstEmptyRowIndex = -1;
            for (let i = 0; i < this.rows.length; i++) {
                if (this.isRowEmpty(this.rows[i])) {
                    firstEmptyRowIndex = i;
                    break;
                }
            }
            
            console.log('Prima riga vuota trovata all\'indice:', firstEmptyRowIndex);

            // Se non ci sono righe vuote, aggiungi una nuova riga
            if (firstEmptyRowIndex === -1) {
                console.log('Nessuna riga vuota trovata, aggiungo una nuova riga');
                this.addRow();
                firstEmptyRowIndex = this.rows.length - 1;
                console.log('Nuova riga aggiunta all\'indice:', firstEmptyRowIndex);
            }

            // Processa i dati dalla clipboard
            console.log('Elaborazione delle righe dalla clipboard...');
            const rawLines = clipboardText.split('\n');
            console.log('Numero righe dopo split (\\n):', rawLines.length);
            console.log('Prime 3 righe raw:', rawLines.slice(0, 3));
            
            const lines = rawLines
                .map(line => line.replace(/\r/g, ''))
                .filter(line => line.trim() || line.includes('\t'));
            
            console.log('Numero righe dopo filtro:', lines.length);
            console.log('Prime 3 righe dopo filtro:', lines.slice(0, 3));

            if (lines.length === 0) {
                console.warn('Nessuna riga valida trovata dopo il processing');
                console.warn('Contenuto originale completo:', clipboardText);
                this.showError('Nessun dato valido trovato nella clipboard.');
                this.isValidating = false;
                return;
            }

            console.log('Chiamata a pasteMultipleRows con', lines.length, 'righe, startRowIndex:', firstEmptyRowIndex, 'startColIndex: 0');
            
            // Incolla i dati a partire dalla prima riga vuota, colonna 0
            await this.pasteMultipleRows(lines, firstEmptyRowIndex, 0);

            console.log('pasteMultipleRows completato con successo');

            // Mostra messaggio di successo
            this.showSuccess(`Incollati ${lines.length} riga/e a partire dalla riga ${firstEmptyRowIndex + 1}.`);
            
            console.log('=== FINE pasteFromClipboard (successo) ===');

        } catch (error) {
            console.error('=== ERRORE in pasteFromClipboard ===');
            console.error('Tipo errore:', error?.constructor?.name || typeof error);
            console.error('Messaggio errore:', error?.message);
            console.error('Stack errore:', error?.stack);
            console.error('Errore completo:', error);
            console.error('Nome errore:', error?.name);
            console.error('Codice errore (se presente):', error?.code);
            console.error('toString():', error?.toString());
            
            // Verifica se è un errore di permessi
            if (error?.name === 'NotAllowedError' || error?.code === 403) {
                console.error('ERRORE DI PERMESSI: Il browser ha negato l\'accesso alla clipboard');
                this.showError('Permesso negato per accedere alla clipboard. Assicurati che la pagina sia servita via HTTPS e che tu abbia dato il permesso al browser.');
            } else if (error?.name === 'NotFoundError') {
                console.error('ERRORE: Nessun dato nella clipboard');
                this.showError('Nessun dato trovato nella clipboard. Assicurati di aver copiato i dati da Excel.');
            } else if (error?.name === 'SecurityError') {
                console.error('ERRORE DI SICUREZZA: La pagina non è servita via HTTPS o il contesto non è sicuro');
                this.showError('Errore di sicurezza: la pagina deve essere servita via HTTPS per accedere alla clipboard.');
            } else {
                console.error('ERRORE GENERICO durante la lettura della clipboard');
                this.showError(`Errore durante la lettura della clipboard: ${error?.message || 'Errore sconosciuto'}. Assicurati di aver copiato i dati da Excel.`);
            }
            console.error('=== FINE ERRORE ===');
        } finally {
            // Disattiva sempre lo spinner alla fine, sia in caso di successo che di errore
            this.isValidating = false;
        }
    }

    async pasteMultipleRows(lines, startRowIndex, startColIndex) {
        const fieldOrder = [
            'partner',
            'invoiceDate',
            'competenceDate', 
            'invoiceNumber',
            'medicalCenter',
            'noProfit',
            'noProfitCategory',
            'isFree',
            'noInvoiceAvailable',
            'tipoVisita',
            'beneficiaryType',
            'numeroVisite',
            'totaleMinuti',
            'amount',
            'dataVisita',
            'comune',
            'provincia',
            'regione'
        ];

        // Assicurati di avere abbastanza righe
        const neededRows = startRowIndex + lines.length;
        while (this.rows.length < neededRows) {
            this.addRow();
        }
        
        const updatedRows = [...this.rows];
        
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const rowIndex = startRowIndex + lineIndex;
            if (rowIndex >= updatedRows.length) {
                // Non dovrebbe mai accadere, ma per sicurezza
                this.addRow();
                updatedRows.push({...this.rows[this.rows.length - 1]});
            }
            
            const values = line.split('\t');
            values.forEach((value, colIndex) => {
                const fieldIndex = startColIndex + colIndex;
                if (fieldIndex >= 0 && fieldIndex < fieldOrder.length) {
                    const field = fieldOrder[fieldIndex];
                    const trimmedValue = value.trim();
                    
                    if (field === 'isFree' || field === 'noInvoiceAvailable') {
                        updatedRows[rowIndex][field] = this.parseBoolean(trimmedValue);
                    } else if (field === 'invoiceDate' || field === 'competenceDate' || field === 'dataVisita') {
                        // Prova sempre a parsare la data, anche se è già in formato visualizzato
                        let parsedDate = this.parseDate(trimmedValue);
                        if (!parsedDate && trimmedValue) {
                            // Se parseDate fallisce, prova a parsare dal formato visualizzato (es. "23 Dic 2024")
                            // o da altri formati comuni
                            parsedDate = this.parseDateFromDisplayFormat(trimmedValue);
                        }
                        if (parsedDate) {
                            updatedRows[rowIndex][field] = parsedDate;
                        } else {
                            updatedRows[rowIndex][field] = trimmedValue;
                        }
                    } else if (field === 'numeroVisite' || field === 'totaleMinuti') {
                        const numValue = this.parseInteger(trimmedValue);
                        updatedRows[rowIndex][field] = numValue !== null ? numValue : trimmedValue;
                    } else if (field === 'amount') {
                        // Validazione currency (rimuove simbolo €)
                        const currencyValue = this.parseCurrency(trimmedValue);
                        updatedRows[rowIndex][field] = currencyValue !== null ? currencyValue : trimmedValue;
                    } else {
                        // Sostituisci con il valore esatto dal dataset se disponibile
                        const exactValue = this.getExactValueFromDataset(field, trimmedValue);
                        updatedRows[rowIndex][field] = exactValue;
                        
                        // Per il campo partner, imposta anche partnerId se trovato
                        if (field === 'partner' && exactValue) {
                            console.log('[pasteMultipleRows] Cercando partner per valore:', exactValue);
                            console.log('[pasteMultipleRows] Numero partner disponibili:', this.partners ? this.partners.length : 0);
                            if (this.partners && this.partners.length > 0) {
                                console.log('[pasteMultipleRows] Primi 5 partner disponibili:', this.partners.slice(0, 5).map(p => p.Name));
                                // Cerca partner che contiene "Sorgenia" per debug
                                const sorgeniaPartners = this.partners.filter(p => p.Name && p.Name.toLowerCase().includes('sorgenia'));
                                console.log('[pasteMultipleRows] Partner che contengono "Sorgenia":', sorgeniaPartners.map(p => ({ Name: p.Name, Id: p.Id })));
                            }
                            
                            // Cerca il partner nella lista usando il valore esatto trovato
                            const partner = this.partners.find(
                                p => p.Name && p.Name.toLowerCase() === exactValue.toLowerCase()
                            );
                            console.log('[pasteMultipleRows] Partner trovato con exactValue:', partner ? { Name: partner.Name, Id: partner.Id } : 'null');
                            
                            if (partner && partner.Id) {
                                updatedRows[rowIndex].partnerId = partner.Id;
                                console.log('[pasteMultipleRows] Partner trovato durante paste:', partner.Name, 'ID:', partner.Id);
                            } else {
                                // Se non trovato con exactValue, prova con trimmedValue originale
                                const partnerOriginal = this.partners.find(
                                    p => p.Name && p.Name.toLowerCase() === trimmedValue.toLowerCase()
                                );
                                console.log('[pasteMultipleRows] Partner trovato con trimmedValue:', partnerOriginal ? { Name: partnerOriginal.Name, Id: partnerOriginal.Id } : 'null');
                                
                                if (partnerOriginal && partnerOriginal.Id) {
                                    updatedRows[rowIndex].partnerId = partnerOriginal.Id;
                                    console.log('[pasteMultipleRows] Partner trovato durante paste (con valore originale):', partnerOriginal.Name, 'ID:', partnerOriginal.Id);
                                } else {
                                    updatedRows[rowIndex].partnerId = '';
                                    console.log('[pasteMultipleRows] Partner NON trovato durante paste per valore:', exactValue || trimmedValue);
                                    console.log('[pasteMultipleRows] Tentativo di match con tutti i partner disponibili:');
                                    if (this.partners) {
                                        this.partners.forEach(p => {
                                            if (p.Name) {
                                                const nameLower = p.Name.toLowerCase();
                                                const searchLower = (exactValue || trimmedValue || '').toLowerCase();
                                                if (nameLower.includes(searchLower) || searchLower.includes(nameLower)) {
                                                    console.log('[pasteMultipleRows] Match parziale trovato:', p.Name, 'vs', exactValue || trimmedValue);
                                                }
                                            }
                                        });
                                    }
                                }
                            }
                        }
                    }
                    
                    // Validazione campi specifici durante il paste
                    this.validateField(updatedRows[rowIndex], field, updatedRows[rowIndex][field]);
                }
            });
            
            // Dopo aver processato tutte le colonne della riga, popola automaticamente la categoria se necessario
            if (updatedRows[rowIndex].noProfit && updatedRows[rowIndex].noProfit.trim() !== '') {
                const enteValue = updatedRows[rowIndex].noProfit.trim();
                const matchingEnte = this.nonProfits && this.nonProfits.length > 0 
                    ? this.nonProfits.find(ente => 
                        ente.Name && ente.Name.toLowerCase() === enteValue.toLowerCase()
                    )
                    : null;
                
                if (matchingEnte) {
                    // Ente trovato: popola la categoria se presente
                    if (matchingEnte.Ente_Categoria__c) {
                        updatedRows[rowIndex].noProfitCategory = matchingEnte.Ente_Categoria__c;
                        // Valida anche la categoria appena popolata
                        this.validateField(updatedRows[rowIndex], 'noProfitCategory', matchingEnte.Ente_Categoria__c);
                    } else {
                        // Ente trovato ma senza categoria: segnala errore
                        updatedRows[rowIndex].noProfitCategory = '';
                        this.validateField(updatedRows[rowIndex], 'noProfitCategory', '');
                    }
                } else {
                    // Ente non trovato: segnala errore sulla categoria
                    if (!updatedRows[rowIndex].noProfitCategory) {
                        updatedRows[rowIndex].noProfitCategory = '';
                    }
                    this.validateField(updatedRows[rowIndex], 'noProfitCategory', updatedRows[rowIndex].noProfitCategory || '');
                }
            } else if (updatedRows[rowIndex].noProfitCategory && updatedRows[rowIndex].noProfitCategory.trim() !== '') {
                // Se c'è una categoria ma non c'è ente, valida comunque
                this.validateField(updatedRows[rowIndex], 'noProfitCategory', updatedRows[rowIndex].noProfitCategory);
            }
            
            // Se isFree o noInvoiceAvailable è true, genera il numero fattura se non presente
            if ((updatedRows[rowIndex].isFree || updatedRows[rowIndex].noInvoiceAvailable) && !updatedRows[rowIndex].invoiceNumber) {
                try {
                    const invoiceNumber = await this.generateInvoiceNumberForRow(updatedRows[rowIndex], rowIndex);
                    if (invoiceNumber) {
                        updatedRows[rowIndex].invoiceNumber = invoiceNumber;
                    }
                } catch (error) {
                    console.error('Errore nella generazione del numero fattura durante il paste:', error);
                }
            }
        }
        
        this.rows = updatedRows;
        
        // Aggiorna lo stato visivo delle celle dopo il paste e aggiorna i valori sostituiti
        // Usa un timeout più lungo per assicurarsi che il DOM sia completamente aggiornato
        await new Promise(resolve => setTimeout(resolve, 100));
        
        updatedRows.forEach((row, rowIdx) => {
            const rowElement = this.template.querySelector(`tr[data-row-index="${rowIdx}"]`);
            if (rowElement) {
                // Aggiorna campi normali
                ['tipoVisita', 'beneficiaryType', 'comune', 'provincia', 'regione', 'medicalCenter', 'noProfit', 'noProfitCategory', 'invoiceNumber'].forEach(field => {
                    const cell = rowElement.querySelector(`td[data-field="${field}"]`);
                    if (cell && row[field] !== undefined) {
                        // Per invoiceNumber, aggiorna lo span interno se presente
                        if (field === 'invoiceNumber') {
                            const invoiceValueSpan = cell.querySelector('.invoice-number-value');
                            if (invoiceValueSpan) {
                                if (invoiceValueSpan.textContent.trim() !== String(row[field] || '').trim()) {
                                    invoiceValueSpan.textContent = row[field] || '';
                                }
                            } else {
                                if (cell.textContent.trim() !== String(row[field] || '').trim()) {
                                    cell.textContent = row[field] || '';
                                }
                            }
                        } else {
                            // Aggiorna il contenuto della cella con il valore esatto
                            if (cell.textContent.trim() !== String(row[field] || '').trim()) {
                                cell.textContent = row[field] || '';
                            }
                        }
                        this.updateCellValidationState(cell, row, field);
                    }
                });
                
                // Formatta le date per la visualizzazione
                ['invoiceDate', 'competenceDate', 'dataVisita'].forEach(field => {
                    const cell = rowElement.querySelector(`td[data-field="${field}"]`);
                    if (cell) {
                        if (row[field]) {
                            // Sempre formatta la data, indipendentemente dal contenuto attuale
                            const formattedDate = this.formatDateForDisplay(row[field]);
                            if (formattedDate) {
                                cell.textContent = formattedDate;
                            } else {
                                // Se la formattazione fallisce, prova a parsare e formattare di nuovo
                                const parsedDate = this.parseDate(row[field]);
                                if (parsedDate) {
                                    const retryFormatted = this.formatDateForDisplay(parsedDate);
                                    if (retryFormatted) {
                                        cell.textContent = retryFormatted;
                                        // Aggiorna anche il valore nel modello dati
                                        row[field] = parsedDate;
                                    }
                                }
                            }
                        } else {
                            // Se il campo è vuoto, assicurati che la cella sia vuota
                            cell.textContent = '';
                        }
                    }
                });
            }
        });
        
        // Verifica unicità numeri fattura dopo il paste
        await this.checkInvoiceNumbersUniqueness();
        
        // Formatta nuovamente tutte le date per assicurarsi che siano corrette
        this.formatDatesInTable();
    }

    updateCellValue(rowIndex, colIndex, value) {
        const fieldOrder = [
            'invoiceDate',
            'competenceDate',
            'invoiceNumber', 
            'medicalCenter',
            'noProfit',
            'noProfitCategory',
            'isFree',
            'noInvoiceAvailable',
            'tipoVisita',
            'beneficiaryType',
            'numeroVisite',
            'totaleMinuti',
            'amount',
            'dataVisita',
            'comune',
            'provincia',
            'regione'
        ];
        
        if (colIndex >= 0 && colIndex < fieldOrder.length && rowIndex >= 0 && rowIndex < this.rows.length) {
            const field = fieldOrder[colIndex];
            const updatedRows = [...this.rows];
            
            if (field === 'isFree' || field === 'noInvoiceAvailable') {
                updatedRows[rowIndex][field] = this.parseBoolean(value);
            } else if (field === 'invoiceDate' || field === 'competenceDate' || field === 'dataVisita') {
                const parsedDate = this.parseDate(value);
                if (parsedDate) {
                    updatedRows[rowIndex][field] = parsedDate;
                } else {
                    updatedRows[rowIndex][field] = value;
                }
            } else if (field === 'numeroVisite' || field === 'totaleMinuti') {
                const numValue = this.parseInteger(value);
                updatedRows[rowIndex][field] = numValue !== null ? numValue : value;
            } else if (field === 'amount') {
                // Validazione currency (rimuove simbolo €)
                const currencyValue = this.parseCurrency(value);
                updatedRows[rowIndex][field] = currencyValue !== null ? currencyValue : value;
            } else {
                // Sostituisci con il valore esatto dal dataset se disponibile
                const exactValue = this.getExactValueFromDataset(field, value);
                updatedRows[rowIndex][field] = exactValue;
            }
            
            // Se è stato inserito un Ente No Profit, cerca automaticamente la categoria
            if (field === 'noProfit' && updatedRows[rowIndex][field]) {
                const matchingEnte = this.nonProfits.find(ente => 
                    ente.Name && ente.Name.toLowerCase() === updatedRows[rowIndex][field].toLowerCase()
                );
                if (matchingEnte && matchingEnte.Ente_Categoria__c) {
                    updatedRows[rowIndex].noProfitCategory = matchingEnte.Ente_Categoria__c;
                }
            }
            
            // Imposta lo spinner di validazione per questa cella
            if (this.hasValidation(field)) {
                this.setCellValidating(rowIndex, field, true);
            }
            
            // Validazione campi specifici
            this.validateField(updatedRows[rowIndex], field, updatedRows[rowIndex][field]);
            
            // Rimuovi lo spinner di validazione per questa cella (validazione sincrona completata)
            if (this.hasValidation(field)) {
                this.setCellValidating(rowIndex, field, false);
            }
            
            // Se è stato modificato noProfit, valida anche noProfitCategory
            if (field === 'noProfit') {
                if (this.hasValidation('noProfitCategory')) {
                    this.setCellValidating(rowIndex, 'noProfitCategory', true);
                }
                this.validateField(updatedRows[rowIndex], 'noProfitCategory', updatedRows[rowIndex].noProfitCategory || '');
                if (this.hasValidation('noProfitCategory')) {
                    this.setCellValidating(rowIndex, 'noProfitCategory', false);
                }
            }
            
            this.rows = updatedRows;
            
            // Aggiorna lo stato visivo della cella dopo l'aggiornamento
            setTimeout(() => {
                const cell = this.template.querySelector(
                    `td[data-field="${field}"][data-row-index="${rowIndex}"]`
                );
                if (cell) {
                    this.updateCellValidationState(cell, updatedRows[rowIndex], field);
                }
            }, 0);
            
            // Verifica unicità numeri fattura se sono stati modificati campi rilevanti
            if (field === 'invoiceNumber' || field === 'invoiceDate' || field === 'medicalCenter') {
                this.checkInvoiceNumbersUniqueness();
            }
            
            // Formatta le date dopo la modifica
            if (field === 'invoiceDate' || field === 'competenceDate' || field === 'dataVisita') {
                setTimeout(() => {
                    this.formatDatesInTable();
                }, 100);
            }
        }
    }

    getColumnIndex(field) {
        const fieldOrder = [
            'partner',
            'invoiceDate',
            'competenceDate',
            'invoiceNumber',
            'medicalCenter',
            'noProfit',
            'noProfitCategory',
            'isFree',
            'noInvoiceAvailable',
            'tipoVisita',
            'beneficiaryType',
            'numeroVisite',
            'totaleMinuti',
            'amount',
            'dataVisita',
            'comune',
            'provincia',
            'regione'
        ];
        return fieldOrder.indexOf(field);
    }

    /**
     * Metodo helper per generare il numero fattura per una riga
     */
    async generateInvoiceNumberForRow(row, rowIndex) {
        const isFree = row.isFree || false;
        const noInvoiceAvailable = row.noInvoiceAvailable || false;
        
        // Se entrambi i flag sono true, isFree ha priorità
        if (isFree || noInvoiceAvailable) {
            try {
                const invoiceNumber = await generateInvoiceNumber({
                    isFree: isFree,
                    noInvoiceAvailable: noInvoiceAvailable && !isFree, // Se isFree è true, ignora noInvoiceAvailable
                    invoiceDate: row.invoiceDate || '',
                    medicalCenter: row.medicalCenter || ''
                });
                return invoiceNumber;
            } catch (error) {
                console.error('Errore nella generazione del numero fattura:', error);
                this.showToast('Errore', 'Errore nella generazione del numero fattura: ' + (error.body?.message || error.message), 'error');
                return null;
            }
        }
        return null;
    }

    /**
     * Verifica l'unicità dei numeri fattura per tutte le righe
     */
    async checkInvoiceNumbersUniqueness() {
        try {
            // Prepara i dati per la verifica
            const invoiceData = this.rows.map((row, index) => ({
                invoiceNumber: row.invoiceNumber || '',
                invoiceDate: row.invoiceDate || '',
                medicalCenter: row.medicalCenter || ''
            }));
            
            const duplicatesMap = await checkInvoiceNumbersUniqueness({
                invoiceData: JSON.stringify(invoiceData),
                programId: this.selectedProgramId
            });
            
            // Aggiorna lo stato di validazione per ogni riga
            const updatedRows = [...this.rows];
            updatedRows.forEach((row, index) => {
                const isDuplicate = duplicatesMap[String(index)] === true;
                row.validationErrors.invoiceNumber = isDuplicate;
                // Aggiorna hasErrors dopo la validazione del numero fattura
                row.hasErrors = this.hasRowErrors(row);
            });
            
            // Se c'è una correzione automatica pendente per il numero fattura, applicala ora
            if (this.pendingInvoiceNumberCorrection) {
                const correction = this.pendingInvoiceNumberCorrection;
                
                // Verifica se il programma è "Tempo Sospeso" per applicare controlli più restrittivi
                const isTempoSospeso = this.selectedProgramName && 
                    this.selectedProgramName.toLowerCase().includes('tempo sospeso');
                
                // Raccogli tutte le celle che devono essere corrette
                const cellsToCorrect = [];
                
                // Ottieni la riga corretta per il nuovo valore
                const correctedRow = updatedRows[correction.rowIndex];
                const correctedValue = correctedRow.invoiceNumber;
                const correctedDate = correctedRow.invoiceDate;
                const correctedMedicalCenter = correctedRow.medicalCenter || '';
                
                // Cerca tutte le righe con lo stesso valore errato originale che hanno un errore di duplicazione
                // OPPURE con lo stesso valore errato che hanno ancora un errore (anche se diverso dall'oldValue)
                updatedRows.forEach((otherRow, otherIndex) => {
                    if (otherRow.invoiceNumber && otherIndex !== correction.rowIndex) {
                        const otherValue = String(otherRow.invoiceNumber).trim().toLowerCase();
                        const otherDate = otherRow.invoiceDate;
                        const otherMedicalCenter = otherRow.medicalCenter || '';
                        const otherValueHasError = otherRow.validationErrors && otherRow.validationErrors.invoiceNumber === true;
                        
                        // Per "Tempo Sospeso": correggi se stesso valore errato originale, stessa data E stesso centro medico E ha errore
                        // OPPURE se stesso valore errato corrente, stessa data E stesso centro medico E ha errore
                        // Per gli altri programmi: correggi se stesso valore errato originale e ha errore
                        // OPPURE se stesso valore errato corrente e ha errore
                        let shouldCorrect = false;
                        if (isTempoSospeso) {
                            const sameOldValue = otherValue === correction.oldValue;
                            const sameCurrentValue = otherValue === String(correctedValue).trim().toLowerCase();
                            const sameDate = otherDate === correction.invoiceDate;
                            const sameMedicalCenter = otherMedicalCenter.toLowerCase() === correction.medicalCenter.toLowerCase();
                            
                            shouldCorrect = otherValueHasError && 
                                ((sameOldValue && sameDate && sameMedicalCenter) || 
                                 (sameCurrentValue && otherDate === correctedDate && 
                                  otherMedicalCenter.toLowerCase() === correctedMedicalCenter.toLowerCase()));
                        } else {
                            const sameOldValue = otherValue === correction.oldValue;
                            const sameCurrentValue = otherValue === String(correctedValue).trim().toLowerCase();
                            
                            shouldCorrect = otherValueHasError && (sameOldValue || sameCurrentValue);
                        }
                        
                        if (shouldCorrect) {
                            cellsToCorrect.push({ row: otherRow, rowIndex: otherIndex });
                        }
                    }
                });
                
                // Attiva lo spinner per tutte le celle che verranno corrette
                cellsToCorrect.forEach(({ rowIndex }) => {
                    this.setCellValidating(rowIndex, 'invoiceNumber', true);
                });
                
                // Esegui la correzione per tutte le celle identificate
                cellsToCorrect.forEach(({ row, rowIndex }) => {
                    // Correggi il valore
                    row.invoiceNumber = correction.newValue;
                    // Aggiorna anche la validazione (sincrono) - rimuove l'errore immediatamente
                    this.validateField(row, 'invoiceNumber', correction.newValue);
                    // Forza la rimozione dell'errore di validazione
                    if (row.validationErrors) {
                        row.validationErrors.invoiceNumber = false;
                    }
                    row.hasErrors = this.hasRowErrors(row);
                });
                
                // Aggiorna anche la cella originale
                const originalRow = updatedRows[correction.rowIndex];
                if (originalRow.validationErrors) {
                    originalRow.validationErrors.invoiceNumber = false;
                }
                originalRow.hasErrors = this.hasRowErrors(originalRow);
                
                // Aggiorna l'array rows per forzare il rerender con i nuovi valori
                this.rows = [...updatedRows];
                
                // Aggiorna lo stato visivo delle celle (bordi rossi) durante lo spinner
                // Usa un delay maggiore per permettere al DOM di aggiornarsi completamente
                setTimeout(() => {
                    // Forza un rerender completo della tabella
                    this.rows = [...this.rows];
                    
                    // Aspetta che il DOM sia completamente aggiornato prima di aggiornare i bordi
                    setTimeout(() => {
                        // Aggiorna lo stato visivo di tutte le celle corrette
                        cellsToCorrect.forEach(({ row, rowIndex }) => {
                            const invoiceCell = this.template.querySelector(
                                `td[data-field="invoiceNumber"][data-row-index="${rowIndex}"]`
                            );
                            if (invoiceCell) {
                                // Rimuovi la classe invalid-cell
                                invoiceCell.classList.remove('invalid-cell');
                                this.updateCellValidationState(invoiceCell, row, 'invoiceNumber');
                            }
                        });
                        
                        // Aggiorna anche la cella originale che è stata corretta
                        const originalCell = this.template.querySelector(
                            `td[data-field="invoiceNumber"][data-row-index="${correction.rowIndex}"]`
                        );
                        if (originalCell) {
                            originalCell.classList.remove('invalid-cell');
                            this.updateCellValidationState(originalCell, originalRow, 'invoiceNumber');
                        }
                        
                        // Forza un altro rerender per assicurarsi che i bordi siano aggiornati
                        this.rows = [...this.rows];
                        
                        // Disattiva gli spinner dopo aver aggiornato i bordi
                        setTimeout(() => {
                            cellsToCorrect.forEach(({ rowIndex }) => {
                                this.setCellValidating(rowIndex, 'invoiceNumber', false);
                            });
                            // Disattiva anche lo spinner della cella originale se era attivo
                            this.setCellValidating(correction.rowIndex, 'invoiceNumber', false);
                        }, 100);
                    }, 200);
                }, 300);
                
                // Pulisci la correzione pendente
                this.pendingInvoiceNumberCorrection = null;
            } else {
                // Se non c'è una correzione pendente ma ci sono numeri fattura duplicati,
                // cerca se una riga ha un numero fattura che è stato appena modificato e non è più duplicato
                // e correggi tutte le altre righe con lo stesso numero fattura errato che hanno ancora un errore
                
                // Verifica se il programma è "Tempo Sospeso" per applicare controlli più restrittivi
                const isTempoSospeso = this.selectedProgramName && 
                    this.selectedProgramName.toLowerCase().includes('tempo sospeso');
                
                // Raccogli tutte le celle che devono essere corrette
                const cellsToCorrectElse = [];
                
                updatedRows.forEach((row, index) => {
                    const invoiceNumber = row.invoiceNumber ? String(row.invoiceNumber).trim().toLowerCase() : '';
                    const hasError = row.validationErrors && row.validationErrors.invoiceNumber === true;
                    
                    // Se questa riga non ha errori ma altre righe con lo stesso numero fattura hanno errori,
                    // significa che questa riga è stata corretta e le altre devono essere corrette anche loro
                    if (invoiceNumber && !hasError) {
                        // Cerca tutte le altre righe con lo stesso numero fattura che hanno ancora un errore
                        updatedRows.forEach((otherRow, otherIndex) => {
                            if (otherIndex !== index && otherRow.invoiceNumber) {
                                const otherValue = String(otherRow.invoiceNumber).trim().toLowerCase();
                                const otherValueHasError = otherRow.validationErrors && otherRow.validationErrors.invoiceNumber === true;
                                
                                // Per "Tempo Sospeso": correggi solo se stesso numero fattura, stessa data E stesso centro medico
                                // Per gli altri programmi: correggi solo se stesso numero fattura
                                let shouldCorrect = false;
                                if (isTempoSospeso) {
                                    shouldCorrect = otherValue === invoiceNumber && 
                                        otherRow.invoiceDate === row.invoiceDate && 
                                        (otherRow.medicalCenter || '').toLowerCase() === (row.medicalCenter || '').toLowerCase() &&
                                        otherValueHasError;
                                } else {
                                    shouldCorrect = otherValue === invoiceNumber && otherValueHasError;
                                }
                                
                                if (shouldCorrect) {
                                    cellsToCorrectElse.push({ row: otherRow, rowIndex: otherIndex, newValue: row.invoiceNumber });
                                }
                            }
                        });
                    }
                });
                
                // Attiva lo spinner per tutte le celle che verranno corrette
                cellsToCorrectElse.forEach(({ rowIndex }) => {
                    this.setCellValidating(rowIndex, 'invoiceNumber', true);
                });
                
                // Esegui la correzione per tutte le celle identificate
                cellsToCorrectElse.forEach(({ row, rowIndex, newValue }) => {
                    // Correggi il valore con quello della riga corretta
                    row.invoiceNumber = newValue;
                    // Aggiorna anche la validazione (sincrono) - rimuove l'errore immediatamente
                    this.validateField(row, 'invoiceNumber', newValue);
                    // Forza la rimozione dell'errore di validazione
                    if (row.validationErrors) {
                        row.validationErrors.invoiceNumber = false;
                    }
                    row.hasErrors = this.hasRowErrors(row);
                });
                
                // Aggiorna l'array rows per forzare il rerender con i nuovi valori
                this.rows = [...updatedRows];
                
                // Aggiorna lo stato visivo delle celle (bordi rossi) durante lo spinner
                // Usa un delay maggiore per permettere al DOM di aggiornarsi completamente
                setTimeout(() => {
                    // Forza un rerender completo della tabella
                    this.rows = [...this.rows];
                    
                    // Aspetta che il DOM sia completamente aggiornato prima di aggiornare i bordi
                    setTimeout(() => {
                        cellsToCorrectElse.forEach(({ row, rowIndex }) => {
                            const invoiceCell = this.template.querySelector(
                                `td[data-field="invoiceNumber"][data-row-index="${rowIndex}"]`
                            );
                            if (invoiceCell) {
                                // Rimuovi la classe invalid-cell
                                invoiceCell.classList.remove('invalid-cell');
                                this.updateCellValidationState(invoiceCell, row, 'invoiceNumber');
                            }
                        });
                        
                        // Forza un altro rerender per assicurarsi che i bordi siano aggiornati
                        this.rows = [...this.rows];
                        
                        // Disattiva gli spinner dopo aver aggiornato i bordi
                        setTimeout(() => {
                            cellsToCorrectElse.forEach(({ rowIndex }) => {
                                this.setCellValidating(rowIndex, 'invoiceNumber', false);
                            });
                        }, 100);
                    }, 200);
                }, 300);
            }
            
            this.rows = updatedRows;
            
            // Aggiorna lo stato visivo delle celle
            // Usa un delay maggiore per assicurarsi che il DOM sia completamente aggiornato
            setTimeout(() => {
                this.rows.forEach((row, rowIdx) => {
                    const invoiceCell = this.template.querySelector(
                        `td[data-field="invoiceNumber"][data-row-index="${rowIdx}"]`
                    );
                    if (invoiceCell) {
                        this.updateCellValidationState(invoiceCell, row, 'invoiceNumber');
                    }
                });
            }, 100);
            
        } catch (error) {
            console.error('Errore nella verifica unicità numeri fattura:', error);
        }
    }

    async toggleCheckbox(event) {
        const cell = event.currentTarget;
        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);
        
        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            const updatedRows = [...this.rows];
            const row = updatedRows[rowIndex];
            const prevIsFree = !!row.isFree;
            const prevNoInvoiceAvailable = !!row.noInvoiceAvailable;

            // Mutua esclusione:
            // - se attivo isFree -> disattivo noInvoiceAvailable
            // - se attivo noInvoiceAvailable -> disattivo isFree
            let nextIsFree = prevIsFree;
            let nextNoInvoiceAvailable = prevNoInvoiceAvailable;

            if (field === 'isFree') {
                nextIsFree = !prevIsFree;
                if (nextIsFree) {
                    nextNoInvoiceAvailable = false;
                    // Quando si attiva Prestazione Gratuita, salva il valore precedente del partner (se non già salvato)
                    // e imposta automaticamente il partner a "Prestazioni Gratuite"
                    if (!row.previousPartner && row.partner) {
                        updatedRows[rowIndex].previousPartner = row.partner;
                        updatedRows[rowIndex].previousPartnerId = row.partnerId || '';
                    }
                    try {
                        const freeAccount = await getFreeAccount();
                        if (freeAccount && freeAccount.Id && freeAccount.Name) {
                            updatedRows[rowIndex].partner = freeAccount.Name;
                            updatedRows[rowIndex].partnerId = freeAccount.Id;
                            // Aggiorna anche il DOM della cella partner
                            setTimeout(() => {
                                const partnerCell = this.template.querySelector(
                                    `td[data-field="partner"][data-row-index="${rowIndex}"]`
                                );
                                if (partnerCell) {
                                    partnerCell.textContent = freeAccount.Name;
                                    // Aggiorna lo stato di validazione
                                    this.validateField(updatedRows[rowIndex], 'partner', freeAccount.Name);
                                }
                            }, 0);
                        }
                    } catch (error) {
                        console.error('Errore nel recupero del Free Account:', error);
                    }
                } else {
                    // Quando si disattiva Prestazione Gratuita, ripristina il valore precedente del partner
                    if (row.previousPartner) {
                        updatedRows[rowIndex].partner = row.previousPartner;
                        updatedRows[rowIndex].partnerId = row.previousPartnerId || '';
                        updatedRows[rowIndex].previousPartner = '';
                        updatedRows[rowIndex].previousPartnerId = '';
                        // Aggiorna anche il DOM della cella partner
                        setTimeout(() => {
                            const partnerCell = this.template.querySelector(
                                `td[data-field="partner"][data-row-index="${rowIndex}"]`
                            );
                            if (partnerCell) {
                                partnerCell.textContent = updatedRows[rowIndex].partner || '';
                                // Aggiorna lo stato di validazione
                                this.validateField(updatedRows[rowIndex], 'partner', updatedRows[rowIndex].partner);
                            }
                        }, 0);
                    } else {
                        // Se non c'era un valore precedente, svuota la cella partner
                        updatedRows[rowIndex].partner = '';
                        updatedRows[rowIndex].partnerId = '';
                        setTimeout(() => {
                            const partnerCell = this.template.querySelector(
                                `td[data-field="partner"][data-row-index="${rowIndex}"]`
                            );
                            if (partnerCell) {
                                partnerCell.textContent = '';
                                // Aggiorna lo stato di validazione
                                this.validateField(updatedRows[rowIndex], 'partner', '');
                            }
                        }, 0);
                    }
                }
            } else if (field === 'noInvoiceAvailable') {
                nextNoInvoiceAvailable = !prevNoInvoiceAvailable;
                if (nextNoInvoiceAvailable) {
                    nextIsFree = false;
                }
            } else {
                // Non dovrebbe succedere (le checkbox sono solo queste due), ma per sicurezza:
                updatedRows[rowIndex][field] = !row[field];
                this.rows = updatedRows;
                return;
            }

            updatedRows[rowIndex].isFree = nextIsFree;
            updatedRows[rowIndex].noInvoiceAvailable = nextNoInvoiceAvailable;

            const hadAnyFlag = prevIsFree || prevNoInvoiceAvailable;
            const hasAnyFlag = nextIsFree || nextNoInvoiceAvailable;

            // Se sto passando da "nessun flag" a "un flag", salvo il numero fattura precedente (una sola volta)
            if (!hadAnyFlag && hasAnyFlag) {
                if (!row.previousInvoiceNumber && row.invoiceNumber &&
                    !row.invoiceNumber.startsWith('GRATUITA-') &&
                    !row.invoiceNumber.startsWith('NON DISPONIBILE-')) {
                    updatedRows[rowIndex].previousInvoiceNumber = row.invoiceNumber;
                }
            }

            // Se rimane almeno un flag attivo, rigenera sempre il numero fattura secondo il flag attivo
            if (hasAnyFlag) {
                const invoiceNumber = await this.generateInvoiceNumberForRow(updatedRows[rowIndex], rowIndex);
                if (invoiceNumber) {
                    updatedRows[rowIndex].invoiceNumber = invoiceNumber;
                }
            } else {
                // Nessun flag attivo: se il numero era generato dai flag, ripristina previousInvoiceNumber
                if (row.invoiceNumber &&
                    (row.invoiceNumber.startsWith('GRATUITA-') || row.invoiceNumber.startsWith('NON DISPONIBILE-'))) {
                    if (row.previousInvoiceNumber) {
                        updatedRows[rowIndex].invoiceNumber = row.previousInvoiceNumber;
                        updatedRows[rowIndex].previousInvoiceNumber = '';
                    } else {
                        updatedRows[rowIndex].invoiceNumber = '';
                    }
                }
            }

            // Aggiorna la visualizzazione della cella invoiceNumber
            setTimeout(() => {
                const invoiceCell = this.template.querySelector(
                    `td[data-field="invoiceNumber"][data-row-index="${rowIndex}"]`
                );
                if (invoiceCell) {
                    const invoiceValueSpan = invoiceCell.querySelector('.invoice-number-value');
                    const displayValue = updatedRows[rowIndex].invoiceNumber || '';
                    if (invoiceValueSpan) {
                        invoiceValueSpan.textContent = displayValue;
                    } else {
                        invoiceCell.textContent = displayValue;
                    }
                }
            }, 0);
            
            // Forza il rerender aggiornando l'array rows con una nuova istanza
            this.rows = updatedRows.map((r, idx) => ({ ...r }));
            
            // Verifica unicità dopo la modifica dei flag
            await this.checkInvoiceNumbersUniqueness();
        }
    }

    parseDate(dateString) {
        if (!dateString) return null;
        
        const trimmed = dateString.trim();
        
        // Prova formato italiano: DD/MM/YYYY o DD-MM-YYYY (anno a 4 cifre)
        const italianFormat4 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
        const match4 = trimmed.match(italianFormat4);
        
        if (match4) {
            const day = parseInt(match4[1], 10);
            const month = parseInt(match4[2], 10);
            const year = parseInt(match4[3], 10);
            
            // Validazione base
            if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
                // Formatta come YYYY-MM-DD per Salesforce
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
        }
        
        // Prova formato italiano: DD/MM/YY o DD-MM-YY (anno a 2 cifre)
        const italianFormat2 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/;
        const match2 = trimmed.match(italianFormat2);
        
        if (match2) {
            const day = parseInt(match2[1], 10);
            const month = parseInt(match2[2], 10);
            let year2 = parseInt(match2[3], 10);
            
            // Converti anno a 2 cifre in anno a 4 cifre
            // Assumiamo che anni < 50 siano 20xx e anni >= 50 siano 19xx
            let year;
            if (year2 < 50) {
                year = 2000 + year2;
            } else {
                year = 1900 + year2;
            }
            
            // Validazione base
            if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
                // Formatta come YYYY-MM-DD per Salesforce
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
        }
        
        // Prova formato ISO: YYYY-MM-DD
        const isoFormat = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
        const isoMatch = trimmed.match(isoFormat);
        if (isoMatch) {
            const year = parseInt(isoMatch[1], 10);
            const month = parseInt(isoMatch[2], 10);
            const day = parseInt(isoMatch[3], 10);
            
            // Validazione base
            if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
                return trimmed; // Già nel formato corretto
            }
        }
        
        return null;
    }

    /**
     * Formatta una data nel formato visualizzato "18 Nov 2025"
     * @param {string} dateString - Data in formato YYYY-MM-DD o DD/MM/YYYY o DD-MM-YYYY
     * @returns {string} Data formattata come "18 Nov 2025" o stringa originale se non valida
     */
    formatDateForDisplay(dateString) {
        if (!dateString) return '';
        
        const trimmed = dateString.trim();
        if (!trimmed) return '';
        
        // Mappa dei mesi in italiano (3 caratteri)
        const mesiItaliano = [
            'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
            'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
        ];
        
        let day, month, year;
        
        // Prova formato YYYY-MM-DD
        const isoFormat = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
        const isoMatch = trimmed.match(isoFormat);
        if (isoMatch) {
            year = parseInt(isoMatch[1], 10);
            month = parseInt(isoMatch[2], 10);
            day = parseInt(isoMatch[3], 10);
        } else {
            // Prova formato DD/MM/YYYY o DD-MM-YYYY (anno a 4 cifre)
            const italianFormat4 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
            const match4 = trimmed.match(italianFormat4);
            if (match4) {
                day = parseInt(match4[1], 10);
                month = parseInt(match4[2], 10);
                year = parseInt(match4[3], 10);
            } else {
                // Prova formato DD/MM/YY o DD-MM-YY (anno a 2 cifre)
                const italianFormat2 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/;
                const match2 = trimmed.match(italianFormat2);
                if (match2) {
                    day = parseInt(match2[1], 10);
                    month = parseInt(match2[2], 10);
                    let year2 = parseInt(match2[3], 10);
                    // Converti anno a 2 cifre in anno a 4 cifre
                    // Assumiamo che anni < 50 siano 20xx e anni >= 50 siano 19xx
                    if (year2 < 50) {
                        year = 2000 + year2;
                    } else {
                        year = 1900 + year2;
                    }
                } else {
                    // Se non corrisponde a nessun formato, prova a parsare come Date
                    const dateObj = new Date(trimmed);
                    if (!isNaN(dateObj.getTime())) {
                        day = dateObj.getDate();
                        month = dateObj.getMonth() + 1;
                        year = dateObj.getFullYear();
                    } else {
                        return trimmed; // Restituisci la stringa originale se non è una data valida
                    }
                }
            }
        }
        
        // Validazione
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
            const giornoFormattato = String(day).padStart(2, '0');
            const meseFormattato = mesiItaliano[month - 1];
            return `${giornoFormattato} ${meseFormattato} ${year}`;
        }
        
        return trimmed; // Restituisci la stringa originale se non valida
    }

    parseDateFromDisplayFormat(dateString) {
        if (!dateString) return null;
        
        const trimmed = dateString.trim();
        if (!trimmed) return null;
        
        // Mappa dei mesi in italiano (3 caratteri)
        const mesiItaliano = [
            'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
            'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'
        ];
        
        // Prova formato "DD Mon YYYY" o "DD Mon YY" (es. "18 Nov 2025" o "18 Nov 25")
        const displayFormatFull = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/;
        const matchFull = trimmed.match(displayFormatFull);
        
        if (matchFull) {
            const day = parseInt(matchFull[1], 10);
            const monthName = matchFull[2];
            const year = parseInt(matchFull[3], 10);
            
            // Trova l'indice del mese
            const monthIndex = mesiItaliano.findIndex(m => 
                m.toLowerCase() === monthName.toLowerCase()
            );
            
            if (monthIndex >= 0 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
                const month = monthIndex + 1;
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
        }
        
        // Prova formato "DD Mon YY" (anno a 2 cifre)
        const displayFormatShort = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2})$/;
        const matchShort = trimmed.match(displayFormatShort);
        
        if (matchShort) {
            const day = parseInt(matchShort[1], 10);
            const monthName = matchShort[2];
            let year = parseInt(matchShort[3], 10);
            
            // Inferisci il secolo per anno a 2 cifre
            year = (year < 70) ? (2000 + year) : (1900 + year);
            
            // Trova l'indice del mese
            const monthIndex = mesiItaliano.findIndex(m => 
                m.toLowerCase() === monthName.toLowerCase()
            );
            
            if (monthIndex >= 0 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
                const month = monthIndex + 1;
                return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
        }
        
        // Se non corrisponde al formato visualizzato, restituisci null
        return null;
    }

    parseBoolean(value) {
        if (!value) return false;
        const lowerValue = value.toLowerCase().trim();
        return lowerValue === 'true' || 
               lowerValue === '1' || 
               lowerValue === 'sì' || 
               lowerValue === 'si' ||
               lowerValue === 'yes' ||
               lowerValue === 'y' ||
               lowerValue === '✓' ||
               lowerValue === 'x';
    }

    parseInteger(value) {
        if (!value) return null;
        const trimmed = value.toString().trim();
        if (trimmed === '') return null;
        const num = parseInt(trimmed, 10);
        return isNaN(num) ? null : num;
    }

    parseDecimal(value) {
        if (!value) return null;
        const trimmed = value.toString().trim();
        if (trimmed === '') return null;
        // Supporta virgola o punto come separatore decimale
        const normalized = trimmed.replace(/,/g, '.');
        const num = parseFloat(normalized);
        return isNaN(num) ? null : num;
    }

    parseCurrency(value) {
        if (!value) return null;
        let trimmed = value.toString().trim();
        if (trimmed === '') return null;
        
        // Rimuovi il simbolo dell'euro e varianti (€, EUR, euro, Euro, EURO)
        // Gestisce: € 40, 40 €, 40€, €40, EUR 40, 40 EUR, ecc.
        trimmed = trimmed
            .replace(/€/g, '') // Rimuovi simbolo €
            .replace(/EUR/gi, '') // Rimuovi EUR (case-insensitive)
            .replace(/euro/gi, '') // Rimuovi "euro" (case-insensitive)
            .replace(/\s+/g, '') // Rimuovi tutti gli spazi
            .trim();
        
        if (trimmed === '') return null;
        
        // Supporta virgola o punto come separatore decimale
        const normalized = trimmed.replace(/,/g, '.');
        const num = parseFloat(normalized);
        return isNaN(num) ? null : num;
    }

    @wire(getTipoVisite)
    wiredTipoVisite({ error, data }) {
        if (data) {
            this.tipoVisite = data.map((tipo) => ({
                Name: tipo.Name,
                Id: tipo.Id
            }));
        } else if (error) {
            console.error('Errore nel caricamento dei tipi visita:', error);
        }
    }

    @wire(getBeneficiaryTypes)
    wiredBeneficiaryTypes({ error, data }) {
        if (data) {
            this.beneficiaryTypeOptions = data.map((type) => ({
                label: type,
                value: type
            }));
        } else if (error) {
            console.error('Errore nel caricamento dei Beneficiary Types:', error);
            this.beneficiaryTypeOptions = [];
        }
    }

    @wire(getComune)
    wiredComuni({ error, data }) {
        if (data) {
            this.comuni = data;
            // Crea set di province e regioni per validazione rapida
            const provinceSet = new Set();
            const regioniSet = new Set();
            const provinceList = [];
            const regioniList = [];
            
            data.forEach(comune => {
                if (comune.Provincia__c) {
                    const provincia = comune.Provincia__c.trim();
                    provinceSet.add(provincia.toLowerCase());
                    if (!provinceList.includes(provincia)) {
                        provinceList.push(provincia);
                    }
                }
                if (comune.Regione__c) {
                    const regione = comune.Regione__c.trim();
                    regioniSet.add(regione.toLowerCase());
                    if (!regioniList.includes(regione)) {
                        regioniList.push(regione);
                    }
                }
            });
            
            this.provinceSet = provinceSet;
            this.regioniSet = regioniSet;
            this.provinceList = provinceList.sort();
            this.regioniList = regioniList.sort();
        } else if (error) {
            console.error('Errore nel caricamento dei comuni:', error);
            this.comuni = [];
        }
    }

    @wire(getMedicalCenters)
    wiredMedicalCenters({ error, data }) {
        if (data) {
            this.medicalCenters = Array.isArray(data) ? data.filter(center => center && center.trim()) : [];
        } else if (error) {
            console.error('Errore nel caricamento dei centri medici:', error);
            this.medicalCenters = [];
        }
    }

    @wire(getSignalingNonProfits)
    wiredNonProfits({ error, data }) {
        if (data) {
            this.nonProfits = Array.isArray(data) ? data : [];
            // Genera le opzioni per le categorie
            const categories = new Set();
            this.nonProfits.forEach(ente => {
                if (ente.Ente_Categoria__c) {
                    categories.add(ente.Ente_Categoria__c);
                }
            });
            this.categoryOptions = Array.from(categories).map(category => ({
                label: category,
                value: category
            }));
        } else if (error) {
            console.error('Errore nel caricamento degli enti no profit:', error);
            this.nonProfits = [];
            this.categoryOptions = [];
        }
    }

    /**
     * Trova il valore esatto nel dataset dato un valore inserito (case-insensitive)
     * Restituisce il valore esatto se trovato, altrimenti il valore originale
     */
    getExactValueFromDataset(field, value) {
        if (!value || value.trim() === '') {
            return value;
        }

        const trimmedValue = value.toString().trim();
        const lowerValue = trimmedValue.toLowerCase();

        switch (field) {
            case 'partner':
                const partner = this.partners.find(
                    p => p.Name && p.Name.toLowerCase() === lowerValue
                );
                return partner ? partner.Name : trimmedValue;

            case 'tipoVisita':
                const tipoVisita = this.tipoVisite.find(
                    tipo => tipo.Name && tipo.Name.toLowerCase() === lowerValue
                );
                return tipoVisita ? tipoVisita.Name : trimmedValue;

            case 'beneficiaryType':
                const beneficiary = this.beneficiaryTypeOptions.find(
                    option => option.value && option.value.toLowerCase() === lowerValue
                );
                return beneficiary ? beneficiary.value : trimmedValue;

            case 'comune':
                const comune = this.comuni.find(
                    c => c.Nome_Comune__c && c.Nome_Comune__c.toLowerCase().trim() === lowerValue
                );
                return comune ? comune.Nome_Comune__c : trimmedValue;

            case 'provincia':
                // Cerca nella lista delle province per trovare il valore esatto
                const provinciaExact = this.provinceList.find(
                    p => p && p.toLowerCase() === lowerValue
                );
                return provinciaExact ? provinciaExact : trimmedValue;

            case 'regione':
                // Cerca nella lista delle regioni per trovare il valore esatto
                const regioneExact = this.regioniList.find(
                    r => r && r.toLowerCase() === lowerValue
                );
                return regioneExact ? regioneExact : trimmedValue;

            case 'medicalCenter':
                const medicalCenter = this.medicalCenters.find(
                    center => center.toLowerCase() === lowerValue
                );
                return medicalCenter ? medicalCenter : trimmedValue;

            case 'noProfit':
                const noProfit = this.nonProfits.find(
                    ente => ente.Name && ente.Name.toLowerCase() === lowerValue
                );
                return noProfit ? noProfit.Name : trimmedValue;

            case 'noProfitCategory':
                // Usa categoryOptions che contiene tutte le categorie disponibili
                const category = this.categoryOptions.find(
                    opt => opt.value && opt.value.toLowerCase() === lowerValue
                );
                return category ? category.value : trimmedValue;

            default:
                return trimmedValue;
        }
    }

    /**
     * Verifica se un campo ha validazione
     */
    hasValidation(field) {
        const fieldsWithValidation = [
            'partner',
            'tipoVisita',
            'beneficiaryType',
            'comune',
            'provincia',
            'regione',
            'medicalCenter',
            'noProfit',
            'noProfitCategory'
        ];
        return fieldsWithValidation.includes(field);
    }

    /**
     * Verifica se un valore è presente nel dataset per un campo specifico
     */
    isValueInDataset(field, value) {
        if (!value || value.trim() === '') {
            return false;
        }

        const trimmedValue = value.toString().trim();
        const lowerValue = trimmedValue.toLowerCase();

        switch (field) {
            case 'partner':
                return this.partners.some(
                    partner => partner.Name && partner.Name.toLowerCase() === lowerValue
                );

            case 'tipoVisita':
                return this.tipoVisite.some(
                    tipo => tipo.Name && tipo.Name.toLowerCase() === lowerValue
                );

            case 'beneficiaryType':
                return this.beneficiaryTypeOptions.some(
                    option => option.value && option.value.toLowerCase() === lowerValue
                );

            case 'comune':
                return this.comuni.some(
                    c => c.Nome_Comune__c && c.Nome_Comune__c.toLowerCase().trim() === lowerValue
                );

            case 'provincia':
                return this.provinceList.some(
                    p => p && p.toLowerCase() === lowerValue
                );

            case 'regione':
                return this.regioniList.some(
                    r => r && r.toLowerCase() === lowerValue
                );

            case 'medicalCenter':
                return this.medicalCenters.some(
                    center => center.toLowerCase() === lowerValue
                );

            case 'noProfit':
                return this.nonProfits.some(
                    ente => ente.Name && ente.Name.toLowerCase() === lowerValue
                );

            case 'noProfitCategory':
                // Usa categoryOptions che contiene tutte le categorie disponibili
                return this.categoryOptions.some(
                    opt => opt.value && opt.value.toLowerCase() === lowerValue
                );

            default:
                return false;
        }
    }

    /**
     * Valida un campo specifico e aggiorna lo stato di validazione
     */
    validateField(row, field, value) {
        if (!row.validationErrors) {
            row.validationErrors = {
                partner: false,
                tipoVisita: false,
                beneficiaryType: false,
                comune: false,
                provincia: false,
                regione: false,
                medicalCenter: false,
                noProfit: false
            };
        }

        const trimmedValue = value ? value.toString().trim() : '';

        switch (field) {
            case 'partner':
                if (trimmedValue === '') {
                    row.validationErrors.partner = false; // Vuoto è ok (non obbligatorio fino al salvataggio)
                } else {
                    // Verifica se il partner esiste nella lista
                    const partnerValid = this.partners.some(
                        partner => partner.Name && partner.Name.toLowerCase() === trimmedValue.toLowerCase()
                    );
                    row.validationErrors.partner = !partnerValid;
                }
                break;

            case 'tipoVisita':
                if (trimmedValue === '') {
                    row.validationErrors.tipoVisita = false; // Vuoto è ok (non obbligatorio fino al salvataggio)
                } else {
                    // Verifica se il valore è nella lista dei tipi visita
                    const tipoVisitaValid = this.tipoVisite.some(
                        tipo => tipo.Name.toLowerCase() === trimmedValue.toLowerCase()
                    );
                    row.validationErrors.tipoVisita = !tipoVisitaValid;
                }
                break;

            case 'beneficiaryType':
                if (trimmedValue === '') {
                    row.validationErrors.beneficiaryType = false; // Vuoto è ok
                } else {
                    // Verifica se il valore è nella lista dei beneficiary types
                    const beneficiaryValid = this.beneficiaryTypeOptions.some(
                        option => option.value.toLowerCase() === trimmedValue.toLowerCase()
                    );
                    row.validationErrors.beneficiaryType = !beneficiaryValid;
                }
                break;

            case 'comune':
                if (trimmedValue === '') {
                    row.validationErrors.comune = false; // Vuoto è ok
                } else {
                    // Verifica se il comune esiste nella lista
                    const comuneMatch = this.comuni.find(
                        c => c.Nome_Comune__c && 
                             c.Nome_Comune__c.toLowerCase().trim() === trimmedValue.toLowerCase()
                    );
                    const comuneExists = !!comuneMatch;
                    
                    if (!comuneExists) {
                        row.validationErrors.comune = true;
                    } else {
                        // Verifica coerenza con provincia e regione se presenti
                        let isCoherent = true;
                        
                        if (comuneMatch) {
                            // Verifica coerenza con provincia
                            if (row.provincia && comuneMatch.Provincia__c) {
                                const provinciaCoherent = comuneMatch.Provincia__c.trim().toLowerCase() === row.provincia.trim().toLowerCase();
                                if (!provinciaCoherent) {
                                    isCoherent = false;
                                }
                            }
                            
                            // Verifica coerenza con regione
                            if (row.regione && comuneMatch.Regione__c) {
                                const regioneCoherent = comuneMatch.Regione__c.trim().toLowerCase() === row.regione.trim().toLowerCase();
                                if (!regioneCoherent) {
                                    isCoherent = false;
                                }
                            }
                        }
                        
                        row.validationErrors.comune = !isCoherent;
                    }
                }
                break;

            case 'provincia':
                if (trimmedValue === '') {
                    row.validationErrors.provincia = false; // Vuoto è ok
                } else {
                    // Verifica se la provincia esiste nella lista
                    const provinciaExists = this.provinceSet.has(trimmedValue.toLowerCase());
                    
                    if (!provinciaExists) {
                        row.validationErrors.provincia = true;
                    } else {
                        // Verifica coerenza con comune e regione se presenti
                        let isCoherent = true;
                        
                        // Verifica coerenza con comune
                        if (row.comune) {
                            const comuneMatch = this.comuni.find(
                                c => c.Nome_Comune__c && 
                                     c.Nome_Comune__c.toLowerCase().trim() === row.comune.toLowerCase().trim()
                            );
                            if (comuneMatch && comuneMatch.Provincia__c) {
                                const comuneCoherent = comuneMatch.Provincia__c.trim().toLowerCase() === trimmedValue.toLowerCase();
                                if (!comuneCoherent) {
                                    isCoherent = false;
                                }
                            }
                        }
                        
                        // Verifica coerenza con regione
                        if (row.regione) {
                            const provinceInRegione = new Set();
                            this.comuni.forEach(comune => {
                                if (comune.Regione__c && 
                                    comune.Regione__c.trim().toLowerCase() === row.regione.trim().toLowerCase() &&
                                    comune.Provincia__c) {
                                    provinceInRegione.add(comune.Provincia__c.trim().toLowerCase());
                                }
                            });
                            if (!provinceInRegione.has(trimmedValue.toLowerCase())) {
                                isCoherent = false;
                            }
                        }
                        
                        row.validationErrors.provincia = !isCoherent;
                    }
                }
                break;

            case 'regione':
                if (trimmedValue === '') {
                    row.validationErrors.regione = false; // Vuoto è ok
                } else {
                    // Verifica se la regione esiste nella lista
                    const regioneExists = this.regioniSet.has(trimmedValue.toLowerCase());
                    
                    if (!regioneExists) {
                        row.validationErrors.regione = true;
                    } else {
                        // Verifica coerenza con comune e provincia se presenti
                        let isCoherent = true;
                        
                        // Verifica coerenza con comune
                        if (row.comune) {
                            const comuneMatch = this.comuni.find(
                                c => c.Nome_Comune__c && 
                                     c.Nome_Comune__c.toLowerCase().trim() === row.comune.toLowerCase().trim()
                            );
                            if (comuneMatch && comuneMatch.Regione__c) {
                                const comuneCoherent = comuneMatch.Regione__c.trim().toLowerCase() === trimmedValue.toLowerCase();
                                if (!comuneCoherent) {
                                    isCoherent = false;
                                }
                            }
                        }
                        
                        // Verifica coerenza con provincia
                        if (row.provincia) {
                            const provinceInRegione = new Set();
                            this.comuni.forEach(comune => {
                                if (comune.Regione__c && 
                                    comune.Regione__c.trim().toLowerCase() === trimmedValue.toLowerCase() &&
                                    comune.Provincia__c) {
                                    provinceInRegione.add(comune.Provincia__c.trim().toLowerCase());
                                }
                            });
                            if (!provinceInRegione.has(row.provincia.trim().toLowerCase())) {
                                isCoherent = false;
                            }
                        }
                        
                        row.validationErrors.regione = !isCoherent;
                    }
                }
                break;

            case 'medicalCenter':
                if (trimmedValue === '') {
                    row.validationErrors.medicalCenter = false; // Vuoto è ok
                } else {
                    // Verifica se il centro medico esiste nella lista
                    const medicalCenterValid = this.medicalCenters.some(
                        center => center.toLowerCase() === trimmedValue.toLowerCase()
                    );
                    row.validationErrors.medicalCenter = !medicalCenterValid;
                }
                break;

            case 'noProfit':
                if (trimmedValue === '') {
                    row.validationErrors.noProfit = false; // Vuoto è ok
                } else {
                    // Verifica se l'ente no profit esiste nella lista
                    const noProfitValid = this.nonProfits.some(
                        ente => ente.Name && ente.Name.toLowerCase() === trimmedValue.toLowerCase()
                    );
                    row.validationErrors.noProfit = !noProfitValid;
                }
                // Se c'è un ente no profit, valida anche la categoria
                if (trimmedValue && row.noProfitCategory !== undefined) {
                    this.validateField(row, 'noProfitCategory', row.noProfitCategory || '');
                }
                break;

            case 'noProfitCategory':
                // Se c'è un ente no profit, la categoria è obbligatoria
                if (row.noProfit && row.noProfit.trim() !== '') {
                    if (trimmedValue === '') {
                        row.validationErrors.noProfitCategory = true; // Vuoto è errore se c'è un ente
                    } else {
                        // Se la categoria è stata confermata manualmente (noProfitCategoryIsNew), è valida
                        if (row.noProfitCategoryIsNew === true) {
                            row.validationErrors.noProfitCategory = false;
                        } else {
                            // Verifica se la categoria è valida nel dataset
                            const categoryValid = this.categoryOptions.some(
                                opt => opt.value && opt.value.toLowerCase() === trimmedValue.toLowerCase()
                            );
                            row.validationErrors.noProfitCategory = !categoryValid;
                        }
                    }
                } else {
                    row.validationErrors.noProfitCategory = false; // Se non c'è ente, categoria può essere vuota
                }
                break;
        }
        
        // Aggiorna hasErrors dopo ogni validazione
        row.hasErrors = this.hasRowErrors(row);
    }

    /**
     * Aggiorna lo stato visivo della cella in base alla validazione
     */
    updateCellValidationState(cell, row, field) {
        if (!row.validationErrors) {
            return;
        }

        const isValid = !row.validationErrors[field];
        
        if (isValid) {
            cell.classList.remove('invalid-cell');
        } else {
            cell.classList.add('invalid-cell');
        }
        
        // Per il campo invoiceNumber, gestisci anche il messaggio di errore
        if (field === 'invoiceNumber') {
            const errorMessage = cell.querySelector('.invoice-number-error-message');
            if (errorMessage) {
                errorMessage.style.display = isValid ? 'none' : 'block';
            }
        }
    }

    /**
     * Verifica se un campo ha un dropdown
     */
    hasDropdown(field) {
        return ['partner', 'tipoVisita', 'beneficiaryType', 'comune', 'provincia', 'regione', 'medicalCenter', 'noProfit', 'noProfitCategory'].includes(field);
    }

    /**
     * Getter per verificare se il dropdown è aperto
     */
    get isDropdownOpen() {
        return this.dropdownOpen !== null;
    }

    /**
     * Getter per ottenere il campo del dropdown aperto
     */
    get currentDropdownField() {
        return this.dropdownOpen ? this.dropdownOpen.field : '';
    }

    /**
     * Getter per ottenere l'indice della riga del dropdown aperto
     */
    get currentDropdownRowIndex() {
        return this.dropdownOpen ? this.dropdownOpen.rowIndex : -1;
    }

    /**
     * Ottiene le opzioni per un campo specifico
     */
    getDropdownOptions(field, rowIndex = -1) {
        switch (field) {
            case 'partner':
                return this.partners.map(partner => ({
                    label: partner.Name,
                    value: partner.Name,
                    id: partner.Id
                }));
            case 'tipoVisita':
                return this.tipoVisite.map(tipo => ({
                    label: tipo.Name,
                    value: tipo.Name,
                    id: tipo.Id
                }));
            case 'beneficiaryType':
                return this.beneficiaryTypeOptions;
            case 'comune':
                // Filtra i comuni in base alla provincia selezionata nella riga
                let comuniFiltered = this.comuni;
                if (rowIndex >= 0 && rowIndex < this.rows.length) {
                    const row = this.rows[rowIndex];
                    if (row.provincia) {
                        comuniFiltered = this.comuni.filter(comune => 
                            comune.Provincia__c && 
                            comune.Provincia__c.trim().toLowerCase() === row.provincia.trim().toLowerCase()
                        );
                    }
                }
                return comuniFiltered.map(comune => ({
                    label: comune.Nome_Comune__c,
                    value: comune.Nome_Comune__c,
                    provincia: comune.Provincia__c,
                    regione: comune.Regione__c
                }));
            case 'provincia':
                // Filtra le province in base alla regione selezionata nella riga
                let provinceFiltered = this.provinceList;
                if (rowIndex >= 0 && rowIndex < this.rows.length) {
                    const row = this.rows[rowIndex];
                    if (row.regione) {
                        // Ottieni le province che appartengono alla regione selezionata
                        const provinceInRegione = new Set();
                        this.comuni.forEach(comune => {
                            if (comune.Regione__c && 
                                comune.Regione__c.trim().toLowerCase() === row.regione.trim().toLowerCase() &&
                                comune.Provincia__c) {
                                provinceInRegione.add(comune.Provincia__c.trim());
                            }
                        });
                        provinceFiltered = Array.from(provinceInRegione).sort();
                    }
                }
                return provinceFiltered.map(provincia => ({
                    label: provincia,
                    value: provincia
                }));
            case 'regione':
                return this.regioniList.map(regione => ({
                    label: regione,
                    value: regione
                }));
            case 'medicalCenter':
                return this.medicalCenters.map(center => ({
                    label: center,
                    value: center
                }));
            case 'noProfit':
                return this.nonProfits.map(ente => ({
                    label: ente.Name,
                    value: ente.Name,
                    category: ente.Ente_Categoria__c
                }));
            case 'noProfitCategory':
                // Mostra sempre tutte le categorie disponibili, non solo quelle filtrate per l'ente
                // Questo permette di selezionare qualsiasi categoria esistente
                return this.categoryOptions;
            default:
                return [];
        }
    }

    /**
     * Verifica se un valore è valido per un campo specifico
     */
    isValueValidForField(rowIndex, field, value) {
        if (!value || value.trim() === '') {
            return true; // Vuoto è valido (non obbligatorio fino al salvataggio)
        }

        const row = this.rows[rowIndex];
        const trimmedValue = value.trim();

        switch (field) {
            case 'comune':
                // Verifica se il comune esiste nella lista
                const comuneExists = this.comuni.some(c => 
                    c.Nome_Comune__c && 
                    c.Nome_Comune__c.toLowerCase() === trimmedValue.toLowerCase()
                );
                
                if (!comuneExists) {
                    return false; // Comune non trovato
                }

                // Se c'è una provincia selezionata, verifica compatibilità
                if (row.provincia) {
                    const comuneMatch = this.comuni.find(c => 
                        c.Nome_Comune__c && 
                        c.Nome_Comune__c.toLowerCase() === trimmedValue.toLowerCase()
                    );
                    if (comuneMatch && comuneMatch.Provincia__c) {
                        return comuneMatch.Provincia__c.trim().toLowerCase() === row.provincia.trim().toLowerCase();
                    }
                }
                return true;

            case 'provincia':
                // Verifica se la provincia esiste
                const provinciaExists = this.provinceList.some(p => 
                    p.toLowerCase() === trimmedValue.toLowerCase()
                );
                
                if (!provinciaExists) {
                    return false;
                }

                // Se c'è una regione selezionata, verifica compatibilità
                if (row.regione) {
                    const provinceInRegione = new Set();
                    this.comuni.forEach(comune => {
                        if (comune.Regione__c && 
                            comune.Regione__c.trim().toLowerCase() === row.regione.trim().toLowerCase() &&
                            comune.Provincia__c) {
                            provinceInRegione.add(comune.Provincia__c.trim().toLowerCase());
                        }
                    });
                    return provinceInRegione.has(trimmedValue.toLowerCase());
                }

                // Se c'è un comune selezionato, verifica compatibilità
                if (row.comune) {
                    const comuneMatch = this.comuni.find(c => 
                        c.Nome_Comune__c && 
                        c.Nome_Comune__c.toLowerCase() === row.comune.trim().toLowerCase()
                    );
                    if (comuneMatch && comuneMatch.Provincia__c) {
                        return comuneMatch.Provincia__c.trim().toLowerCase() === trimmedValue.toLowerCase();
                    }
                }
                return true;

            case 'regione':
                return this.regioniList.some(r => 
                    r.toLowerCase() === trimmedValue.toLowerCase()
                );

            case 'tipoVisita':
                return this.tipoVisite.some(tv => 
                    tv.Name.toLowerCase() === trimmedValue.toLowerCase()
                );

            case 'beneficiaryType':
                return this.beneficiaryTypeOptions.some(opt => 
                    opt.value.toLowerCase() === trimmedValue.toLowerCase()
                );

            case 'medicalCenter':
                return this.medicalCenters.some(center => 
                    center.toLowerCase() === trimmedValue.toLowerCase()
                );

            case 'noProfit':
                return this.nonProfits.some(ente => 
                    ente.Name && ente.Name.toLowerCase() === trimmedValue.toLowerCase()
                );

            case 'partner':
                return this.partners.some(partner => 
                    partner.Name && partner.Name.toLowerCase() === trimmedValue.toLowerCase()
                );

            default:
                return true;
        }
    }

    /**
     * Apre il dropdown per una cella specifica
     */
    openDropdown(event) {
        const cell = event.currentTarget;
        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);

        if (!this.hasDropdown(field)) {
            return; // Non aprire dropdown per campi senza validazione
        }

        // Previeni il comportamento di default per evitare che la cella diventi editabile
        event.preventDefault();
        event.stopPropagation();

        // Ottieni il valore corrente della cella
        const currentValue = this.rows[rowIndex] ? this.rows[rowIndex][field] || '' : '';
        const trimmedValue = currentValue.toString().trim();

        // Chiudi altri dropdown aperti
        this.closeDropdown();

        // Imposta isEditing per mostrare il pulsante "Conferma Valore" nella cella
        // Questo è necessario quando la cella è vuota o quando ha un valore non valido
        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            const row = this.rows[rowIndex];
            if (!row.isEditing) {
                row.isEditing = {};
            }
            // Per i campi che supportano la conferma, imposta sempre isEditing = true quando si apre il dropdown
            if (['comune', 'medicalCenter', 'noProfit', 'noProfitCategory', 'tipoVisita'].includes(field)) {
                row.isEditing[field] = true;
                // Forza il rerender per mostrare il pulsante di conferma nella cella
                this.rows = [...this.rows];
            }
        }

        // Apri il nuovo dropdown
        this.dropdownOpen = { rowIndex, field };
        this.dropdownFilter = trimmedValue;
        
        // Aggiorna le opzioni filtrate immediatamente
        this.updateFilteredOptions();
        
        // Posiziona il dropdown e aggiorna nuovamente le opzioni dopo che il DOM è stato aggiornato
        setTimeout(() => {
            this.positionDropdown(cell);
            // Focus sul campo di ricerca
            const filterInput = this.template.querySelector('.dropdown-filter');
            if (filterInput) {
                // Assicurati che il valore del filtro corrisponda al valore della cella
                if (filterInput.value !== trimmedValue) {
                    filterInput.value = trimmedValue;
                }
                filterInput.focus();
                if (trimmedValue) {
                    filterInput.select();
                }
                // Aggiorna nuovamente le opzioni dopo che il filtro è stato impostato nel DOM
                this.updateFilteredOptions();
            }
        }, 0);
    }

    /**
     * Chiude il dropdown
     */
    closeDropdown() {
        this.dropdownOpen = null;
        this.dropdownFilter = '';
        this.dropdownFilteredOptions = [];
        this.showConfirmButton = false;
        this.skipNextConfirmClick = false;
        // Chiudi anche il date picker se aperto
        this.closeDatePicker();
    }

    /**
     * Verifica se un campo è una data
     */
    isDateField(field) {
        return field === 'invoiceDate' || field === 'competenceDate' || field === 'dataVisita';
    }

    /**
     * Apre il calendario per una cella data
     */
    openDatePicker(event) {
        const cell = event.currentTarget;
        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex, 10);

        if (!this.isDateField(field)) {
            return;
        }

        // Previeni il comportamento di default
        event.preventDefault();
        event.stopPropagation();

        // Chiudi altri calendari/dropdown aperti
        this.closeDropdown();
        this.closeDatePicker();

        // Ottieni il valore corrente della cella
        const currentValue = this.rows[rowIndex] ? this.rows[rowIndex][field] || '' : '';
        
        // Converti la data nel formato YYYY-MM-DD per l'input date
        let dateValue = '';
        if (currentValue) {
            const parsedDate = this.parseDate(currentValue);
            if (parsedDate) {
                // Se parseDate restituisce una stringa YYYY-MM-DD, usala direttamente
                dateValue = parsedDate;
            } else {
                // Altrimenti prova a convertire
                const dateObj = new Date(currentValue);
                if (!isNaN(dateObj.getTime())) {
                    dateValue = dateObj.toISOString().split('T')[0];
                }
            }
        }

        // Apri il calendario
        this.datePickerOpen = { rowIndex, field, value: dateValue };

        // Posiziona l'input date sopra la cella
        setTimeout(() => {
            this.positionDatePicker(cell);
            // Focus sull'input date per aprire il calendario
            const dateInput = this.template.querySelector('.date-picker-input');
            if (dateInput) {
                dateInput.focus();
                dateInput.showPicker && dateInput.showPicker(); // Se supportato dal browser
            }
        }, 0);
    }

    /**
     * Chiude il calendario
     */
    closeDatePicker() {
        this.datePickerOpen = null;
    }

    /**
     * Posiziona l'input date relativamente alla cella
     */
    positionDatePicker(cell) {
        const dateInput = this.template.querySelector('.date-picker-input');
        if (!dateInput || !cell) return;

        const cellRect = cell.getBoundingClientRect();
        const container = this.template.querySelector('.excel-table-container');
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        
        dateInput.style.position = 'absolute';
        dateInput.style.top = `${cellRect.top - containerRect.top}px`;
        dateInput.style.left = `${cellRect.left - containerRect.left}px`;
        dateInput.style.width = `${cellRect.width}px`;
        dateInput.style.zIndex = '1001';
    }

    /**
     * Gestisce il cambio di data nel calendario
     */
    handleDateChange(event) {
        if (!this.datePickerOpen) {
            return;
        }

        const newDate = event.target.value;
        const rowIndex = this.datePickerOpen.rowIndex;
        const field = this.datePickerOpen.field;

        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            const updatedRows = [...this.rows];
            const row = updatedRows[rowIndex];

            // Aggiorna il valore della data (in formato YYYY-MM-DD per Salesforce)
            row[field] = newDate;

            // Valida il campo
            this.validateField(row, field, newDate);

            this.rows = updatedRows;

            // Aggiorna lo stato visivo della cella e formatta la data
            setTimeout(() => {
                const cell = this.template.querySelector(
                    `td[data-field="${field}"][data-row-index="${rowIndex}"]`
                );
                if (cell) {
                    // Formatta la data per la visualizzazione
                    const formattedDate = this.formatDateForDisplay(newDate);
                    cell.textContent = formattedDate;
                    this.updateCellValidationState(cell, row, field);
                }
            }, 0);
            
            // Verifica unicità numeri fattura se è stata modificata invoiceDate
            if (field === 'invoiceDate') {
                this.checkInvoiceNumbersUniqueness();
            }
        }

        // Chiudi il calendario dopo un breve delay per permettere la selezione
        setTimeout(() => {
            this.closeDatePicker();
        }, 100);
    }

    /**
     * Getter per verificare se il calendario è aperto
     */
    get isDatePickerOpen() {
        return this.datePickerOpen !== null;
    }

    /**
     * Getter per ottenere il valore corrente del calendario
     */
    get currentDatePickerValue() {
        return this.datePickerOpen ? this.datePickerOpen.value : '';
    }

    /**
     * Getter per ottenere il campo corrente del calendario
     */
    get currentDatePickerField() {
        return this.datePickerOpen ? this.datePickerOpen.field : '';
    }

    /**
     * Conferma un valore comune, centro medico o ente no profit non trovato
     */
    handleConfirmMouseDown(event) {
        // Esegui la conferma PRIMA del blur/re-render; il click successivo verrà ignorato.
        this.skipNextConfirmClick = true;
        this.confirmNewComune(event);
    }

    confirmNewComune(event) {
        // Se arriviamo qui dal click dopo un mousedown già gestito, ignora.
        if (this.skipNextConfirmClick && event && event.type === 'click') {
            this.skipNextConfirmClick = false;
            return;
        }

        if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
        }
        if (event && typeof event.stopPropagation === 'function') {
            event.stopPropagation();
        }

        try {
            if (!this.dropdownOpen || !this.hasValidation(this.dropdownOpen.field)) {
                return;
            }

            const rowIndex = this.dropdownOpen.rowIndex;
            const field = this.dropdownOpen.field;

            // Source of truth: leggi dall'input filtro per evitare mismatch stato/DOM
            const filterInputEl = this.template.querySelector('.dropdown-filter');
            let filterValue = '';
            if (filterInputEl && typeof filterInputEl.value === 'string') {
                filterValue = filterInputEl.value.trim();
            }
            if (!filterValue) {
                filterValue = (this.dropdownFilter || '').toString().trim();
            }
            // Ultimo fallback: se per qualche motivo l'input filtro non è aggiornato (race focus),
            // usa il contenuto della cella corrente.
            if (!filterValue) {
                const activeCell = this.template.querySelector(
                    `td[data-field="${field}"][data-row-index="${rowIndex}"]`
                );
                if (activeCell) {
                    filterValue = (activeCell.textContent || '').trim();
                }
            }
            if (!filterValue && rowIndex >= 0 && rowIndex < this.rows.length) {
                filterValue = this.rows[rowIndex][field] || '';
            }

            // Branch dedicata: Categoria Ente deve sempre “committare” il valore in riga e chiudere.
            // Evita che la logica generica (correzioni cross-cella, ecc.) interferisca.
            if (field === 'noProfitCategory') {
                if (rowIndex < 0 || rowIndex >= this.rows.length || !filterValue) {
                    // Niente da confermare: chiudi e basta
                    this.closeDropdown();
                    return;
                }

                const updatedRows = [...this.rows];
                const row = updatedRows[rowIndex];
                row.noProfitCategory = filterValue;

                // Flag “nuovo valore categoria” solo se non è tra le opzioni esistenti
                const categoryExists = (this.categoryOptions || []).some(
                    opt => opt.value && opt.value.toLowerCase() === filterValue.toLowerCase()
                );
                row.noProfitCategoryIsNew = !categoryExists;

                // Validazione: consideriamo confermato = valido
                if (!row.validationErrors) {
                    row.validationErrors = {};
                }
                row.validationErrors.noProfitCategory = false;

                this.rows = updatedRows;

                // Chiudi subito il dropdown e riallinea il DOM
                this.isConfirmingValue = true;
                this.closeDropdown();
                setTimeout(() => {
                    const categoryCell = this.template.querySelector(
                        `td[data-field="noProfitCategory"][data-row-index="${rowIndex}"]`
                    );
                    const updatedRow = this.rows[rowIndex];
                    if (categoryCell && updatedRow) {
                        categoryCell.textContent = updatedRow.noProfitCategory || '';
                        this.updateCellValidationState(categoryCell, updatedRow, 'noProfitCategory');
                        // Rimuovi isEditing dopo la conferma
                        if (updatedRow.isEditing) {
                            updatedRow.isEditing.noProfitCategory = false;
                        }
                    }
                    this.isConfirmingValue = false;
                    // Forza il rerender per nascondere il pulsante
                    this.rows = [...this.rows];
                }, 0);
                return;
            }

            if (rowIndex >= 0 && rowIndex < this.rows.length && filterValue) {
                const updatedRows = [...this.rows];
                const row = updatedRows[rowIndex];
                const oldValue = row[field];
            
            // Salva lo stato dell'errore PRIMA di rimuoverlo
            const oldValueHadError = row.validationErrors && row.validationErrors[field] === true;
            const wasOldValueIncorrect = oldValue && (
                !this.isValueInDataset(field, oldValue) || oldValueHadError
            );
            
            // Salva queste informazioni per l'aggiornamento visivo successivo
            const shouldUpdateOtherCells = wasOldValueIncorrect;

                // Imposta il valore come nuovo e rimuovi l'errore di validazione
                row[field] = filterValue;
            
            // Gestisci i flag specifici per i campi che li supportano
                if (field === 'comune') {
                    row.comuneIsNew = true;
                    row.validationErrors.comune = false;
                } else if (field === 'medicalCenter') {
                    row.medicalCenterIsNew = true;
                    row.validationErrors.medicalCenter = false;
                } else if (field === 'noProfit') {
                    row.noProfitIsNew = true;
                    row.validationErrors.noProfit = false;
                } else if (field === 'noProfitCategory') {
                    // Se viene confermata una categoria, segna come nuovo se non esiste nel dataset
                    const categoryExists = this.categoryOptions.some(
                        opt => opt.value && opt.value.toLowerCase() === filterValue.toLowerCase()
                    );
                    if (!categoryExists) {
                        row.noProfitCategoryIsNew = true;
                    }
                    row.validationErrors.noProfitCategory = false;
                } else if (field === 'tipoVisita') {
                    // Se viene confermato un tipo visita, segna come nuovo se non esiste nel dataset
                    const tipoVisitaExists = this.tipoVisite && this.tipoVisite.some(
                        tipo => tipo.Name && tipo.Name.toLowerCase() === filterValue.toLowerCase()
                    );
                    if (!tipoVisitaExists) {
                        row.tipoVisitaIsNew = true;
                    }
                    row.validationErrors.tipoVisita = false;
                } else if (field === 'invoiceNumber') {
                // Per numero fattura, rimuovi l'errore di validazione
                // Il controllo di unicità verrà fatto dopo per verificare che il nuovo valore non sia duplicato
                if (row.validationErrors && row.validationErrors[field] !== undefined) {
                    row.validationErrors[field] = false;
                }
                } else {
                // Per altri campi validati, rimuovi solo l'errore di validazione
                if (row.validationErrors && row.validationErrors[field] !== undefined) {
                    row.validationErrors[field] = false;
                }
                }

                // Correggi tutte le altre celle della stessa colonna con lo stesso valore errato
            // Usa wasOldValueIncorrect che è stato calcolato PRIMA di rimuovere l'errore
            
            // Salva il valore da cercare per l'aggiornamento visivo
            const valueToFindForUpdate = oldValue ? oldValue.trim().toLowerCase() : '';
            
            // Traccia gli indici delle celle che sono state corrette (dichiarato fuori dal blocco if per essere accessibile nel setTimeout)
            let correctedRowIndices = [];
            
            // Correggi anche se il valore non cambia, purché il valore originale fosse errato
            if (wasOldValueIncorrect) {
                const valueToFind = oldValue.trim().toLowerCase();
                
                // Per numero fattura, correggi solo se stessa data E stesso centro medico
                if (field === 'invoiceNumber') {
                    const invoiceDate = row.invoiceDate;
                    const medicalCenter = row.medicalCenter || '';
                    updatedRows.forEach((otherRow, otherIndex) => {
                        if (otherIndex !== rowIndex && otherRow[field]) {
                            const otherValue = String(otherRow[field]).trim().toLowerCase();
                            const otherDate = otherRow.invoiceDate;
                            const otherMedicalCenter = otherRow.medicalCenter || '';
                            const otherValueHasError = otherRow.validationErrors && otherRow.validationErrors[field] === true;
                            
                            // Correggi solo se stesso valore errato, stessa data E stesso centro medico E ha errore
                            if (otherValue === valueToFind && 
                                otherDate === invoiceDate && 
                                otherMedicalCenter.toLowerCase() === medicalCenter.toLowerCase() &&
                                otherValueHasError) {
                                // Correggi il valore
                                otherRow[field] = filterValue;
                                // Rimuovi l'errore di validazione
                                if (otherRow.validationErrors) {
                                    otherRow.validationErrors[field] = false;
                                }
                                // Traccia questa cella come corretta
                                correctedRowIndices.push(otherIndex);
                                // NON chiamare validateField qui perché il valore è stato confermato dall'utente
                                // Il controllo di unicità verrà fatto dopo per verificare che il nuovo valore non sia duplicato
                            }
                        }
                    });
                } else {
                    // Per tutti gli altri campi validati (esclusi comune, provincia e regione)
                    // Per comune, provincia e regione, NON fare correzione automatica delle altre celle
                    if (field !== 'comune' && field !== 'provincia' && field !== 'regione') {
                        updatedRows.forEach((otherRow, otherIndex) => {
                            if (otherIndex !== rowIndex && otherRow[field]) {
                                const otherValue = String(otherRow[field]).trim().toLowerCase();
                                // Verifica se il valore è errato (non nel dataset o con errore di validazione)
                                const isOtherValueIncorrect = !this.isValueInDataset(field, otherRow[field]) ||
                                    (otherRow.validationErrors && otherRow.validationErrors[field] === true);
                                
                                if (otherValue === valueToFind && isOtherValueIncorrect) {
                                    // Correggi il valore
                                    otherRow[field] = filterValue;
                                    // Rimuovi l'errore di validazione (considera corretto come se avessi premuto "Conferma Valore")
                                    // NON chiamare validateField perché il valore è stato confermato dall'utente
                                    if (field === 'medicalCenter') {
                                        otherRow.medicalCenterIsNew = true;
                                        if (otherRow.validationErrors) {
                                            otherRow.validationErrors.medicalCenter = false;
                                        }
                                    } else if (field === 'noProfit') {
                                        otherRow.noProfitIsNew = true;
                                        if (otherRow.validationErrors) {
                                            otherRow.validationErrors.noProfit = false;
                                        }
                                    } else if (field === 'noProfitCategory') {
                                        const categoryExists = this.categoryOptions.some(
                                            opt => opt.value && opt.value.toLowerCase() === filterValue.toLowerCase()
                                        );
                                        if (!categoryExists) {
                                            otherRow.noProfitCategoryIsNew = true;
                                        }
                                        if (otherRow.validationErrors) {
                                            otherRow.validationErrors.noProfitCategory = false;
                                        }
                                    } else {
                                        // Per altri campi validati, rimuovi solo l'errore di validazione
                                        if (otherRow.validationErrors && otherRow.validationErrors[field] !== undefined) {
                                            otherRow.validationErrors[field] = false;
                                        }
                                    }
                                    // Traccia questa cella come corretta
                                    correctedRowIndices.push(otherIndex);
                                    // NON chiamare validateField qui perché il valore è stato confermato dall'utente
                                    // e deve essere considerato valido anche se non è nel dataset
                                }
                            }
                        });
                    }
                }
            }

                this.rows = updatedRows;

            // Chiudi il dropdown e resetta isEditing
            this.isConfirmingValue = true;
            
            // Aggiorna lo stato visivo per tutte le celle corrette (inclusa quella corrente)
            // Usa un delay maggiore per assicurarsi che il DOM sia completamente aggiornato
            setTimeout(() => {
                // Usa this.rows che è già stato aggiornato
                const currentRow = this.rows[rowIndex];
                
                // Rimuovi isEditing dopo la conferma
                if (currentRow && currentRow.isEditing) {
                    currentRow.isEditing[field] = false;
                }
                
                // Aggiorna prima la cella corrente
                const currentCell = this.template.querySelector(
                    `td[data-field="${field}"][data-row-index="${rowIndex}"]`
                );
                if (currentCell && currentRow) {
                    this.updateCellValidationState(currentCell, currentRow, field);
                }
                
                // Poi aggiorna tutte le altre celle che sono state corrette nella logica sopra
                // Usa gli indici tracciati durante la correzione
                if (shouldUpdateOtherCells && correctedRowIndices && correctedRowIndices.length > 0) {
                    correctedRowIndices.forEach((correctedIndex) => {
                        const correctedRow = this.rows[correctedIndex];
                        if (correctedRow) {
                            const cell = this.template.querySelector(
                                `td[data-field="${field}"][data-row-index="${correctedIndex}"]`
                            );
                            if (cell) {
                                // Aggiorna lo stato visivo usando i dati aggiornati da this.rows
                                // Questo rimuoverà il bordo rosso se l'errore è stato rimosso
                                this.updateCellValidationState(cell, correctedRow, field);
                            }
                        }
                    });
                }
                
                // Forza il rerender per nascondere il pulsante dopo la conferma
                this.rows = [...this.rows];
                this.isConfirmingValue = false;
            }, 150);

            // Per numero fattura, dopo la correzione, verifica l'unicità del nuovo valore
            if (field === 'invoiceNumber' && wasOldValueIncorrect) {
                setTimeout(async () => {
                    await this.checkInvoiceNumbersUniqueness();
                }, 200);
            }

            // Per ente no profit, dopo la conferma, apri il dropdown per la categoria
            if (field === 'noProfit') {
                setTimeout(() => {
                    const categoryCell = this.template.querySelector(
                        `td[data-field="noProfitCategory"][data-row-index="${rowIndex}"]`
                    );
                    if (categoryCell) {
                        // Usa helper che crea un evento "safe" (openDropdown richiede preventDefault/stopPropagation)
                        this.openDropdownForCell(categoryCell, rowIndex, 'noProfitCategory');
                    }
                }, 200);
                return;
            }
            
            // Chiudi il dropdown (già chiuso sopra, ma per sicurezza)
            this.closeDropdown();
            } // Chiude il blocco if (rowIndex >= 0 && rowIndex < this.rows.length && filterValue)
        } catch (e) {
            console.error('[invoiceExcelEditor] confirmNewComune error:', e);
            // se succede un errore, garantiamo comunque la chiusura del dropdown
            this.closeDropdown();
        } finally {
            // Ultima safety net: se stiamo confermando una categoria e il dropdown è ancora aperto, chiudilo.
            if (this.dropdownOpen && this.dropdownOpen.field === 'noProfitCategory') {
                this.closeDropdown();
            }
        }
    }

    /**
     * Posiziona il dropdown relativamente alla cella
     */
    positionDropdown(cell) {
        const dropdown = this.template.querySelector('.dropdown-menu');
        if (!dropdown || !cell) return;

        const cellRect = cell.getBoundingClientRect();
        
        dropdown.style.position = 'fixed'; // Fixed rispetto alla viewport per posizionamento preciso
        // Overlay: angolo superiore sinistro del dropdown "cade" nella cella chiamante
        dropdown.style.top = `${cellRect.top}px`;
        dropdown.style.left = `${cellRect.left}px`;
        // Larghezza minima maggiore per adattarsi meglio al testo, ma almeno quanto la cella
        const minWidth = Math.max(cellRect.width, 300);
        dropdown.style.width = `${minWidth}px`;
        dropdown.style.maxWidth = '500px';
        dropdown.style.maxHeight = '300px';
        dropdown.style.zIndex = '1000';
    }

    /**
     * Aggiorna le opzioni filtrate
     */
    updateFilteredOptions() {
        if (!this.dropdownOpen) {
            this.dropdownFilteredOptions = [];
            this.showConfirmButton = false;
            return;
        }

        const options = this.getDropdownOptions(this.dropdownOpen.field, this.dropdownOpen.rowIndex);
        const filter = this.dropdownFilter.toLowerCase().trim();

        if (!filter) {
            this.dropdownFilteredOptions = options;
            // Per i campi che supportano la conferma, mostra sempre il pulsante quando il filtro è vuoto
            // Questo permette di inserire un nuovo valore anche quando la cella è vuota
            // NOTA: per 'partner' NON mostrare mai il pulsante "Conferma Valore"
            if (this.dropdownOpen.field === 'partner') {
                this.showConfirmButton = false;
            } else if (['comune', 'medicalCenter', 'noProfit', 'noProfitCategory', 'tipoVisita'].includes(this.dropdownOpen.field)) {
                // Per questi campi, mostra sempre il pulsante quando il filtro è vuoto
                // Questo permette di inserire un nuovo valore anche quando la cella è vuota
                this.showConfirmButton = true;
            } else {
                this.showConfirmButton = false;
            }
        } else {
            this.dropdownFilteredOptions = options.filter(option =>
                option.label.toLowerCase().includes(filter)
            );
            
            // Per comune, medicalCenter, noProfit, noProfitCategory e tipoVisita, mostra "Conferma Valore" se:
            // 1. Non ci sono risultati nel filtro, OPPURE
            // 2. Per medicalCenter, noProfit, noProfitCategory e tipoVisita: se c'è un valore nel filtro (anche se corrisponde a un'opzione)
            // NOTA: per 'partner' NON mostrare mai il pulsante "Conferma Valore" perché il valore deve essere obbligatoriamente uno di quelli ammessi
            if (this.dropdownOpen.field === 'partner') {
                // Per partner, non mostrare mai il pulsante "Conferma Valore"
                this.showConfirmButton = false;
            } else if (['comune', 'medicalCenter', 'noProfit', 'noProfitCategory', 'tipoVisita'].includes(this.dropdownOpen.field)) {
                if (this.dropdownFilteredOptions.length === 0) {
                    // Nessun risultato trovato - mostra sempre il pulsante per confermare il valore
                    this.showConfirmButton = true;
                } else if (['medicalCenter', 'noProfit', 'noProfitCategory', 'tipoVisita'].includes(this.dropdownOpen.field)) {
                    // Per medicalCenter, noProfit, noProfitCategory e tipoVisita, mostra sempre il pulsante se c'è un valore nel filtro
                    // Questo permette di confermare il valore anche se corrisponde a un'opzione esistente
                    this.showConfirmButton = filter !== '';
                } else {
                    // Per comune, mostra solo se non ci sono risultati
                    this.showConfirmButton = false;
                }
            } else {
                this.showConfirmButton = false;
            }
        }
    }

    /**
     * Gestisce il filtro del dropdown
     */
    handleDropdownFilter(event) {
        // Previeni la propagazione per evitare che il click chiuda il dropdown
        event.stopPropagation();
        this.dropdownFilter = event.target.value;
        // Forza l'aggiornamento reattivo
        this.updateFilteredOptions();
        // Forza un re-render per assicurarsi che il pulsante venga mostrato
        setTimeout(() => {
            this.updateFilteredOptions();
        }, 0);
    }

    /**
     * Previene la chiusura del dropdown quando si clicca sul campo di ricerca
     */
    handleDropdownFilterClick(event) {
        event.stopPropagation();
    }

    /**
     * Previene la chiusura del dropdown quando si clicca sul dropdown stesso
     */
    handleDropdownClick(event) {
        event.stopPropagation();
    }

    /**
     * Seleziona un valore dal dropdown
     */
    selectDropdownValue(event) {
        // Protezione: per Categoria Ente gestiamo un flusso dedicato (semplice e affidabile)
        // per evitare che la logica generica (correzioni cross-cella, dipendenze, ecc.)
        // interferisca con l'inserimento e la chiusura del dropdown.
        if (this.dropdownOpen && this.dropdownOpen.field === 'noProfitCategory') {
            event.stopPropagation();
            const value = event.currentTarget.dataset.value;
            const rowIndex = this.dropdownOpen.rowIndex;

            if (rowIndex >= 0 && rowIndex < this.rows.length) {
                const updatedRows = [...this.rows];
                const row = updatedRows[rowIndex];

                row.noProfitCategory = value;
                row.noProfitCategoryIsNew = false;
                if (!row.validationErrors) {
                    row.validationErrors = {};
                }
                row.validationErrors.noProfitCategory = false;

                this.rows = updatedRows;
            }

            this.closeDropdown();

            // Riallinea subito il DOM della cella (contenteditable) al modello dati
            setTimeout(() => {
                const categoryCell = this.template.querySelector(
                    `td[data-field="noProfitCategory"][data-row-index="${this.dropdownOpen ? this.dropdownOpen.rowIndex : rowIndex}"]`
                );
                const updatedRow = this.rows[rowIndex];
                if (categoryCell && updatedRow) {
                    categoryCell.textContent = updatedRow.noProfitCategory || '';
                    this.updateCellValidationState(categoryCell, updatedRow, 'noProfitCategory');
                }
            }, 0);
            return;
        }

        const value = event.currentTarget.dataset.value;
        const rowIndex = this.dropdownOpen.rowIndex;
        const field = this.dropdownOpen.field;

        if (rowIndex >= 0 && rowIndex < this.rows.length) {
            const updatedRows = [...this.rows];
            const row = updatedRows[rowIndex];
            const oldValue = row[field]; // Salva il valore precedente per la correzione automatica

            // Gestione dipendenze tra Comune, Provincia e Regione
            if (field === 'regione') {
                row.regione = value;
                
                // Verifica compatibilità con provincia e comune esistenti
                if (row.provincia && !this.isValueValidForField(rowIndex, 'provincia', row.provincia)) {
                    // Provincia non compatibile, apri dropdown provincia
                    this.rows = updatedRows;
                    this.closeDropdown();
                    setTimeout(() => {
                        const provinciaCell = this.template.querySelector(
                            `td[data-field="provincia"][data-row-index="${rowIndex}"]`
                        );
                        if (provinciaCell) {
                            this.openDropdownForCell(provinciaCell, rowIndex, 'provincia');
                        }
                    }, 100);
                    return;
                }
                
                if (row.comune && !this.isValueValidForField(rowIndex, 'comune', row.comune)) {
                    // Comune non compatibile, apri dropdown comune
                    this.rows = updatedRows;
                    this.closeDropdown();
                    setTimeout(() => {
                        const comuneCell = this.template.querySelector(
                            `td[data-field="comune"][data-row-index="${rowIndex}"]`
                        );
                        if (comuneCell) {
                            this.openDropdownForCell(comuneCell, rowIndex, 'comune');
                        }
                    }, 100);
                    return;
                }
                
                // Valida i campi (la validazione verificherà anche la coerenza)
                this.validateField(row, 'regione', value);
                if (row.provincia) {
                    this.validateField(row, 'provincia', row.provincia);
                }
                if (row.comune) {
                    this.validateField(row, 'comune', row.comune);
                }
            } else if (field === 'provincia') {
                row.provincia = value;
                
                // Verifica compatibilità con comune esistente
                if (row.comune && !this.isValueValidForField(rowIndex, 'comune', row.comune)) {
                    // Comune non compatibile, apri dropdown comune
                    this.rows = updatedRows;
                    this.closeDropdown();
                    setTimeout(() => {
                        const comuneCell = this.template.querySelector(
                            `td[data-field="comune"][data-row-index="${rowIndex}"]`
                        );
                        if (comuneCell) {
                            this.openDropdownForCell(comuneCell, rowIndex, 'comune');
                        }
                    }, 100);
                    return;
                }
                
                // Valida i campi (la validazione verificherà anche la coerenza)
                this.validateField(row, 'provincia', value);
                if (row.comune) {
                    this.validateField(row, 'comune', row.comune);
                }
                if (row.regione) {
                    this.validateField(row, 'regione', row.regione);
                }
            }
            
            if (field === 'comune') {
                // Se si seleziona un comune, aggiorna anche provincia e regione
                row.comune = value;
                const option = this.dropdownFilteredOptions.find(opt => opt.value === value);
                if (option) {
                    if (option.provincia) {
                        row.provincia = option.provincia;
                    }
                    if (option.regione) {
                        row.regione = option.regione;
                    }
                }
                
                // Valida i campi (la validazione verificherà anche la coerenza)
                this.validateField(row, 'comune', value);
                if (row.provincia) {
                    this.validateField(row, 'provincia', row.provincia);
                }
                if (row.regione) {
                    this.validateField(row, 'regione', row.regione);
                }
            } else if (field === 'noProfit') {
                // Se si seleziona un ente no profit, aggiorna anche la categoria
                row.noProfit = value;
                const option = this.dropdownFilteredOptions.find(opt => opt.value === value);
                if (option && option.category) {
                    row.noProfitCategory = option.category;
                }
                
                // Valida i campi
                this.validateField(row, 'noProfit', value);
            } else if (field === 'medicalCenter') {
                // Aggiorna il centro medico
                row.medicalCenter = value;
                this.validateField(row, 'medicalCenter', value);
            } else if (field === 'noProfitCategory') {
                // Aggiorna la categoria ente
                row.noProfitCategory = value;
                // Rimuovi il flag noProfitCategoryIsNew quando viene selezionato dal dropdown (non confermato manualmente)
                row.noProfitCategoryIsNew = false;
                // Valida il campo
                this.validateField(row, 'noProfitCategory', value);
            } else if (field === 'partner') {
                // Aggiorna il partner
                row.partner = value;
                const option = this.dropdownFilteredOptions.find(opt => opt.value === value);
                if (option && option.id) {
                    row.partnerId = option.id;
                }
                // Valida il campo
                this.validateField(row, 'partner', value);
                
                // Chiudi il dropdown prima di aggiornare il DOM
                this.closeDropdown();
                
                // Aggiorna il DOM della cella corrente
                setTimeout(() => {
                    const partnerCell = this.template.querySelector(
                        `td[data-field="partner"][data-row-index="${rowIndex}"]`
                    );
                    const updatedRow = this.rows[rowIndex];
                    if (partnerCell && updatedRow) {
                        partnerCell.textContent = updatedRow.partner || '';
                        this.updateCellValidationState(partnerCell, updatedRow, 'partner');
                    }
                }, 0);
                return; // Esci subito dopo aver aggiornato il DOM
            } else {
                // Aggiorna il valore per altri campi
                row[field] = value;
                
                // Se è tipoVisita, salva anche l'ID
                if (field === 'tipoVisita') {
                    const option = this.dropdownFilteredOptions.find(opt => opt.value === value);
                    if (option && option.id) {
                        row.tipoVisitaId = option.id;
                    }
                }
                
                // Valida il campo
                this.validateField(row, field, value);
            }

            // Correggi automaticamente SOLO se il valore originale era errato
            // Verifica che oldValue NON fosse nel dataset (era errato) o avesse un errore di validazione
            const oldValueHadError = row.validationErrors && row.validationErrors[field] === true;
            const wasOldValueIncorrect = oldValue && (
                !this.isValueInDataset(field, oldValue) || oldValueHadError
            );
            const isNewValueValid = this.isValueInDataset(field, value);
            
            // Per numero fattura, gestisci separatamente (non ha validazione dataset)
            if (field === 'invoiceNumber' && oldValue && oldValueHadError &&
                oldValue.trim().toLowerCase() !== value.trim().toLowerCase()) {
                const valueToFind = oldValue.trim().toLowerCase();
                const invoiceDate = row.invoiceDate;
                const medicalCenter = row.medicalCenter || '';
                updatedRows.forEach((otherRow, otherIndex) => {
                    if (otherIndex !== rowIndex && otherRow[field]) {
                        const otherValue = String(otherRow[field]).trim().toLowerCase();
                        const otherDate = otherRow.invoiceDate;
                        const otherMedicalCenter = otherRow.medicalCenter || '';
                        const otherValueHasError = otherRow.validationErrors && otherRow.validationErrors[field] === true;
                        
                        // Correggi solo se stesso valore errato, stessa data E stesso centro medico E ha errore
                        if (otherValue === valueToFind && 
                            otherDate === invoiceDate && 
                            otherMedicalCenter.toLowerCase() === medicalCenter.toLowerCase() &&
                            otherValueHasError) {
                            // Correggi il valore
                            otherRow[field] = value;
                            // Aggiorna anche la validazione
                            this.validateField(otherRow, field, value);
                        }
                    }
                });
            } else if (wasOldValueIncorrect && isNewValueValid && 
                this.hasValidation(field) && field !== 'comune' && field !== 'provincia' && field !== 'regione') {
                // Per tutti gli altri campi validati (esclusi comune, provincia e regione), correggi tutte le celle della stessa colonna
                const valueToFind = oldValue.trim().toLowerCase();
                
                updatedRows.forEach((otherRow, otherIndex) => {
                    if (otherIndex !== rowIndex && otherRow[field]) {
                        const otherValue = String(otherRow[field]).trim().toLowerCase();
                        // Correggi solo se il valore è errato (non nel dataset o con errore di validazione)
                        const otherValueHasError = otherRow.validationErrors && otherRow.validationErrors[field] === true;
                        const isOtherValueIncorrect = !this.isValueInDataset(field, otherRow[field]) || otherValueHasError;
                        if (otherValue === valueToFind && isOtherValueIncorrect) {
                            // Correggi il valore
                            otherRow[field] = value;
                            // Aggiorna anche la validazione
                            this.validateField(otherRow, field, value);
                            
                            // Se è ente no profit, aggiorna anche la categoria
                            if (field === 'noProfit') {
                                const option = this.dropdownFilteredOptions.find(opt => opt.value === value);
                                if (option && option.category) {
                                    otherRow.noProfitCategory = option.category;
                                    this.validateField(otherRow, 'noProfitCategory', option.category);
                                }
                            }
                            
                            // Se è tipoVisita, salva anche l'ID
                            if (field === 'tipoVisita') {
                                const option = this.dropdownFilteredOptions.find(opt => opt.value === value);
                                if (option && option.id) {
                                    otherRow.tipoVisitaId = option.id;
                                }
                            }
                            
                            // Se è partner, salva anche l'ID
                            if (field === 'partner') {
                                const option = this.dropdownFilteredOptions.find(opt => opt.value === value);
                                if (option && option.id) {
                                    otherRow.partnerId = option.id;
                                }
                            }
                        }
                    }
                });
            }

            this.rows = updatedRows;

            // Aggiorna lo stato visivo per tutte le celle corrette
            setTimeout(() => {
                updatedRows.forEach((otherRow, otherIndex) => {
                    const cell = this.template.querySelector(
                        `td[data-field="${field}"][data-row-index="${otherIndex}"]`
                    );
                    if (cell) {
                        this.updateCellValidationState(cell, otherRow, field);
                        // Aggiorna anche il contenuto della cella se necessario
                        const cellElement = field === 'invoiceNumber' && cell.querySelector('.invoice-number-value')
                            ? cell.querySelector('.invoice-number-value')
                            : cell;
                        if (oldValue && cellElement.textContent.trim().toLowerCase() === oldValue.trim().toLowerCase() &&
                            cellElement.textContent !== otherRow[field]) {
                            cellElement.textContent = otherRow[field] || '';
                        }
                        // Caso speciale: noProfitCategory spesso parte vuota, quindi la condizione su oldValue non scatta.
                        // Forziamo l'aggiornamento del DOM per allineare la cella (contenteditable) al modello dati.
                        if (field === 'noProfitCategory') {
                            const desired = otherRow.noProfitCategory || '';
                            if ((cellElement.textContent || '') !== desired) {
                                cellElement.textContent = desired;
                            }
                        }
                    }
                    
                    // Se è stato modificato comune, provincia o regione, aggiorna anche lo stato visivo degli altri due campi correlati
                    if ((field === 'comune' || field === 'provincia' || field === 'regione') && otherIndex === rowIndex) {
                        const comuneCell = this.template.querySelector(`td[data-field="comune"][data-row-index="${otherIndex}"]`);
                        const provinciaCell = this.template.querySelector(`td[data-field="provincia"][data-row-index="${otherIndex}"]`);
                        const regioneCell = this.template.querySelector(`td[data-field="regione"][data-row-index="${otherIndex}"]`);
                        
                        if (comuneCell) {
                            this.updateCellValidationState(comuneCell, otherRow, 'comune');
                        }
                        if (provinciaCell) {
                            this.updateCellValidationState(provinciaCell, otherRow, 'provincia');
                        }
                        if (regioneCell) {
                            this.updateCellValidationState(regioneCell, otherRow, 'regione');
                        }
                    }
                    
                    // NON aggiornare provincia e regione per altre righe quando comune viene modificato
                    // La correzione automatica per comune, provincia e regione è disabilitata
                    
                    // Aggiorna anche categoria ente se ente no profit è stato modificato
                    if (field === 'noProfit') {
                        const categoryCell = this.template.querySelector(
                            `td[data-field="noProfitCategory"][data-row-index="${otherIndex}"]`
                        );
                        if (categoryCell && otherRow.noProfitCategory) {
                            this.updateCellValidationState(categoryCell, otherRow, 'noProfitCategory');
                            if (categoryCell.textContent !== otherRow.noProfitCategory) {
                                categoryCell.textContent = otherRow.noProfitCategory;
                            }
                        }
                    }
                });
            }, 100);
        }

        // Chiudi il dropdown
        this.closeDropdown();
    }

    /**
     * Apre il dropdown per una cella specifica (metodo helper)
     */
    openDropdownForCell(cell, rowIndex, field) {
        if (!this.hasDropdown(field)) {
            return;
        }

        // Chiudi altri dropdown aperti
        this.closeDropdown();

        // Ottieni il valore corrente della cella
        const currentValue = this.rows[rowIndex] ? this.rows[rowIndex][field] || '' : '';

        // Apri il nuovo dropdown
        this.dropdownOpen = { rowIndex, field };
        this.dropdownFilter = currentValue.toString().trim();
        this.updateFilteredOptions();

        // Posiziona il dropdown
        setTimeout(() => {
            this.positionDropdown(cell);
            // Focus sul campo di ricerca
            const filterInput = this.template.querySelector('.dropdown-filter');
            if (filterInput) {
                filterInput.focus();
                filterInput.select();
            }
        }, 0);
    }

    /**
     * Gestisce il click fuori dal dropdown per chiuderlo
     */
    handleClickOutside(event) {
        // Gestisci chiusura dropdown
        if (this.dropdownOpen) {
            const dropdown = this.template.querySelector('.dropdown-menu');
            const cell = this.template.querySelector(
                `td[data-field="${this.dropdownOpen.field}"][data-row-index="${this.dropdownOpen.rowIndex}"]`
            );
            const filterInput = this.template.querySelector('.dropdown-filter');
            
            // Chiudi solo se il click è fuori dal dropdown, dalla cella e dal campo di ricerca
            if (dropdown && !dropdown.contains(event.target) && 
                cell && !cell.contains(event.target) &&
                filterInput && !filterInput.contains(event.target)) {
                this.closeDropdown();
            }
        }

        // Gestisci chiusura date picker
        if (this.datePickerOpen) {
            const dateInput = this.template.querySelector('.date-picker-input');
            const cell = this.template.querySelector(
                `td[data-field="${this.datePickerOpen.field}"][data-row-index="${this.datePickerOpen.rowIndex}"]`
            );
            
            // Chiudi solo se il click è fuori dall'input date e dalla cella
            if (dateInput && !dateInput.contains(event.target) && 
                cell && !cell.contains(event.target)) {
                this.closeDatePicker();
            }
        }
    }

    async connectedCallback() {
        // Aggiungi una riga vuota iniziale
        this.addRow();
        
        // Aggiungi listener per click fuori dal dropdown
        document.addEventListener('click', (event) => {
            this.handleClickOutside(event);
        });

        // Applica eventuali valori passati via Flow (API props) prima dell'inizializzazione
        this.applyIncomingContext({
            c__programId: this.programId,
            c__partnerBudgetId: this.partnerBudgetId
        });

        // Recupera l'Account Partner e i programmi enrolled (o usa valori già passati)
        await this.initializeProgramSelection();
    }

    async applyIncomingContext(state) {
        if (this._incomingContextApplied) return;
        const incomingProgramId = state?.c__programId || this.programId;
        const incomingBudgetId = state?.c__partnerBudgetId || this.partnerBudgetId;

        // Se arrivano valori dal Flow (anche se vuoti), segnaliamo che sono stati passati
        // Questo permette di nascondere la selezione perché il Flow ha già gestito la scelta
        if (state?.c__programId !== undefined || this.programId !== undefined) {
            // Valore passato dal Flow (può essere null se non selezionato, ma il Flow ha gestito la selezione)
            if (incomingProgramId) {
                this.selectedProgramId = incomingProgramId;
                // Carica i partner per il programma selezionato
                await this.loadPartnersForProgram(incomingProgramId);
            }
            // Nascondi la selezione programma perché il Flow l'ha già gestita
            this.showProgramSelection = false;
        }
        
        if (state?.c__partnerBudgetId !== undefined || this.partnerBudgetId !== undefined) {
            // Valore passato dal Flow (può essere null se non selezionato, ma il Flow ha gestito la selezione)
            if (incomingBudgetId) {
                this.selectedPartnerBudgetId = incomingBudgetId;
            }
            // Nascondi la selezione partner perché il Flow l'ha già gestita
            this.showPartnerSelection = false;
        }
        
        this._incomingContextApplied = true;
    }
    
    async initializeProgramSelection() {
        try {
            this.isLoadingPrograms = true;
            
            // Se abbiamo già un Programma (da Flow/URL), non mostrare la UI e passa al budget
            if (this.selectedProgramId) {
                this.showProgramSelection = false;
                // Carica i partner per il programma selezionato
                await this.loadPartnersForProgram(this.selectedProgramId);
                // Recupera l'Account Partner per il check del budget
                const partnerAccount = await getPartnerAccount();
                if (partnerAccount && partnerAccount.Id) {
                    this.partnerAccountId = partnerAccount.Id;
                }
                await this.checkPartnerSelection();
                return;
            }
            
            // Se la selezione è già stata nascosta dal Flow (valori passati anche se null),
            // non mostrare la UI e termina
            if (!this.showProgramSelection && (this.programId !== undefined || this.partnerBudgetId !== undefined)) {
                // Il Flow ha già gestito la selezione, anche se i valori sono null
                // Non mostrare la UI di selezione
                return;
            }
            
            // Recupera l'Account Partner
            const partnerAccount = await getPartnerAccount();
            if (!partnerAccount || !partnerAccount.Id) {
                this.showError('Impossibile recuperare l\'Account Partner. Verificare che User.CompanyName sia configurato correttamente.');
                return;
            }
            
            this.partnerAccountId = partnerAccount.Id;
            
            // Recupera i programmi enrolled
            const enrolledPrograms = await getEnrolledPrograms({ accountId: partnerAccount.Id });
            
            if (!enrolledPrograms || enrolledPrograms.length === 0) {
                this.showError('Nessun programma trovato per l\'Account Partner. Verificare i ProgramEnrollment attivi.');
                return;
            }
            
            // Aggiungi la proprietà variant a ogni programma
            this.programs = enrolledPrograms.map(program => ({
                ...program,
                variant: this.selectedProgramId == program.Id ? 'brand' : 'neutral'
            }));
            
            // Mostra la sezione di selezione programma solo se ci sono più programmi tra cui scegliere
            this.showProgramSelection = enrolledPrograms.length > 1;
            
            // Se c'è un solo programma, selezionalo automaticamente
            if (enrolledPrograms.length === 1) {
                await this.selectProgram(enrolledPrograms[0].Id, enrolledPrograms[0].Name);
                this.showProgramSelection = false;
            }
            
        } catch (error) {
            console.error('Errore nell\'inizializzazione della selezione programma:', error);
            this.showError('Errore nel recupero dei programmi: ' + (error.body ? error.body.message : error.message));
        } finally {
            this.isLoadingPrograms = false;
        }
    }
    
    async selectProgram(programId, programName) {
        this.selectedProgramId = programId;
        this.selectedProgramName = programName;
        
        // Aggiorna il variant di tutti i programmi
        if (this.programs && this.programs.length > 0) {
            this.programs = this.programs.map(program => ({
                ...program,
                variant: programId == program.Id ? 'brand' : 'neutral'
            }));
        }
        
        // Carica i partner (donatori) con Program Enrollment attivo per questo programma
        await this.loadPartnersForProgram(programId);
        
        // Verifica se serve selezionare un partner
        await this.checkPartnerSelection();
    }
    
    async loadPartnersForProgram(programId) {
        try {
            if (!programId) {
                console.log('[loadPartnersForProgram] programId non fornito, reset partners');
                this.partners = [];
                return;
            }
            
            console.log('[loadPartnersForProgram] Caricamento partner per programId:', programId);
            const partners = await getPartnersForProgram({ programId });
            this.partners = partners || [];
            console.log('[loadPartnersForProgram] Partner caricati:', this.partners.length);
            console.log('[loadPartnersForProgram] Lista partner:', this.partners.map(p => ({ Name: p.Name, Id: p.Id })));
            
            // Verifica se "Sorgenia" è nella lista
            const sorgeniaPartner = this.partners.find(p => p.Name && p.Name.toLowerCase().includes('sorgenia'));
            if (sorgeniaPartner) {
                console.log('[loadPartnersForProgram] Partner "Sorgenia" trovato:', { Name: sorgeniaPartner.Name, Id: sorgeniaPartner.Id });
            } else {
                console.log('[loadPartnersForProgram] Partner "Sorgenia" NON trovato nella lista');
            }
        } catch (error) {
            console.error('Errore nel caricamento dei partner:', error);
            this.partners = [];
        }
    }
    
    async checkPartnerSelection() {
        try {
            // Se abbiamo già un Budget (da Flow/URL), non mostrare la UI partner
            if (this.selectedPartnerBudgetId) {
                this.showPartnerSelection = false;
                return;
            }
            
            // Se la selezione è già stata nascosta dal Flow (valori passati anche se null),
            // non mostrare la UI partner
            if (!this.showPartnerSelection && (this.programId !== undefined || this.partnerBudgetId !== undefined)) {
                // Il Flow ha già gestito la selezione, anche se i valori sono null
                // Non mostrare la UI di selezione
                return;
            }

            this.isLoadingBudgets = true;
            
            // Verifica se serve selezionare un partner
            const budgetCheck = await checkBudgetForProgram({ 
                programId: this.selectedProgramId, 
                partnerAccountId: this.partnerAccountId 
            });
            
            if (budgetCheck.needsPartnerSelection) {
                // Recupera i budget disponibili per la selezione
                const budgets = await getAvailableBudgetsForProgram({ programId: this.selectedProgramId });
                // Aggiungi la proprietà variant a ogni budget
                this.availableBudgets = (budgets || []).map(budget => ({
                    ...budget,
                    variant: this.selectedPartnerBudgetId == budget.Id ? 'brand' : 'neutral'
                }));
                
                // Mostra la sezione di selezione partner solo se serve (non determinabile automaticamente)
                this.showPartnerSelection = true;
            } else {
                // Usa il budget trovato automaticamente
                this.selectedPartnerBudgetId = budgetCheck.budgetId;
                this.showPartnerSelection = false;
            }
            
        } catch (error) {
            console.error('Errore nella verifica del partner:', error);
            this.showError('Errore nella verifica del partner: ' + (error.body ? error.body.message : error.message));
        } finally {
            this.isLoadingBudgets = false;
        }
    }
    
    selectPartner(budgetId) {
        this.selectedPartnerBudgetId = budgetId;
        
        // Aggiorna il variant di tutti i budget
        if (this.availableBudgets && this.availableBudgets.length > 0) {
            this.availableBudgets = this.availableBudgets.map(budget => ({
                ...budget,
                variant: budgetId == budget.Id ? 'brand' : 'neutral'
            }));
        }
    }
    
    cancelPartnerSelection() {
        // Se l'utente annulla, usa il budget di default
        this.selectedPartnerBudgetId = null;
    }
    
    handleProgramSelect(event) {
        const programId = event.currentTarget.dataset.programId;
        const programName = event.currentTarget.dataset.programName;
        this.selectProgram(programId, programName);
    }
    
    handlePartnerSelect(event) {
        const budgetId = event.currentTarget.dataset.budgetId;
        this.selectPartner(budgetId);
    }
    
    getProgramVariant(programId) {
        return this.selectedProgramId == programId ? 'brand' : 'neutral';
    }
    
    getBudgetVariant(budgetId) {
        return this.selectedPartnerBudgetId == budgetId ? 'brand' : 'neutral';
    }
    
    renderedCallback() {
        // Formatta tutte le date ogni volta che il componente viene renderizzato
        // Questo assicura che le date siano sempre visualizzate correttamente
        if (this.rows && this.rows.length > 0) {
            setTimeout(() => {
                this.formatDatesInTable();
            }, 0);
        }
    }

    disconnectedCallback() {
        // Rimuovi listener quando il componente viene distrutto
        document.removeEventListener('click', this.handleClickOutside);
    }

    async saveAllInvoices() {
        // Valida le righe prima di salvare
        const validRows = this.rows.filter(row => !this.isRowEmpty(row));
        
        if (validRows.length === 0) {
            this.showError('Nessuna riga valida da salvare. Inserisci almeno i dati obbligatori.');
            return;
        }

        // Log dello stato delle righe prima di preparare i dati
        console.log('[saveAllInvoices] Stato righe prima di preparare i dati:');
        validRows.slice(0, 5).forEach((row, idx) => {
            console.log(`[saveAllInvoices] Riga ${idx + 1}:`, {
                partner: row.partner,
                partnerId: row.partnerId,
                partnerIdType: typeof row.partnerId,
                hasPartnerId: !!row.partnerId
            });
        });
        
        // Verifica se ci sono righe con partner ma senza partnerId
        const rowsWithPartnerButNoId = validRows.filter(row => row.partner && !row.partnerId);
        if (rowsWithPartnerButNoId.length > 0) {
            console.log(`[saveAllInvoices] ATTENZIONE: ${rowsWithPartnerButNoId.length} righe hanno partner ma NON hanno partnerId`);
            console.log('[saveAllInvoices] Esempi:', rowsWithPartnerButNoId.slice(0, 3).map(r => ({ partner: r.partner, partnerId: r.partnerId })));
            
            // Prova a trovare il partnerId per TUTTE queste righe
            let foundCount = 0;
            rowsWithPartnerButNoId.forEach(row => {
                if (row.partner && this.partners) {
                    const foundPartner = this.partners.find(p => p.Name && p.Name.toLowerCase() === row.partner.toLowerCase());
                    if (foundPartner && foundPartner.Id) {
                        row.partnerId = foundPartner.Id;
                        foundCount++;
                        console.log(`[saveAllInvoices] Partner "${row.partner}" trovato nella lista con ID:`, foundPartner.Id);
                    } else {
                        console.log(`[saveAllInvoices] Partner "${row.partner}" NON trovato nella lista`);
                        // Log per debug: mostra tutti i partner disponibili se il match non viene trovato
                        if (this.partners && this.partners.length > 0) {
                            console.log(`[saveAllInvoices] Partner disponibili (primi 10):`, this.partners.slice(0, 10).map(p => p.Name));
                        }
                    }
                }
            });
            console.log(`[saveAllInvoices] Recuperati ${foundCount} partnerId su ${rowsWithPartnerButNoId.length} righe`);
        }

        // Prepara i dati per il controller Apex
        const invoiceData = validRows.map((row, index) => {
            const rowData = {
                partner: row.partner || null,
                partnerId: (row.partnerId && row.partnerId.trim() !== '') ? row.partnerId : null,
                invoiceDate: row.invoiceDate || null,
                competenceDate: row.competenceDate || null,
                invoiceNumber: row.invoiceNumber || null,
                medicalCenter: row.medicalCenter || null,
                noProfit: row.noProfit || null,
                noProfitCategory: row.noProfitCategory || null,
                isFree: row.isFree || false,
                noInvoiceAvailable: row.noInvoiceAvailable || false,
                // Dati visite mediche
                tipoVisita: row.tipoVisita || null,
                tipoVisitaId: row.tipoVisitaId || null,
                beneficiaryType: row.beneficiaryType || null,
                numeroVisite: row.numeroVisite ? parseInt(row.numeroVisite, 10) : null,
                totaleMinuti: row.totaleMinuti ? parseInt(row.totaleMinuti, 10) : null,
                amount: row.amount ? parseFloat(row.amount.toString().replace(',', '.')) : null,
                dataVisita: row.dataVisita || null,
                comune: row.comune || null,
                provincia: row.provincia || null,
                regione: row.regione || null,
                comuneIsNew: row.comuneIsNew || false, // Flag per indicare se il comune è nuovo
                medicalCenterIsNew: row.medicalCenterIsNew || false, // Flag per indicare se il centro medico è nuovo
                noProfitIsNew: row.noProfitIsNew || false, // Flag per indicare se l'ente no profit è nuovo
                noProfitCategoryIsNew: row.noProfitCategoryIsNew || false, // Flag per indicare se la categoria ente è nuova
                tipoVisitaIsNew: row.tipoVisitaIsNew || false // Flag per indicare se il tipo visita è nuovo
            };
            console.log(`[saveAllInvoices] Riga ${index + 1} - partnerId:`, rowData.partnerId, 'partner:', rowData.partner);
            return rowData;
        });
        
        // Riepilogo partnerId
        const partnerIdCount = invoiceData.filter(d => d.partnerId != null).length;
        console.log(`[saveAllInvoices] Riepilogo: ${invoiceData.length} righe totali, ${partnerIdCount} con partnerId non null`);
        
        console.log('[saveAllInvoices] Dati preparati per Apex:', JSON.stringify(invoiceData, null, 2));

        // Attiva lo spinner
        this.isSaving = true;
        this.showResults = false;
        this.hasError = false;
        this.hasSuccess = false;

        try {
            console.log('[saveAllInvoices] Chiamata Apex con parametri:', {
                invoiceDataLength: invoiceData.length,
                programId: this.selectedProgramId,
                partnerBudgetId: this.selectedPartnerBudgetId,
                invoiceDataSample: invoiceData.slice(0, 2) // Mostra solo le prime 2 righe per non intasare la console
            });
            
            const result = await createInvoicesFromFlow({ 
                invoiceData: JSON.stringify(invoiceData),
                programId: this.selectedProgramId,
                partnerBudgetId: this.selectedPartnerBudgetId
            });
            
            console.log('[saveAllInvoices] Risultato Apex ricevuto:', result);
            
            // Disattiva lo spinner
            this.isSaving = false;
            
            // Processa i risultati dettagliati
            if (result.invoiceResults && result.invoiceResults.length > 0) {
                console.log('[saveAllInvoices] Processando risultati da Apex:', result.invoiceResults.length);
                console.log('[saveAllInvoices] Primi 3 risultati RAW da Apex:', result.invoiceResults.slice(0, 3));
                
                this.saveResults = result.invoiceResults.map((invoiceResult, index) => {
                    const status = invoiceResult.status || 'error';
                    const totalCost = invoiceResult.totalCost || 0;
                    
                    // Log dettagliato per ogni risultato
                    if (index < 5) { // Log solo i primi 5 per non intasare
                        console.log(`[saveAllInvoices] Risultato ${index} RAW da Apex:`, {
                            rowNumber: invoiceResult.rowNumber,
                            invoiceId: invoiceResult.invoiceId,
                            partnerId: invoiceResult.partnerId,
                            partnerIdType: typeof invoiceResult.partnerId,
                            status: invoiceResult.status
                        });
                    }
                    
                    const savedResult = {
                        id: `result-${index}`,
                        rowNumber: invoiceResult.rowNumber || index + 1,
                        invoiceId: invoiceResult.invoiceId || null,
                        invoiceName: invoiceResult.invoiceName || invoiceResult.invoiceId || null,
                        invoiceNumber: invoiceResult.invoiceNumber || '',
                        invoiceDate: invoiceResult.invoiceDate || '',
                        dataCompetenza: invoiceResult.dataCompetenza || '',
                        medicalCenter: invoiceResult.medicalCenter || '',
                        partnerName: invoiceResult.partnerName || '',
                        enteNoProfit: invoiceResult.enteNoProfit || '',
                        noProfitCategory: invoiceResult.noProfitCategory || '',
                        prestazioneGratuita: invoiceResult.prestazioneGratuita || false,
                        localita: invoiceResult.localita || '',
                        partnerId: invoiceResult.partnerId || null, // Salva partnerId per l'update massivo
                        status: status,
                        isSuccess: status === 'success',
                        errorMessage: invoiceResult.errorMessage || null,
                        visitsCreated: invoiceResult.visitsCreated || 0,
                        visitsFailed: invoiceResult.visitsFailed || 0,
                        visitError: invoiceResult.visitError || null,
                        totalQuantity: invoiceResult.totalQuantity || 0,
                        totalMinutes: invoiceResult.totalMinutes || 0,
                        totalCost: totalCost,
                        totalCostFormatted: this.formatCurrency(totalCost),
                        visitDetails: invoiceResult.visitDetails || [] // Dettagli delle visite create
                    };
                    
                    if (index < 5) { // Log solo i primi 5 per non intasare
                        console.log(`[saveAllInvoices] Risultato ${index} salvato in saveResults:`, {
                            rowNumber: savedResult.rowNumber,
                            invoiceId: savedResult.invoiceId,
                            partnerId: savedResult.partnerId,
                            partnerIdType: typeof savedResult.partnerId,
                            isSuccess: savedResult.isSuccess
                        });
                    }
                    
                    return savedResult;
                });
                
                // Riepilogo finale dei risultati salvati
                const partnerIdCount = this.saveResults.filter(r => r.partnerId).length;
                const nullPartnerIdCount = this.saveResults.filter(r => !r.partnerId).length;
                console.log('[saveAllInvoices] Riepilogo risultati salvati:');
                console.log('  - Totale risultati:', this.saveResults.length);
                console.log('  - Con partnerId:', partnerIdCount);
                console.log('  - Senza partnerId:', nullPartnerIdCount);
                console.log('[saveAllInvoices] Primi 5 risultati salvati:', this.saveResults.slice(0, 5).map(r => ({
                    rowNumber: r.rowNumber,
                    invoiceId: r.invoiceId,
                    partnerId: r.partnerId,
                    partnerIdType: typeof r.partnerId
                })));
                
                // Aggiorna organizedInvoices con i risultati del salvataggio
                this.updateOrganizedInvoicesWithSaveResults(this.saveResults);
                
                // Mantieni la vista organizzata visibile
                this.showOrganizedView = true;
                this.showResults = false;
                
                // Mostra un messaggio di riepilogo
                const successCount = this.saveResults.filter(r => r.status === 'success').length;
                const errorCount = this.saveResults.filter(r => r.status === 'error').length;
                if (successCount > 0) {
                    this.showSuccess(`${successCount} fattura/e creata/e con successo${errorCount > 0 ? ', ' + errorCount + ' con errori' : ''}.`);
                } else {
                    this.showError('Nessuna fattura creata. Verifica gli errori nella tabella dei risultati.');
                }
            } else {
                if (result.success) {
                    this.showSuccess(`Successo! ${result.createdCount} fattura/e creata/e.`);
                } else {
                    this.showError(result.errorMessage || 'Errore durante il salvataggio delle fatture.');
                }
            }
        } catch (error) {
            console.error('Errore nel salvataggio:', error);
            this.isSaving = false;
            this.showError('Errore durante il salvataggio: ' + (error.body?.message || error.message));
        }
    }
    
    /**
     * Aggiorna organizedInvoices con i risultati del salvataggio
     */
    updateOrganizedInvoicesWithSaveResults(saveResults) {
        // Crea una mappa dei risultati usando invoiceNumber come chiave
        const resultsMap = new Map();
        saveResults.forEach(result => {
            const invoiceNumber = result.invoiceNumber || '';
            if (invoiceNumber) {
                resultsMap.set(invoiceNumber, result);
            }
        });
        
        // Aggiorna ogni invoiceGroup con i risultati corrispondenti
        this.organizedInvoices = this.organizedInvoices.map(invoiceGroup => {
            const invoiceNumber = invoiceGroup.invoice.invoiceNumber;
            const saveResult = resultsMap.get(invoiceNumber);
            
            if (saveResult) {
                // Aggiorna lo stato della fattura
                const updatedInvoice = {
                    ...invoiceGroup.invoice,
                    saveStatus: saveResult.isSuccess ? 'success' : 'error',
                    saveStatusSuccess: saveResult.isSuccess === true, // Booleano per il template
                    saveErrorMessage: saveResult.errorMessage || null,
                    invoiceId: saveResult.invoiceId || null,
                    invoiceName: saveResult.invoiceName || null
                };
                
                // Funzione helper per normalizzare una stringa
                const normalizeString = (str) => (str || '').trim().toLowerCase();
                
                // Funzione helper per costruire localita normalizzata
                const buildNormalizedLocalita = (comune, provincia, regione) => {
                    let localita = normalizeString(comune);
                    const prov = normalizeString(provincia);
                    const reg = normalizeString(regione);
                    
                    if (prov) {
                        localita += localita ? ` (${prov}` : prov;
                        if (reg) {
                            localita += `, ${reg}`;
                        }
                        if (localita.includes('(')) {
                            localita += ')';
                        }
                    } else if (reg) {
                        localita += localita ? ` (${reg})` : reg;
                    }
                    return localita;
                };
                
                // Crea un array delle visite disponibili dal backend (non ancora assegnate)
                // Aggiungi anche l'indice originale per il matching
                const availableVisitDetails = (saveResult.visitDetails || []).map((vd, index) => ({
                    ...vd,
                    normalizedVisitType: normalizeString(vd.visitType),
                    normalizedBeneficiaryType: normalizeString(vd.beneficiaryType),
                    normalizedLocalita: normalizeString(vd.localita),
                    originalIndex: index, // Indice originale nell'array restituito dal backend
                    assigned: false
                }));
                
                // Traccia le visite già assegnate per evitare duplicati
                const assignedVisitIds = new Set();
                
                // Se il numero di visite corrisponde esattamente, usa matching per indice come strategia principale
                const useIndexMatching = invoiceGroup.visits.length === availableVisitDetails.length;
                
                // Aggiorna le visite con i loro stati
                const updatedVisits = invoiceGroup.visits.map((visit, visitIndex) => {
                    // Normalizza i valori della visita organizzata
                    const normalizedTipoVisita = normalizeString(visit.tipoVisita);
                    const normalizedBeneficiaryType = normalizeString(visit.beneficiaryType);
                    const normalizedLocalita = buildNormalizedLocalita(visit.comune, visit.provincia, visit.regione);
                    
                    let visitResult = null;
                    
                    // Strategia 1: Se il numero corrisponde esattamente, usa matching per indice (più affidabile)
                    if (useIndexMatching && visitIndex < availableVisitDetails.length) {
                        const candidateByIndex = availableVisitDetails[visitIndex];
                        if (candidateByIndex && !candidateByIndex.assigned && candidateByIndex.id) {
                            // Verifica che almeno tipoVisita e beneficiaryType corrispondano per sicurezza
                            const basicMatch = candidateByIndex.normalizedVisitType === normalizedTipoVisita &&
                                             candidateByIndex.normalizedBeneficiaryType === normalizedBeneficiaryType;
                            
                            // Se corrisponde perfettamente o almeno tipoVisita e beneficiaryType corrispondono
                            if (basicMatch) {
                                visitResult = candidateByIndex;
                            }
                        }
                    }
                    
                    // Strategia 2: Matching completo (tipoVisita + beneficiaryType + localita) - più preciso
                    if (!visitResult) {
                        for (const visitDetail of availableVisitDetails) {
                            if (visitDetail.assigned || assignedVisitIds.has(visitDetail.id)) continue;
                            
                            if (visitDetail.normalizedVisitType === normalizedTipoVisita &&
                                visitDetail.normalizedBeneficiaryType === normalizedBeneficiaryType &&
                                visitDetail.normalizedLocalita === normalizedLocalita) {
                                visitResult = visitDetail;
                                break;
                            }
                        }
                    }
                    
                    // Strategia 3: Matching per tipoVisita + localita (se comune/provincia/regione sono disponibili)
                    if (!visitResult && normalizedLocalita) {
                        for (const visitDetail of availableVisitDetails) {
                            if (visitDetail.assigned || assignedVisitIds.has(visitDetail.id)) continue;
                            
                            if (visitDetail.normalizedVisitType === normalizedTipoVisita &&
                                visitDetail.normalizedLocalita === normalizedLocalita) {
                                visitResult = visitDetail;
                                break;
                            }
                        }
                    }
                    
                    // Strategia 4: Matching per tipoVisita + beneficiaryType
                    if (!visitResult && normalizedTipoVisita && normalizedBeneficiaryType) {
                        for (const visitDetail of availableVisitDetails) {
                            if (visitDetail.assigned || assignedVisitIds.has(visitDetail.id)) continue;
                            
                            if (visitDetail.normalizedVisitType === normalizedTipoVisita &&
                                visitDetail.normalizedBeneficiaryType === normalizedBeneficiaryType) {
                                visitResult = visitDetail;
                                break;
                            }
                        }
                    }
                    
                    // Strategia 5: Se ancora non trovato e il numero corrisponde, usa l'indice come fallback assoluto
                    if (!visitResult && useIndexMatching && visitIndex < availableVisitDetails.length) {
                        const candidateByIndex = availableVisitDetails[visitIndex];
                        if (candidateByIndex && !candidateByIndex.assigned && candidateByIndex.id) {
                            visitResult = candidateByIndex;
                        }
                    }
                    
                    // Strategia 6: Ultimo tentativo - prendi la prima visita disponibile non assegnata
                    if (!visitResult) {
                        for (const visitDetail of availableVisitDetails) {
                            if (visitDetail.assigned || assignedVisitIds.has(visitDetail.id)) continue;
                            if (visitDetail.id) {
                                visitResult = visitDetail;
                                break;
                            }
                        }
                    }
                    
                    if (visitResult && visitResult.id) {
                        // Marca questa visita come assegnata
                        assignedVisitIds.add(visitResult.id);
                        visitResult.assigned = true;
                        
                        return {
                            ...visit,
                            saveStatus: 'success',
                            saveStatusSuccess: true,
                            saveErrorMessage: null,
                            visitId: visitResult.id,
                            visitName: visitResult.name || null
                        };
                    }
                    
                    // Se non c'è un risultato specifico, eredita lo stato della fattura
                    return {
                        ...visit,
                        saveStatus: saveResult.isSuccess ? 'success' : 'error',
                        saveStatusSuccess: saveResult.isSuccess === true,
                        saveErrorMessage: saveResult.visitError || saveResult.errorMessage || null
                    };
                });
                
                return {
                    ...invoiceGroup,
                    invoice: updatedInvoice,
                    visits: updatedVisits
                };
            }
            
            // Se non c'è un risultato per questa fattura, mantieni lo stato originale
            return invoiceGroup;
        });
    }
    
    /**
     * Apre un record Salesforce in un nuovo tab della console
     */
    async openInvoiceRecord(event) {
        const invoiceId = event.currentTarget.dataset.invoiceId;
        if (!invoiceId) return;
        
        try {
            await openTab({
                recordId: invoiceId,
                focus: true
            });
        } catch (error) {
            console.error('Errore nell\'apertura del record:', error);
            // Fallback: navigazione standard
            this[NavigationMixin.GenerateUrl]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: invoiceId,
                    actionName: 'view'
                }
            }).then(url => {
                window.open(url, '_blank');
            });
        }
    }
    
    showError(message) {
        this.hasError = true;
        this.errorMessage = message;
        this.hasSuccess = false;
        
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Errore',
                message: message,
                variant: 'error'
            })
        );
    }

    showSuccess(message) {
        this.hasSuccess = true;
        this.successMessage = message;
        this.hasError = false;
        
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Successo',
                message: message,
                variant: 'success'
            })
        );
    }
    
    /**
     * Organizza le fatture e le visite raggruppando per numero fattura
     */
    organizeInvoicesAndVisits() {
        // Filtra solo le righe che hanno almeno un numero fattura o una visita
        const validRows = this.rows.filter(row => {
            return row.invoiceNumber || row.tipoVisita || row.dataVisita;
        });
        
        if (validRows.length === 0) {
            this.showToast('Attenzione', 'Nessuna riga valida da organizzare', 'warning');
            return;
        }
        
        // Raggruppa per numero fattura
        const invoiceMap = new Map();
        
        validRows.forEach(row => {
            const invoiceNumber = row.invoiceNumber || 'Senza Numero Fattura';
            
            if (!invoiceMap.has(invoiceNumber)) {
                // Crea una nuova entry per questa fattura con errori di validazione
                const invoiceErrors = {
                    invoiceNumber: row.validationErrors && row.validationErrors.invoiceNumber === true,
                    invoiceDate: false, // Le date non hanno validazione specifica
                    medicalCenter: row.validationErrors && row.validationErrors.medicalCenter === true,
                    noProfit: row.validationErrors && row.validationErrors.noProfit === true,
                    noProfitCategory: row.validationErrors && row.validationErrors.noProfitCategory === true
                };
                
                invoiceMap.set(invoiceNumber, {
                    invoice: {
                        invoiceNumber: invoiceNumber,
                        invoiceDate: row.invoiceDate || '',
                        competenceDate: row.competenceDate || '',
                        partner: row.partner || '',
                        medicalCenter: row.medicalCenter || '',
                        noProfit: row.noProfit || '',
                        noProfitCategory: row.noProfitCategory || '',
                        amount: 0, // Sarà calcolato come somma delle visite
                        isFree: row.isFree || false,
                        noInvoiceAvailable: row.noInvoiceAvailable || false,
                        hasErrors: Object.values(invoiceErrors).some(err => err === true),
                        errors: invoiceErrors
                    },
                    visits: [],
                    totalVisitsAmount: 0,
                    totalVisitsMinutes: 0,
                    totalVisitsNumber: 0
                });
            }
            
            // Aggiorna gli errori della fattura aggregando da tutte le righe con lo stesso numero fattura
            const currentInvoice = invoiceMap.get(invoiceNumber);
            if (row.validationErrors) {
                // Aggrega gli errori: se almeno una riga ha un errore, la fattura ha quell'errore
                if (row.validationErrors.invoiceNumber === true) {
                    currentInvoice.invoice.errors.invoiceNumber = true;
                    currentInvoice.invoice.hasErrors = true;
                }
                if (row.validationErrors.medicalCenter === true) {
                    currentInvoice.invoice.errors.medicalCenter = true;
                    currentInvoice.invoice.hasErrors = true;
                }
                if (row.validationErrors.noProfit === true) {
                    currentInvoice.invoice.errors.noProfit = true;
                    currentInvoice.invoice.hasErrors = true;
                }
                if (row.validationErrors.noProfitCategory === true) {
                    currentInvoice.invoice.errors.noProfitCategory = true;
                    currentInvoice.invoice.hasErrors = true;
                }
            }
            
            // Aggiorna anche i valori della fattura se questa riga ha valori più completi
            if (row.invoiceDate && !currentInvoice.invoice.invoiceDate) {
                currentInvoice.invoice.invoiceDate = row.invoiceDate;
            }
            if (row.competenceDate && !currentInvoice.invoice.competenceDate) {
                currentInvoice.invoice.competenceDate = row.competenceDate;
            }
            if (row.partner && !currentInvoice.invoice.partner) {
                currentInvoice.invoice.partner = row.partner;
            }
            if (row.medicalCenter && !currentInvoice.invoice.medicalCenter) {
                currentInvoice.invoice.medicalCenter = row.medicalCenter;
            }
            if (row.noProfit && !currentInvoice.invoice.noProfit) {
                currentInvoice.invoice.noProfit = row.noProfit;
            }
            if (row.noProfitCategory && !currentInvoice.invoice.noProfitCategory) {
                currentInvoice.invoice.noProfitCategory = row.noProfitCategory;
            }
            
            // Aggiungi la visita se presente
            if (row.tipoVisita || row.dataVisita || row.beneficiaryType || row.comune) {
                const visitAmount = this.parseDecimal(row.amount) || 0;
                const visitMinutes = this.parseInteger(row.totaleMinuti) || 0;
                
                // Errori di validazione per la visita
                const visitErrors = {
                    tipoVisita: row.validationErrors && row.validationErrors.tipoVisita === true,
                    beneficiaryType: row.validationErrors && row.validationErrors.beneficiaryType === true,
                    dataVisita: false, // Le date non hanno validazione specifica
                    comune: row.validationErrors && row.validationErrors.comune === true,
                    provincia: row.validationErrors && row.validationErrors.provincia === true,
                    regione: row.validationErrors && row.validationErrors.regione === true
                };
                
                // Aggiungi un identificatore temporaneo basato sull'indice della riga per il matching
                const visitIndex = invoiceMap.get(invoiceNumber).visits.length;
                invoiceMap.get(invoiceNumber).visits.push({
                    id: `visit-${invoiceNumber}-${visitIndex}`,
                    tempIndex: visitIndex, // Indice temporaneo per il matching
                    rowIndex: row.rowNumber || rowIndex, // Indice della riga originale se disponibile
                    tipoVisita: row.tipoVisita || '',
                    beneficiaryType: row.beneficiaryType || '',
                    dataVisita: row.dataVisita ? this.formatDateForDisplay(row.dataVisita) : '',
                    comune: row.comune || '',
                    provincia: row.provincia || '',
                    regione: row.regione || '',
                    numeroVisite: row.numeroVisite || '',
                    totaleMinuti: row.totaleMinuti || '',
                    amount: visitAmount,
                    amountFormatted: this.formatCurrency(visitAmount),
                    hasErrors: Object.values(visitErrors).some(err => err === true),
                    errors: visitErrors
                });
                
                // Aggiorna i totali
                invoiceMap.get(invoiceNumber).totalVisitsAmount = 
                    (invoiceMap.get(invoiceNumber).totalVisitsAmount || 0) + visitAmount;
                invoiceMap.get(invoiceNumber).totalVisitsMinutes = 
                    (invoiceMap.get(invoiceNumber).totalVisitsMinutes || 0) + visitMinutes;
                const visitNumber = row.numeroVisite ? parseInt(row.numeroVisite, 10) : 0;
                invoiceMap.get(invoiceNumber).totalVisitsNumber = 
                    (invoiceMap.get(invoiceNumber).totalVisitsNumber || 0) + visitNumber;
            }
        });
        
        // Converti la Map in array e formatta i totali
        this.organizedInvoices = Array.from(invoiceMap.values()).map(invoiceGroup => {
            const totalAmount = invoiceGroup.totalVisitsAmount || 0;
            const totalMinutes = invoiceGroup.totalVisitsMinutes || 0;
            const totalNumber = invoiceGroup.totalVisitsNumber || 0;
            
            // Verifica se ci sono errori nelle visite
            const hasVisitErrors = invoiceGroup.visits && invoiceGroup.visits.some(visit => visit.hasErrors === true);
            
            // L'ammontare della fattura è la somma degli ammontari delle visite
            invoiceGroup.invoice.amount = totalAmount;
            invoiceGroup.invoice.amountFormatted = this.formatCurrency(totalAmount);
            
            return {
                ...invoiceGroup,
                totalVisitsAmount: totalAmount,
                totalVisitsAmountFormatted: this.formatCurrency(totalAmount),
                totalVisitsMinutes: totalMinutes,
                totalVisitsMinutesFormatted: totalMinutes.toLocaleString('it-IT'),
                totalVisitsNumber: totalNumber,
                totalVisitsNumberFormatted: totalNumber.toLocaleString('it-IT'),
                expanded: false, // Per gestire l'accordion
                hasVisitErrors: hasVisitErrors,
                visitsRowKey: `visits-header-${invoiceGroup.invoice.invoiceNumber}`, // ID univoco per la riga header delle visite
                visitsContentRowKey: `visits-content-${invoiceGroup.invoice.invoiceNumber}` // ID univoco per la riga contenuto delle visite
            };
        });
        this.showOrganizedView = true;
    }
    
    /**
     * Torna alla vista tabella originale
     */
    startNewEntry() {
        this.showOrganizedView = false;
        this.showResults = false;
        this.organizedInvoices = [];
        this.saveResults = [];
        this.rows = [];
        this.addRow();
        this.hasError = false;
        this.errorMessage = '';
        this.hasSuccess = false;
        this.successMessage = '';
        this.selectedRowIndex = -1;
    }
    
    backToTableView() {
        this.showOrganizedView = false;
        this.showResults = false;
        this.organizedInvoices = [];
        this.saveResults = [];
        // Dopo il rerender della tabella, ripristina i bordi rossi delle celle con errore
        setTimeout(() => {
            this.refreshValidationBordersInTable();
        }, 0);
    }
    
    /**
     * Resetta completamente la tabella per un nuovo caricamento
     */
    nuovoCaricamento() {
        // Chiudi eventuali dropdown o date picker aperti
        this.dropdownOpen = null;
        this.datePickerOpen = null;
        this.dropdownFilter = '';
        this.dropdownFilteredOptions = [];
        this.showConfirmButton = false;
        this.isConfirmingValue = false;
        
        // Resetta la vista organizzata
        this.showOrganizedView = false;
        this.showResults = false;
        this.organizedInvoices = [];
        this.saveResults = [];
        
        // Resetta messaggi di errore/successo
        this.hasError = false;
        this.errorMessage = '';
        this.hasSuccess = false;
        this.successMessage = '';
        
        // Resetta lo stato di salvataggio
        this.isSaving = false;
        this.isValidating = false;
        
        // Resetta l'indice della riga selezionata
        this.selectedRowIndex = -1;
        
        // Resetta il contatore delle righe
        this.nextRowId = 1;
        
        // Svuota completamente l'array delle righe
        this.rows = [];
        
        // Aggiungi una riga vuota iniziale
        this.addRow();
    }
    
    /**
     * Gestisce l'espansione/chiusura dell'accordion delle visite
     */
    toggleVisitsAccordion(event) {
        event.preventDefault();
        event.stopPropagation();
        const index = parseInt(event.currentTarget.dataset.index, 10);
        if (isNaN(index) || index < 0 || index >= this.organizedInvoices.length) {
            console.error('Invalid index:', index);
            return;
        }
        // Crea una copia profonda dell'array per forzare il re-render
        const updatedInvoices = this.organizedInvoices.map((invoice, i) => {
            if (i === index) {
                return {
                    ...invoice,
                    expanded: !invoice.expanded
                };
            }
            return invoice;
        });
        this.organizedInvoices = updatedInvoices;
    }
    
    /**
     * Formatta un numero come valuta
     */
    formatCurrency(value) {
        if (!value && value !== 0) return '';
        const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
        if (isNaN(num)) return value;
        return new Intl.NumberFormat('it-IT', { 
            style: 'currency', 
            currency: 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    }
}
