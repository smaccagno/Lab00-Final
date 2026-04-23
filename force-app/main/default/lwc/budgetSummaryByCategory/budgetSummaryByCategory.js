import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { IsConsoleNavigation, getFocusedTabInfo, openSubtab, openTab } from 'lightning/platformWorkspaceApi';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import ANNO_FIELD from '@salesforce/schema/Overview_Budget_per_Anno__c.Anno__c';
import getSummary from '@salesforce/apex/BudgetSummaryController.getSummary';

export default class BudgetSummaryByCategory extends NavigationMixin(LightningElement) {
    @api recordId;
    @api hideDateFilter = false;
    @api showQuickSummary = false;
    /**
     * Se true: legge l'anno dal record (Overview_Budget_per_Anno__c.Anno__c),
     * nasconde i filtri "Oggi", combobox Anno, combobox Mese, input Data e
     * blocca l'anno della vista. Restano i soli shortcut trimestrali.
     */
    @api yearLockedFromRecord = false;
    @api externalMaxVal;
    @api externalMaxIncassiVal;
    @api externalMaxSpeseVal;
    @api externalMaxCashFlowVal;
    @api externalMaxCategoriesVal;
    rawQuickDateActions = [
        { key: 'today', label: 'Oggi' },
        { key: 'q1', label: 'Primo Trimestre' },
        { key: 'q2', label: 'Secondo Trimestre' },
        { key: 'q3', label: 'Terzo Trimestre' },
        { key: 'q4', label: 'Quarto Trimestre' }
    ];
    get quickDateActions() {
        if (this.yearLockedFromRecord) {
            return this.rawQuickDateActions.filter(a => a.key !== 'today');
        }
        return this.rawQuickDateActions;
    }
    get showExtraDateFilters() {
        return !this.hideDateFilter && !this.yearLockedFromRecord;
    }
    get showYearToolbar() {
        return !this.hideDateFilter;
    }
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
    _lockedYear; // valorizzato dal wire getRecord quando yearLockedFromRecord=true

    get lockedFieldsList() {
        return this.yearLockedFromRecord ? [ANNO_FIELD] : [];
    }

    @wire(getRecord, { recordId: '$recordId', fields: '$lockedFieldsList' })
    wiredLockedRecord({ data }) {
        if (!this.yearLockedFromRecord || !data) return;
        const annoValue = getFieldValue(data, ANNO_FIELD);
        if (annoValue && /^\d{4}$/.test(String(annoValue))) {
            this._lockedYear = String(annoValue);
            this._selectedDate = `${this._lockedYear}-12-31`;
        }
    }

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

    get selectedYear() {
        return this.getSelectedYear();
    }

    get yearOptions() {
        const selectedYear = Number(this.getSelectedYear()) || new Date().getFullYear();
        const options = [];
        for (let year = selectedYear + 5; year >= selectedYear - 5; year -= 1) {
            options.push({
                label: String(year),
                value: String(year)
            });
        }
        return options;
    }

    incassi = [];
    spese = [];
    cashFlow = [];
    quickSummary = null;
    hasData = false;
    loading = true;
    error;

    get showSkeleton() {
        return this.loading && !this.hasData && !this.error;
    }

    get incassiCountLabel() {
        return this.incassi ? String(this.incassi.length) : '0';
    }

    get speseCountLabel() {
        return this.spese ? String(this.spese.length) : '0';
    }

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
        this._cancelTooltipHide();
        const itemsJson = event.currentTarget.dataset.items;
        const title = event.currentTarget.dataset.title;
        const scope = event.currentTarget.dataset.scope || 'category';
        if (itemsJson) {
            let parsedItems = JSON.parse(itemsJson);
            const tooltipItems = parsedItems
                .filter(item => item && item.name !== undefined)
                .map(item => {
                    const amount = item.amount !== undefined ? item.amount : item.value;
                    const parts = [];
                    if (scope === 'total') {
                        parts.push(item.category || 'Non categorizzato');
                    }
                    parts.push(item.subcategory || '—');
                    parts.push(item.note ? item.note : '—');
                    return {
                        label: parts.join(' · '),
                        value: amount,
                        recordId: item.recordId || null,
                        url: item.url || (item.recordId ? '/' + item.recordId : null),
                        hasLink: !!item.recordId
                    };
                })
                .filter(i => i.value !== 0);

            // Fallback per elementi "sintetici" (Disponibile) privi di name/amount.
            if (tooltipItems.length === 0) {
                const syntheticItems = parsedItems
                    .filter(item => item && (item.label !== undefined || item.name !== undefined))
                    .map(item => ({
                        label: item.name || item.label,
                        value: item.amount !== undefined ? item.amount : item.value,
                        recordId: item.recordId || null,
                        url: item.url || (item.recordId ? '/' + item.recordId : null),
                        hasLink: !!item.recordId
                    }))
                    .filter(i => i.value !== 0);
                this.tooltipItems = syntheticItems;
            } else {
                this.tooltipItems = tooltipItems;
            }
            this.tooltipItems = this.tooltipItems.map((it, idx) => ({ ...it, _key: `${idx}-${it.recordId || it.label}` }));
            this.tooltipTitle = title;
            if (this.tooltipItems.length > 0) {
                this.tooltipVisible = true;
            }
        }
    }

    handleMouseMove(event) {
        if (this.tooltipVisible) {
            const offset = 15;
            const margin = 8;
            const tooltipEl = this.template.querySelector('.custom-tooltip');
            const ttW = tooltipEl ? tooltipEl.offsetWidth : 280;
            const ttH = tooltipEl ? tooltipEl.offsetHeight : 200;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let x = event.clientX + offset;
            let y = event.clientY + offset;
            if (x + ttW + margin > vw) {
                x = Math.max(margin, event.clientX - ttW - offset);
            }
            if (y + ttH + margin > vh) {
                y = Math.max(margin, vh - ttH - margin);
            }
            this.tooltipStyle = `left: ${x}px; top: ${y}px;`;
        }
    }

    handleMouseOut() {
        this._scheduleTooltipHide();
    }

    handleTooltipEnter() {
        this._cancelTooltipHide();
    }

    handleTooltipLeave() {
        this.tooltipVisible = false;
    }

    handleTooltipItemClick(event) {
        event.preventDefault();
        event.stopPropagation();
        const recordId = event.currentTarget.dataset.recordId;
        if (recordId) {
            this.openRecordInConsole(recordId);
            this.tooltipVisible = false;
        }
    }

    _scheduleTooltipHide() {
        this._cancelTooltipHide();
        this._tooltipHideTimer = setTimeout(() => {
            this.tooltipVisible = false;
        }, 180);
    }

    _cancelTooltipHide() {
        if (this._tooltipHideTimer) {
            clearTimeout(this._tooltipHideTimer);
            this._tooltipHideTimer = null;
        }
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

    _escHandler = (event) => {
        if (event.key === 'Escape' && this.modalVisible) {
            this.closeModal();
        }
    };

    connectedCallback() {
        document.addEventListener('keydown', this._escHandler);
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._escHandler);
    }

    handleDateChange(event) {
        this._selectedDate = event.target.value;
    }

    getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }

    getSelectedYear() {
        if (this.yearLockedFromRecord && this._lockedYear) {
            return this._lockedYear;
        }
        if (this._selectedDate) {
            const year = String(this._selectedDate).split('-')[0];
            if (/^\d{4}$/.test(year)) {
                return year;
            }
        }
        return String(new Date().getFullYear());
    }

    rebaseDateToYear(targetYear) {
        const safeYear = Number(targetYear);
        const sourceDate = this._selectedDate || this.getTodayDate();
        const parts = String(sourceDate).split('-');
        const month = Number(parts[1]) || 1;
        const day = Number(parts[2]) || 1;
        if (!safeYear) {
            return this.getTodayDate();
        }
        const lastDay = new Date(safeYear, month, 0).getDate();
        const safeDay = Math.min(day, lastDay);
        return `${safeYear}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
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
        if (actionKey === 'today' && !this.yearLockedFromRecord) {
            this._selectedDate = this.getTodayDate();
            return;
        }
        // Quick-date trimestre: forza uso di lockedYear se attivo.
        this._selectedDate = this.buildQuarterDate(actionKey);
    }

    handleMonthShortcutChange(event) {
        this._selectedDate = this.buildMonthEndDate(event.detail.value);
    }

    handleYearChange(event) {
        this._selectedDate = this.rebaseDateToYear(event.detail.value);
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
                style: 'width: 4px;',
                cssClass: `${previstoClass} clickable`,
                title: 'Previsto',
                itemsJson: '[]',
                labelClass: 'segment-label label-top label-outside'
            },
            {
                id: 'effettivo',
                value: 0,
                style: 'width: 4px;',
                cssClass: `${effettivoClass} clickable`,
                title: 'Effettivo',
                itemsJson: '[]',
                labelClass: 'segment-label label-bottom label-outside'
            }
        ];
    }

    @wire(getSummary, { recordId: '$recordId', filterDate: '$_selectedDate' })
    wiredSummary({ error, data }) {
        this.loading = false;
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
            const externalGlobalMaxVal = Number(this.externalMaxVal) || 0;
            const externalCategoriesMaxVal = Math.max(
                Number(this.externalMaxCategoriesVal) || 0,
                Number(this.externalMaxIncassiVal) || 0,
                Number(this.externalMaxSpeseVal) || 0
            );
            const externalCashFlowMaxVal = Number(this.externalMaxCashFlowVal) || 0;
            const totalIncassi = totalIncassiEffettivo + totalIncassiPrevisto;
            const totalSpese = totalSpeseEffettivo + totalSpesePrevisto;
            // Disponibilità Previsto: se non ho Incassi Previsti, la
            // disponibilità pianificata è 0 (non stiamo pianificando un
            // "buco"). Altrimenti Incassi − Spese. Effettivo può essere
            // negativo (solo spese senza incassi a copertura).
            const dispEffettivo = totalIncassiEffettivo - totalSpeseEffettivo;
            const dispPrevisto = totalIncassiPrevisto === 0
                ? 0
                : totalIncassiPrevisto - totalSpesePrevisto;
            const totalDisp = dispEffettivo + dispPrevisto;
            const maxCashFlowVal = Math.max(
                totalIncassiEffettivo, totalIncassiPrevisto,
                totalSpeseEffettivo, totalSpesePrevisto,
                Math.abs(dispEffettivo), Math.abs(dispPrevisto)
            ) || 1;
            // Scala autonoma per incassi/spese (categorie): non dipende dal Cash Flow totale
            const localCategoriesMaxVal = Math.max(maxIncassiVal, maxSpeseVal, 1);
            const scaleCategoriesVal = externalGlobalMaxVal > 0
                ? externalGlobalMaxVal
                : (externalCategoriesMaxVal > 0 ? externalCategoriesMaxVal : localCategoriesMaxVal);
            // Scala autonoma per Cash Flow: basata sulla barra più grande del Cash Flow
            const scaleCashFlowVal = externalGlobalMaxVal > 0
                ? externalGlobalMaxVal
                : (externalCashFlowMaxVal > 0 ? externalCashFlowMaxVal : maxCashFlowVal);

            const processSegments = (segments, maxVal) => {
                segments.sort((a, b) => b.value - a.value);

                const classify = (seg, pct) => {
                    // Previsto sempre in alto, Effettivo sempre in basso, così da
                    // restare coerente con le badge laterali Previsto/Effettivo.
                    const verticalClass = seg.id === 'previsto' ? 'label-top' : 'label-bottom';
                    const base = `segment-label ${verticalClass}`;
                    if (pct < 10) {
                        seg.labelClass = `${base} label-outside`;
                    } else {
                        seg.labelClass = base;
                    }
                };

                segments.forEach(seg => {
                    const pct = (seg.value / maxVal) * 100;
                    classify(seg, pct);
                });
                return segments;
            };

            this.incassi = (data.incassi || []).map(item => {
                let segments = [];
                
                let pStyle = `width: ${(item.previsto / scaleCategoriesVal) * 100}%;`;
                if (item.previsto === 0) {
                    pStyle = `width: 4px;`;
                }
                segments.push({
                    id: 'previsto',
                    value: item.previsto,
                    style: pStyle,
                    cssClass: 'bar-fill bar-incasso-previsto clickable',
                    title: 'Previsto',
                    itemsJson: JSON.stringify(item.itemsPrevisti || [])
                });

                let eStyle = `width: ${(item.effettivo / scaleCategoriesVal) * 100}%;`;
                if (item.effettivo === 0) {
                    eStyle = 'width: 4px;';
                }
                segments.push({
                    id: 'effettivo',
                    value: item.effettivo,
                    style: eStyle,
                    cssClass: 'bar-fill bar-incasso-effettivo clickable',
                    title: 'Effettivo',
                    itemsJson: JSON.stringify(item.itemsEffettivi || [])
                });

                segments = processSegments(segments, scaleCategoriesVal);

                return {
                    ...item,
                    segments: segments,
                    rowClass: 'bar-row row-incasso',
                    avanzamento: this.calculateProgress(item.effettivo, item.previsto)
                };
            });

            this.spese = (data.spese || []).map(item => {
                let segments = [];
                
                let pStyle = `width: ${(item.previsto / scaleCategoriesVal) * 100}%;`;
                if (item.previsto === 0) {
                    pStyle = `width: 4px;`;
                }
                segments.push({
                    id: 'previsto',
                    value: item.previsto,
                    style: pStyle,
                    cssClass: 'bar-fill bar-spesa-previsto clickable',
                    title: 'Previsto',
                    itemsJson: JSON.stringify(item.itemsPrevisti || [])
                });

                let eStyle = `width: ${(item.effettivo / scaleCategoriesVal) * 100}%;`;
                if (item.effettivo === 0) {
                    eStyle = 'width: 4px;';
                }
                segments.push({
                    id: 'effettivo',
                    value: item.effettivo,
                    style: eStyle,
                    cssClass: 'bar-fill bar-spesa-effettivo clickable',
                    title: 'Effettivo',
                    itemsJson: JSON.stringify(item.itemsEffettivi || [])
                });

                segments = processSegments(segments, scaleCategoriesVal);

                return {
                    ...item,
                    segments: segments,
                    rowClass: 'bar-row row-spesa',
                    avanzamento: this.calculateProgress(item.effettivo, item.previsto)
                };
            });

            if (this.incassi.length === 0) {
                this.incassi = [{
                    categoria: 'Non categorizzato',
                    previsto: 0,
                    effettivo: 0,
                    segments: this.createZeroSegments('bar-fill bar-incasso-previsto', 'bar-fill bar-incasso-effettivo'),
                    rowClass: 'bar-row row-incasso',
                    avanzamento: this.calculateProgress(0, 0)
                }];
            }

            if (this.spese.length === 0) {
                this.spese = [{
                    categoria: 'Non categorizzato',
                    previsto: 0,
                    effettivo: 0,
                    segments: this.createZeroSegments('bar-fill bar-spesa-previsto', 'bar-fill bar-spesa-effettivo'),
                    rowClass: 'bar-row row-spesa',
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
            let cfIncassiPStyle = `width: ${(totalIncassiPrevisto / scaleCashFlowVal) * 100}%;`;
            if (totalIncassiPrevisto === 0) {
                cfIncassiPStyle = `width: 4px;`;
            }
            cfIncassiSegments.push({
                id: 'previsto',
                value: totalIncassiPrevisto,
                style: cfIncassiPStyle,
                cssClass: 'bar-fill bar-incasso-previsto clickable',
                title: 'Previsto',
                itemsJson: JSON.stringify(allIncassiPrevistiItems)
            });
            let cfIncassiEStyle = `width: ${(totalIncassiEffettivo / scaleCashFlowVal) * 100}%;`;
            if (totalIncassiEffettivo === 0) {
                cfIncassiEStyle = 'width: 4px;';
            }
            cfIncassiSegments.push({
                id: 'effettivo',
                value: totalIncassiEffettivo,
                style: cfIncassiEStyle,
                cssClass: 'bar-fill bar-incasso-effettivo clickable',
                title: 'Effettivo',
                itemsJson: JSON.stringify(allIncassiEffettiviItems)
            });
            cfIncassiSegments = processSegments(cfIncassiSegments, scaleCashFlowVal);

            let cfSpeseSegments = [];
            let cfSpesePStyle = `width: ${(totalSpesePrevisto / scaleCashFlowVal) * 100}%;`;
            if (totalSpesePrevisto === 0) {
                cfSpesePStyle = `width: 4px;`;
            }
            cfSpeseSegments.push({
                id: 'previsto',
                value: totalSpesePrevisto,
                style: cfSpesePStyle,
                cssClass: 'bar-fill bar-spesa-previsto clickable',
                title: 'Previsto',
                itemsJson: JSON.stringify(allSpesePrevistiItems)
            });
            let cfSpeseEStyle = `width: ${(totalSpeseEffettivo / scaleCashFlowVal) * 100}%;`;
            if (totalSpeseEffettivo === 0) {
                cfSpeseEStyle = 'width: 4px;';
            }
            cfSpeseSegments.push({
                id: 'effettivo',
                value: totalSpeseEffettivo,
                style: cfSpeseEStyle,
                cssClass: 'bar-fill bar-spesa-effettivo clickable',
                title: 'Effettivo',
                itemsJson: JSON.stringify(allSpeseEffettiviItems)
            });
            cfSpeseSegments = processSegments(cfSpeseSegments, scaleCashFlowVal);

            let cfDispSegments = [];
            let dispPrevWidth = Math.max(0, dispPrevisto);
            let cfDispPStyle = `width: ${(dispPrevWidth / scaleCashFlowVal) * 100}%;`;
            if (dispPrevisto <= 0) {
                cfDispPStyle = `width: 4px;`;
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
            let cfDispEStyle = `width: ${(dispEffWidth / scaleCashFlowVal) * 100}%;`;
            if (dispEffettivo <= 0) {
                cfDispEStyle = `width: 4px;`;
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
            cfDispSegments = processSegments(cfDispSegments, scaleCashFlowVal);

            this.cashFlow = [];
            this.cashFlow.push({
                categoria: 'Totale Incassi',
                totale: totalIncassi,
                previsto: totalIncassiPrevisto,
                effettivo: totalIncassiEffettivo,
                segments: cfIncassiSegments,
                rowClass: 'bar-row row-incasso',
                avanzamento: this.calculateProgress(totalIncassiEffettivo, totalIncassiPrevisto)
            });
            this.cashFlow.push({
                categoria: 'Totale Spese',
                totale: totalSpese,
                previsto: totalSpesePrevisto,
                effettivo: totalSpeseEffettivo,
                segments: cfSpeseSegments,
                rowClass: 'bar-row row-spesa',
                avanzamento: this.calculateProgress(totalSpeseEffettivo, totalSpesePrevisto)
            });
            this.cashFlow.push({
                categoria: 'Disponibile',
                totale: totalDisp,
                previsto: dispPrevisto,
                effettivo: dispEffettivo,
                segments: cfDispSegments,
                rowClass: 'bar-row row-disp',
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
