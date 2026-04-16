import { LightningElement, api, wire } from 'lwc';
import getSummary from '@salesforce/apex/BudgetSummaryController.getSummary';

export default class BudgetSummaryByCategory extends LightningElement {
    @api recordId;

    selectedDate;
    incassi = [];
    spese = [];
    hasData = false;
    error;

    handleDateChange(event) {
        this.selectedDate = event.target.value;
    }

    @wire(getSummary, { recordId: '$recordId', filterDate: '$selectedDate' })
    wiredSummary({ error, data }) {
        if (data) {
            let maxIncassiVal = 0;
            let maxSpeseVal = 0;
            
            // Trova il valore massimo per scalare le barre proporzionalmente (da 0 a 100%)
            if (data.incassi) {
                data.incassi.forEach(item => { if (item.totale > maxIncassiVal) maxIncassiVal = item.totale; });
            }
            if (data.spese) {
                data.spese.forEach(item => { if (item.totale > maxSpeseVal) maxSpeseVal = item.totale; });
            }

            // Evita divisioni per zero
            maxIncassiVal = maxIncassiVal > 0 ? maxIncassiVal : 1;
            maxSpeseVal = maxSpeseVal > 0 ? maxSpeseVal : 1;

            this.incassi = (data.incassi || []).map(item => {
                let pStyle = `width: ${(item.previsto / maxIncassiVal) * 100}%; min-width: 35px;`;
                if (item.previsto === 0) {
                    pStyle += ` border-left: 1px solid rgba(255,255,255,0.5);`;
                }
                return {
                    ...item,
                    effettivoStyle: `width: ${(item.effettivo / maxIncassiVal) * 100}%; min-width: 35px;`,
                    previstoStyle: pStyle,
                    effettivoClass: 'bar-fill bar-incasso-effettivo',
                    previstoClass: 'bar-fill bar-incasso-previsto',
                    showEffettivo: item.effettivo > 0,
                    showPrevisto: true
                };
            });

            this.spese = (data.spese || []).map(item => {
                let pStyle = `width: ${(item.previsto / maxSpeseVal) * 100}%; min-width: 35px;`;
                if (item.previsto === 0) {
                    pStyle += ` border-left: 1px solid rgba(255,255,255,0.5);`;
                }
                return {
                    ...item,
                    effettivoStyle: `width: ${(item.effettivo / maxSpeseVal) * 100}%; min-width: 35px;`,
                    previstoStyle: pStyle,
                    effettivoClass: 'bar-fill bar-spesa-effettivo',
                    previstoClass: 'bar-fill bar-spesa-previsto',
                    showEffettivo: item.effettivo > 0,
                    showPrevisto: true
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
