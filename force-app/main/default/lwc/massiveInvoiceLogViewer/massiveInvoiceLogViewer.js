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
            this.numeroDettagli = getFieldValue(data, 'MassiveInvoiceLog__c.Numero_Visite__c') || 0;
            const logJson = getFieldValue(data, 'MassiveInvoiceLog__c.Log__c');
            this.logEntries = this.normalizeLogEntries(this.parseLog(logJson));
            this.isSorrisoLog = this.isSorrisoPayload(logJson) || this.logEntries.some((entry) => entry.isSorrisoSospeso === true);
            this.error = undefined;
        } else if (error) {
            this.error = error;
            this.logEntries = [];
            this.isSorrisoLog = false;
        }
    }
    
    data;
    utente;
    numeroFatture;
    numeroDettagli;
    logEntries = [];
    error;
    expandedSections = {};
    isSorrisoLog = false;
    
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

    normalizeLogEntries(rawEntries) {
        if (!Array.isArray(rawEntries)) return [];
        return rawEntries.map((entry, idx) => {
            const details = Array.isArray(entry.tickets)
                ? entry.tickets
                : (Array.isArray(entry.visits) ? entry.visits : []);
            const isSorrisoEntry = this.isSorrisoEntry(entry, details);
            const createdCount = this.toNumber(entry.ticketsCreated ?? entry.visitsCreated);
            const failedCount = this.toNumber(entry.ticketsFailed ?? entry.visitsFailed);
            const created = createdCount != null ? createdCount : details.filter((d) => d.saveStatusSuccess !== false).length;
            const failed = failedCount != null ? failedCount : details.filter((d) => d.saveStatusSuccess === false).length;
            const errorMsgs = details
                .filter((d) => d.saveStatusSuccess === false && d.saveErrorMessage)
                .map((v) => v.saveErrorMessage);
            const detailError = this.coalesceString(entry.ticketError) || this.coalesceString(entry.visitError) || (errorMsgs.length > 0 ? errorMsgs.join('; ') : null);
            const totalCost = this.toNumber(entry.totalTicketsAmount ?? entry.totalVisitsAmount ?? entry.totalCost);
            const totalDiscounted = isSorrisoEntry
                ? this.toNumber(entry.totalDiscountedAmount ?? entry.valoreScontato ?? totalCost)
                : null;
            const invoiceTipologia = this.coalesceString(entry.tipologia);
            const invoiceFornitore = this.coalesceString(entry.fornitore);
            const noInvoiceAvailable = this.toBoolean(entry.noInvoiceAvailable);

            return {
                ...entry,
                isSorrisoSospeso: isSorrisoEntry,
                rowNumber: entry.rowNumber ?? idx + 1,
                invoiceNumber: entry.invoiceNumber ?? entry.invoiceId ?? '-',
                invoiceDate: entry.invoiceDate ?? entry.dataCompetenza ?? entry.competenceDate,
                dataCompetenza: entry.dataCompetenza ?? entry.competenceDate ?? entry.invoiceDate,
                medicalCenter: entry.medicalCenter ?? '',
                partnerName: entry.partnerName ?? entry.partner ?? '',
                tipologia: invoiceTipologia,
                fornitore: invoiceFornitore,
                noInvoiceAvailable: noInvoiceAvailable,
                enteNoProfit: entry.enteNoProfit ?? entry.noProfit ?? '',
                noProfitCategory: entry.noProfitCategory ?? '',
                prestazioneGratuita: entry.prestazioneGratuita ?? false,
                localita: entry.localita ?? '',
                totalQuantity: entry.totalTicketsNumber ?? entry.totalBeneficiari ?? entry.totalVisitsNumber ?? entry.totalQuantity ?? 0,
                totalMinutes: entry.totalTicketsMinutes ?? entry.totalVisitsMinutes ?? entry.totalMinutes ?? 0,
                totalCost: totalCost,
                totalCostFormatted: entry.amountFormatted || this.formatCurrency(totalCost),
                totalDiscounted: totalDiscounted,
                totalDiscountedFormatted: isSorrisoEntry ? (entry.valoreScontatoFormatted || this.formatCurrency(totalDiscounted)) : null,
                detailsCreated: created,
                detailsFailed: failed,
                detailError: detailError,
                visitsCreated: created,
                visitsFailed: failed,
                visitError: detailError,
                visitDetails: details.map((v, vi) => {
                    const success = v.saveStatusSuccess !== false;
                    const detailId = v.id ?? v.ticketId ?? v.visitId ?? `d-${idx}-${vi}`;
                    const amountValue = this.toNumber(v.amount);
                    const discountedValue = this.toNumber(v.valoreScontato ?? v.discountedAmount ?? amountValue);
                    const showDatetime = this.coalesceString(v.showDatetime);
                    const detailTipologia = this.coalesceString(v.tipologia) || this.coalesceString(v.ticketType) || this.coalesceString(v.visitType);
                    const detailFornitore = this.coalesceString(v.fornitore) || invoiceFornitore;
                    const detailDataSpettacolo = this.coalesceString(v.dataSpettacolo) || this.extractDateFromDateTime(showDatetime);
                    const detailOraSpettacolo = this.coalesceString(v.oraSpettacolo) || this.extractTimeFromDateTime(showDatetime);

                    const baseDetail = {
                        id: detailId,
                        recordId: detailId,
                        name: v.ticketName ?? v.visitName ?? v.name ?? v.ticketId ?? v.visitId ?? '-',
                        comune: v.comune ?? '',
                        provincia: v.provincia ?? '',
                        regione: v.regione ?? '',
                        localita: v.localita ?? v.comune ?? '',
                        numeroVisite: v.numeroBeneficiari ?? v.numeroVisite ?? '',
                        saveStatusSuccess: success,
                        saveErrorMessage: v.saveErrorMessage ?? null,
                        boxClass: success
                            ? 'slds-box slds-box_x-small slds-m-bottom_x-small visit-detail'
                            : 'slds-box slds-box_x-small slds-m-bottom_x-small visit-detail slds-theme_error'
                    };

                    if (isSorrisoEntry) {
                        return {
                            ...baseDetail,
                            tipologia: detailTipologia,
                            fornitore: detailFornitore,
                            nomeSpettacolo: this.coalesceString(v.nomeSpettacolo) || this.coalesceString(v.showName),
                            tipologiaSpettacolo: this.coalesceString(v.tipologiaSpettacolo) || this.coalesceString(v.showType),
                            dataSpettacolo: detailDataSpettacolo,
                            oraSpettacolo: detailOraSpettacolo,
                            noInvoiceAvailable: this.toBoolean(v.noInvoiceAvailable) || noInvoiceAvailable,
                            amountFormatted: v.amountFormatted || this.formatCurrency(amountValue),
                            valoreScontatoFormatted: v.valoreScontatoFormatted || v.discountedAmountFormatted || this.formatCurrency(discountedValue)
                        };
                    }

                    return {
                        ...baseDetail,
                        visitType: v.visitType ?? v.tipoVisita ?? '',
                        beneficiaryType: v.beneficiaryType ?? '',
                        localita: v.localita ?? v.comune ?? '',
                        dataVisita: v.dataVisita ?? '',
                        totaleMinuti: v.totaleMinuti ?? '',
                        amountFormatted: v.amountFormatted || this.formatCurrency(amountValue)
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

    get detailCountLabel() {
        return this.isSorrisoLog ? 'Numero Biglietti' : 'Numero Visite';
    }

    get detailSectionTitle() {
        return this.isSorrisoLog ? 'Fatture e Biglietti Caricati' : 'Fatture e Visite Caricate';
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
        return this.logEntries.map((entry, idx) => {
            const status = entry.status || 'unknown';
            const badgeClass = 'slds-m-left_small slds-badge ' + (status === 'success' ? 'slds-badge_success' : status === 'error' ? 'slds-badge_error' : 'slds-badge_lightest');
            const invFields = this.getInvoiceFields(entry.isSorrisoSospeso);
            const detailFields = this.getDetailFields(entry.isSorrisoSospeso);
            const invoiceFieldsDisplay = invFields.map((f) => ({
                key: f.key,
                label: f.label,
                formattedValue: this.formatValue(entry[f.key])
            }));
            let visitDetails = entry.visitDetails || [];
            if (visitDetails && visitDetails.length > 0) {
                visitDetails = visitDetails.map((v) => ({
                    ...v,
                    visitFieldsDisplay: detailFields.map((f) => ({
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
                badgeClass: badgeClass,
                detailErrorTitle: entry.isSorrisoSospeso ? 'Errori nella creazione dei biglietti' : 'Errori nella creazione delle visite',
                detailSectionTitle: entry.isSorrisoSospeso ? 'Biglietti associati' : 'Visite associate',
                hasCreatedDetails: (entry.detailsCreated || 0) > 0,
                createdDetailsText: `${entry.detailsCreated || 0} ${entry.isSorrisoSospeso ? 'biglietto/i' : 'visita/e'}`
            };
        });
    }
    
    formatValue(val) {
        if (val === null || val === undefined) return '-';
        if (typeof val === 'boolean') return val ? 'Sì' : 'No';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    }

    getInvoiceFields(isSorriso) {
        if (isSorriso) {
            return [
                { key: 'rowNumber', label: 'Riga' },
                { key: 'status', label: 'Stato' },
                { key: 'invoiceNumber', label: 'Numero Fattura' },
                { key: 'invoiceDate', label: 'Data Fattura' },
                { key: 'dataCompetenza', label: 'Data Competenza' },
                { key: 'partnerName', label: 'Partner' },
                { key: 'tipologia', label: 'Tipologia' },
                { key: 'fornitore', label: 'Fornitore' },
                { key: 'noInvoiceAvailable', label: 'Fattura Non Disponibile' },
                { key: 'totalQuantity', label: 'Totale Beneficiari' },
                { key: 'totalCostFormatted', label: 'Valore Commerciale Totale' },
                { key: 'totalDiscountedFormatted', label: 'Valore Scontato Totale' },
                { key: 'detailsCreated', label: 'Biglietti Creati' },
                { key: 'detailsFailed', label: 'Biglietti Falliti' },
                { key: 'detailError', label: 'Errore Biglietti' }
            ];
        }
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
    
    getDetailFields(isSorriso) {
        if (isSorriso) {
            return [
                { key: 'saveStatusSuccess', label: 'Stato Caricamento' },
                { key: 'saveErrorMessage', label: 'Errore' },
                { key: 'name', label: 'Record' },
                { key: 'tipologia', label: 'Tipologia' },
                { key: 'fornitore', label: 'Fornitore' },
                { key: 'nomeSpettacolo', label: 'Nome Spettacolo' },
                { key: 'tipologiaSpettacolo', label: 'Tipologia Spettacolo' },
                { key: 'dataSpettacolo', label: 'Data Spettacolo' },
                { key: 'oraSpettacolo', label: 'Ora Spettacolo' },
                { key: 'noInvoiceAvailable', label: 'Fattura Non Disponibile' },
                { key: 'numeroVisite', label: 'Quantità Beneficiari' },
                { key: 'amountFormatted', label: 'Valore Commerciale Totale' },
                { key: 'valoreScontatoFormatted', label: 'Valore Scontato Totale' },
                { key: 'comune', label: 'Comune' },
                { key: 'provincia', label: 'Provincia' },
                { key: 'regione', label: 'Regione' }
            ];
        }
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

    isSorrisoEntry(entry, details) {
        if (entry && entry.isSorrisoSospeso === true) return true;
        if (entry && (entry.tipologia || entry.fornitore || entry.valoreScontato != null || entry.totalDiscountedAmount != null)) return true;
        if (!Array.isArray(details)) return false;
        return details.some((d) =>
            d && (
                d.tipologia ||
                d.ticketType ||
                d.ticketName ||
                d.ticketId ||
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
            logJson.includes('"ticketId"');
    }

    toNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return value;
        const parsed = Number(String(value).replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
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

    formatCurrency(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '-';
        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR'
        }).format(value);
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