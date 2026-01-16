import { LightningElement, track, wire } from 'lwc';
import getPagamenti from '@salesforce/apex/PagamentiController.getPagamenti';
import getAvailablePrograms from '@salesforce/apex/PagamentiController.getAvailablePrograms';
import getAvailableYears from '@salesforce/apex/PagamentiController.getAvailableYears';
import getAvailableStatuses from '@salesforce/apex/PagamentiController.getAvailableStatuses';

const COLUMNS = [
    {
        label: 'Codice',
        fieldName: 'recordLink',
        type: 'url',
        typeAttributes: {
            label: { fieldName: 'Name' },
            target: '_self'
        }
    },
    {
        label: 'Ammontare',
        fieldName: 'Amount__c',
        type: 'currency',
        typeAttributes: { currencyCode: 'EUR' }
    },
    {
        label: 'Budget',
        fieldName: 'budgetLink',
        type: 'url',
        typeAttributes: {
            label: { fieldName: 'BudgetName' },
            target: '_self'
        }
    },
    {
        label: 'Stato',
        fieldName: 'Status__c',
        type: 'text'
    },
    {
        label: 'Data del Pagamento',
        fieldName: 'Data_di_Pagamento__c',
        type: 'date'
    }
];

export default class PagamentiOverview extends LightningElement {
    @track selectedProgram = '';
    @track selectedYear = '';
    @track selectedStatus = 'all';

    @track programOptions = [];
    @track yearOptions = [];
    @track statusOptions = [];

    // Elenco completo dei pagamenti secondo i filtri correnti
    @track pagamenti = [];
    @track pagamentiDaPagare = [];
    @track pagamentiPagati = [];

    @track totalePagato = 0;
    @track isLoading = false;

    columns = COLUMNS;

    connectedCallback() {
        this.loadFilters();
        this.fetchData();
    }

    async loadFilters() {
        try {
            const [programs, years, statuses] = await Promise.all([
                getAvailablePrograms(),
                getAvailableYears(),
                getAvailableStatuses()
            ]);

            this.programOptions = [{ label: 'Tutti i Programmi', value: '' }, ...programs.map(p => ({
                label: p.Name,
                value: p.Id
            }))];

            this.yearOptions = [{ label: 'Tutti gli Anni', value: '' }, ...years.map(y => ({ label: y, value: y }))];

            this.statusOptions = [{ label: 'Tutti gli Stati', value: 'all' }, ...statuses.map(s => ({
                label: s,
                value: s
            }))];
        } catch (error) {
            console.error('Errore nel caricamento dei filtri:', error);
        }
    }

    async fetchData() {
        this.isLoading = true;
        try {
            const result = await getPagamenti({
                year: this.selectedYear,
                programId: this.selectedProgram,
                stato: this.selectedStatus
            });

            const allPayments = result.records.map(p => ({
                ...p,
                recordLink: '/' + p.Id,
                budgetLink: p.Budget__c ? '/' + p.Budget__c : '',
                BudgetName: p.Budget__r?.Name || ''
            }));

            this.totalePagato = result.totalePagato || 0;

            // Imposta la lista principale per la tabella
            this.pagamenti = allPayments;
            this.pagamentiDaPagare = allPayments.filter(p => p.Status__c !== 'Pagato');
            this.pagamentiPagati = allPayments.filter(p => p.Status__c === 'Pagato');
        } catch (error) {
            console.error('Errore nel recupero dei pagamenti:', error);
        } finally {
            this.isLoading = false;
        }
    }

    handleProgramChange(event) {
        this.selectedProgram = event.detail.value;
        this.fetchData();
    }

    handleYearChange(event) {
        this.selectedYear = event.detail.value;
        this.fetchData();
    }

    handleStatusChange(event) {
        this.selectedStatus = event.detail.value;
        this.fetchData();
    }
}