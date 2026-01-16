import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

export default class FlowAdminLauncher extends NavigationMixin(LightningElement) {

    isFlowVisible = false; // Visibilità del modal
    currentFlow; // Nome del Flow attualmente in esecuzione

    // Funzione per aprire la pagina Report
    handleOpenReport() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/lightning/o/Report/home'  // URL per la home dei Report
            }
        });
    }

    // Funzione per aprire la pagina Dashboard
    handleOpenDashboard() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/lightning/o/Dashboard/home'  // URL per la home delle Dashboard
            }
        });
    }

    handleOpenHome(){
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/lightning/page/home'  // URL per la home dei Report
            }
        });
    }

    // Funzione per aprire un Flow
    openFlow(flowName) {
        this.currentFlow = flowName;
        this.isFlowVisible = true;
    }

    // Funzione per chiudere il Flow
    closeFlow() {
        this.isFlowVisible = false;
        this.currentFlow = null;
    }

    // Gestione per il Flow "Tipo di Visita"
    handleCreaVisitType() {
        this.openFlow('Crea_Tipo_Visita');
    }

    // Gestione per il Flow "Comune"
    handleCreaNewCity() {
        this.openFlow('Crea_Comune');
    }
}