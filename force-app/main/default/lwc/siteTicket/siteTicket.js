import { api, LightningElement, track, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import getTickets from '@salesforce/apex/SiteController.getTickets';
import deleteTicket from '@salesforce/apex/SiteController.deleteTicket';

const edit = { label: 'Modifica', name: 'edit' };
const del = { label: 'Elimina', name: 'delete' };
const load = { label: 'Carica Biglietto/Abbonamento', name: 'load' };

const columns = [
    { label: 'Codice', fieldName: 'name', initialWidth: 200 },
    { label: 'Tipologia Offerta', fieldName: 'type', initialWidth: 300, sortable: true },
    { label: 'Spettacolo/Abbonamento', fieldName: 'showName', initialWidth: 200 },
    { label: 'Tipologia', fieldName: 'showType', initialWidth: 200, sortable: true },
    { label: 'Data/Ora Spettacolo', fieldName: 'showDatetime', type: 'date', typeAttributes:{ year: "numeric", month: "numeric", day: "2-digit", hour: "2-digit", minute: "2-digit" }, initialWidth: 150, sortable: true },
    { label: 'N° Biglietti/Ingressi', fieldName: 'uses', type: 'number', initialWidth: 100 },
    // { label: 'Inizio Validità', fieldName: 'startValidity', type: 'date', typeAttributes:{ year: "numeric", month: "numeric", day: "2-digit", hour: "2-digit", minute: "2-digit" }, initialWidth: 130 },
    // { label: 'Fine Validità', fieldName: 'endValidity', type: 'date', typeAttributes:{ year: "numeric", month: "numeric", day: "2-digit", hour: "2-digit", minute: "2-digit" }, initialWidth: 130 },
    { label: 'Prezzo Intero', fieldName: 'price', type: 'currency', typeAttributes: { currencyCode: 'EUR' }, initialWidth: 100 },
    { label: 'Prezzo Scontato', fieldName: 'priceDiscount', type: 'currency', typeAttributes: { currencyCode: 'EUR' }, initialWidth: 100 },
    { label: 'Offerta Valida Entro Il', fieldName: 'expirationDate', type: 'date', typeAttributes:{ year: "numeric", month: "numeric", day: "2-digit" }, initialWidth: 100 },
    { label: 'Stato', fieldName: 'state', initialWidth: 100, sortable: true  }
];

export default class SiteTicket extends LightningElement {
    columns = [
        ...columns,
        { type: 'action', typeAttributes: { rowActions: this.getRowActions.bind(this) } }
    ];

    @api account;

    @track isModalOpen = false;  

    flowInputVariables = [];
    flowTitle;
    flowName;
    dataLoaded = false;

    @track data = [];
    @track wiredTicketsResult;

    @wire(getTickets, { accountId: '$account.Id' })
    wiredTickets(result){
        this.wiredTicketsResult = result;
        const { data, error } = result;

        if(data){
            this.data = data?.map(ticket => {
                return {
                    id: ticket.Id,
                    type: `${ticket.TicketType__c} ${ticket.IssuanceType__c} - ${ticket.PaymentType__c}`,
                    issuanceType: ticket.IssuanceType__c,
                    paymentType: ticket.PaymentType__c,
                    showName: ticket.Show__r?.Name || ticket.SubscriptionName__c,
                    showType: ticket.Show__r?.Type__c || ticket.SubscriptionType__c,
                    showDatetime: ticket.Show__r?.Datetime__c,
                    startValidity: ticket.StartValidity__c,
                    endValidity: ticket.EndValidity__c,
                    state: ticket.State__c,
                    price: ticket.PriceFull__c || 0,
                    priceDiscount: ticket.PriceDiscounted__c || 0,
                    expirationDate: ticket.OfferExpirationDate__c,
                    uses: ticket.NumberUses__c || 0,
                    name: ticket.Name
                }
            });

            this.dataLoaded = true;
        } else if (error) {
            console.error(error);
        }
    }

    get jsonData(){
        return this.data.map(data => {
            let result = {};
            Object.keys(data).forEach(key => {
                const column = this.columns.find(column => column.fieldName == key);

                if (column) { result[column.label] = data[key]; }
            })
            return result;
        });
    }

    get showWelcomeText(){
        return this.dataLoaded && !this.data.length;
    }

    getRowActions(row, doneCallback) {
        let actions = [];

        switch (row.state) {
            case 'Disponibile':
                actions = [edit, del];
                break;
            case 'Prenotato':
                actions = [load];
                break;
            default:
                break;
        }

        doneCallback(actions);
    }

    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const row = event.detail.row;

        switch (actionName) {
            case edit.name:
                this.editRow(row);
                break;
            case del.name:
                this.deleteRow(row);
                break;
            case load.name:
                this.loadRow(row);
                break;
            default:
                break;
        }
    }

    editRow(row) {
        this.flowTitle = 'Modifica Offerta';
        this.flowName = 'EditTicket';
        this.flowInputVariables = [
            {
                name: 'TicketAvailabilityId',
                type: 'String',
                value: row.id
            }
        ];
        this.openModal();
    }

    deleteRow(row) {
        this.loading(true);
        deleteTicket({ ticketId: row.id })
        .then(() => {
            this.refreshData();
            this.toast('Successo', 'Offerta eliminata correttamente!');
        })
        .catch(error => {
            console.error(error);
            this.toast('Errore', `Si è verificato un errore durante l'eliminzaione dell'offerta.`, 'error');
        })
        .finally(() => {
            this.loading(false);
        });
    }

    loadRow(row){
        this.flowTitle = 'Carica Biglietto/Abbonamento';
        this.flowName = 'LoadTicket';
        this.flowInputVariables = [
            {
                name: 'TicketAvailabilityId',
                type: 'String',
                value: row.id
            }
        ];
        this.openModal();
    }

    newTicket(){
        this.flowTitle = 'Nuova Offerta';
        this.flowName = 'NewTicket';
        this.flowInputVariables = [
            {
                name: 'StructureId',
                type: 'String',
                value: this.account?.Id
            }
        ];
        this.openModal();
    }

    openModal() {
        this.isModalOpen = true;
    }

    closeModal() {
        this.refreshData();
        this.isModalOpen = false;
    }

    refreshData(){
        refreshApex(this.wiredTicketsResult);
    }

    toast(title, message, variant = 'success', mode = 'dismissible'){
        this.dispatchEvent(new ShowToastEvent({title, message, variant, mode}));
    }

    loading(loading){
        this.dispatchEvent(new CustomEvent('loading', { detail: loading }));
    }

    handleSort(event) {
        const { fieldName, sortDirection } = event.detail;
        this.sortedBy = fieldName;
        this.sortDirection = sortDirection;
        this.sortData(fieldName, sortDirection);
    }

    sortData(fieldName, direction) {
        const data = [...this.data];
        const isReverse = direction === 'desc' ? -1 : 1;

        const sortedData = [...data].sort((a, b) => {
            let valueA = a[fieldName];
            let valueB = b[fieldName];

            const aIsNull = valueA == null;
            const bIsNull = valueB == null;

            if (aIsNull && bIsNull) return 0;
            if (aIsNull) return -1 * isReverse;
            if (bIsNull) return 1 * isReverse;

            if (valueA instanceof Date) valueA = new Date(valueA);
            if (valueB instanceof Date) valueB = new Date(valueB);

            if (valueA < valueB) return -1 * isReverse;
            if (valueA > valueB) return 1 * isReverse;
            return 0;
        });

        this.data = sortedData;
    }

}