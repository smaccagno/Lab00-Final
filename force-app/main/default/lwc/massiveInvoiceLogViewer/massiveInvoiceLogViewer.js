import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

const FIELDS = [
    'MassiveInvoiceLog__c.Data__c',
    'MassiveInvoiceLog__c.Utente__c',
    'MassiveInvoiceLog__c.Numero_Fatture__c',
    'MassiveInvoiceLog__c.Numero_Visite__c',
    'MassiveInvoiceLog__c.Log__c',
    'MassiveInvoiceLog__c.Utente__r.Name'
];

export default class MassiveInvoiceLogViewer extends LightningElement {
    @api recordId;
    
    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    wiredRecord({ error, data }) {
        if (data) {
            this.data = getFieldValue(data, 'MassiveInvoiceLog__c.Data__c');
            this.utente = getFieldValue(data, 'MassiveInvoiceLog__c.Utente__r.Name') || getFieldValue(data, 'MassiveInvoiceLog__c.Utente__c');
            this.numeroFatture = getFieldValue(data, 'MassiveInvoiceLog__c.Numero_Fatture__c') || 0;
            this.numeroVisite = getFieldValue(data, 'MassiveInvoiceLog__c.Numero_Visite__c') || 0;
            const logJson = getFieldValue(data, 'MassiveInvoiceLog__c.Log__c');
            this.logEntries = this.normalizeLogEntries(this.parseLog(logJson));
            this.error = undefined;
        } else if (error) {
            this.error = error;
            this.logEntries = [];
        }
    }
    
    data;
    utente;
    numeroFatture;
    numeroVisite;
    logEntries = [];
    error;
    expandedSections = {};
    
    parseLog(logJson) {
        if (!logJson || typeof logJson !== 'string') {
            return [];
        }
        try {
            return JSON.parse(logJson);
        } catch (e) {
            console.error('Errore nel parsing del log JSON:', e);
            return [];
        }
    }

    /**
     * Normalizza le voci del log per il display: calcola visitsCreated, visitsFailed, visitError
     * e mappa visitDetails dal campo visits. Gestisce sia la struttura del log (visits array)
     * che i campi con nomi alternativi (dataCompetenza/competenceDate, partner/partnerName).
     */
    normalizeLogEntries(rawEntries) {
        if (!Array.isArray(rawEntries)) return [];
        return rawEntries.map((entry, idx) => {
            const visits = entry.visits || [];
            const created = visits.filter((v) => v.saveStatusSuccess !== false).length;
            const failed = visits.filter((v) => v.saveStatusSuccess === false).length;
            const errorMsgs = visits
                .filter((v) => v.saveStatusSuccess === false && v.saveErrorMessage)
                .map((v) => v.saveErrorMessage);
            const visitError = errorMsgs.length > 0 ? errorMsgs.join('; ') : null;

            return {
                ...entry,
                rowNumber: entry.rowNumber ?? idx + 1,
                invoiceNumber: entry.invoiceNumber ?? entry.invoiceId ?? '-',
                invoiceDate: entry.invoiceDate ?? entry.dataCompetenza ?? entry.competenceDate,
                dataCompetenza: entry.dataCompetenza ?? entry.competenceDate ?? entry.invoiceDate,
                medicalCenter: entry.medicalCenter ?? '',
                partnerName: entry.partnerName ?? entry.partner ?? '',
                enteNoProfit: entry.enteNoProfit ?? entry.noProfit ?? '',
                noProfitCategory: entry.noProfitCategory ?? '',
                prestazioneGratuita: entry.prestazioneGratuita ?? false,
                localita: entry.localita ?? '',
                totalQuantity: entry.totalVisitsNumber ?? entry.totalQuantity ?? 0,
                totalMinutes: entry.totalVisitsMinutes ?? entry.totalMinutes ?? 0,
                totalCost: entry.totalVisitsAmount ?? entry.totalCost ?? 0,
                visitsCreated: created,
                visitsFailed: failed,
                visitError: visitError,
                visitDetails: visits.map((v, vi) => {
                    const success = v.saveStatusSuccess !== false;
                    return {
                        id: v.id ?? v.visitId ?? `v-${idx}-${vi}`,
                        name: v.visitName ?? v.name ?? v.visitId ?? '-',
                        visitType: v.visitType ?? v.tipoVisita ?? '',
                        beneficiaryType: v.beneficiaryType ?? '',
                        localita: v.localita ?? v.comune ?? '',
                        dataVisita: v.dataVisita ?? '',
                        comune: v.comune ?? '',
                        provincia: v.provincia ?? '',
                        regione: v.regione ?? '',
                        numeroVisite: v.numeroVisite ?? '',
                        totaleMinuti: v.totaleMinuti ?? '',
                        amountFormatted: v.amountFormatted ?? (v.amount != null ? String(v.amount) : '-'),
                        saveStatusSuccess: success,
                        saveErrorMessage: v.saveErrorMessage ?? null,
                        boxClass: success
                            ? 'slds-box slds-box_x-small slds-m-bottom_x-small visit-detail'
                            : 'slds-box slds-box_x-small slds-m-bottom_x-small visit-detail slds-theme_error'
                    };
                })
            };
        });
    }
    
    get formattedData() {
        if (!this.data) return '';
        const d = new Date(this.data);
        return d.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    get hasLogEntries() {
        return this.logEntries && this.logEntries.length > 0;
    }
    
    get hasError() {
        return !!this.error;
    }
    
    get errorMessage() {
        return this.error && this.error.body && this.error.body.message ? this.error.body.message : (this.error ? String(this.error) : '');
    }
    
    toggleSection(event) {
        const index = event.currentTarget.dataset.index;
        this.expandedSections = {
            ...this.expandedSections,
            [index]: !this.expandedSections[index]
        };
    }
    
    isExpanded(index) {
        return !!this.expandedSections[String(index)];
    }
    
    get entriesWithIndex() {
        const invFields = this.invoiceFields;
        const visFields = this.visitFields;
        return this.logEntries.map((entry, idx) => {
            const status = entry.status || 'unknown';
            const badgeClass = 'slds-m-left_small slds-badge ' + (status === 'success' ? 'slds-badge_success' : status === 'error' ? 'slds-badge_error' : 'slds-badge_lightest');
            const invoiceFieldsDisplay = invFields.map((f) => ({
                key: f.key,
                label: f.label,
                formattedValue: this.formatValue(entry[f.key])
            }));
            let visitDetails = entry.visitDetails;
            if (visitDetails && visitDetails.length > 0) {
                visitDetails = visitDetails.map((v) => ({
                    ...v,
                    visitFieldsDisplay: visFields.map((f) => ({
                        key: f.key,
                        label: f.label,
                        formattedValue: f.key === 'saveStatusSuccess'
                            ? (v.saveStatusSuccess ? 'Caricata correttamente' : 'Errore')
                            : this.formatValue(v[f.key])
                    }))
                }));
            }
            return {
                ...entry,
                visitDetails,
                invoiceFieldsDisplay,
                index: idx,
                isExpanded: this.isExpanded(idx),
                expandIcon: this.isExpanded(idx) ? 'utility:chevrondown' : 'utility:chevronright',
                badgeClass: badgeClass
            };
        });
    }
    
    formatValue(val) {
        if (val === null || val === undefined) return '-';
        if (typeof val === 'boolean') return val ? 'Sì' : 'No';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    }

    get invoiceFields() {
        return [
            { key: 'rowNumber', label: 'Riga' },
            { key: 'status', label: 'Stato' },
            { key: 'invoiceNumber', label: 'Numero Fattura' },
            { key: 'invoiceDate', label: 'Data Fattura' },
            { key: 'dataCompetenza', label: 'Data Competenza' },
            { key: 'medicalCenter', label: 'Centro Medico' },
            { key: 'partnerName', label: 'Partner' },
            { key: 'enteNoProfit', label: 'Ente No Profit' },
            { key: 'noProfitCategory', label: 'Categoria Ente' },
            { key: 'prestazioneGratuita', label: 'Prestazione Gratuita' },
            { key: 'localita', label: 'Località' },
            { key: 'totalQuantity', label: 'Quantità Totale' },
            { key: 'totalMinutes', label: 'Minuti Totali' },
            { key: 'totalCost', label: 'Costo Totale' },
            { key: 'visitsCreated', label: 'Visite Create' },
            { key: 'visitsFailed', label: 'Visite Fallite' },
            { key: 'visitError', label: 'Errore Visite' }
        ];
    }
    
    get visitFields() {
        return [
            { key: 'saveStatusSuccess', label: 'Stato Caricamento' },
            { key: 'saveErrorMessage', label: 'Errore' },
            { key: 'name', label: 'Nome' },
            { key: 'visitType', label: 'Tipo Visita' },
            { key: 'beneficiaryType', label: 'Tipo Beneficiario' },
            { key: 'dataVisita', label: 'Data Visita' },
            { key: 'comune', label: 'Comune' },
            { key: 'localita', label: 'Località' },
            { key: 'numeroVisite', label: 'Numero Visite' },
            { key: 'totaleMinuti', label: 'Totale Minuti' },
            { key: 'amountFormatted', label: 'Ammontare' }
        ];
    }
}