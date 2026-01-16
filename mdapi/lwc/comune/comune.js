import { LightningElement, api, wire, track } from "lwc";
import getComune from "@salesforce/apex/InvoiceCreationController.getComune";
const COMUNE_CHANGE_EVT = "comunechange";
export default class Comune extends LightningElement {
  @track comuni = [];
  @track province = [];
  @track filteredSuggestions = [];
  @track filteredProvinceSuggestions = [];
  dropdownStyle = "display: none;";
  provinceDropdownStyle = "display: none;";
  showErrorMessage = false;
  showProvinceInput = false;
  isClickingSuggestion = false;
  isInputValid = true;

  @api selectedComune = "";
  @api selectedProvincia = "";
  @api selectedRegione = "";

  @api
  get locationData() {
    return {
      comune: this.selectedComune,
      provincia: this.selectedProvincia,
      regione: this.selectedRegione
    };
  }

  get computedInputClass() {
    return `full-width-input no-padding-input ${this.isInputValid ? "" : "slds-has-error"}`.trim();
  }

  @wire(getComune)
  wiredComuni({ error, data }) {
    if (data) {
      this.comuni = data;

      const provinceSet = new Set(
        data.map((comune) => comune.Provincia__c).filter(Boolean)
      );
      this.province = Array.from(provinceSet).sort();

      console.log("Province uniche caricate:", this.province);
    } else if (error) {
      console.error("Errore nel caricamento dei comuni:", error);
    }
  }

  dispatchComuneChange() {
    this.dispatchEvent(
      new CustomEvent(COMUNE_CHANGE_EVT, {
        detail: {
          comune: this.selectedComune,
          provincia: this.selectedProvincia,
          regione: this.selectedRegione
        },
        bubbles: true,
        composed: true
      })
    );
  }

  handleInputChange(event) {
    const query = event.target.value.trim().toLowerCase();

    // Nascondi il campo Provincia quando il campo Comune viene modificato
    this.showProvinceInput = false;
    this.selectedProvincia = ""; // Reset Provincia selezionata
    this.selectedRegione = ""; // Reset Regione selezionata
    this.showErrorMessage = false;
    this.isInputValid = true;

    // Reset Comune selezionato
    this.selectedComune = "";

    if (query.length > 0) {
      this.filteredSuggestions = this.comuni.filter(
        (comune) =>
          comune.Nome_Comune__c &&
          comune.Nome_Comune__c.toLowerCase().includes(query)
      );
      this.dropdownStyle =
        this.filteredSuggestions.length > 0
          ? "display: block;"
          : "display: none;";
      this.showErrorMessage = this.filteredSuggestions.length === 0;
    } else {
      this.filteredSuggestions = [];
      this.dropdownStyle = "display: none;";
    }

    // Pulisci eventuali errori precedenti mentre l'utente digita
    const input = this.template.querySelector('lightning-input[data-id="comune"]');
    if (input) {
      input.setCustomValidity("");
      if (query.length > 0) input.reportValidity();
    }
  }

  handleFocus() {
    this.isInputValid = true;
    this.filteredSuggestions = this.comuni;
    this.dropdownStyle = "display: block;";
  }

  handleBlur() {
    if (!this.isClickingSuggestion) {
      this.dropdownStyle = "display: none;";
      const inputValue = this.template
        .querySelector('lightning-input[data-id="comune"]')
        .value.trim();
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
    const selectedComune = event.target.textContent;
    const selectedComuneData = this.comuni.find(
      (comune) => comune.Nome_Comune__c === selectedComune
    );

    if (selectedComuneData) {
      this.selectedComune = selectedComune;
      this.selectedProvincia = selectedComuneData.Provincia__c;
      this.selectedRegione = selectedComuneData.Regione__c;

      const input = this.template.querySelector('lightning-input[data-id="comune"]');
      if (input) {
        input.value = selectedComune;
        input.setCustomValidity("");
        input.reportValidity();
      }
      this.filteredSuggestions = [];
      this.dropdownStyle = "display: none;";
      this.showErrorMessage = false;
      this.isInputValid = true;
    }
    this.dispatchComuneChange();
  }

  handleConfirm() {
    const inputValue = this.template
      .querySelector('lightning-input[data-id="comune"]')
      .value.trim();
    if (inputValue) {
      this.selectedComune = inputValue;
      this.selectedProvincia = "";
      this.selectedRegione = "";
      this.showErrorMessage = false;
      this.isInputValid = true;
      this.showProvinceInput = true;

      this.filteredProvinceSuggestions = this.province;
      this.provinceDropdownStyle = "display: block;";
      const input = this.template.querySelector('lightning-input[data-id="comune"]');
      if (input) {
        input.setCustomValidity("");
        input.reportValidity();
      }
      this.dispatchComuneChange();
    } else {
      this.isInputValid = false;
    }
  }

  handleProvinceInputChange(event) {
    const query = event.target.value.trim().toLowerCase();
    if (query.length > 0) {
      this.filteredProvinceSuggestions = this.province.filter((provincia) =>
        provincia.toLowerCase().includes(query)
      );
      this.provinceDropdownStyle =
        this.filteredProvinceSuggestions.length > 0
          ? "display: block;"
          : "display: none;";
    } else {
      this.filteredProvinceSuggestions = [];
      this.provinceDropdownStyle = "display: none;";
    }
    const provInput = this.template.querySelector('lightning-input[data-id="provincia"]');
    if (provInput) {
      provInput.setCustomValidity("");
      if (query.length > 0) provInput.reportValidity();
    }
  }

  handleProvinceFocus() {
    this.filteredProvinceSuggestions = this.province;
    this.provinceDropdownStyle = "display: block;";
  }

  handleProvinceSuggestionClick(event) {
    const selectedProvincia = event.target.textContent;
    this.selectedProvincia = selectedProvincia;
    this.template.querySelector('lightning-input[data-id="provincia"]').value =
      selectedProvincia;
    this.filteredProvinceSuggestions = [];
    this.provinceDropdownStyle = "display: none;";

    const matchingComune = this.comuni.find(
      (comune) => comune.Provincia__c === selectedProvincia
    );
    if (matchingComune) {
      this.selectedRegione = matchingComune.Regione__c;
    }
    const provInput = this.template.querySelector('lightning-input[data-id="provincia"]');
    if (provInput) {
      provInput.setCustomValidity("");
      provInput.reportValidity();
    }
    this.dispatchComuneChange();
  }

  handleProvinceBlur() {
    if (!this.isClickingSuggestion) {
      this.provinceDropdownStyle = "display: none;";
    }
  }

  // Validazione mandatorietà invocata dal parent al momento del salvataggio
  @api validate() {
    let valid = true;
    const input = this.template.querySelector('lightning-input[data-id="comune"]');
    if (input) {
      if (!this.selectedComune || this.selectedComune.trim() === '') {
        input.setCustomValidity('Questo campo è obbligatorio, compilalo prima di Salvare');
        valid = false;
      } else {
        input.setCustomValidity('');
      }
      input.reportValidity();
    }

    if (this.showProvinceInput) {
      const provInput = this.template.querySelector('lightning-input[data-id="provincia"]');
      if (provInput) {
        if (!this.selectedProvincia || this.selectedProvincia.trim() === '') {
          provInput.setCustomValidity('Seleziona una Provincia');
          valid = false;
        } else {
          provInput.setCustomValidity('');
        }
        provInput.reportValidity();
      }
    }
    return valid;
  }
}