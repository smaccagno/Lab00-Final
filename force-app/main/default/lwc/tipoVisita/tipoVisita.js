import { LightningElement, api, wire, track } from "lwc";
import getTipoVisite from "@salesforce/apex/InvoiceCreationController.getTipiVisita";
import getBeneficiaryTypes from "@salesforce/apex/VisiteMediche.getBeneficiaryTypes";

export default class TipoVisitaItem extends LightningElement {
  @api invoiceDate;
  @track tipoVisite = []; // Lista completa dei tipi visita
  @track beneficiaryTypeOptions = []; // Opzioni per Beneficiary Type
  @track filteredSuggestions = []; // Suggerimenti filtrati per Tipo Visita
  @track dropdownStyle = "display: none;";
  @track showErrorMessage = false;
  @track isInputValid = true;
  @track tipoVisita = ""; // Nome del Tipo Visita selezionato
  @track tipoVisitaId = ""; // ID Salesforce del Tipo Visita selezionato
  @track tipoVisitaCustom = ""; // Valore personalizzato inserito
  @track beneficiaryType = "";
  @track numeroVisite = null;
  @track totaleMinuti = null;
  @track amount = null;
  @track amountInput = "";
  @track dataVisita = this.getToday();

  @track comune = "";
  @track provincia = "";
  @track regione = "";

  // Proprietà per ricevere la variabile gratuita
  _gratuita;
  @api
  set gratuita(value) {
    this._gratuita = value;
    console.log("TipoVisitaItem - proprietà gratuita ricevuta:", value);
    // Se gratuita è true (o la stringa 'true'), forziamo l'amount a 0
    if (value === true || value === "true") {
      this.amount = 0;
      this.amountInput = "0";
    }
  }
  get gratuita() {
    return this._gratuita;
  }

  // Computed property per disabilitare l'input Amount se gratuita è true
  get isAmountDisabled() {
    return this.gratuita === true || this.gratuita === "true";
  }

  connectedCallback() {
    // ✅ Se invoiceDate è valorizzato, usalo come data predefinita per la visita
    this.dataVisita = this.invoiceDate || this.getToday();
  }

  getToday() {
    const today = new Date();
    return today.toISOString().split("T")[0]; // Formatta la data come YYYY-MM-DD
  }

  get inputClass() {
    return `no-padding-input ${this.isInputValid ? "" : "slds-has-error"}`.trim();
  }

  normalizeAmountInput(rawValue) {
    const raw = (rawValue ?? "").toString().trim();
    if (raw === "") {
      return { raw: "", value: null, valid: true };
    }

    const cleaned = raw.replace(/\s/g, "");
    const hasComma = cleaned.includes(",");
    const normalized = hasComma
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned;

    const numeric = Number(normalized);
    return { raw, value: numeric, valid: !Number.isNaN(numeric) };
  }

  // Required dinamico per Amount (solo se non gratuita)
  get isAmountRequired() {
    return !(this.gratuita === true || this.gratuita === "true");
  }

  @api
  get visitaData() {
    return {
      tipoVisita: this.tipoVisitaCustom || this.tipoVisita, // Usa tipoVisitaCustom se presente
      tipoVisitaId: this.tipoVisitaId || "", // Resta vuoto se custom
      beneficiaryType: this.beneficiaryType,
      numeroVisite: this.numeroVisite,
      totaleMinuti: this.totaleMinuti,
      amount: this.amount,
      dataVisita: this.dataVisita,
      comune: this.comune,
      provincia: this.provincia,
      regione: this.regione
    };
  }

  set visitaData(data) {
    if (data) {
      this.tipoVisita = data.tipoVisita || "";
      this.tipoVisitaId = data.tipoVisitaId || "";
      this.tipoVisitaCustom = ""; // Reset della variabile custom quando si riceve un dato
      this.beneficiaryType = data.beneficiaryType || "";
      this.numeroVisite = data.numeroVisite ?? null;
      this.totaleMinuti = data.totaleMinuti ?? null;
      const { raw, value } = this.normalizeAmountInput(data.amount);
      this.amount = value;
      this.amountInput = raw;
      this.dataVisita = data.dataVisita || this.invoiceDate || this.getToday();
      // Precompila area geografica se fornita
      this.comune = data.comune || "";
      this.provincia = data.provincia || "";
      this.regione = data.regione || "";
    }
  }

  @wire(getTipoVisite)
  wiredTipoVisite({ error, data }) {
    if (data) {
      this.tipoVisite = data.map((tipo) => ({
        Name: tipo.Name,
        Id: tipo.Id
      }));
    } else if (error) {
      console.error("Errore nel caricamento dei tipi visita:", error);
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
      console.error("Errore nel caricamento dei Beneficiary Types:", error);
      this.beneficiaryTypeOptions = [];
    }
  }

  handleComuneChange(event) {
    const { comune, provincia, regione } = event.detail;
    this.comune = comune;
    this.provincia = provincia;
    this.regione = regione;
    this.notifyParent(); // mantiene in sync il livello superiore
  }

  handleInputChange(event) {
    const rawValue = event.target.value || '';
    const query = rawValue.trim().toLowerCase();

    this.isInputValid = true;
    this.showErrorMessage = false;
    // Non impostiamo qui tipoVisitaCustom: verrà settato solo su "Confermo"

    if (query.length > 0) {
      this.filteredSuggestions = this.tipoVisite
        .filter((tipo) => tipo.Name.toLowerCase().includes(query))
        .map((tipo) => tipo.Name);
      this.dropdownStyle =
        this.filteredSuggestions.length > 0
          ? "display: block;"
          : "display: none;";

      // Se l'input corrisponde esattamente ad un tipo esistente, selezionalo
      const exact = this.tipoVisite.find(
        (t) => t.Name.toLowerCase() === query
      );
      // Mostra la richiesta di conferma quando non esiste una corrispondenza esatta
      this.showErrorMessage = !exact && rawValue.trim().length > 0;
      if (exact) {
        this.tipoVisita = exact.Name;
        this.tipoVisitaId = exact.Id;
        this.showErrorMessage = false;
      } else {
        this.tipoVisita = "";
        this.tipoVisitaId = "";
      }
    } else {
      this.filteredSuggestions = []; // Correzione qui
      this.dropdownStyle = "display: none;";
      this.showErrorMessage = false;
    }

    // Se in precedenza era stato mostrato un errore, rimuovilo mentre l'utente digita
    const tipoInput = this.template.querySelector('lightning-input[data-id="tipoVisita"]');
    if (tipoInput) {
      tipoInput.setCustomValidity("");
      // Evita di mostrare errori mentre l'utente digita; aggiorna la UI solo se c'è un valore
      if (rawValue.trim().length > 0) {
        tipoInput.reportValidity();
      }
    }
    this.notifyParent();
  }

  handleFocus() {
    console.log("TipoVisitaItem - handleFocus chiamato");
    this.isInputValid = true;
    this.filteredSuggestions = this.tipoVisite.map((tipo) => tipo.Name);
    this.dropdownStyle = "display: block;";
  }

  handleBlur() {
    /*  Nasconde la dropdown solo dopo un brevissimo delay:
     *  serve a permettere il click sull’elemento del menu
     *  prima che l’input perda il focus definitivo.
     */
    setTimeout(() => {
      this.dropdownStyle = "display: none;";
    }, 200);
  }

  handleSuggestionClick(event) {
    const selectedTipo = event.target.textContent;
    const matchingTipo = this.tipoVisite.find(
      (tipo) => tipo.Name === selectedTipo
    );

    if (matchingTipo) {
      this.tipoVisita = matchingTipo.Name;
      this.tipoVisitaId = matchingTipo.Id;
    }

    const tipoInput = this.template.querySelector('lightning-input[data-id="tipoVisita"]');
    if (tipoInput) {
      tipoInput.value = selectedTipo;
      // Pulisci eventuali messaggi di required preesistenti
      tipoInput.setCustomValidity("");
      tipoInput.reportValidity();
    }
    this.filteredSuggestions = [];
    this.dropdownStyle = "display: none;";
    this.showErrorMessage = false;
    this.isInputValid = true;
    this.notifyParent();
  }

  handleConfirm() {
    const inputValue = this.template
      .querySelector("lightning-input")
      .value.trim();
    if (inputValue) {
      this.tipoVisitaCustom = inputValue; // Assegna il valore personalizzato
      this.tipoVisita = ""; // Resetta il tipo visita standard
      this.tipoVisitaId = ""; // Lascia vuoto l'ID Salesforce
      this.showErrorMessage = false;
      this.isInputValid = true;
      // Pulisci eventuali errori di required mostrati in precedenza
      const tipoInput = this.template.querySelector('lightning-input[data-id="tipoVisita"]');
      if (tipoInput) {
        tipoInput.setCustomValidity("");
        tipoInput.reportValidity();
      }
      this.notifyParent();
    } else {
      this.isInputValid = false;
    }
  }

  handleBeneficiaryTypeChange(event) {
    this.beneficiaryType = event.detail.value;
    console.log("Beneficiary Type selezionato:", this.beneficiaryType);
    this.notifyParent();
  }

  handleNumeroVisiteChange(event) {
    this.numeroVisite = event.target.value;
    console.log("Numero Visite modificato:", this.numeroVisite);
    this.notifyParent();
  }

  handleTotaleMinutiChange(event) {
    this.totaleMinuti = event.target.value;
    console.log("Totale Minuti modificato:", this.totaleMinuti);
    this.notifyParent();
  }

  handleAmountChange(event) {
    if (this.isAmountDisabled) {
      event.preventDefault();
      return;
    }
    const { raw, value, valid } = this.normalizeAmountInput(event.target.value);
    this.amountInput = raw;

    if (!valid) {
      event.target.setCustomValidity("Inserisci un numero valido. Puoi usare la virgola o il punto come separatore decimale.");
      event.target.reportValidity();
      this.amount = null;
    } else {
      event.target.setCustomValidity("");
      event.target.reportValidity();
      this.amount = value;
    }

    console.log("TipoVisitaItem - Amount modificato:", this.amount);
    this.notifyParent();
  }

  handleDataVisitaChange(event) {
    this.dataVisita = event.target.value;
    console.log("Data Visita modificata:", this.dataVisita);
    this.notifyParent();
  }

  // Validazione chiamata dal parent (repeater) prima del salvataggio
  @api
  validate() {
    let valid = true;

    // Valida anche il componente figlio c-comune per la mandatorietà del Comune
    const comuneCmp = this.template.querySelector('c-comune');
    if (comuneCmp && typeof comuneCmp.validate === 'function') {
      valid = comuneCmp.validate() && valid;
    }

    // Campo obbligatorio: Tipo Visita (accettiamo nome standard o custom)
    const tipoInput = this.template.querySelector('lightning-input[data-id="tipoVisita"]');
    if (tipoInput) {
      const raw = (tipoInput.value || '').trim();
      const chosen =
        (this.tipoVisitaCustom && this.tipoVisitaCustom.trim()) ||
        (this.tipoVisita && this.tipoVisita.trim()) ||
        '';
      if (!chosen && !raw) {
        // Campo proprio vuoto
        tipoInput.setCustomValidity('Questo campo è obbligatorio, compilalo prima di Salvare');
        valid = false;
      } else if (!chosen && raw) {
        // Valore digitato ma non confermato/riconosciuto
        tipoInput.setCustomValidity('Valore non presente in lista. Premi "Confermo" per usarlo.');
        valid = false;
      } else {
        tipoInput.setCustomValidity('');
      }
      tipoInput.reportValidity();
    }

    const bene = this.template.querySelector('lightning-combobox[data-id="beneficiaryType"]');
    if (bene) {
      if (!this.beneficiaryType) {
        bene.setCustomValidity('Questo campo è obbligatorio, compilalo prima di Salvare');
        valid = false;
      } else {
        bene.setCustomValidity('');
      }
      bene.reportValidity();
    }

    const num = this.template.querySelector('lightning-input[data-id="numeroVisite"]');
    if (num) {
      const v = this.numeroVisite;
      if (v == null || v === '' || Number(v) <= 0) {
        num.setCustomValidity('Questo campo è obbligatorio, compilalo prima di Salvare');
        valid = false;
      } else {
        num.setCustomValidity('');
      }
      num.reportValidity();
    }

    const min = this.template.querySelector('lightning-input[data-id="totaleMinuti"]');
    if (min) {
      const v = this.totaleMinuti;
      if (v == null || v === '' || Number(v) <= 0) {
        min.setCustomValidity('Questo campo è obbligatorio, compilalo prima di Salvare');
        valid = false;
      } else {
        min.setCustomValidity('');
      }
      min.reportValidity();
    }

    const amt = this.template.querySelector('lightning-input[data-id="amount"]');
    if (amt && !this.isAmountDisabled) {
      const v = this.amount;
      if (v == null || v === '') {
        amt.setCustomValidity('Questo campo è obbligatorio, compilalo prima di Salvare');
        valid = false;
      } else if (Number.isNaN(Number(v))) {
        amt.setCustomValidity('Inserisci un numero valido. Puoi usare la virgola o il punto come separatore decimale.');
        valid = false;
      } else {
        amt.setCustomValidity('');
      }
      amt.reportValidity();
    }

    const dt = this.template.querySelector('lightning-input[data-id="dataVisita"]');
    if (dt) {
      if (!this.dataVisita) {
        dt.setCustomValidity('Questo campo è obbligatorio, compilalo prima di Salvare');
        valid = false;
      } else {
        dt.setCustomValidity('');
      }
      dt.reportValidity();
    }

    return valid;
  }

  notifyParent() {
    const updateEvent = new CustomEvent("updatevisita", {
      detail: { ...this.visitaData }, // Assicura che venga passato un oggetto con i dati aggiornati
      bubbles: true,
      composed: true
    });
    console.log("TipoVisitaItem - Evento inviato con dati:", this.visitaData);
    this.dispatchEvent(updateEvent);
  }
}