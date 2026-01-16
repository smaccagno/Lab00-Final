import { LightningElement, api, track } from "lwc";

export default class TicketItem extends LightningElement {
    
    @track dropdownStyle = "display: none;";
    @track showErrorMessage = false;
    @track isInputValid = true;

    @api totalCommercial;
    @api totalDiscounted;
    @api totalQuantity;

    comune = "";
    provincia = "";
    regione = "";
    amountCommercial = 0;
    amountDiscounted = 0;
    ticketNumbers = 0;

    // Proprietà per ricevere la variabile gratuita
    _gratuita;
    @api
    set gratuita(value) {
        this._gratuita = value;

        if (value === true || value === "true") {
            this.amount = 0;
        }
    }

    get gratuita() {
        return this._gratuita;
    }

    get inputClass() {
        return `no-padding-input ${this.isInputValid ? "" : "slds-has-error"}`.trim();
    }

    @api
    get ticketData() {
        return {
            ticketNumbers: this.ticketNumbers,
            amountCommercial: this.amountCommercial,
            amountDiscounted: this.amountDiscounted,
            comune: this.comune,
            provincia: this.provincia,
            regione: this.regione
        };
    }

    set ticketData(data) {
        if (data) {
            this.ticketNumbers = data.ticketNumbers || 0;
            this.amountCommercial = data.amountCommercial || 0;
            this.amountDiscounted = data.amountDiscounted || 0;
        }
    }

    handleComuneChange(event) {
        const { comune, provincia, regione } = event.detail;
        this.comune = comune;
        this.provincia = provincia;
        this.regione = regione;
        this.notifyParent(); // mantiene in sync il livello superiore
    }

    handleTicketNumbers(event) {
        this.ticketNumbers = event.target.value;
        this.notifyParent();

        this.calculateAmounts();
    }

    notifyParent() {
        const updateEvent = new CustomEvent("updateticket", { detail: { ...this.ticketData  } });
        console.log("TipoVisitaItem - Evento inviato con dati:", this.ticketData);
        this.dispatchEvent(updateEvent);
    }

    getRowAmount(total){
        return ((total / this.totalQuantity) * this.ticketNumbers).toFixed(2);
    }

    @api calculateAmounts(){
        setTimeout(() => {
            const commercial = Number(this.getRowAmount(this.totalCommercial));
            const dicounted = Number(this.getRowAmount(this.totalDiscounted));

            if (commercial != this.amountCommercial || dicounted != this.amountDiscounted) {
                this.amountCommercial = commercial || 0;
                this.amountDiscounted = dicounted || 0;
                this.notifyParent();
            }
        }, 0);
    }
}