import { LightningElement, api, wire } from 'lwc';
import getRelatedRecords from '@salesforce/apex/Transazioni.getRelatedRecords';
import getAvailableYears from '@salesforce/apex/Transazioni.getAvailableYears';
import getAvailablePrograms from '@salesforce/apex/Transazioni.getAvailablePrograms';

// Definiamo le colonne per la lightning-datatable
const COLUMNS = [
    {
        label: 'Nome Transazione',
        fieldName: 'recordLink',
        type: 'url',
        typeAttributes: {
            label: { fieldName: 'Name' },
            target: '_self'
        }
    },
    {
        label: 'Donatore',
        fieldName: 'donorLink',
        type: 'url',
        typeAttributes: {
            label: { fieldName: 'Nome_Donatore__c' },
            target: '_self'
        }
    },
    {
        label: 'Data Competenza',
        fieldName: 'Data_di_Competenza__c',
        type: 'date'
    },
    {
        label: 'Data Donazione',
        fieldName: 'TransactionDate',
        type: 'date'
    },
    {
        label: 'Donato',
        fieldName: 'Original_Donation_Amount__c',
        type: 'currency',
        typeAttributes: { currencyCode: 'EUR' }
    },
    {   label: 'Trattenuta %', 
        fieldName: 'formattedPercent', 
        type: 'text' 
    },    
    {
        label: 'Allocabile',
        fieldName: 'CurrentAmount',
        type: 'currency',
        typeAttributes: { currencyCode: 'EUR' }
    },    
    {
        label: 'Numero Allocazioni',
        fieldName: 'Total_Allocations__c'
    },
    {
        label: 'Allocazioni Non Pagate',
        fieldName: 'Allocation_not_paid__c'
    },    
    {
        label: 'Metodo di Pagamento',
        fieldName: 'PaymentMethod',
        type: 'text'
    },
    {
        label: 'Campagna',
        fieldName: 'campaignLink',
        type: 'url',
        typeAttributes: {
            label: { fieldName: 'campaignName' },
            target: '_self'
        }
    }
];

export default class GiftTransactions extends LightningElement {
    @api recordId;
    relatedData = [];
    yearOptions = [];
    programOptions = [];
    selectedYear = String(new Date().getFullYear());
    selectedProgram = '';
    totalOriginalDonation = 0;
    totalAllocations = 0;
    totalAllocated = 0;
    totalAllocatedPaid = 0;
    totalAllocatedNotPaid = 0;
    totalAllocable = 0;
    columns = COLUMNS;
    isLoading = false;

    statusOptions = [
        { label: 'Tutte', value: 'all' },
        { label: 'Allocate ma NON Pagate', value: 'Distributed' },
        { label: 'Allocate e Pagate', value: 'Paid' },
        { label: 'Non Allocate', value: 'Created' },
    ];
    selectedStatus = 'all'; // di default mostra tutto

    @wire(getAvailableYears)
    wiredYears({ error, data }) {
        if (data) {
            const uniqueYears = [...new Set(data)];
            const currentYear = new Date().getFullYear().toString();

            this.yearOptions = [
                { label: 'Tutti gli Anni', value: '' },
                ...uniqueYears.map(year => ({
                    label: year,
                    value: year
                }))
            ];

            // Se l'anno corrente è disponibile, selezionalo come default
            if (uniqueYears.includes(currentYear)) {
                this.selectedYear = currentYear;
            } else {
                this.selectedYear = '';
            }
        } else if (error) {
            console.error('Error retrieving years:', error);
        }
    }

    @wire(getAvailablePrograms)
    wiredPrograms({ error, data }) {
        if (data) {
            const options = data.map(program => ({
                label: program.Name,
                value: program.Id
            }));

            // Prependiamo l'opzione "Tutti i Programmi"
            this.programOptions = [
                { label: 'Tutti i Programmi', value: '' },
                ...options
            ];

            // Se vuoi iniziare senza alcun filtro
            this.selectedProgram = '';
        } else if (error) {
            console.error('Error retrieving programs:', error);
        }
    }

    @wire(getRelatedRecords, { year: '$selectedYear', program: '$selectedProgram', status: '$selectedStatus' })
    wiredData({ error, data }) {
        if (data) {
            // Mappiamo i dati per la tabella
            this.relatedData = data.records.map(record => ({
                ...record,
                recordLink: '/' + record.Id,
                donorLink: '/' + record.DonorId,
                formattedPercent: record.Withholding__c + '%',
                campaignLink: record.CampaignId ? '/' + record.CampaignId : '',
                campaignName: record.Campaign ? record.Campaign.Name : '',        
            }));

            this.totalOriginalDonation = data.totalOriginalDonation;
            this.totalAllocations = data.totalAllocations;
            this.totalAllocationsPaid = data.totalAllocationsPaid;
            this.totalAllocated = data.totalAllocated;
            this.totalAllocatedPaid = data.totalAllocatedPaid;
            this.totalAllocatedNotPaid = data.totalAllocatedNotPaid;
            this.totalAllocable = data.totalAllocable;
        } else if (error) {
            console.error('Error retrieving related records:', error);
        }
        this.isLoading = false;
    }

    // --- HANDLERS ---

    handleYearChange(event) {
        this.isLoading = true;
        this.selectedYear = event.detail.value;
    }

    handleProgramChange(event) {
        this.isLoading = true;
        this.selectedProgram = event.detail.value;
    }

        // Nuovo handler per lo Status
    handleStatusChange(event) {
        this.isLoading = true;
        this.selectedStatus = event.detail.value;
    }
}