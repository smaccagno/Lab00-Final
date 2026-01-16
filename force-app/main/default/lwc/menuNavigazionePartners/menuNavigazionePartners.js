import { LightningElement, track, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import { openTab, setTabLabel } from "lightning/platformWorkspaceApi";

import enabledForTempoSospeso from "@salesforce/apex/ProgramEnrollmentService.enabledForTempoSospeso";
import enabledForSorrisoSospeso from "@salesforce/apex/ProgramEnrollmentService.enabledForSorrisoSospeso";

export default class MenuNavigazione extends NavigationMixin(LightningElement) {
  isFlowVisible = false; // Visibilità del modal
  currentFlow; // Nome del Flow attualmente in esecuzione
  flowLabel;

  @track _tabs = [
    { id: "1", label: "Donazioni", apiName: "Allocazioni" },
    { id: "2", label: "Fatture", apiName: "Fatture" }
    // { id: "3", label: "Visite Mediche", apiName: "Visite_Mediche" },
    // { id: "4", label: 'Acquista o Prenota Biglietti/Abbonamenti', flowName: 'BuyTicket' },
  ];

  get tabs() {
    return this._tabs;
  }

  @wire(enabledForTempoSospeso)
  wiredEnabledForTempoSospeso({ data, error }) {
    if (!!data) {
      this._tabs.push({
        id: "3",
        label: "Visite Mediche",
        apiName: "Visite_Mediche"
      });
    } else if (error) {
      console.error(error);
    }
  }

  @wire(enabledForSorrisoSospeso)
  wiredEnabledForSorrisoSospeso({ data, error }) {
    if (!!data) {
      this._tabs.push({
        id: "3",
        label: "Esperienze",
        apiName: "Biglietti"
      });
      this._tabs.push({
        id: "4",
        label: "Offerte sottoscritte",
        apiName: "Offerte"
      });
      this._tabs.push({
        id: "5",
        label: "Acquista Offerta",
        apiName: "Offerte1"
      });
    } else if (error) {
      console.error(error);
    }
  }

  /**
   * Apre un nuovo tab console sul Navigation Item richiesto
   * e gli assegna subito l’etichetta del bottone cliccato.
   */
  handleTabClick(event) {
    const flowName = event.currentTarget.dataset.flowname;
    const apiName = event.currentTarget.dataset.apiname;
    const label = event.currentTarget.innerText; // “Donazioni”, “Fatture”, …

    if (apiName) {
      // L’URL diretto a un Navigation Item è /lightning/n/{apiName}
      const url = `/lightning/n/${apiName}`;

      // 1. Apriamo il tab con l’etichetta desiderata
      openTab({ url, label })
        .then((tabId) => {
          /* 2. In rari casi il framework riassegna il label dopo il load.
                     Forziamo di nuovo l’etichetta quando il tab è pronto. */
          return setTabLabel({ tabId, label });
        })
        .catch((error) => {
          /* Fallback: se per qualche motivo openTab fallisce,
                     usiamo comunque la navigazione standard. */
          // eslint-disable-next-line no-console
          console.error("WorkspaceAPI error:", error);
          this[NavigationMixin.Navigate]({
            type: "standard__navItemPage",
            attributes: { apiName }
          });
        });
    } else if (flowName) {
      this.openFlow(flowName, label);
    }
  }

  // Funzione per aprire un Flow nel modale
  openFlow(flowName, flowLabel) {
    this.currentFlow = flowName;
    this.isFlowVisible = true;
    this.flowLabel = flowLabel;
  }

  // Funzione per chiudere il Flow
  closeFlow() {
    this.isFlowVisible = false;
    this.currentFlow = null;
    this.flowLabel = null;
  }

  handleFlowStatusChange(event) {
    if (event.detail.status === "FINISHED") {
      this.closeFlow(); // Chiude il modale
    }
  }
}