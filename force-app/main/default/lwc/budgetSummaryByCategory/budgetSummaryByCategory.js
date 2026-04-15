import { LightningElement, api, wire } from 'lwc';
import getSummary from '@salesforce/apex/BudgetSummaryController.getSummary';

export default class BudgetSummaryByCategory extends LightningElement {
    @api recordId;

    incassi = [];
    spese = [];
    hasIncassi = false;
    hasSpese = false;
    error;

    @wire(getSummary, { recordId: '$recordId' })
    wiredSummary({ error, data }) {
        if (data) {
            this.incassi = data.incassi;
            this.spese = data.spese;
            this.hasIncassi = this.incassi && this.incassi.length > 0;
            this.hasSpese = this.spese && this.spese.length > 0;
            this.error = undefined;
        } else if (error) {
            this.error = error.body ? error.body.message : error.message;
            this.incassi = [];
            this.spese = [];
            this.hasIncassi = false;
            this.hasSpese = false;
        }
    }
}