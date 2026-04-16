import { LightningElement, api, wire } from 'lwc';
import getSummary from '@salesforce/apex/BudgetSummaryController.getSummary';

export default class BudgetSummaryByCategory extends LightningElement {
    @api recordId;
    @api hideDateFilter = false;

    _selectedDate = new Date().toISOString().split('T')[0];

    @api
    get filterDate() {
        return this._selectedDate;
    }
    set filterDate(value) {
        if (value) {
            this._selectedDate = value;
        }
    }

    get selectedDate() {
        return this._selectedDate;
    }
    incassi = [];
    spese = [];
    cashFlow = [];
    hasData = false;
    error;

    tooltipVisible = false;
    tooltipStyle = '';
    tooltipTitle = '';
    tooltipItems = [];

    modalVisible = false;
    modalTitle = '';
    modalData = [];
    modalColumns = [
        { label: 'Titolo', fieldName: 'url', type: 'url', typeAttributes: { label: { fieldName: 'name' }, target: '_blank' } },
        { label: 'Data', fieldName: 'itemDate', type: 'date-local' },
        { label: 'Categoria', fieldName: 'category', type: 'text' },
        { label: 'Stato', fieldName: 'status', type: 'text' },
        { label: 'Transazione', fieldName: 'sourceTransactionName', type: 'text' },
        { label: 'Ammontare', fieldName: 'amount', type: 'currency', typeAttributes: { currencyCode: 'EUR' } }
    ];

    handleMouseOver(event) {
        const itemsJson = event.currentTarget.dataset.items;
        const title = event.currentTarget.dataset.title;
        if (itemsJson) {
            let parsedItems = JSON.parse(itemsJson);
            // Deduplicate items with same name, summing their values for tooltip
            let itemsMap = {};
            parsedItems.forEach(item => {
                let label = item.name || item.label;
                let val = item.amount !== undefined ? item.amount : item.value;
                if (itemsMap[label]) {
                    itemsMap[label].value += val;
                } else {
                    itemsMap[label] = { label: label, value: val };
                }
            });
            this.tooltipItems = Object.values(itemsMap).filter(item => item.value !== 0);
            this.tooltipTitle = title;
            if (this.tooltipItems.length > 0) {
                this.tooltipVisible = true;
            }
        }
    }

    handleMouseMove(event) {
        if (this.tooltipVisible) {
            // Offset slightly from cursor
            const x = event.clientX + 15;
            const y = event.clientY + 15;
            this.tooltipStyle = `left: ${x}px; top: ${y}px;`;
        }
    }

    handleMouseOut() {
        this.tooltipVisible = false;
    }

    handleBarClick(event) {
        const itemsJson = event.currentTarget.dataset.items;
        const title = event.currentTarget.dataset.title;
        const cat = event.currentTarget.dataset.category;
        if (itemsJson) {
            let parsedItems = JSON.parse(itemsJson);
            // For Cash Flow aggregates, parsedItems might not have full ItemDetail.
            // But we want to show the detailed table.
            // If it's cash flow, we might just show the aggregate in the modal or we can pass the full items.
            // We'll pass the full items in itemsJson.
            if (parsedItems && parsedItems.length > 0 && parsedItems[0].name !== undefined) {
                this.modalData = parsedItems;
                this.modalTitle = `Dettaglio: ${cat ? cat + ' - ' : ''}${title}`;
                this.modalVisible = true;
                this.tooltipVisible = false;
            }
        }
    }

    closeModal() {
        this.modalVisible = false;
    }

    handleDateChange(event) {
        this._selectedDate = event.target.value;
    }

    @wire(getSummary, { recordId: '$recordId', filterDate: '$_selectedDate' })
    wiredSummary({ error, data }) {
        if (data) {
            let maxIncassiVal = 0;
            let maxSpeseVal = 0;
            
            let totalIncassiEffettivo = 0;
            let totalIncassiPrevisto = 0;
            let totalSpeseEffettivo = 0;
            let totalSpesePrevisto = 0;
            
            let allIncassiPrevistiItems = [];
            let allIncassiEffettiviItems = [];
            let allSpesePrevistiItems = [];
            let allSpeseEffettiviItems = [];

            // Trova il valore massimo per scalare le barre proporzionalmente (da 0 a 100%)
            if (data.incassi) {
                data.incassi.forEach(item => { 
                    let maxBar = Math.max(item.effettivo, item.previsto);
                    if (maxBar > maxIncassiVal) maxIncassiVal = maxBar; 
                    totalIncassiEffettivo += item.effettivo;
                    totalIncassiPrevisto += item.previsto;
                    if (item.itemsPrevisti) allIncassiPrevistiItems.push(...item.itemsPrevisti);
                    if (item.itemsEffettivi) allIncassiEffettiviItems.push(...item.itemsEffettivi);
                });
            }
            if (data.spese) {
                data.spese.forEach(item => { 
                    let maxBar = Math.max(item.effettivo, item.previsto);
                    if (maxBar > maxSpeseVal) maxSpeseVal = maxBar; 
                    totalSpeseEffettivo += item.effettivo;
                    totalSpesePrevisto += item.previsto;
                    if (item.itemsPrevisti) allSpesePrevistiItems.push(...item.itemsPrevisti);
                    if (item.itemsEffettivi) allSpeseEffettiviItems.push(...item.itemsEffettivi);
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
                    cssClass: 'bar-fill bar-incasso-previsto clickable',
                    title: 'Previsto',
                    itemsJson: JSON.stringify(item.itemsPrevisti || [])
                });

                if (item.effettivo > 0) {
                    segments.push({
                        id: 'effettivo',
                        value: item.effettivo,
                        style: `width: ${(item.effettivo / maxIncassiVal) * 100}%;`,
                        cssClass: 'bar-fill bar-incasso-effettivo clickable',
                        title: 'Effettivo',
                        itemsJson: JSON.stringify(item.itemsEffettivi || [])
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
                    cssClass: 'bar-fill bar-spesa-previsto clickable',
                    title: 'Previsto',
                    itemsJson: JSON.stringify(item.itemsPrevisti || [])
                });

                if (item.effettivo > 0) {
                    segments.push({
                        id: 'effettivo',
                        value: item.effettivo,
                        style: `width: ${(item.effettivo / maxSpeseVal) * 100}%;`,
                        cssClass: 'bar-fill bar-spesa-effettivo clickable',
                        title: 'Effettivo',
                        itemsJson: JSON.stringify(item.itemsEffettivi || [])
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

            let maxCashFlowVal = Math.max(
                totalIncassiEffettivo, totalIncassiPrevisto,
                totalSpeseEffettivo, totalSpesePrevisto,
                Math.abs(dispEffettivo), Math.abs(dispPrevisto)
            );
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
                cssClass: 'bar-fill bar-incasso-previsto clickable',
                title: 'Previsto',
                itemsJson: JSON.stringify(allIncassiPrevistiItems)
            });
            if (totalIncassiEffettivo > 0) {
                cfIncassiSegments.push({
                    id: 'effettivo',
                    value: totalIncassiEffettivo,
                    style: `width: ${(totalIncassiEffettivo / maxCashFlowVal) * 100}%;`,
                    cssClass: 'bar-fill bar-incasso-effettivo clickable',
                    title: 'Effettivo',
                    itemsJson: JSON.stringify(allIncassiEffettiviItems)
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
                cssClass: 'bar-fill bar-spesa-previsto clickable',
                title: 'Previsto',
                itemsJson: JSON.stringify(allSpesePrevistiItems)
            });
            if (totalSpeseEffettivo > 0) {
                cfSpeseSegments.push({
                    id: 'effettivo',
                    value: totalSpeseEffettivo,
                    style: `width: ${(totalSpeseEffettivo / maxCashFlowVal) * 100}%;`,
                    cssClass: 'bar-fill bar-spesa-effettivo clickable',
                    title: 'Effettivo',
                    itemsJson: JSON.stringify(allSpeseEffettiviItems)
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
                title: 'Previsto',
                itemsJson: JSON.stringify([
                    { label: 'Totale Incassi Previsti', value: totalIncassiPrevisto },
                    { label: 'Totale Spese Previste', value: -totalSpesePrevisto }
                ])
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
                title: 'Effettivo',
                itemsJson: JSON.stringify([
                    { label: 'Totale Incassi Effettivi', value: totalIncassiEffettivo },
                    { label: 'Totale Spese Effettive', value: -totalSpeseEffettivo }
                ])
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
