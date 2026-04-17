import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { IsConsoleNavigation, getFocusedTabInfo, openSubtab, openTab } from 'lightning/platformWorkspaceApi';
import getSummary from '@salesforce/apex/BudgetSummaryController.getSummary';

export default class BudgetSummaryByCategory extends NavigationMixin(LightningElement) {
    @api recordId;
    @api hideDateFilter = false;
    @api showQuickSummary = false;
    @api externalMaxVal;
    @api externalMaxIncassiVal;
    @api externalMaxSpeseVal;
    @api externalMaxCashFlowVal;
    quickDateActions = [
        { key: 'today', label: 'Oggi' },
        { key: 'q1', label: 'Primo Trimestre' },
        { key: 'q2', label: 'Secondo Trimestre' },
        { key: 'q3', label: 'Terzo Trimestre' },
        { key: 'q4', label: 'Quarto Trimestre' }
    ];
    monthOptions = [
        { label: 'Gennaio', value: '1' },
        { label: 'Febbraio', value: '2' },
        { label: 'Marzo', value: '3' },
        { label: 'Aprile', value: '4' },
        { label: 'Maggio', value: '5' },
        { label: 'Giugno', value: '6' },
        { label: 'Luglio', value: '7' },
        { label: 'Agosto', value: '8' },
        { label: 'Settembre', value: '9' },
        { label: 'Ottobre', value: '10' },
        { label: 'Novembre', value: '11' },
        { label: 'Dicembre', value: '12' }
    ];

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
    quickSummary = null;
    hasData = false;
    error;

    tooltipVisible = false;
    tooltipStyle = '';
    tooltipTitle = '';
    tooltipItems = [];
    isConsoleNavigation = false;

    modalVisible = false;
    modalTitle = '';
    modalData = [];
    modalColumns = [
        { label: 'Titolo', type: 'button', typeAttributes: { label: { fieldName: 'name' }, name: 'open_record', variant: 'base' } },
        { label: 'Data', fieldName: 'itemDate', type: 'date-local' },
        { label: 'Categoria', fieldName: 'category', type: 'text' },
        { label: 'Stato', fieldName: 'status', type: 'text' },
        { label: 'Transazione', type: 'button', typeAttributes: { label: { fieldName: 'sourceTransactionName' }, name: 'open_transaction', variant: 'base', disabled: { fieldName: 'disableSourceTransaction' } } },
        { label: 'Ammontare', fieldName: 'amount', type: 'currency', typeAttributes: { currencyCode: 'EUR' } }
    ];

    @wire(IsConsoleNavigation)
    wiredIsConsoleNavigation(result) {
        this.isConsoleNavigation = !!(result && result.data);
    }

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
                this.modalData = parsedItems.map(item => ({
                    ...item,
                    _rowKey: item.recordId,
                    sourceTransactionName: item.sourceTransactionName || '',
                    disableSourceTransaction: !item.sourceTransactionId
                }));
                this.modalTitle = `Dettaglio: ${cat ? cat + ' - ' : ''}${title}`;
                this.modalVisible = true;
                this.tooltipVisible = false;
            }
        }
    }

    async openRecordInConsole(recordId) {
        if (!recordId) {
            return;
        }
        const pageReference = {
            type: 'standard__recordPage',
            attributes: {
                recordId,
                actionName: 'view'
            }
        };

        try {
            if (this.isConsoleNavigation) {
                const focusedTabInfo = await getFocusedTabInfo();
                if (focusedTabInfo && focusedTabInfo.tabId) {
                    await openSubtab(focusedTabInfo.tabId, { pageReference, focus: true });
                    return;
                }
                await openTab({ pageReference, focus: true });
                return;
            }
        } catch (e) {
            // fallback below
        }

        this[NavigationMixin.Navigate](pageReference);
    }

    handleModalRowAction(event) {
        if (!(event.detail && event.detail.action && event.detail.row)) {
            return;
        }

        if (event.detail.action.name === 'open_record') {
            this.openRecordInConsole(event.detail.row.recordId);
        } else if (event.detail.action.name === 'open_transaction') {
            this.openRecordInConsole(event.detail.row.sourceTransactionId);
        }
    }

    closeModal() {
        this.modalVisible = false;
    }

    handleDateChange(event) {
        this._selectedDate = event.target.value;
    }

    getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }

    getSelectedYear() {
        if (this._selectedDate) {
            const year = String(this._selectedDate).split('-')[0];
            if (/^\d{4}$/.test(year)) {
                return year;
            }
        }
        return String(new Date().getFullYear());
    }

    buildQuarterDate(actionKey) {
        const year = this.getSelectedYear();
        const quarterMap = {
            q1: `${year}-03-31`,
            q2: `${year}-06-30`,
            q3: `${year}-09-30`,
            q4: `${year}-12-31`
        };
        return quarterMap[actionKey] || this.getTodayDate();
    }

    buildMonthEndDate(monthValue) {
        const year = Number(this.getSelectedYear());
        const month = Number(monthValue);
        if (!year || !month || month < 1 || month > 12) {
            return this.getTodayDate();
        }
        const lastDay = new Date(year, month, 0).getDate();
        return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    handleQuickDateClick(event) {
        const actionKey = event.currentTarget.dataset.action;
        if (actionKey === 'today') {
            this._selectedDate = this.getTodayDate();
            return;
        }
        this._selectedDate = this.buildQuarterDate(actionKey);
    }

    handleMonthShortcutChange(event) {
        this._selectedDate = this.buildMonthEndDate(event.detail.value);
    }

    calculateProgress(effettivo, previsto) {
        const eff = Number(effettivo) || 0;
        const prev = Number(previsto) || 0;
        if (prev > 0) {
            return eff / prev;
        }
        if (prev === 0) {
            // In percent format, 2 => 200%. Keep zero-denominator case readable.
            return eff / 100;
        }
        return eff / Math.abs(prev);
    }

    formatDateLabel(value) {
        if (!value) {
            return '-';
        }
        const parts = String(value).split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return value;
    }

    createZeroSegments(previstoClass, effettivoClass) {
        return [
            {
                id: 'previsto',
                value: 0,
                style: 'width: 35px; border-right: 1px solid rgba(255,255,255,0.5);',
                cssClass: `${previstoClass} clickable`,
                title: 'Previsto',
                itemsJson: '[]',
                labelClass: 'segment-label label-outside'
            },
            {
                id: 'effettivo',
                value: 0,
                style: 'width: 18px; border-right: 1px solid rgba(255,255,255,0.5);',
                cssClass: `${effettivoClass} clickable`,
                title: 'Effettivo',
                itemsJson: '[]',
                labelClass: 'segment-label'
            }
        ];
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
            const externalGlobalMaxVal = Number(this.externalMaxVal);
            const externalLegacyMaxVal = Math.max(
                Number(this.externalMaxIncassiVal) || 0,
                Number(this.externalMaxSpeseVal) || 0,
                Number(this.externalMaxCashFlowVal) || 0
            );
            const totalIncassi = totalIncassiEffettivo + totalIncassiPrevisto;
            const totalSpese = totalSpeseEffettivo + totalSpesePrevisto;
            const dispEffettivo = totalIncassiEffettivo - totalSpeseEffettivo;
            const dispPrevisto = totalIncassiPrevisto - totalSpesePrevisto;
            const totalDisp = dispEffettivo + dispPrevisto;
            const maxCashFlowVal = Math.max(
                totalIncassiEffettivo, totalIncassiPrevisto,
                totalSpeseEffettivo, totalSpesePrevisto,
                Math.abs(dispEffettivo), Math.abs(dispPrevisto)
            ) || 1;
            const localGlobalMaxVal = Math.max(maxIncassiVal, maxSpeseVal, maxCashFlowVal, 1);
            const scaleGlobalVal = externalGlobalMaxVal > 0
                ? externalGlobalMaxVal
                : (externalLegacyMaxVal > 0 ? externalLegacyMaxVal : localGlobalMaxVal);

            const processSegments = (segments, maxVal) => {
                segments.sort((a, b) => b.value - a.value);
                
                if (segments.length === 2) {
                    let pct0 = (segments[0].value / maxVal) * 100;
                    let pct1 = (segments[1].value / maxVal) * 100;
                    
                    if ((pct0 - pct1 < 15 && pct0 < 85) || pct0 < 12) {
                        segments[0].labelClass = 'segment-label label-outside';
                    } else {
                        segments[0].labelClass = 'segment-label';
                    }
                    segments[1].labelClass = 'segment-label';
                } else if (segments.length === 1) {
                    let pct0 = (segments[0].value / maxVal) * 100;
                    if (pct0 < 12) {
                        segments[0].labelClass = 'segment-label label-outside';
                    } else {
                        segments[0].labelClass = 'segment-label';
                    }
                }
                return segments;
            };

            this.incassi = (data.incassi || []).map(item => {
                let segments = [];
                
                let pStyle = `width: ${(item.previsto / scaleGlobalVal) * 100}%;`;
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

                let eStyle = `width: ${(item.effettivo / scaleGlobalVal) * 100}%;`;
                if (item.effettivo === 0) {
                    eStyle = 'width: 35px; border-right: 1px solid rgba(255,255,255,0.5);';
                }
                segments.push({
                    id: 'effettivo',
                    value: item.effettivo,
                    style: eStyle,
                    cssClass: 'bar-fill bar-incasso-effettivo clickable',
                    title: 'Effettivo',
                    itemsJson: JSON.stringify(item.itemsEffettivi || [])
                });

                segments = processSegments(segments, scaleGlobalVal);

                return {
                    ...item,
                    segments: segments,
                    avanzamento: this.calculateProgress(item.effettivo, item.previsto)
                };
            });

            this.spese = (data.spese || []).map(item => {
                let segments = [];
                
                let pStyle = `width: ${(item.previsto / scaleGlobalVal) * 100}%;`;
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

                let eStyle = `width: ${(item.effettivo / scaleGlobalVal) * 100}%;`;
                if (item.effettivo === 0) {
                    eStyle = 'width: 35px; border-right: 1px solid rgba(255,255,255,0.5);';
                }
                segments.push({
                    id: 'effettivo',
                    value: item.effettivo,
                    style: eStyle,
                    cssClass: 'bar-fill bar-spesa-effettivo clickable',
                    title: 'Effettivo',
                    itemsJson: JSON.stringify(item.itemsEffettivi || [])
                });

                segments = processSegments(segments, scaleGlobalVal);

                return {
                    ...item,
                    segments: segments,
                    avanzamento: this.calculateProgress(item.effettivo, item.previsto)
                };
            });

            if (this.incassi.length === 0) {
                this.incassi = [{
                    categoria: 'Non categorizzato',
                    previsto: 0,
                    effettivo: 0,
                    segments: this.createZeroSegments('bar-fill bar-incasso-previsto', 'bar-fill bar-incasso-effettivo'),
                    avanzamento: this.calculateProgress(0, 0)
                }];
            }

            if (this.spese.length === 0) {
                this.spese = [{
                    categoria: 'Non categorizzato',
                    previsto: 0,
                    effettivo: 0,
                    segments: this.createZeroSegments('bar-fill bar-spesa-previsto', 'bar-fill bar-spesa-effettivo'),
                    avanzamento: this.calculateProgress(0, 0)
                }];
            }

            this.hasData = true;
            this.quickSummary = {
                dateLabel: this.formatDateLabel(this._selectedDate),
                incassiPrevisti: totalIncassiPrevisto,
                incassiEffettivi: totalIncassiEffettivo,
                spesePreviste: totalSpesePrevisto,
                speseEffettive: totalSpeseEffettivo,
                disponibilePrevisto: dispPrevisto,
                disponibileEffettivo: dispEffettivo
            };
            
            // Cash Flow logic

            let cfIncassiSegments = [];
            let cfIncassiPStyle = `width: ${(totalIncassiPrevisto / scaleGlobalVal) * 100}%;`;
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
            let cfIncassiEStyle = `width: ${(totalIncassiEffettivo / scaleGlobalVal) * 100}%;`;
            if (totalIncassiEffettivo === 0) {
                cfIncassiEStyle = 'width: 35px; border-right: 1px solid rgba(255,255,255,0.5);';
            }
            cfIncassiSegments.push({
                id: 'effettivo',
                value: totalIncassiEffettivo,
                style: cfIncassiEStyle,
                cssClass: 'bar-fill bar-incasso-effettivo clickable',
                title: 'Effettivo',
                itemsJson: JSON.stringify(allIncassiEffettiviItems)
            });
            cfIncassiSegments = processSegments(cfIncassiSegments, scaleGlobalVal);

            let cfSpeseSegments = [];
            let cfSpesePStyle = `width: ${(totalSpesePrevisto / scaleGlobalVal) * 100}%;`;
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
            let cfSpeseEStyle = `width: ${(totalSpeseEffettivo / scaleGlobalVal) * 100}%;`;
            if (totalSpeseEffettivo === 0) {
                cfSpeseEStyle = 'width: 35px; border-right: 1px solid rgba(255,255,255,0.5);';
            }
            cfSpeseSegments.push({
                id: 'effettivo',
                value: totalSpeseEffettivo,
                style: cfSpeseEStyle,
                cssClass: 'bar-fill bar-spesa-effettivo clickable',
                title: 'Effettivo',
                itemsJson: JSON.stringify(allSpeseEffettiviItems)
            });
            cfSpeseSegments = processSegments(cfSpeseSegments, scaleGlobalVal);

            let cfDispSegments = [];
            let dispPrevWidth = Math.max(0, dispPrevisto);
            let cfDispPStyle = `width: ${(dispPrevWidth / scaleGlobalVal) * 100}%;`;
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
            let cfDispEStyle = `width: ${(dispEffWidth / scaleGlobalVal) * 100}%;`;
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
            cfDispSegments = processSegments(cfDispSegments, scaleGlobalVal);

            this.cashFlow = [];
            this.cashFlow.push({
                categoria: 'Totale Incassi',
                totale: totalIncassi,
                segments: cfIncassiSegments,
                avanzamento: this.calculateProgress(totalIncassiEffettivo, totalIncassiPrevisto)
            });
            this.cashFlow.push({
                categoria: 'Totale Spese',
                totale: totalSpese,
                segments: cfSpeseSegments,
                avanzamento: this.calculateProgress(totalSpeseEffettivo, totalSpesePrevisto)
            });
            this.cashFlow.push({
                categoria: 'Disponibile',
                totale: totalDisp,
                segments: cfDispSegments,
                avanzamento: this.calculateProgress(dispEffettivo, dispPrevisto)
            });

            this.error = undefined;
        } else if (error) {
            this.error = error.body ? error.body.message : error.message;
            this.incassi = [];
            this.spese = [];
            this.cashFlow = [];
            this.quickSummary = null;
            this.hasData = false;
        }
    }
}
