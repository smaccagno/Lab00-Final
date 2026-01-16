import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';

export default class FlowSSLauncher extends NavigationMixin(LightningElement) {
    isFlowVisible = false; // Visibilità del modal
    currentFlow; // Nome del Flow attualmente in esecuzione

    // Costanti per separatori
    SEPARATORS = [5, 11, 13]; // Indici cumulativi per i separatori: 5, 5+6, 5+6+2

    rawButtons = [
        { id: 1, label: 'Crea una Nuova Struttura', action: this.handleNewStructure.bind(this) },
        // { id: 2, label: 'Crea una Nuova Sub Struttura', action: this.handleNewSubStructure.bind(this) },
        // { id: 3, label: 'Crea un Nuovo Spettacolo', action: this.handleNewShow.bind(this) },
        // { id: 4, label: 'Crea un Nuovo Ticket', action: this.handleNewTicket.bind(this) },
        // { id: 5, label: 'Acquista Biglietti/Abbonamenti', action: this.handleBuyTicket.bind(this) },
    ];

    // Raggruppa i bottoni in base ai separatori
    get groupedButtons() {
        const groups = [];
        let start = 0;

        this.SEPARATORS.forEach((separatorIndex, index) => {
            const group = this.rawButtons.slice(start, separatorIndex);
            groups.push({
                groupKey: `group-${index}`, // Chiave unica per il gruppo
                separatorKey: `separator-${index}`, // Chiave unica per il separatore
                buttons: group,
                isOdd: group.length % 2 !== 0, // Verifica se il gruppo ha un numero dispari di bottoni
                hasSeparator: index < this.SEPARATORS.length // Determina se deve avere un separatore
            });
            start = separatorIndex;
        });

        // Aggiunge i bottoni rimanenti come ultimo gruppo
        if (start < this.rawButtons.length) {
            const group = this.rawButtons.slice(start);
            groups.push({
                groupKey: `group-${groups.length}`, // Chiave unica per il gruppo
                separatorKey: `separator-${groups.length}`, // Chiave unica per il separatore
                buttons: group,
                isOdd: group.length % 2 !== 0,
                hasSeparator: false // L'ultimo gruppo non ha separatore
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

    handleFlowStatusChange(event) {
        if (event.detail.status === 'FINISHED') {
            this.closeFlow(); // Chiude il modale
        }
    }

    handleNewStructure() {
        this.openFlow('NewSupplier');
    }

    // handleBuyTicket(){
    //     this.openFlow('BuyTicket');
    // }
}