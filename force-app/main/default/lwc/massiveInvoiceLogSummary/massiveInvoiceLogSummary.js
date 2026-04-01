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
            return;
        }
        this.organizedInvoices = this.normalizeLogToSummaryFormat(logEntries);
    }
    
    normalizeLogToSummaryFormat(logEntries) {
        return logEntries.map((g) => {
            const visits = g.visits || [];
            return {
                invoice: {
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
                    invoiceId: g.invoiceId,
                    invoiceName: g.invoiceName,
                    status: g.status,
                    errorMessage: g.errorMessage,
                    amountFormatted: g.amountFormatted || this.formatCurrency(g.totalVisitsAmount)
                },
                visits: visits.map((v) => ({
                    id: v.id || v.visitId || `v-${Math.random()}`,
                    visitId: v.visitId || v.id,
                    visitName: v.visitName || v.name,
                    name: v.name || v.visitName,
                    visitType: v.visitType || v.tipoVisita || '',
                    tipoVisita: v.tipoVisita || v.visitType || '',
                    beneficiaryType: v.beneficiaryType || '',
                    dataVisita: v.dataVisita || '',
                    comune: v.comune || '',
                    provincia: v.provincia || '',
                    regione: v.regione || '',
                    numeroVisite: v.numeroVisite || '',
                    totaleMinuti: v.totaleMinuti || '',
                    amountFormatted: v.amountFormatted || (v.amount != null ? this.formatCurrency(v.amount) : '-'),
                    localita: v.localita || '',
                    saveStatus: v.saveStatus ?? true,
                    saveStatusSuccess: v.saveStatusSuccess ?? true,
                    saveErrorMessage: v.saveErrorMessage
                })),
                totalVisitsAmount: g.totalVisitsAmount || 0,
                totalVisitsMinutes: g.totalVisitsMinutes || 0,
                totalVisitsNumber: g.totalVisitsNumber || 0,
                totalVisitsMinutesFormatted: (g.totalVisitsMinutesFormatted || (g.totalVisitsMinutes || 0).toLocaleString('it-IT')),
                totalVisitsNumberFormatted: (g.totalVisitsNumberFormatted || (g.totalVisitsNumber || 0).toLocaleString('it-IT')),
                hasVisitErrors: visits.some((v) => v.saveStatusSuccess === false),
                visitsContentRowKey: g.visitsContentRowKey || `visits-${g.invoiceNumber}`
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
        const visitId = event.currentTarget.dataset.visitId;
        if (!visitId) return;
        try {
            await openTab({ recordId: visitId, focus: true });
        } catch (err) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: visitId, actionName: 'view' }
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
                invoice: {
                    ...inv.invoice,
                    statusClass: statusClass
                }
            };
        });
    }
}