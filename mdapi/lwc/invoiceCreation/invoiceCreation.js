import { LightningElement, api, wire, track } from 'lwc';
import getMedicalCenters from '@salesforce/apex/InvoiceCreationController.getMedicalCenters';

export default class InvoiceCreation extends LightningElement {
    @track medicalCenters = [];
    @track filteredSuggestions = [];
    @api selectedMedicalCenter = ''; // Dichiarazione della proprietà per il Flow
    dropdownStyle = 'display: none;'; // Inizializza lo stile della tendina

    // Fetch the medical centers from Apex
    @wire(getMedicalCenters)
    wiredMedicalCenters({ error, data }) {
        if (data) {
            this.medicalCenters = data;
        } else if (error) {
            console.error('Error fetching medical centers:', error);
        }
    }

    // Filter suggestions based on user input
    handleInputChange(event) {
        const query = event.target.value.toLowerCase();
        this.filteredSuggestions = this.medicalCenters.filter(center =>
            center.toLowerCase().includes(query)
        );
        this.dropdownStyle = this.filteredSuggestions.length > 0 ? 'display: block;' : 'display: none;';
    }

    // Show suggestions on focus
    handleFocus() {
        this.filteredSuggestions = this.medicalCenters;
        this.dropdownStyle = 'display: block;';
    }

    // Handle suggestion click
    handleSuggestionClick(event) {
        const selectedCenter = event.target.textContent;
        this.selectedMedicalCenter = selectedCenter; // Assegna il valore selezionato alla proprietà
        this.template.querySelector('lightning-input').value = selectedCenter;
        this.filteredSuggestions = [];
        this.dropdownStyle = 'display: none;'; // Nasconde la tendina
    }
}