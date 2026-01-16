import { LightningElement, track, api } from "lwc";
import { FlowNavigationHandler, FlowNavigationNextEvent, FlowAttributeChangeEvent } from "lightning/flowSupport";

export default class TicketRepeater extends LightningElement {
    @track tipoTicketsList = [];
	@track saveButtonVariant = "brand"; // Variante del pulsante Salva Tickets
	@track isValidInputs = false; // Nuova variabile per gestire la visibilità del pulsante Aggiungi

	/** Deprecated */
	@api isComplete; 
	@api invoiceDate; 
	@api invoiceId; 
	@api createdTicketIds;
    @api totalAmount;
	/** Deprecated */

	@api totalQuantity;
    @api structureName;
    @api showName;
    @api tickets = [];
	@api isManual;

	totalCommercial;
	_totalAmountCommercial;
	@api 
	set totalAmountCommercial(totalAmountCommercial){
		this.totalCommercial = totalAmountCommercial;
		this._totalAmountCommercial = totalAmountCommercial;
	}
	get totalAmountCommercial(){
		return this._totalAmountCommercial;
	}

	totalDiscounted;
	_totalAmountDiscounted;
	@api 
	set totalAmountDiscounted(totalAmountDiscounted){
		this.totalDiscounted = totalAmountDiscounted;
		this._totalAmountDiscounted = totalAmountDiscounted;
	}
	get totalAmountDiscounted(){
		return this._totalAmountDiscounted;
	}
	
	get isTotalDiscountedDisabled(){
		return this._totalAmountDiscounted || this.gratuita;
	}
	
	get isTotalCommercialDisabled(){
		return this._totalAmountCommercial || this.gratuita;
	}

    @api get gratuita(){
      	return !this.totalDiscounted && !this.isManual;
    }
      
	get isNextDisabled() {
		return !this.isValidInputs;
	}
    
	/** Ritorna la lista aggiungendo il sequenziale (1-based) */
	get tipoTicketsWithIndex() {
		return this.tipoTicketsList.map((ticket, idx) => ({
			...ticket,
			seq: idx + 1 // Ticket 1, Ticket 2, …
		}));
	}

    get totalQuantityInput(){
        return this.tipoTicketsList.reduce((acc, curr) => {
            return acc + Number(curr?.data?.ticketNumbers);
        }, 0);
    }

	get totalAmountDiscountedInput(){
        return this.tipoTicketsList.reduce((acc, curr) => {
            return acc + Number(curr?.data?.amountDiscounted);
        }, 0);
    }

    get validCityInput(){
        return !this.tipoTicketsList.some(ticket => !ticket.data.comune);
    } 

	get quantityShow(){
		return this.totalQuantity || this.totalQuantityInput;
	}

	connectedCallback() {
		if (this.tipoTicketsList.length === 0) this.addTipoTicket();
	}
    
	notifyFlow() {
		const attributeChangeEvent = new CustomEvent("iscompletechange", { detail: { value: this.isValidInputs } });
		this.dispatchEvent(attributeChangeEvent);

		// ✅ Forza il Flow a ricalcolare la variabile
		const flowHandler = new FlowNavigationHandler();
		flowHandler.refreshFlowScreen();
	}

	generateUniqueId() {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	addTipoTicket() {
		const newId = this.generateUniqueId();
		this.tipoTicketsList = [
			...this.tipoTicketsList,
			{
				id: newId,
				data: {
					ticketNumbers: 0,
					amount: 0.0, 
					comune: "",
					provincia: "",
					regione: ""
				}
			}
		];
	}
    
	removeTicket(event) {
		const idToRemove = event.target.dataset.id;
		this.tipoTicketsList = this.tipoTicketsList.filter(ticket => ticket.id !== idToRemove);
		this.calculateAmounts();
		this.tickets = this.setTickets();
		this.dispatchEvent(new FlowAttributeChangeEvent('tickets', this.tickets));
		this.setIsValidInput();
	}

	handleTicketChange(event) {
		const updatedId = event.currentTarget.dataset.id;
		const updatedData = event.detail;
		this.tipoTicketsList.find((ticket) => ticket.id === updatedId).data = { ...updatedData };
		this.calculateAmounts(updatedId);
		this.tickets = this.setTickets();
		this.dispatchEvent(new FlowAttributeChangeEvent('tickets', this.tickets));
		this.setIsValidInput();
	}

	setIsValidInput(){
		this.isValidInputs = this.validCityInput && 
							((this.totalQuantity && this.totalQuantityInput == this.totalQuantity) || (!this.totalQuantity && this.totalQuantityInput > 0)) && 
							(this.gratuita || this.totalAmountDiscountedInput == this.totalDiscounted) && 
							this.totalCommercial >= this.totalDiscounted;
	}
    
	handleNext() {
		this.dispatchEvent(new FlowNavigationNextEvent()); // Naviga avanti nel Flow
	}

	setTickets(){
		return this.tipoTicketsList.map(ticket => {
			return {
				apiName: 'Ticket__c',
				Uses__c: ticket.data.ticketNumbers,
				Price__c: ticket.data.amountDiscounted,
				CommercialValue__c: ticket.data.amountCommercial,
				City__c: ticket.data.comune,
				Province__c: ticket.data.provincia,
				Region__c: ticket.data.regione
			}
		});
	}

	handleTotalCommercialChange(event){
		this.totalCommercial = Number(event.detail.value);
		this.calculateAmounts();
	}

	handleTotalDiscountedChange(event){
		this.totalDiscounted = Number(event.detail.value);
		this.calculateAmounts();
	}

	calculateAmounts(ticketId){
		this.tipoTicketsList.filter(ticket => ticket.id !== ticketId).forEach(ticket => {
			this.template.querySelector(`[data-id="${ticket.id}"]`).calculateAmounts();
		});
	}
}