import { LightningElement } from "lwc";
import { NavigationMixin } from "lightning/navigation";

export default class FlowLauncher extends NavigationMixin(LightningElement) {
  isFlowVisible = false;
  currentFlow;

  SEPARATORS = [5, 13, 15, 17];

  _rawButtons = [];

  connectedCallback() {
    const baseButtons = [
      {
        label: "Crea un Nuovo Donatore",
        action: () => this.handleCreaNuovoDonatore()
      },
      { label: "Crea un Nuovo Partner", action: () => this.handleCreaBudget() },
      {
        label: "Crea una Nuovo Fornitore",
        action: () => this.handleNewStructure()
      },

      {
        label: "Crea un Nuovo Anno di Reportistica",
        action: () => this.handleCreaReportingYear()
      },
      {
        label: "Crea Iscrizione ad un Programma",
        action: () => this.handleCreaIscrizione()
      },
      {
        label: "Inserisci una Nuova Donazione",
        action: () => this.handleCreateNewDonation()
      },
      {
        label: "Alloca una Donazione ai Partners",
        action: () => this.handleGestisciDistribuzione()
      },
      {
        label: "Inserisci una Nuova Fattura",
        action: () => this.handleInsertNewInvoice()
      },
      {
        label: "Inserisci una Nuova Offerta",
        action: () => this.handleInsertNewOffer()
      },

      {
        label: "Acquista Biglietti/Abbonamenti",
        action: () => this.handleBuyTicket()
      },
      {
        label: "Assegna Fatture ad un Donatore",
        action: () => this.handleAssegnaFatture()
      },
      {
        label: "Crea un Pagamento per una lista di Allocazioni",
        action: () => this.handleCalculatePayment()
      },
      {
        label: "Marca una lista di Pagamenti come Fatti",
        action: () => this.handleClosePayment()
      },
      {
        label: "Aggiungi un Tipo di Visita",
        action: () => this.handleCreaVisitType()
      },
      { label: "Inserisci un Comune", action: () => this.handleCreaNewCity() },
      {
        label: "Elimina Donazioni",
        action: () => this.handleDeleteDonations()
      },
      {
        label: "Elimina Iscrizione a Programma",
        action: () => this.handleDeleteEnrollment()
      },
      { label: "Gestisci i Report", action: () => this.handleOpenReport() },
      {
        label: "Gestisci le Dashboard",
        action: () => this.handleOpenDashboard()
      },
      { label: "Reportistica", action: () => this.handleOpenReportistica() }
    ];

    this._rawButtons = baseButtons.map((btn, index) => ({
      ...btn,
      id: index + 1
    }));
  }

  get rawButtons() {
    return this._rawButtons;
  }

  get groupedButtons() {
    const groups = [];
    let start = 0;

    this.SEPARATORS.forEach((separatorIndex, index) => {
      const group = this.rawButtons.slice(start, separatorIndex);
      groups.push({
        groupKey: `group-${index}`,
        separatorKey: `separator-${index}`,
        buttons: group,
        isOdd: group.length % 2 !== 0,
        hasSeparator: index < this.SEPARATORS.length
      });
      start = separatorIndex;
    });

    if (start < this.rawButtons.length) {
      const group = this.rawButtons.slice(start);
      groups.push({
        groupKey: `group-${groups.length}`,
        separatorKey: `separator-${groups.length}`,
        buttons: group,
        isOdd: group.length % 2 !== 0,
        hasSeparator: false
      });
    }

    return groups;
  }

  // Funzione per aprire un Flow nel modale
  openFlow(flowName) {
    this.currentFlow = flowName;
    this.isFlowVisible = true;
  }

  // Funzione per chiudere il Flow
  closeFlow() {
    this.isFlowVisible = false;
    this.currentFlow = null;
  }

  // Gestione per ciascun Flow
  handleCreaNuovoDonatore() {
    this.openFlow("Crea_Nuovo_Donatore");
  }

  handleCreateNewDonation() {
    this.openFlow("Create_New_Donation");
  }

  handleGestisciDistribuzione() {
    this.openFlow("Gestisci_distribuzione_di_una_transazione");
  }

  handleInsertNewInvoice() {
    this.openFlow("Insert_a_new_Invoice");
  }
  handleAssegnaFatture() {
    this.openFlow("Assegna_Fatture_ad_una_Campagna");
  }

  handleCalculatePayment() {
    this.openFlow("Calculate_Payment_to_do");
  }

  handleClosePayment() {
    this.openFlow("Close_Payment");
  }

  handleCreaReportingYear() {
    this.openFlow("Crea_Reporting_Year");
  }

  handleCreaCampagna() {
    this.openFlow("Crea_Nuova_Campagna");
  }

  handleCreaBudget() {
    this.openFlow("Crea_Nuovo_Budget_manual");
  }

  handleCreaIscrizione() {
    this.openFlow("Iscrizione_ad_un_Programma");
  }

  // Funzione per aprire la pagina Report
  handleOpenReport() {
    this[NavigationMixin.Navigate]({
      type: "standard__webPage",
      attributes: {
        url: "/lightning/o/Report/home" // URL per la home dei Report
      }
    });
  }

  // Funzione per aprire la pagina Dashboard
  handleOpenDashboard() {
    this[NavigationMixin.Navigate]({
      type: "standard__webPage",
      attributes: {
        url: "/lightning/o/Dashboard/home" // URL per la home delle Dashboard
      }
    });
  }

  // Gestione per il Flow "Tipo di Visita"
  handleCreaVisitType() {
    this.openFlow("Crea_Tipo_Visita");
  }

  // Gestione per il Flow "Comune"
  handleCreaNewCity() {
    this.openFlow("Crea_Comune");
  }

  handleOpenReportistica() {
    this[NavigationMixin.Navigate]({
      type: "standard__webPage",
      attributes: {
        url: "/lightning/n/Reportistica" // URL per la home dei Report
      }
    });
  }

  handleFlowStatusChange(event) {
    if (event.detail.status === "FINISHED") {
      this.closeFlow(); // Chiude il modale
    }
  }

  handleDeleteDonations(event) {
    this.openFlow("Elimina_Tutte_le_donazioni");
  }

  handleDeleteEnrollment(event) {
    this.openFlow("Elimina_Enrollment");
  }

  handleNewStructure() {
    this.openFlow("NewSupplier");
  }

  handleBuyTicket() {
    this.openFlow("BuyTicket");
  }

  handleInsertNewOffer() {
    this.openFlow("NewTicket");
  }
}