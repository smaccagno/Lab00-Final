import { LightningElement, api, wire } from 'lwc'; 
import getRelatedRecords from '@salesforce/apex/Donazioni.getRelatedRecords';
import getAvailableYears from '@salesforce/apex/Donazioni.getAvailableYears';


const COLUMNS = [

    { label: 'Descrizione', fieldName: 'Title__c' },
    { label: 'Data Ricezione', fieldName: 'GiftReceivedDate' },
    { label: 'Data Competenza', fieldName: 'Data_di_Competenza__c' },
 
];

export default class Donazioni extends LightningElement {
    @api recordId;
    relatedData = [];
    yearOptions = [];
    selectedYear = String(new Date().getFullYear());
    totalOriginal = 0; // Variabile per la somma degli "Paid"
    totalToDistribute = 0; // Variabile per la somma degli "Distributed"
    columns = COLUMNS;

    @wire(getAvailableYears)
    wiredYears({ error, data }) {
        if (data) {
            this.yearOptions = data.map(year => ({ label: year, value: year }));
        } else if (error) {
            console.error('Error retrieving years:', error);
        }
    }

    @wire(getRelatedRecords, { year: '$selectedYear' })
    wiredData({ error, data }) {
        if (data) {
            // Estrai records e somme dalla risposta
            this.relatedData = data.records.map(record => ({
                ...record,
                recordLink: '/' + record.Id,
                donorLink: '/' + record.DonorId,
                donorName: record.Nome_Donatore__c,
                transLink: '/' + record.GiftTransactionId,
                transName: record.GiftTransaction.Name,
                formattedPercent: record.Withholding_percent__c + '%',
                yearLink: '/' + record.Reporting_Year__c,
                yearName: record.Reporting_Year__r.Name
            }));
            this.totalOriginal = data.totalOriginal; // Imposta il totale "Paid"
            this.totalToDistribute = data.totalToDistribute; // Imposta il totale "Distributed"
        } else if (error) {
            console.error('Error retrieving related records:', error);
        }
    }

    handleYearChange(event) {
        this.selectedYear = event.detail.value; // Aggiorna l'anno selezionato
        // Il metodo wiredData si occupa di ricaricare i dati automaticamente.
    }

    onHandleSort(event) {
        const { fieldName: sortedBy, sortDirection } = event.detail;
        const cloneData = [...this.relatedData];

        cloneData.sort(this.sortBy(sortedBy, sortDirection === 'asc' ? 1 : -1));
        this.relatedData = cloneData;
        this.sortDirection = sortDirection;
        this.sortedBy = sortedBy;
    }

    sortBy(field, reverse, primer) {
        const key = primer
            ? function (x) {
                  return primer(x[field]);
              }
            : function (x) {
                  return x[field];
              };

        return function (a, b) {
            a = key(a);
            b = key(b);
            return reverse * ((a > b) - (b > a));
        };
    }
}