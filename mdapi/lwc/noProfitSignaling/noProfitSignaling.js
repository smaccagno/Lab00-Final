import { LightningElement, api, wire, track } from 'lwc';
import getSignalingNonProfits from '@salesforce/apex/InvoiceCreationController.getSignalingNonProfits';

export default class NoProfitSignaling extends LightningElement {
    @track nonProfits = [];
    @track filteredSuggestions = [];
    @api selectedCategory = '';
    @track showCategoryInput = false;
    @track categoryOptions = []; // Opzioni per lightning-combobox
    dropdownStyle = 'display: none;';
    showErrorMessage = false;
    isInputValid = true;
    isClickingSuggestion = false;
    _selectedNoProfit = '';

    @api
    get selectedNoProfit() {
        return this._selectedNoProfit;
    }

    set selectedNoProfit(value) {
        this._selectedNoProfit = value;
        const selectedEvent = new CustomEvent('valuechange', {
            detail: { selectedNoProfit: this._selectedNoProfit, selectedCategory: this.selectedCategory }
        });
        this.dispatchEvent(selectedEvent);
    }

    get inputClass() {
        return `no-padding-input ${this.isInputValid ? '' : 'slds-has-error'}`.trim();
    }

    @wire(getSignalingNonProfits)
    wiredNonProfits({ error, data }) {
        if (data) {
            console.log('Enti no profit caricati:', data);
            this.nonProfits = data;
            this.generateCategoryOptions(data); // Genera le opzioni
        } else if (error) {
            console.error('Errore nel caricamento degli enti no profit:', error);
        }
    }

    generateCategoryOptions(nonProfits) {
        const categories = new Set();
        nonProfits.forEach(nonProfit => {
            if (nonProfit.Ente_Categoria__c) {
                categories.add(nonProfit.Ente_Categoria__c);
            }
        });
        this.categoryOptions = Array.from(categories).map(category => ({
            label: category,
            value: category
        }));
    }

    handleInputChange(event) {
        const query = event.target.value.trim().toLowerCase();

        this.isInputValid = true;
        this.showErrorMessage = false;

        this._selectedNoProfit = '';
        this.selectedCategory = ''; // Resetta la categoria

        if (query.length > 0) {
            this.filteredSuggestions = this.nonProfits.filter(nonProfit => {
                const nonProfitName = nonProfit.Name.toLowerCase();
                return nonProfitName.includes(query);
            });

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
        this.filteredSuggestions = this.nonProfits;
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
        const selectedName = event.target.textContent;
        this.selectedNoProfit = selectedName;
        this.template.querySelector('lightning-input').value = selectedName;
        this.filteredSuggestions = [];
        this.dropdownStyle = 'display: none;';
        this.showErrorMessage = false;
        this.isInputValid = true;

        const selectedNonProfitRecord = this.nonProfits.find(nonProfit => nonProfit.Name === selectedName);
        if (selectedNonProfitRecord) {
            this.selectedCategory = selectedNonProfitRecord.Ente_Categoria__c;
        }
    }

    handleConfirm() {
        const inputValue = this.template.querySelector('lightning-input').value.trim();
        if (inputValue) {
            this.selectedNoProfit = inputValue;
            this.showErrorMessage = false;
            this.isInputValid = true;
            this.showCategoryInput = true;
        } else {
            this.isInputValid = false;
        }
    }

    handleCategoryChange(event) {
        this.selectedCategory = event.target.value;
        this.showCategoryInput = false;
    }
}