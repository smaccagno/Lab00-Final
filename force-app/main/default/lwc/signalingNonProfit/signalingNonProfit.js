import { LightningElement, api, wire, track } from 'lwc';
import getSignalingNonProfits from '@salesforce/apex/InvoiceCreationController.getSignalingNonProfits';

export default class EnteNoProfit extends LightningElement {
    @track nonProfitEntities = []; // Lista degli enti no-profit
    @track filteredSuggestions = []; // Suggerimenti filtrati
    dropdownStyle = 'display: none;'; // Stile della tendina
    showErrorMessage = false; // Controlla la visibilità del messaggio di errore "Non in lista"
    isInputValid = true; // Controlla la validità del campo input
    isClickingSuggestion = false; // Flag per rilevare clic sui suggerimenti
    _selectedNonProfit = ''; // Variabile interna

    @api
    get selectedSignalingNonProfit() {
        return this._selectedNonProfit;
    }

    set selectedSignalingNonProfit(value) {
        this._selectedNonProfit = value;
        const selectedEvent = new CustomEvent('valuechange', {
            detail: { selectedNonProfit: this._selectedNonProfit }
        });
        this.dispatchEvent(selectedEvent);
    }

    get inputClass() {
        return `no-padding-input ${this.isInputValid ? '' : 'slds-has-error'}`.trim();
    }

    @wire(getSignalingNonProfits)
    wiredNonProfits({ error, data }) {
        if (data) {
            console.log('Enti no-profit caricati:', data);
            this.nonProfitEntities = data.map(entity => entity.Name);
        } else if (error) {
            console.error('Errore nel caricamento degli enti no-profit:', error);
        }
    }

    handleInputChange(event) {
        const query = event.target.value.trim().toLowerCase();

        this.isInputValid = true;
        this.showErrorMessage = false;
        this._selectedNonProfit = '';

        if (query.length > 0) {
            this.filteredSuggestions = this.nonProfitEntities.filter(entity =>
                entity.toLowerCase().includes(query)
            );
            this.dropdownStyle = this.filteredSuggestions.length > 0 ? 'display: block;' : 'display: none;';
            this.showErrorMessage = this.filteredSuggestions.length === 0;
        } else {
            this.filteredSuggestions = [];
            this.dropdownStyle = 'display: none;';
            this.showErrorMessage = false;
        }
    }

    handleFocus() {
        this.isInputValid = true;
        this.filteredSuggestions = this.nonProfitEntities;
        this.dropdownStyle = 'display: block;';
    }

    handleBlur() {
        if (!this.isClickingSuggestion) {
            this.dropdownStyle = 'display: none;';
            const inputValue = this.template.querySelector('lightning-input').value.trim();
            this.isInputValid = inputValue.length > 0;
        }
    }

    handleMouseDownSuggestion() {
        this.isClickingSuggestion = true;
    }

    handleMouseUpSuggestion() {
        this.isClickingSuggestion = false;
    }

    handleSuggestionClick(event) {
        const selectedEntity = event.target.textContent;
        this.selectedSignalingNonProfit = selectedEntity;
        this.template.querySelector('lightning-input').value = selectedEntity;
        this.filteredSuggestions = [];
        this.dropdownStyle = 'display: none;';
        this.showErrorMessage = false;
        this.isInputValid = true;
    }

    handleConfirm() {
        const inputValue = this.template.querySelector('lightning-input').value.trim();
        if (inputValue) {
            this.selectedSignalingNonProfit = inputValue;
            console.log('Ente no-profit confermato:', this.selectedSignalingNonProfit);
            this.showErrorMessage = false;
            this.isInputValid = true;
        } else {
            this.isInputValid = false;
        }
    }
}