import { LightningElement, api, track } from 'lwc';
import { FlowAttributeChangeEvent, FlowNavigationNextEvent } from 'lightning/flowSupport';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import fetchStructures from '@salesforce/apex/StructureSelectionService.fetchStructures';
import fetchStructureTypes from '@salesforce/apex/StructureSelectionService.fetchStructureTypes';
import fetchComuni from '@salesforce/apex/StructureSelectionService.fetchComuni';
import createSubStructures from '@salesforce/apex/StructureSelectionService.createSubStructures';

const FIELD_NAME = 'name';
const FIELD_TYPE = 'typeValue';
const FIELD_COMUNE = 'comuneId';

export default class FornitoreStructurePicker extends LightningElement {
    @track fornitoreOptions = [];
    @track subStructureOptions = [];
    @track newStructureRows = [];

    labelFornitoreInternal = 'Fornitore';
    labelStrutturaInternal = 'Struttura';

    structureTypeOptions = [];
    comuneOptions = [];

    structuresMap = new Map();
    _structureRecordTypeId;
    _selectedFornitoreId;
    _selectedSubStructureId;
    _forcedFornitoreId;
    isLoading = false;
    isSavingStructures = false;
    errorMessage;
    creationErrorMessage;
    pendingFetchKey;
    structureOnlyMessageInternal = '';
    supportingDataLoaded = false;
    newStructureKeyCounter = 0;
    _creaNuovoFornitoreOutput = false;
    _initialFornitoreProvided = false;

    @api
    get structureRecordTypeId() {
        return this._structureRecordTypeId;
    }

    set structureRecordTypeId(value) {
        if (value === this._structureRecordTypeId) {
            return;
        }
        this._structureRecordTypeId = value;
        this.loadData();
    }

    @api
    get labelFornitore() {
        return this.labelFornitoreInternal;
    }

    set labelFornitore(value) {
        this.labelFornitoreInternal = value || 'Fornitore';
    }

    @api
    get labelStruttura() {
        return this.labelStrutturaInternal;
    }

    set labelStruttura(value) {
        this.labelStrutturaInternal = value || 'Struttura';
    }

    @api
    get selectedFornitoreId() {
        return this._selectedFornitoreId;
    }

    @api
    get selectedSubStructureId() {
        return this._selectedSubStructureId;
    }

    @api
    get initialFornitoreId() {
        return this._selectedFornitoreId;
    }

    set initialFornitoreId(value) {
        const normalizedValue = value || null;
        this._initialFornitoreProvided = !!normalizedValue;
        this._selectedFornitoreId = normalizedValue;
        this.updateSubStructureOptions();
    }

    @api
    get initialSubStructureId() {
        return this._selectedSubStructureId;
    }

    set initialSubStructureId(value) {
        this._selectedSubStructureId = value || null;
        this.updateSubStructureOptions();
    }

    @api
    get crea_nuovo_fornitore_output() {
        return this._creaNuovoFornitoreOutput;
    }

    set crea_nuovo_fornitore_output(value) {
        this._creaNuovoFornitoreOutput = !!value;
    }

    @api
    get forcedFornitoreId() {
        return this._forcedFornitoreId;
    }

    set forcedFornitoreId(value) {
        const normalizedValue = value || null;
        if (normalizedValue === this._forcedFornitoreId) {
            return;
        }
        const shouldResetSelection =
            !!normalizedValue && this._selectedFornitoreId && this._selectedFornitoreId !== normalizedValue;
        this._forcedFornitoreId = normalizedValue;
        if (normalizedValue) {
            this._selectedFornitoreId = normalizedValue;
        }
        this.newStructureRows = [];
        this.creationErrorMessage = undefined;
        this.updateSubStructureOptions(shouldResetSelection);
    }

    @api
    get structureOnlyMessage() {
        return this.structureOnlyMessageInternal;
    }

    set structureOnlyMessage(value) {
        this.structureOnlyMessageInternal = value || '';
    }

    connectedCallback() {
        this.initializeSupportingData();
        this.loadData();
    }

    async initializeSupportingData() {
        try {
            const [types, comuni] = await Promise.all([
                fetchStructureTypes(),
                fetchComuni()
            ]);
            console.log(
                '[FornitoreStructurePicker] Picklist structure types ricevuti:',
                JSON.stringify(types)
            );
            console.log(
                '[FornitoreStructurePicker] Comuni ricevuti:',
                JSON.stringify(comuni)
            );
            this.structureTypeOptions = (types || []).map((type) => ({ label: type.label, value: type.value }));
            this.comuneOptions = (comuni || []).map((comune) => ({ label: comune.name, value: comune.id }));
            this.supportingDataLoaded = true;
            this.updateSubStructureOptions();
        } catch (error) {
            this.creationErrorMessage = this.normalizeError(error);
            this.supportingDataLoaded = false;
        }
    }

    async loadData() {
        if (!this._structureRecordTypeId) {
            this.structuresMap.clear();
            this.fornitoreOptions = [];
            this.subStructureOptions = [];
            this.newStructureRows = [];
            return;
        }

        const fetchKey = this._structureRecordTypeId;
        this.pendingFetchKey = fetchKey;
        this.isLoading = true;
        this.errorMessage = undefined;

        try {
            const data = await fetchStructures({ structureRecordTypeId: this._structureRecordTypeId });
            if (this.pendingFetchKey !== fetchKey) {
                return;
            }
            this.structuresMap = new Map();
            console.log(
                '[FornitoreStructurePicker] Fornitori caricati:',
                JSON.stringify(data)
            );
            this.fornitoreOptions = (data || []).map((structure) => {
                this.structuresMap.set(structure.id, {
                    name: structure.name,
                    subStructures: (structure.subStructures || []).map((sub) => ({
                        id: sub.id,
                        name: sub.name,
                        typeValue: sub.typeValue,
                        address: sub.address,
                        comuneId: sub.comuneId,
                        comuneName: sub.comuneName
                    }))
                });
                return {
                    label: structure.name,
                    value: structure.id
                };
            });

            if (this._forcedFornitoreId) {
                if (this.structuresMap.has(this._forcedFornitoreId)) {
                    this._selectedFornitoreId = this._forcedFornitoreId;
                } else {
                    this.errorMessage = 'Il fornitore fornito in input non è valido.';
                    this._selectedFornitoreId = null;
                }
            } else if (this._selectedFornitoreId && !this.structuresMap.has(this._selectedFornitoreId)) {
                this._selectedFornitoreId = null;
            }

            this.updateSubStructureOptions();
        } catch (error) {
            this.errorMessage = this.normalizeError(error);
            this.structuresMap.clear();
            this.fornitoreOptions = [];
            this.subStructureOptions = [];
            this._selectedFornitoreId = null;
            this._selectedSubStructureId = null;
        } finally {
            if (this.pendingFetchKey === fetchKey) {
                this.isLoading = false;
            }
        }
    }

    updateSubStructureOptions(resetSelection = false) {
        const structureData = this.structuresMap.get(this._selectedFornitoreId);
        const rawSubStructures = structureData && structureData.subStructures
            ? structureData.subStructures
            : [];
        this.subStructureOptions = rawSubStructures.map((sub) => ({
            label: this.buildSubStructureLabelFromData(sub),
            value: sub.id
        }));
        console.log(
            '[FornitoreStructurePicker] Aggiornamento sub-strutture',
            {
                selectedFornitoreId: this._selectedFornitoreId,
                resetSelection,
                subStructureOptions: this.subStructureOptions
            }
        );

        const hasCurrentSelection = rawSubStructures.some((sub) => sub.id === this._selectedSubStructureId);
        if (resetSelection || (!hasCurrentSelection && rawSubStructures.length > 0)) {
            this._selectedSubStructureId = null;
        }
        if (this.subStructureOptions.length === 0) {
            this._selectedSubStructureId = null;
        }

        if (this.subStructureOptions.length > 0) {
            this.newStructureRows = [];
            this.creationErrorMessage = undefined;
        }

        this.dispatchAttributeChange('selectedSubStructureId', this._selectedSubStructureId);
        this.dispatchAttributeChange('selectedFornitoreId', this._selectedFornitoreId);
    }

    handleFornitoreChange(event) {
        if (this.isFornitoreLocked) {
            return;
        }
        this._selectedFornitoreId = event.detail.value || null;
        this.newStructureRows = [];
        this.creationErrorMessage = undefined;
        this.updateCreateNewFornitoreOutput(false);
        this.updateSubStructureOptions(true);
    }

    handleSubStructureChange(event) {
        this._selectedSubStructureId = event.detail.value || null;
        this.dispatchAttributeChange('selectedSubStructureId', this._selectedSubStructureId);
    }

    handleAddStructureRow() {
        if (!this.canAddStructureRow) {
            return;
        }
        const key = `row_${this.newStructureKeyCounter++}`;
        const newRow = {
            key,
            name: '',
            typeValue: '',
            comuneId: '',
            address: ''
        };
        this.newStructureRows = [...this.newStructureRows, newRow];
        this.creationErrorMessage = undefined;
    }

    handleRemoveStructureRow(event) {
        const key = event.currentTarget.dataset.key;
        this.newStructureRows = this.newStructureRows.filter((row) => row.key !== key);
        this.creationErrorMessage = undefined;
    }

    handleNewStructureValueChange(event) {
        const { key, field } = event.target.dataset;
        if (!key || !field) {
            return;
        }
        let value = event.detail && event.detail.value !== undefined
            ? event.detail.value
            : event.target.value;

        if (field === FIELD_TYPE) {
            value = this.resolveStructureTypeValue(value);
        }
        this.newStructureRows = this.newStructureRows.map((row) => {
            if (row.key === key) {
                return { ...row, [field]: value };
            }
            return row;
        });
        console.log(
            '[FornitoreStructurePicker] Campo riga modificato',
            { key, field, value }
        );
        event.target.setCustomValidity('');
        event.target.reportValidity();
        this.creationErrorMessage = undefined;
    }

    async handleSaveStructures() {
        this.creationErrorMessage = undefined;

        if (!this._selectedFornitoreId) {
            this.creationErrorMessage = 'Seleziona un fornitore prima di creare una struttura.';
            return;
        }
        if (!this.hasNewStructureRows) {
            this.creationErrorMessage = 'Aggiungi almeno una struttura da salvare.';
            return;
        }

        let hasErrors = false;
        this.newStructureRows.forEach((row) => {
            hasErrors = this.validateRowField(row.key, FIELD_NAME, row.name, 'Nome struttura obbligatorio.') || hasErrors;
            hasErrors = this.validateRowField(row.key, FIELD_TYPE, row.typeValue, 'Tipo struttura obbligatorio.') || hasErrors;
            hasErrors = this.validateRowField(row.key, FIELD_COMUNE, row.comuneId, 'Comune obbligatorio.') || hasErrors;
        });

        if (hasErrors) {
            this.creationErrorMessage = 'Correggi gli errori evidenziati prima di salvare.';
            return;
        }

        const payload = this.newStructureRows.map((row) => ({
            name: row.name ? row.name.trim() : null,
            typeValue: this.resolveStructureTypeValue(row.typeValue),
            comuneId: row.comuneId,
            address: row.address ? row.address.trim() : null
        }));
        console.log(
            '[FornitoreStructurePicker] Payload pronto per la creazione sub-strutture',
            JSON.stringify(payload)
        );

        this.isSavingStructures = true;
        try {
            const createdIds = await createSubStructures({
                structureId: this._selectedFornitoreId,
                newStructures: payload
            });
            console.log(
                '[FornitoreStructurePicker] Risposta creazione sub-strutture',
                JSON.stringify(createdIds)
            );
            const newlyCreatedRawData = this.buildJustCreatedRawData(createdIds, payload);
            if (newlyCreatedRawData.length > 0) {
                const structureEntry =
                    this.structuresMap.get(this._selectedFornitoreId) || {
                        name: this.getStructureLabel(this._selectedFornitoreId),
                        subStructures: []
                    };
                const updatedSubStructures = [
                    ...(structureEntry.subStructures || []),
                    ...newlyCreatedRawData
                ];
                this.structuresMap.set(this._selectedFornitoreId, {
                    ...structureEntry,
                    subStructures: updatedSubStructures
                });
                this._selectedSubStructureId = newlyCreatedRawData[0].id;
                this.updateSubStructureOptions(false);
            } else {
                this.updateSubStructureOptions(false);
            }
            this.newStructureRows = [];
            this.creationErrorMessage = undefined;
            this.showToast('Successo', 'Strutture create correttamente.', 'success');
        } catch (error) {
            const message = this.normalizeError(error);
            this.creationErrorMessage = message;
            this.showToast('Errore', message, 'error');
        } finally {
            this.isSavingStructures = false;
        }
    }

    validateRowField(key, field, value, message) {
        const input = this.template.querySelector(`[data-field="${field}"][data-key="${key}"]`);
        if (!input) {
            return false;
        }
        if (!value || (typeof value === 'string' && !value.trim())) {
            input.setCustomValidity(message);
            input.reportValidity();
            return true;
        }
        input.setCustomValidity('');
        input.reportValidity();
        return false;
    }

    get isSubStructureDisabled() {
        return this.subStructureOptions.length === 0;
    }

    get isFornitoreLocked() {
        return !!this._forcedFornitoreId;
    }

    get showFornitoreSelector() {
        return !this.isFornitoreLocked;
    }

    get showStructureOnlyMessage() {
        return this.isFornitoreLocked && !!this.structureOnlyMessageInternal;
    }

    get shouldShowCreationUi() {
        return !!this._selectedFornitoreId;
    }

    get creationMessage() {
        if (this.subStructureOptions.length > 0) {
            return 'Aggiungi nuove strutture al fornitore selezionato';
        }
        return 'Non sono presenti strutture per il fornitore selezionato.';
    }

    get canAddStructureRow() {
        return this.supportingDataLoaded && !!this._selectedFornitoreId && !this.isSavingStructures;
    }

    get hasNewStructureRows() {
        return this.newStructureRows.length > 0;
    }

    get isAddStructureDisabled() {
        return !this.canAddStructureRow;
    }

    get isSaveDisabled() {
        return !this.hasNewStructureRows || this.isSavingStructures;
    }

    get showSpinner() {
        return this.isLoading || this.isSavingStructures;
    }

    get proceedDisabled() {
        return this.isLoading || this.isSavingStructures || !this._selectedSubStructureId;
    }

    get showCreateNewFornitoreButton() {
        return !this.isFornitoreLocked && !this._initialFornitoreProvided;
    }

    get createNewFornitoreDisabled() {
        return this.isLoading || this.isSavingStructures;
    }

    resolveStructureTypeValue(rawValue) {
        if (!rawValue) {
            return null;
        }

        console.log('[FornitoreStructurePicker] Risoluzione tipo struttura', rawValue);
        let match = this.structureTypeOptions.find((option) => option.value === rawValue);
        if (match) {
            return match.value;
        }

        match = this.structureTypeOptions.find((option) => option.label === rawValue);
        return match ? match.value : rawValue;
    }

    buildJustCreatedRawData(createdIds, payload) {
        if (!createdIds || createdIds.length === 0) {
            return [];
        }

        return createdIds.map((id, index) => {
            const relatedPayload = Array.isArray(payload) ? payload[index] : null;
            const name = relatedPayload && relatedPayload.name ? relatedPayload.name : 'Nuova struttura';
            const typeValue = relatedPayload ? relatedPayload.typeValue : null;
            const address = relatedPayload && relatedPayload.address ? relatedPayload.address : null;
            const comuneId = relatedPayload ? relatedPayload.comuneId : null;
            const comuneName = this.getComuneLabel(comuneId) || '';
            return {
                id,
                name,
                typeValue,
                address,
                comuneId,
                comuneName
            };
        });
    }

    getStructureLabel(structureId) {
        const existingOption = this.fornitoreOptions.find((option) => option.value === structureId);
        return existingOption ? existingOption.label : '';
    }

    getStructureTypeLabel(value) {
        if (!value) {
            return '';
        }

        const match = this.structureTypeOptions.find((option) => option.value === value);
        if (match) {
            return match.label;
        }

        return value;
    }

    getComuneLabel(comuneId) {
        if (!comuneId) {
            return '';
        }

        const match = this.comuneOptions.find((option) => option.value === comuneId);
        return match ? match.label : '';
    }

    buildSubStructureLabelFromData(sub) {
        if (!sub) {
            return '';
        }

        const typeLabel = this.getStructureTypeLabel(sub.typeValue);
        const baseParts = [];
        if (typeLabel) {
            baseParts.push(typeLabel);
        }
        if (sub.name) {
            baseParts.push(sub.name);
        }
        let label = baseParts.join(' ');
        const comuneLabel = sub.comuneName || this.getComuneLabel(sub.comuneId);
        const address = sub.address;

        if (address && comuneLabel) {
            label = `${label} - ${address}, ${comuneLabel}`;
        } else if (address) {
            label = `${label} - ${address}`;
        } else if (comuneLabel) {
            label = `${label}, ${comuneLabel}`;
        }

        if (!label) {
            return 'Struttura';
        }

        return label;
    }

    handleProceed() {
        this.updateCreateNewFornitoreOutput(false);
        if (this.proceedDisabled) {
            this.creationErrorMessage = 'Seleziona una struttura prima di proseguire.';
            return;
        }
        this.dispatchEvent(new FlowNavigationNextEvent());
    }

    handleCreateNewFornitore() {
        if (this.createNewFornitoreDisabled) {
            return;
        }
        this.updateCreateNewFornitoreOutput(true);
        this.dispatchEvent(new FlowNavigationNextEvent());
    }

    @api
    validate() {
        if (this._creaNuovoFornitoreOutput) {
            return { isValid: true };
        }
        if (this.isLoading || this.isSavingStructures) {
            return { isValid: false, errorMessage: 'Attendere il completamento delle operazioni in corso.' };
        }
        if (this.errorMessage) {
            return { isValid: false, errorMessage: this.errorMessage };
        }
        if (!this._selectedFornitoreId) {
            return { isValid: false, errorMessage: 'Seleziona un fornitore.' };
        }
        if (this.shouldShowCreationUi && this.hasNewStructureRows) {
            return { isValid: false, errorMessage: 'Salva o rimuovi le strutture aggiunte prima di proseguire.' };
        }
        if (!this._selectedSubStructureId && this.subStructureOptions.length > 0) {
            return { isValid: false, errorMessage: 'Seleziona una struttura.' };
        }
        return { isValid: true };
    }

    updateCreateNewFornitoreOutput(value) {
        const normalized = !!value;
        this._creaNuovoFornitoreOutput = normalized;
        this.dispatchAttributeChange('crea_nuovo_fornitore_output', normalized);
    }

    dispatchAttributeChange(attributeName, value) {
        this.dispatchEvent(new FlowAttributeChangeEvent(attributeName, value));
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

    normalizeError(error) {
        if (!error) {
            return 'Si è verificato un errore sconosciuto.';
        }
        if (Array.isArray(error.body)) {
            return error.body.map((entry) => entry.message).join(' ');
        }
        if (error.body && error.body.message) {
            return error.body.message;
        }
        if (error.message) {
            return error.message;
        }
        return 'Si è verificato un errore.';
    }
}