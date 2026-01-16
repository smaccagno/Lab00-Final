import { LightningElement, api, wire, track } from 'lwc';
import getMedicalCenters from '@salesforce/apex/InvoiceCreationController.getMedicalCenters';

export default class MedicalCenter extends LightningElement {
    @track medicalCenters = [];
    @track filteredSuggestions = [];

    dropdownStyle = 'display: none;';
    showErrorMessage = false;
    isInputValid = true;
    isClickingSuggestion = false;

    _selectedMedicalCenter = '';
    inputValue = '';
    debugEnabled = true;

    @api
    get selectedMedicalCenter() {
        return this._selectedMedicalCenter;
    }

    set selectedMedicalCenter(value) {
        this._selectedMedicalCenter = value || '';
        this.inputValue = this._selectedMedicalCenter;
        this.dropdownStyle = 'display: none;';
        this.filteredSuggestions = [];
        this.showErrorMessage = false;
        this.isInputValid = this._selectedMedicalCenter.length > 0;
        this.log('setter:selectedMedicalCenter', {
            value: this._selectedMedicalCenter,
            inputValue: this.inputValue
        });

        const selectedEvent = new CustomEvent('valuechange', {
            detail: { selectedMedicalCenter: this._selectedMedicalCenter }
        });
        this.dispatchEvent(selectedEvent);
        this.log('setter:selectedMedicalCenter dispatch valuechange', selectedEvent.detail);
    }

    get inputClass() {
        return `no-padding-input ${this.isInputValid ? '' : 'slds-has-error'}`.trim();
    }

    @wire(getMedicalCenters)
    wiredMedicalCenters({ error, data }) {
        if (data) {
            this.medicalCenters = Array.isArray(data)
                ? Array.from(
                    new Set(
                        data
                            .map(center => (center || '').trim())
                            .filter(center => center.length)
                    )
                )
                : [];

            this.log('wire:getMedicalCenters success', {
                rawCount: Array.isArray(data) ? data.length : 0,
                normalizedCount: this.medicalCenters.length
            });

            this.filterSuggestions(this.inputValue, true);
        } else if (error) {
            // eslint-disable-next-line no-console
            console.error('Errore nel caricamento dei centri medici:', error);
            this.log('wire:getMedicalCenters error', error);
        }
    }

    get hasSuggestions() {
        return Array.isArray(this.filteredSuggestions) && this.filteredSuggestions.length > 0;
    }

    handleInputChange(event) {
        const rawValue = event.detail?.value ?? event.target?.value ?? '';
        this.log('handleInputChange', { rawValue });
        this.inputValue = rawValue;
        this.isInputValid = true;
        this.showErrorMessage = false;
        this._selectedMedicalCenter = '';

        this.filterSuggestions(rawValue);
        this.log('handleInputChange post-filter', {
            filteredCount: this.filteredSuggestions.length,
            dropdownStyle: this.dropdownStyle,
            showErrorMessage: this.showErrorMessage
        });
    }

    handleFocus() {
        this.isInputValid = true;
        this.log('handleFocus', { currentValue: this.inputValue });
        this.filterSuggestions(this.inputValue, true);
    }

    handleMouseDownSuggestion() {
        this.log('handleMouseDownSuggestion');
        this.isClickingSuggestion = true;
    }

    handleMouseUpSuggestion() {
        this.log('handleMouseUpSuggestion');
        this.isClickingSuggestion = false;
    }

    handleSuggestionClick(event) {
        const selectedCenter = event.currentTarget?.dataset?.value || event.target?.textContent;
        if (!selectedCenter) {
            this.log('handleSuggestionClick skipped (no value)');
            return;
        }
        this.selectedMedicalCenter = selectedCenter;
        this.filteredSuggestions = [];
        this.dropdownStyle = 'display: none;';
        this.showErrorMessage = false;
        this.isInputValid = true;
        this.log('handleSuggestionClick applied', { selectedCenter });
    }

    handleConfirm() {
        const value = (this.inputValue || '').trim();
        this.log('handleConfirm', { value });
        if (value) {
            this.selectedMedicalCenter = value;
            this.filteredSuggestions = [];
            this.dropdownStyle = 'display: none;';
            this.showErrorMessage = false;
            this.isInputValid = true;
            this.log('handleConfirm accepted', { value });
        } else {
            this.isInputValid = false;
            this.log('handleConfirm rejected empty value');
        }
    }

    handleBlur() {
        if (!this.isClickingSuggestion) {
            this.dropdownStyle = 'display: none;';
            const value = (this.inputValue || '').trim();
            this.isInputValid = value.length > 0;
            this.log('handleBlur', { value, isInputValid: this.isInputValid });
        }
    }

    filterSuggestions(query, showAllWhenEmpty = false) {
        const normalized = (query || '').trim().toLowerCase();

        this.log('filterSuggestions:start', { query, normalized, showAllWhenEmpty });

        if (!normalized) {
            if (showAllWhenEmpty) {
                this.filteredSuggestions = [...this.medicalCenters];
                this.dropdownStyle = this.hasSuggestions ? 'display: block;' : 'display: none;';
            } else {
                this.filteredSuggestions = [];
                this.dropdownStyle = 'display: none;';
            }
            this.showErrorMessage = false;
            this.log('filterSuggestions:emptyQuery', {
                filteredCount: this.filteredSuggestions.length,
                dropdownStyle: this.dropdownStyle
            });
            return;
        }

        const matches = this.medicalCenters.filter(center =>
            center.toLowerCase().includes(normalized)
        );

        this.filteredSuggestions = matches;
        this.dropdownStyle = matches.length ? 'display: block;' : 'display: none;';
        this.showErrorMessage = matches.length === 0;
        this.log('filterSuggestions:result', {
            matches,
            dropdownStyle: this.dropdownStyle,
            showErrorMessage: this.showErrorMessage
        });
    }

    log(message, payload) {
        if (!this.debugEnabled) {
            return;
        }
        // eslint-disable-next-line no-console
        console.log('[medicalCenter]', message, payload);
    }
}