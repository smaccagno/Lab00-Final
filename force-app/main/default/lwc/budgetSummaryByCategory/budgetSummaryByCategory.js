import { LightningElement, api, wire } from 'lwc';
import getSummary from '@salesforce/apex/BudgetSummaryController.getSummary';

export default class BudgetSummaryByCategory extends LightningElement {
    @api recordId;

    incassi = [];
    spese = [];
    hasData = false;
    error;

    @wire(getSummary, { recordId: '$recordId' })
    wiredSummary({ error, data }) {
        if (data) {
            let maxVal = 0;
            
            // Trova il valore massimo per scalare le barre proporzionalmente (da 0 a 100%)
            if (data.incassi) {
                data.incassi.forEach(item => { if (item.totale > maxVal) maxVal = item.totale; });
            }
            if (data.spese) {
                data.spese.forEach(item => { if (item.totale > maxVal) maxVal = item.totale; });
            }

            // Evita divisioni per zero
            maxVal = maxVal > 0 ? maxVal : 1;

            this.incassi = (data.incassi || []).map(item => {
                return {
                    ...item,
                    widthStyle: `width: ${(item.totale / maxVal) * 100}%`,
                    barClass: 'bar-fill bar-incasso'
                };
            });

            this.spese = (data.spese || []).map(item => {
                return {
                    ...item,
                    widthStyle: `width: ${(item.totale / maxVal) * 100}%`,
                    barClass: 'bar-fill bar-spesa'
                };
            });

            this.hasData = this.incassi.length > 0 || this.spese.length > 0;
            this.error = undefined;
        } else if (error) {
            this.error = error.body ? error.body.message : error.message;
            this.incassi = [];
            this.spese = [];
            this.hasData = false;
        }
    }
}
