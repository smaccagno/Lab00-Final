import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import LightningConfirm from 'lightning/confirm';
import getPartnerAccounts from '@salesforce/apex/ConfigurazioniController.getPartnerAccounts';
import getFieldValues from '@salesforce/apex/ConfigurazioniController.getFieldValues';
import getConfigurationsByAccount from '@salesforce/apex/ConfigurazioniController.getConfigurationsByAccount';
import createConfiguration from '@salesforce/apex/ConfigurazioniController.createConfiguration';
import updateConfiguration from '@salesforce/apex/ConfigurazioniController.updateConfiguration';
import deleteConfiguration from '@salesforce/apex/ConfigurazioniController.deleteConfiguration';
import { refreshApex } from '@salesforce/apex';

const TYPE_OPTIONS = [
    { label: 'Funzionalità on/off', value: 'funzionalita_on_off' },
    { label: 'Valore di Default', value: 'valore_di_default' }
];

const FUNCTIONALITY_OPTIONS = [
    { label: 'Prestazione Gratuita', value: 'prestazione_gratuita' }
];

const DEFAULT_OBJECT_OPTIONS = [
    { label: 'Fattura', value: 'Invoice__c' },
    { label: 'Visita Medica', value: 'Visit__c' }
];

const DEFAULT_OBJECT_FIELDS = {
    Invoice__c: [
        { label: 'Centro Medico', value: 'Medical_Center__c' }
    ],
    Visit__c: []
};

const ON_OFF_OPTIONS = [
    { label: 'ON', value: 'true' },
    { label: 'OFF', value: 'false' }
];

const getPlaceholderOption = () => ({
    label: 'Seleziona...',
    value: ''
});

const withPlaceholder = (options = []) => [
    getPlaceholderOption(),
    ...options.map((option) => ({ ...option }))
];

const ROW_ACTIONS = [
    { label: 'Modifica', name: 'edit', iconName: 'utility:edit' },
    { label: 'Elimina', name: 'delete', iconName: 'utility:delete' }
];

const CONFIGURATION_COLUMNS = [
    { label: 'Nome', fieldName: 'Name' },
    { label: 'Account', fieldName: 'AccountName' },
    { label: 'Nome Configurazione', fieldName: 'Nome_Configurazione__c' },
    { label: 'Tipo Configurazione', fieldName: 'Tipo_Configurazione__c' },
    { label: 'Funzionalità', fieldName: 'Nome_Funzionalita__c' },
    { label: 'On/Off', fieldName: 'On_Off__c', type: 'boolean' },
    { label: 'Oggetto', fieldName: 'Object_Name__c' },
    { label: 'Campo', fieldName: 'Field_Name__c' },
    { label: 'Valore', fieldName: 'Valore__c' },
    { label: 'Attiva', fieldName: 'Attiva__c', type: 'boolean' },
    { type: 'action', typeAttributes: { rowActions: ROW_ACTIONS, menuAlignment: 'right' } }
];

export default class ConfigurazioniTypePicker extends LightningElement {
    configurationColumns = CONFIGURATION_COLUMNS;
    options = withPlaceholder(TYPE_OPTIONS);
    functionalityOptions = withPlaceholder(FUNCTIONALITY_OPTIONS);
    defaultObjectOptions = withPlaceholder(DEFAULT_OBJECT_OPTIONS);
    defaultFieldOptions = withPlaceholder();
    defaultValueOptions = withPlaceholder();
    onOffOptions = withPlaceholder(ON_OFF_OPTIONS);
    defaultValueOptionsLoaded = false;
    partnerOptions = withPlaceholder();
    configurations = [];
    configurationsLoading = false;
    configurationsError;
    wiredConfigurationsResult;
    isEditing = false;
    editingRecordId;

    selectedValue = '';
    selectedFunctionality = '';
    selectedOnOff = '';
    selectedDefaultObject = '';
    selectedDefaultField = '';
    selectedDefaultValue = '';
    selectedPartner = '';
    selectedActive = true;

    isSaving = false;
    isPartnerLoading = true;
    isDefaultValueLoading = false;
    defaultValueRequestKey = 0;
    _recordId;

    @api
    get recordId() {
        return this._recordId;
    }

    set recordId(value) {
        this._recordId = value;
        if (value) {
            this.configurationsLoading = true;
        }
        if (value && this.selectedPartner && this.selectedPartner !== value) {
            this.selectedPartner = '';
        }
        this.syncSelectedPartnerWithRecord();
    }

    @wire(getPartnerAccounts)
    wiredPartners({ data, error }) {
        if (data) {
            const partnerOptions = data.map((account) => ({
                label: account.Name,
                value: account.Id
            }));
            if (!partnerOptions.some((option) => option.value === this.selectedPartner)) {
                this.selectedPartner = '';
            }
            this.partnerOptions = withPlaceholder(partnerOptions);
            this.syncSelectedPartnerWithRecord();
            this.isPartnerLoading = false;
            if (this.showDefaultObjectPicker && this.selectedDefaultField) {
                this.loadDefaultValueOptions();
            }
        } else if (error) {
            this.partnerOptions = withPlaceholder();
            this.isPartnerLoading = false;
            this.showToast('Errore', this.getErrorMessage(error), 'error');
        }
    }

    @wire(getConfigurationsByAccount, { accountId: '$recordId' })
    wiredConfigurations(value) {
        this.wiredConfigurationsResult = value;
        const { data, error } = value;
        if (data) {
            this.configurations = data.map((record) => {
                const { attributes, Account__r, ...rest } = record;
                const accountName = Account__r ? Account__r.Name : null;
                return { ...rest, AccountName: accountName };
            });
            this.configurationsError = undefined;
            this.configurationsLoading = false;
        } else if (error) {
            this.configurations = [];
            this.configurationsError = this.getErrorMessage(error);
            this.configurationsLoading = false;
        } else {
            this.configurationsError = undefined;
            this.configurationsLoading = true;
        }
    }

    async handleRowAction(event) {
        const actionName = event.detail.action.name;
        const row = event.detail.row;

        try {
            if (actionName === 'edit') {
                await this.beginEditConfiguration(row);
            } else if (actionName === 'delete') {
                await this.confirmDeleteConfiguration(row);
            }
        } catch (error) {
            console.error('ConfigurazioniTypePicker.handleRowAction error', error);
            this.showToast('Errore', this.getErrorMessage(error), 'error');
        }
    }

    get showFunctionalityPicker() {
        return this.selectedValue === 'funzionalita_on_off';
    }

    get showDefaultObjectPicker() {
        return this.selectedValue === 'valore_di_default';
    }

    get hasDefaultFields() {
        return Array.isArray(this.defaultFieldOptions) && this.defaultFieldOptions.some((option) => option.value);
    }

    get showDefaultValuePicker() {
        return (
            this.showDefaultObjectPicker &&
            this.selectedDefaultField &&
            !this.isDefaultValueLoading &&
            this.defaultValueOptionsLoaded
        );
    }

    get showDefaultValueSpinner() {
        return (
            this.showDefaultObjectPicker &&
            this.selectedDefaultField &&
            this.isDefaultValueLoading
        );
    }

    get isCreateDisabled() {
        return this.isSaving || this.isPartnerLoading || this.isDefaultValueLoading;
    }

    get isDefaultValueDisabled() {
        return !Array.isArray(this.defaultValueOptions) || !this.defaultValueOptions.some((option) => option.value);
    }

    get defaultValuePlaceholder() {
        const hasOptions = Array.isArray(this.defaultValueOptions) && this.defaultValueOptions.some((option) => option.value);
        return hasOptions ? 'Seleziona...' : 'Nessun valore disponibile';
    }

    get isDefaultValueRequired() {
        return Array.isArray(this.defaultValueOptions) && this.defaultValueOptions.some((option) => option.value);
    }

    get showConfigurationsSection() {
        return Boolean(this.recordId);
    }

    get hasConfigurations() {
        return Array.isArray(this.configurations) && this.configurations.length > 0;
    }

    get showEmptyConfigurationsMessage() {
        return this.showConfigurationsSection && !this.configurationsLoading && !this.hasConfigurations && !this.configurationsError;
    }

    handlePartnerChange(event) {
        this.selectedPartner = event.detail.value;
        if (this.showDefaultObjectPicker && this.selectedDefaultField) {
            this.loadDefaultValueOptions();
        }
    }

    handleChange(event) {
        this.selectedValue = event.detail.value;
        this.dispatchConfigurationTypeChange();

        if (!this.selectedValue) {
            this.clearFunctionalitySelections();
            this.clearDefaultSelections();
            return;
        }

        if (this.showFunctionalityPicker) {
            const stillValid = this.functionalityOptions.some(
                (option) => option.value === this.selectedFunctionality && option.value
            );
            this.selectedFunctionality = stillValid ? this.selectedFunctionality : '';
            const onOffStillValid = this.onOffOptions.some(
                (option) => option.value === this.selectedOnOff && option.value
            );
            this.selectedOnOff = onOffStillValid ? this.selectedOnOff : '';
            this.dispatchFunctionalityChange();
            this.clearDefaultSelections();
            return;
        }

        this.clearFunctionalitySelections();

        if (this.showDefaultObjectPicker) {
            if (this.selectedDefaultObject) {
                this.updateDefaultFieldOptions();
            } else {
                this.clearDefaultSelections();
            }
            return;
        }

        this.clearDefaultSelections();
    }

    handleFunctionalityChange(event) {
        this.selectedFunctionality = event.detail.value;
        this.dispatchFunctionalityChange();

        if (!this.selectedFunctionality) {
            this.selectedOnOff = '';
        }
    }

    handleOnOffChange(event) {
        this.selectedOnOff = event.detail.value;
    }

    handleDefaultObjectChange(event) {
        this.setDefaultObject(event.detail.value);
    }

    handleDefaultFieldChange(event) {
        this.selectedDefaultField = event.detail.value;
        this.dispatchDefaultFieldChange();
        if (this.selectedDefaultField) {
            this.loadDefaultValueOptions();
        } else {
            this.clearDefaultValueSelections();
        }
    }

    handleDefaultValueChange(event) {
        this.selectedDefaultValue = event.detail.value;
        this.dispatchDefaultValueChange();
    }

    handleActiveChange(event) {
        this.selectedActive = Boolean(event.target?.checked);
    }

    async beginEditConfiguration(record) {
        if (!record || !record.Id) {
            return;
        }

        this.editingRecordId = record.Id;
        this.isEditing = true;
        this.selectedPartner = record.Account__c || '';
        const typeValue = this.getValueForLabel(TYPE_OPTIONS, record.Tipo_Configurazione__c);
        this.selectedValue = typeValue || '';
        this.dispatchConfigurationTypeChange();
        this.selectedActive = record.Attiva__c === true;

        if (this.showFunctionalityPicker) {
            this.selectedFunctionality = this.getValueForLabel(FUNCTIONALITY_OPTIONS, record.Nome_Funzionalita__c) || '';
            this.dispatchFunctionalityChange();
            if (record.On_Off__c === true) {
                this.selectedOnOff = 'true';
            } else if (record.On_Off__c === false) {
                this.selectedOnOff = 'false';
            } else {
                this.selectedOnOff = '';
            }
            this.clearDefaultSelections();
        } else if (this.showDefaultObjectPicker) {
            this.clearFunctionalitySelections();
            if (record.Object_Name__c) {
                this.setDefaultObject(record.Object_Name__c);
                if (record.Field_Name__c) {
                    this.selectedDefaultField = record.Field_Name__c;
                    this.dispatchDefaultFieldChange();
                    this.selectedDefaultValue = record.Valore__c || '';
                    await this.loadDefaultValueOptions();
                } else {
                    this.clearDefaultValueSelections();
                    this.selectedDefaultValue = record.Valore__c || '';
                    this.dispatchDefaultValueChange();
                }
            } else {
                this.clearDefaultSelections();
            }
        } else {
            this.clearFunctionalitySelections();
            this.clearDefaultSelections();
        }

        this.syncSelectedPartnerWithRecord();
    }

    async confirmDeleteConfiguration(record) {
        if (!record || !record.Id) {
            return;
        }

        const confirmed = await LightningConfirm.open({
            message: 'Sei sicuro di voler eliminare questa configurazione?',
            label: 'Conferma eliminazione'
        });

        if (!confirmed) {
            return;
        }

        this.isSaving = true;
        try {
            await deleteConfiguration({ configurationId: record.Id });
            this.showToast('Successo', 'Configurazione eliminata correttamente.', 'success');
            if (this.isEditing && this.editingRecordId === record.Id) {
                this.resetForm();
            }
            await this.refreshConfigurations();
        } catch (error) {
            this.showToast('Errore', this.getErrorMessage(error), 'error');
        } finally {
            this.isSaving = false;
        }
    }

    setDefaultObject(objectApiName) {
        this.selectedDefaultObject = objectApiName;
        this.dispatchDefaultObjectChange();
        this.updateDefaultFieldOptions();
    }

    updateDefaultFieldOptions() {
        const fields = DEFAULT_OBJECT_FIELDS[this.selectedDefaultObject] || [];
        this.defaultFieldOptions = withPlaceholder(fields);
        const previousField = this.selectedDefaultField;

        const stillAvailable = fields.some((field) => field.value === previousField);
        this.selectedDefaultField = stillAvailable ? previousField : '';

        this.dispatchDefaultFieldChange();

        if (this.showDefaultObjectPicker && this.selectedDefaultField) {
            this.loadDefaultValueOptions();
        } else {
            this.clearDefaultValueSelections();
        }
    }

    clearDefaultSelections() {
        this.selectedDefaultObject = '';
        this.defaultFieldOptions = withPlaceholder();
        this.selectedDefaultField = '';
        this.clearDefaultValueSelections();
        this.dispatchDefaultObjectChange();
        this.dispatchDefaultFieldChange();
    }

    clearDefaultValueSelections() {
        this.defaultValueRequestKey += 1;
        this.defaultValueOptions = withPlaceholder();
        this.selectedDefaultValue = '';
        this.defaultValueOptionsLoaded = false;
        this.isDefaultValueLoading = false;
        this.dispatchDefaultValueChange();
    }

    clearFunctionalitySelections() {
        this.selectedFunctionality = '';
        this.selectedOnOff = '';
        this.dispatchFunctionalityChange();
    }

    async loadDefaultValueOptions() {
        if (!this.showDefaultObjectPicker || !this.selectedDefaultObject || !this.selectedDefaultField) {
            this.clearDefaultValueSelections();
            return;
        }

        if (this.selectedDefaultObject === 'Invoice__c' && !this.selectedPartner) {
            this.clearDefaultValueSelections();
            return;
        }

        const requestKey = ++this.defaultValueRequestKey;
        this.isDefaultValueLoading = true;
        this.defaultValueOptionsLoaded = false;

        console.log('ConfigurazioniTypePicker.loadDefaultValueOptions params', {
            objectApiName: this.selectedDefaultObject,
            fieldApiName: this.selectedDefaultField,
            accountId: this.selectedPartner
        });

        try {
            const response = await getFieldValues({
                objectApiName: this.selectedDefaultObject,
                fieldApiName: this.selectedDefaultField,
                accountId: this.selectedPartner || null
            });

            console.log('ConfigurazioniTypePicker.loadDefaultValueOptions response', response);

            const values = response?.values || [];
            if (response?.query) {
                console.log('ConfigurazioniTypePicker.loadDefaultValueOptions executed query:', response.query);
            }

            if (requestKey !== this.defaultValueRequestKey) {
                return;
            }

            const baseOptions = (values || []).map((value) => ({
                label: value,
                value
            }));

            this.defaultValueOptions = withPlaceholder(baseOptions);
            this.defaultValueOptionsLoaded = true;

            const previousValue = this.selectedDefaultValue;
            const hasPrevious = previousValue && baseOptions.some((opt) => opt.value === previousValue);
            this.selectedDefaultValue = hasPrevious ? previousValue : '';
            this.dispatchDefaultValueChange();
        } catch (error) {
            if (requestKey === this.defaultValueRequestKey) {
                this.defaultValueOptions = withPlaceholder();
                this.selectedDefaultValue = '';
                this.defaultValueOptionsLoaded = true;
                this.dispatchDefaultValueChange();
                console.error('ConfigurazioniTypePicker.loadDefaultValueOptions error', error);
                this.showToast('Errore', this.getErrorMessage(error), 'error');
            }
        } finally {
            if (requestKey === this.defaultValueRequestKey) {
                this.isDefaultValueLoading = false;
            }
            console.log('ConfigurazioniTypePicker defaultValueOptions', this.defaultValueOptions);
        }
    }

    async handleCreateConfiguration() {
        if (this.isCreateDisabled) {
            return;
        }

        const payload = this.prepareSubmissionPayload();
        if (!payload) {
            return;
        }

        this.isSaving = true;

        try {
            const { active, ...createPayload } = payload;
            await createConfiguration(createPayload);
            this.showToast('Successo', 'Configurazione creata correttamente.', 'success');
            this.resetForm();
            await this.refreshConfigurations();
        } catch (error) {
            this.showToast('Errore', this.getErrorMessage(error), 'error');
        } finally {
            this.isSaving = false;
        }
    }

    async handleSaveConfiguration() {
        if (this.isCreateDisabled || !this.isEditing || !this.editingRecordId) {
            return;
        }

        const payload = this.prepareSubmissionPayload();
        if (!payload) {
            return;
        }

        this.isSaving = true;

        try {
            await updateConfiguration({ ...payload, configurationId: this.editingRecordId });
            this.showToast('Successo', 'Configurazione aggiornata correttamente.', 'success');
            this.resetForm();
            await this.refreshConfigurations();
        } catch (error) {
            this.showToast('Errore', this.getErrorMessage(error), 'error');
        } finally {
            this.isSaving = false;
        }
    }

    handleCancelEdit() {
        this.resetForm();
    }

    resetForm() {
        this.isEditing = false;
        this.editingRecordId = null;
        this.selectedValue = '';
        this.selectedPartner = '';
        this.clearFunctionalitySelections();
        this.clearDefaultSelections();
        this.dispatchConfigurationTypeChange();
        this.syncSelectedPartnerWithRecord();
        this.selectedActive = true;
    }

    dispatchConfigurationTypeChange() {
        this.dispatchEvent(
            new CustomEvent('configurationtypechange', {
                detail: this.selectedValue
            })
        );
    }

    dispatchFunctionalityChange() {
        this.dispatchEvent(
            new CustomEvent('functionalitychange', {
                detail: this.selectedFunctionality
            })
        );
    }

    dispatchDefaultObjectChange() {
        this.dispatchEvent(
            new CustomEvent('defaultobjectchange', {
                detail: this.selectedDefaultObject
            })
        );
    }

    dispatchDefaultFieldChange() {
        this.dispatchEvent(
            new CustomEvent('defaultfieldchange', {
                detail: this.selectedDefaultField
            })
        );
    }

    dispatchDefaultValueChange() {
        this.dispatchEvent(
            new CustomEvent('defaultvaluechange', {
                detail: this.selectedDefaultValue
            })
        );
    }

    getLabelForValue(options, value) {
        const option = options.find((opt) => opt.value === value);
        return option ? option.label : value;
    }

    composeConfigurationName(partnerLabel, typeLabel) {
        const safePartner = partnerLabel || '';
        const safeType = typeLabel || '';
        if (!safePartner && !safeType) {
            return '';
        }
        if (!safePartner) {
            return safeType;
        }
        if (!safeType) {
            return safePartner;
        }
        return `${safePartner} - ${safeType}`;
    }

    prepareSubmissionPayload() {
        if (!this.reportFormValidity()) {
            return null;
        }

        if (!this.selectedPartner || !this.selectedValue) {
            return null;
        }

        if (this.showFunctionalityPicker) {
            if (!this.selectedFunctionality || !this.selectedOnOff) {
                return null;
            }
        }

        if (this.showDefaultObjectPicker) {
            if (!this.selectedDefaultObject) {
                return null;
            }
            if (this.hasDefaultFields && !this.selectedDefaultField) {
                return null;
            }
            if (this.isDefaultValueRequired && !this.selectedDefaultValue) {
                return null;
            }
        }

        const configurationTypeLabel = this.getLabelForValue(TYPE_OPTIONS, this.selectedValue);
        const partnerLabel = this.getLabelForValue(this.partnerOptions, this.selectedPartner);
        const functionalityLabel = this.showFunctionalityPicker && this.selectedFunctionality
            ? this.getLabelForValue(FUNCTIONALITY_OPTIONS, this.selectedFunctionality)
            : null;

        return {
            accountId: this.selectedPartner,
            configurationTypeLabel,
            configurationName: this.composeConfigurationName(partnerLabel, configurationTypeLabel),
            functionalityName: functionalityLabel,
            objectApiName: this.showDefaultObjectPicker ? this.selectedDefaultObject || null : null,
            fieldApiName: this.showDefaultObjectPicker ? this.selectedDefaultField || null : null,
            defaultValue: this.showDefaultObjectPicker ? this.selectedDefaultValue || null : null,
            onOff: this.showFunctionalityPicker ? this.selectedOnOff === 'true' : null,
            active: this.selectedActive
        };
    }

    getValueForLabel(options, label) {
        if (!label) {
            return '';
        }

        const option = options.find((opt) => opt.label === label);
        return option ? option.value : '';
    }

    getErrorMessage(error) {
        if (!error) {
            return 'Si è verificato un errore sconosciuto.';
        }
        if (Array.isArray(error.body)) {
            return error.body.map((e) => e.message).join(', ');
        }
        if (error.body && typeof error.body.message === 'string') {
            return error.body.message;
        }
        if (typeof error.message === 'string') {
            return error.message;
        }
        return 'Si è verificato un errore.';
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

    reportFormValidity() {
        const requiredFields = this.template.querySelectorAll('[data-required-field]');
        let isValid = true;

        requiredFields.forEach((field) => {
            if (typeof field.reportValidity !== 'function') {
                return;
            }

            if (!field.checkValidity()) {
                field.reportValidity();
                isValid = false;
            }
        });

        return isValid;
    }

    syncSelectedPartnerWithRecord() {
        if (!this.recordId || !Array.isArray(this.partnerOptions) || !this.partnerOptions.length) {
            return;
        }

        if (this.selectedPartner) {
            return;
        }

        const matchingOption = this.partnerOptions.find((option) => option.value === this.recordId);
        if (matchingOption) {
            this.selectedPartner = matchingOption.value;
        }
    }

    async refreshConfigurations() {
        if (!this.wiredConfigurationsResult) {
            return;
        }

        try {
            await refreshApex(this.wiredConfigurationsResult);
        } catch (error) {
            console.error('ConfigurazioniTypePicker.refreshConfigurations error', error);
        }
    }
}