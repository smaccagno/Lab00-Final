import { LightningElement, api, wire } from 'lwc';
import getSummary from '@salesforce/apex/BudgetSummaryController.getSummary';

export default class BudgetSummaryByCategory extends LightningElement {
    @api recordId;

    selectedDate;
    incassi = [];
    spese = [];
    cashFlow = [];
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
            
            let totalIncassiEffettivo = 0;
            let totalIncassiPrevisto = 0;
            let totalSpeseEffettivo = 0;
            let totalSpesePrevisto = 0;
            
            // Trova il valore massimo per scalare le barre proporzionalmente (da 0 a 100%)
            if (data.incassi) {
                data.incassi.forEach(item => { 
                    if (item.totale > maxIncassiVal) maxIncassiVal = item.totale; 
                    totalIncassiEffettivo += item.effettivo;
                    totalIncassiPrevisto += item.previsto;
                });
            }
            if (data.spese) {
                data.spese.forEach(item => { 
                    if (item.totale > maxSpeseVal) maxSpeseVal = item.totale; 
                    totalSpeseEffettivo += item.effettivo;
                    totalSpesePrevisto += item.previsto;
                });
            }

            // Evita divisioni per zero
            maxIncassiVal = maxIncassiVal > 0 ? maxIncassiVal : 1;
            maxSpeseVal = maxSpeseVal > 0 ? maxSpeseVal : 1;

            this.incassi = (data.incassi || []).map(item => {
                let segments = [];
                
                let pStyle = `width: ${(item.previsto / maxIncassiVal) * 100}%;`;
                if (item.previsto === 0) {
                    pStyle = `width: 35px; border-right: 1px solid rgba(255,255,255,0.5);`;
                }
                segments.push({
                    id: 'previsto',
                    value: item.previsto,
                    style: pStyle,
                    cssClass: 'bar-fill bar-incasso-previsto',
                    title: 'Previsto'
                });

                if (item.effettivo > 0) {
                    segments.push({
                        id: 'effettivo',
                        value: item.effettivo,
                        style: `width: ${(item.effettivo / maxIncassiVal) * 100}%;`,
                        cssClass: 'bar-fill bar-incasso-effettivo',
                        title: 'Effettivo'
                    });
                }

                segments.sort((a, b) => b.value - a.value);

                return {
                    ...item,
                    segments: segments
                };
            });

            this.spese = (data.spese || []).map(item => {
                let segments = [];
                
                let pStyle = `width: ${(item.previsto / maxSpeseVal) * 100}%;`;
                if (item.previsto === 0) {
                    pStyle = `width: 35px; border-right: 1px solid rgba(255,255,255,0.5);`;
                }
                segments.push({
                    id: 'previsto',
                    value: item.previsto,
                    style: pStyle,
                    cssClass: 'bar-fill bar-spesa-previsto',
                    title: 'Previsto'
                });

                if (item.effettivo > 0) {
                    segments.push({
                        id: 'effettivo',
                        value: item.effettivo,
                        style: `width: ${(item.effettivo / maxSpeseVal) * 100}%;`,
                        cssClass: 'bar-fill bar-spesa-effettivo',
                        title: 'Effettivo'
                    });
                }

                segments.sort((a, b) => b.value - a.value);

                return {
                    ...item,
                    segments: segments
                };
            });

            this.hasData = this.incassi.length > 0 || this.spese.length > 0;
            
            // Cash Flow logic
            let totalIncassi = totalIncassiEffettivo + totalIncassiPrevisto;
            let totalSpese = totalSpeseEffettivo + totalSpesePrevisto;
            
            let dispEffettivo = totalIncassiEffettivo - totalSpeseEffettivo;
            let dispPrevisto = totalIncassiPrevisto - totalSpesePrevisto;
            let totalDisp = dispEffettivo + dispPrevisto;

            let maxCashFlowVal = Math.max(totalIncassi, totalSpese, Math.abs(dispEffettivo), Math.abs(dispPrevisto));
            maxCashFlowVal = maxCashFlowVal > 0 ? maxCashFlowVal : 1;

            let cfIncassiSegments = [];
            let cfIncassiPStyle = `width: ${(totalIncassiPrevisto / maxCashFlowVal) * 100}%;`;
            if (totalIncassiPrevisto === 0) {
                cfIncassiPStyle = `width: 35px; border-right: 1px solid rgba(255,255,255,0.5);`;
            }
            cfIncassiSegments.push({
                id: 'previsto',
                value: totalIncassiPrevisto,
                style: cfIncassiPStyle,
                cssClass: 'bar-fill bar-incasso-previsto',
                title: 'Previsto'
            });
            if (totalIncassiEffettivo > 0) {
                cfIncassiSegments.push({
                    id: 'effettivo',
                    value: totalIncassiEffettivo,
                    style: `width: ${(totalIncassiEffettivo / maxCashFlowVal) * 100}%;`,
                    cssClass: 'bar-fill bar-incasso-effettivo',
                    title: 'Effettivo'
                });
            }
            cfIncassiSegments.sort((a, b) => b.value - a.value);

            let cfSpeseSegments = [];
            let cfSpesePStyle = `width: ${(totalSpesePrevisto / maxCashFlowVal) * 100}%;`;
            if (totalSpesePrevisto === 0) {
                cfSpesePStyle = `width: 35px; border-right: 1px solid rgba(255,255,255,0.5);`;
            }
            cfSpeseSegments.push({
                id: 'previsto',
                value: totalSpesePrevisto,
                style: cfSpesePStyle,
                cssClass: 'bar-fill bar-spesa-previsto',
                title: 'Previsto'
            });
            if (totalSpeseEffettivo > 0) {
                cfSpeseSegments.push({
                    id: 'effettivo',
                    value: totalSpeseEffettivo,
                    style: `width: ${(totalSpeseEffettivo / maxCashFlowVal) * 100}%;`,
                    cssClass: 'bar-fill bar-spesa-effettivo',
                    title: 'Effettivo'
                });
            }
            cfSpeseSegments.sort((a, b) => b.value - a.value);

            let cfDispSegments = [];
            let dispPrevWidth = Math.max(0, dispPrevisto);
            let cfDispPStyle = `width: ${(dispPrevWidth / maxCashFlowVal) * 100}%;`;
            if (dispPrevisto <= 0) {
                cfDispPStyle = `width: 45px; border-right: 1px solid rgba(255,255,255,0.5);`;
            }
            cfDispSegments.push({
                id: 'previsto',
                value: dispPrevisto,
                style: cfDispPStyle,
                cssClass: 'bar-fill bar-disp-previsto',
                title: 'Previsto'
            });

            let dispEffWidth = Math.max(0, dispEffettivo);
            let cfDispEStyle = `width: ${(dispEffWidth / maxCashFlowVal) * 100}%;`;
            if (dispEffettivo <= 0) {
                cfDispEStyle = `width: 45px; border-right: 1px solid rgba(255,255,255,0.5);`;
            }
            cfDispSegments.push({
                id: 'effettivo',
                value: dispEffettivo,
                style: cfDispEStyle,
                cssClass: 'bar-fill bar-disp-effettivo',
                title: 'Effettivo'
            });
            cfDispSegments.sort((a, b) => b.value - a.value);

            this.cashFlow = [];
            if (totalIncassi > 0 || totalSpese > 0) {
                this.cashFlow.push({
                    categoria: 'Totale Incassi',
                    totale: totalIncassi,
                    segments: cfIncassiSegments
                });
                this.cashFlow.push({
                    categoria: 'Totale Spese',
                    totale: totalSpese,
                    segments: cfSpeseSegments
                });
                this.cashFlow.push({
                    categoria: 'Disponibile',
                    totale: totalDisp,
                    segments: cfDispSegments
                });
            }

            this.error = undefined;
        } else if (error) {
            this.error = error.body ? error.body.message : error.message;
            this.incassi = [];
            this.spese = [];
            this.cashFlow = [];
            this.hasData = false;
        }
    }
}
