import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { openTab } from 'lightning/platformWorkspaceApi';
import { CurrentPageReference } from 'lightning/navigation';

const LOG_FIELDS = [
    'MassiveInvoiceLog__c.Id',
    'MassiveInvoiceLog__c.Name',
    'MassiveInvoiceLog__c.Data__c',
    'MassiveInvoiceLog__c.Utente__r.Name',
    'MassiveInvoiceLog__c.Numero_Fatture__c',
    'MassiveInvoiceLog__c.Numero_Visite__c',
    'MassiveInvoiceLog__c.Log__c',
    'MassiveInvoiceLog__c.Errori__c'
];

export default class MassiveInvoiceLogSummary extends NavigationMixin(LightningElement) {
    _recordId;
    logDetails = null;
    logErrori = null;
    organizedInvoices = [];
    expandedInvoices = {};
    isLoading = false;
    isSorrisoLog = false;
    error;
    
    @api
    get recordId() {
        return this._recordId;
    }
    set recordId(value) {
        this._recordId = value;
    }
    
    @wire(CurrentPageReference)
    setPageReference(pageRef) {
        if (!this._recordId && pageRef) {
            const fromAttrs = pageRef.attributes?.recordId;
            const fromState = pageRef.state?.recordId;
            this._recordId = fromAttrs || fromState || null;
        }
    }
    
    @wire(getRecord, { recordId: '$_recordId', fields: LOG_FIELDS })
    wiredRecord({ error, data }) {
        this.isLoading = !data && !error && !!this._recordId;
        if (data && this._recordId) {
            this.loadLogFromRecord(data);
            this.error = undefined;
        } else if (error) {
            this.error = error;
        }
    }
    
    loadLogFromRecord(data) {
        const logJson = getFieldValue(data, 'MassiveInvoiceLog__c.Log__c');
        this.logErrori = getFieldValue(data, 'MassiveInvoiceLog__c.Errori__c');
        if (logJson) {
            this.parseAndOrganizeLog(logJson);
        } else {
            this.organizedInvoices = [];
        }
    }
    
    parseAndOrganizeLog(logJson) {
        let logEntries = [];
        try {
            logEntries = JSON.parse(logJson);
        } catch (e) {
            console.error('Errore parsing JSON:', e);
            this.organizedInvoices = [];
            return;
        }
        if (!Array.isArray(logEntries)) {
            this.organizedInvoices = [];
            this.isSorrisoLog = false;
            return;
        }
        this.isSorrisoLog = this.isSorrisoPayload(logJson);
        this.organizedInvoices = this.normalizeLogToSummaryFormat(logEntries);
        this.isSorrisoLog = this.isSorrisoLog || this.organizedInvoices.some((g) => g.isSorrisoSospeso === true);
    }
    
    normalizeLogToSummaryFormat(logEntries) {
        return logEntries.map((g, groupIndex) => {
            const details = Array.isArray(g.tickets)
                ? g.tickets
                : (Array.isArray(g.visits) ? g.visits : []);
            const isSorriso = this.isSorrisoEntry(g, details);
            const totalVisitsAmount = this.toNumber(g.totalTicketsAmount ?? g.totalVisitsAmount);
            const totalVisitsMinutes = this.toNumber(g.totalTicketsMinutes ?? g.totalVisitsMinutes);
            const totalVisitsNumber = this.toNumber(g.totalTicketsNumber ?? g.totalBeneficiari ?? g.totalVisitsNumber);
            const totalDiscountedAmount = isSorriso
                ? (this.toNumber(g.totalDiscountedAmount) ?? this.toNumber(g.valoreScontato) ?? totalVisitsAmount)
                : null;

            const normalizedDetails = details.map((v, detailIndex) => {
                const success = v.saveStatusSuccess !== false;
                const detailId = v.id || v.ticketId || v.visitId || `d-${groupIndex}-${detailIndex}`;
                const amountValue = this.toNumber(v.amount);
                const discountedValue = this.toNumber(v.valoreScontato ?? v.discountedAmount ?? amountValue);
                const showDatetime = this.coalesceString(v.showDatetime);

                if (isSorriso) {
                    return {
                        id: detailId,
                        recordId: detailId,
                        visitId: detailId,
                        visitName: v.ticketName || v.visitName || v.name || detailId,
                        name: v.ticketName || v.name || v.visitName || detailId,
                        tipologia: this.coalesceString(v.tipologia) || this.coalesceString(v.ticketType) || this.coalesceString(v.visitType),
                        fornitore: this.coalesceString(v.fornitore) || this.coalesceString(g.fornitore),
                        nomeSpettacolo: this.coalesceString(v.nomeSpettacolo) || this.coalesceString(v.showName),
                        tipologiaSpettacolo: this.coalesceString(v.tipologiaSpettacolo) || this.coalesceString(v.showType),
                        dataSpettacolo: this.coalesceString(v.dataSpettacolo) || this.extractDateFromDateTime(showDatetime),
                        oraSpettacolo: this.coalesceString(v.oraSpettacolo) || this.extractTimeFromDateTime(showDatetime),
                        noInvoiceAvailable: this.toBoolean(v.noInvoiceAvailable) || this.toBoolean(g.noInvoiceAvailable),
                        numeroVisite: v.numeroBeneficiari || v.numeroVisite || '',
                        amountFormatted: v.amountFormatted || this.formatCurrency(amountValue),
                        valoreScontatoFormatted: v.valoreScontatoFormatted || v.discountedAmountFormatted || this.formatCurrency(discountedValue),
                        comune: v.comune || '',
                        provincia: v.provincia || '',
                        regione: v.regione || '',
                        saveStatus: v.saveStatus ?? true,
                        saveStatusSuccess: success,
                        saveErrorMessage: v.saveErrorMessage || null
                    };
                }

                return {
                    id: detailId,
                    recordId: detailId,
                    visitId: detailId,
                    visitName: v.visitName || v.name || detailId,
                    name: v.name || v.visitName || detailId,
                    visitType: v.visitType || v.tipoVisita || '',
                    tipoVisita: v.tipoVisita || v.visitType || '',
                    beneficiaryType: v.beneficiaryType || '',
                    dataVisita: v.dataVisita || '',
                    comune: v.comune || '',
                    provincia: v.provincia || '',
                    regione: v.regione || '',
                    numeroVisite: v.numeroVisite || '',
                    totaleMinuti: v.totaleMinuti || '',
                    amountFormatted: v.amountFormatted || this.formatCurrency(amountValue),
                    localita: v.localita || '',
                    saveStatus: v.saveStatus ?? true,
                    saveStatusSuccess: success,
                    saveErrorMessage: v.saveErrorMessage || null
                };
            });

            return {
                invoice: {
                    isSorrisoSospeso: isSorriso,
                    invoiceNumber: g.invoiceNumber || '',
                    invoiceDate: g.invoiceDate || '',
                    competenceDate: g.dataCompetenza || g.competenceDate || '',
                    dataCompetenza: g.dataCompetenza || g.competenceDate || '',
                    medicalCenter: g.medicalCenter || '',
                    partnerName: g.partnerName || g.partner || '',
                    partner: g.partnerName || g.partner || '',
                    enteNoProfit: g.enteNoProfit || g.noProfit || '',
                    noProfit: g.enteNoProfit || g.noProfit || '',
                    noProfitCategory: g.noProfitCategory || '',
                    prestazioneGratuita: g.prestazioneGratuita ?? false,
                    localita: g.localita || '',
                    tipologia: g.tipologia || '',
                    fornitore: g.fornitore || '',
                    noInvoiceAvailable: this.toBoolean(g.noInvoiceAvailable),
                    valoreScontatoFormatted: isSorriso ? this.formatCurrency(totalDiscountedAmount) : null,
                    invoiceId: g.invoiceId,
                    invoiceName: g.invoiceName,
                    status: g.status,
                    errorMessage: g.errorMessage,
                    amountFormatted: g.amountFormatted || this.formatCurrency(totalVisitsAmount)
                },
                visits: normalizedDetails,
                totalVisitsAmount: totalVisitsAmount,
                totalVisitsMinutes: totalVisitsMinutes,
                totalVisitsNumber: totalVisitsNumber,
                totalTicketsAmount: totalVisitsAmount,
                totalTicketsMinutes: totalVisitsMinutes,
                totalTicketsNumber: totalVisitsNumber,
                totalDiscountedAmount: totalDiscountedAmount,
                totalVisitsMinutesFormatted: g.totalTicketsMinutesFormatted || g.totalVisitsMinutesFormatted || totalVisitsMinutes.toLocaleString('it-IT'),
                totalVisitsNumberFormatted: g.totalTicketsNumberFormatted || g.totalBeneficiariFormatted || g.totalVisitsNumberFormatted || totalVisitsNumber.toLocaleString('it-IT'),
                hasVisitErrors: normalizedDetails.some((v) => v.saveStatusSuccess === false),
                visitsContentRowKey: g.ticketsContentRowKey || g.visitsContentRowKey || `details-${g.invoiceNumber || groupIndex}`,
                isSorrisoSospeso: isSorriso
            };
        });
    }
    
    formatCurrency(value) {
        if (value == null || isNaN(value)) return '-';
        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR'
        }).format(value);
    }
    
    toggleVisits(event) {
        const index = event.currentTarget.dataset.index;
        this.expandedInvoices = {
            ...this.expandedInvoices,
            [index]: !this.expandedInvoices[index]
        };
    }
    
    async openInvoiceRecord(event) {
        event.preventDefault();
        const invoiceId = event.currentTarget.dataset.invoiceId;
        if (!invoiceId) return;
        try {
            await openTab({ recordId: invoiceId, focus: true });
        } catch (err) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: invoiceId, actionName: 'view' }
            });
        }
    }
    
    async openVisitRecord(event) {
        event.preventDefault();
        const recordId = event.currentTarget.dataset.recordId || event.currentTarget.dataset.visitId;
        if (!recordId) return;
        try {
            await openTab({ recordId: recordId, focus: true });
        } catch (err) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: recordId, actionName: 'view' }
            });
        }
    }
    
    get hasData() {
        return this.organizedInvoices && this.organizedInvoices.length > 0;
    }
    
    get hasError() {
        return !!this.error;
    }
    
    get errorMessage() {
        return this.error && this.error.body && this.error.body.message
            ? this.error.body.message
            : this.error ? String(this.error) : '';
    }
    
    get invoicesWithExpanded() {
        return this.organizedInvoices.map((inv, idx) => {
            const isExp = !!this.expandedInvoices[idx];
            const status = inv.invoice.status || '';
            const statusClass = status === 'success' ? 'slds-text-color_success' : status === 'error' ? 'slds-text-color_error' : '';
            return {
                ...inv,
                index: idx,
                isExpanded: isExp,
                expandIcon: isExp ? 'utility:dash' : 'utility:add',
                expandButtonTitle: isExp ? 'Collassa' : 'Espandi',
                detailTitle: inv.isSorrisoSospeso ? `Biglietti Associati (${inv.visits.length})` : `Visite Associate (${inv.visits.length})`,
                detailErrorWarning: inv.isSorrisoSospeso
                    ? '⚠️ Ci sono errori da correggere nei biglietti'
                    : '⚠️ Ci sono errori da correggere nelle visite',
                invoice: {
                    ...inv.invoice,
                    statusClass: statusClass
                }
            };
        });
    }

    get summaryCardTitle() {
        return this.isSorrisoLog ? 'Summary Caricamento Massivo - Fatture e Biglietti' : 'Summary Caricamento Massivo - Fatture e Visite';
    }

    toNumber(value) {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return value;
        const parsed = Number(String(value).replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    toBoolean(value) {
        if (value === true || value === false) return value;
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase() === 'true';
    }

    coalesceString(value) {
        if (value === null || value === undefined) return '';
        const str = String(value).trim();
        return str === 'null' ? '' : str;
    }

    isSorrisoEntry(entry, details) {
        if (entry && entry.isSorrisoSospeso === true) return true;
        if (entry && Array.isArray(entry.tickets)) return true;
        if (entry && (entry.tipologia || entry.fornitore || entry.valoreScontato != null || entry.totalDiscountedAmount != null)) return true;
        return details.some((d) =>
            d && (
                d.tipologia ||
                d.ticketId ||
                d.ticketName ||
                d.ticketType ||
                d.nomeSpettacolo ||
                d.showName ||
                d.tipologiaSpettacolo ||
                d.showType ||
                d.valoreScontato != null ||
                d.discountedAmount != null
            )
        );
    }

    isSorrisoPayload(logJson) {
        if (!logJson || typeof logJson !== 'string') return false;
        return logJson.includes('"isSorrisoSospeso": true') ||
            logJson.includes('"isSorrisoSospeso" : true') ||
            logJson.includes('"tickets"') ||
            logJson.includes('"ticketId"') ||
            logJson.includes('"ticketName"');
    }

    extractDateFromDateTime(value) {
        const raw = this.coalesceString(value);
        if (!raw) return '';
        const normalized = raw.replace('T', ' ');
        if (normalized.length >= 10) {
            return normalized.substring(0, 10);
        }
        return '';
    }

    extractTimeFromDateTime(value) {
        const raw = this.coalesceString(value);
        if (!raw) return '';
        const normalized = raw.replace('T', ' ');
        const spaceIndex = normalized.indexOf(' ');
        let timePart = spaceIndex > -1 ? normalized.substring(spaceIndex + 1) : normalized;
        const dotIndex = timePart.indexOf('.');
        if (dotIndex > -1) {
            timePart = timePart.substring(0, dotIndex);
        }
        timePart = timePart.replace('Z', '');
        if (timePart.length >= 5 && timePart.substring(2, 3) === ':') {
            return timePart.substring(0, 5);
        }
        return '';
    }
}