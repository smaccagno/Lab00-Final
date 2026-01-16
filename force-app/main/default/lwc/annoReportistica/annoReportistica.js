import { LightningElement, wire, track, api } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import PROGRAM_NAME_FIELD from '@salesforce/schema/Anno_Reportistica__c.Programma__r.Name';
import getRelatedRecords from '@salesforce/apex/AnnoReportistica.getRelatedRecords';

/* -------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */
const deepClone = (obj) => (obj ? JSON.parse(JSON.stringify(obj)) : obj);

/**
 * Stampa in console un valore SENZA Proxy.
 * Converte l’oggetto in stringa JSON, poi lo re-parse e lo logga.
 * Se è un array, usa console.table per maggiore leggibilità.
 */
function logPlain(label, value) {
    const clean = JSON.parse(JSON.stringify(value));
    if (Array.isArray(clean)) {
        // eslint-disable-next-line no-console
        console.group(label);
        // eslint-disable-next-line no-console
        console.table(clean);
        // eslint-disable-next-line no-console
        console.groupEnd();
    } else {
        // eslint-disable-next-line no-console
        console.log(label, clean);
    }
}

/* =========================================================================
 * COMPONENT
 * ========================================================================= */
export default class AnnoReportistica extends LightningElement {
    /* ------------ API & reactive props ------------ */
    @api   recordId;
    @track programDevName;

    @track budgetData  = [];
    @track donorData   = [];

    @track totalBudgetValues          = {};
    @track totalDonorValues           = {};
    @track formattedTotalBudgetValues = {};
    @track formattedTotalDonorValues  = {};

    @track budgetDynamicCols = [];
    @track donorDynamicCols  = [];

    /* ------------ cache locali ------------ */
    originalBudgetData = [];
    originalDonorData  = [];

    /* ======================================================================
       1) Developer Name del Programma
       ====================================================================== */
    @wire(getRecord, { recordId: '$recordId', fields: [PROGRAM_NAME_FIELD] })
    wiredAnno({ error, data }) {
        if (data) {
            const progName = getFieldValue(data, PROGRAM_NAME_FIELD);
            if (progName) {
                this.programDevName = progName.replace(/\s+/g, '_').toUpperCase();
            }
        } else if (error) {
            // eslint-disable-next-line no-console
            console.error('Errore getRecord Anno_Reportistica__c', error);
        }
    }

    /* ======================================================================
       2) Apex — budget & donor
       ====================================================================== */
    @wire(getRelatedRecords, {
        recordId: '$recordId',
        programDevName: '$programDevName'
    })
    wiredRecords({ error, data }) {
        if (data) {
            /* ---- query & payload ----------------------------------------- */
            // eslint-disable-next-line no-console
            console.info('⚙️ SOQL Budget:', data.query_budget);
            // eslint-disable-next-line no-console
            console.info('⚙️ SOQL Donor :',  data.query_donor);
            logPlain('🚚 Payload Apex', data);

            /* ---- clone, format, aggrega ---------------------------------- */
            this.originalBudgetData = this.formatDataWithLink(
                deepClone(data.records_budget)
            );
            this.budgetData = [...this.originalBudgetData];

            this.originalDonorData = this.formatDataWithLink(
                deepClone(data.records_donor_raw)
            );
            this.donorData = this.calculateAggregatedDonorData(
                this.originalDonorData,
                (data.donorMeta || []).map(m => m.fieldApi) // KPI dinamici
            );

            logPlain('📊 Budget (plain)', this.budgetData);
            logPlain('📊 Donor  (plain)', this.donorData);

            /* ---- totali --------------------------------------------------- */
            this.calculateTotalValues(
                'budgetData',
                'totalBudgetValues',
                'formattedTotalBudgetValues'
            );
            this.calculateTotalValues(
                'donorData',
                'totalDonorValues',
                'formattedTotalDonorValues'
            );

            /* ---- colonne dinamiche --------------------------------------- */
            this.budgetDynamicCols = this.buildDynamicCols(
                data.budgetMeta,
                'formattedTotalBudgetValues'
            );
            this.donorDynamicCols  = this.buildDynamicCols(
                data.donorMeta,
                'formattedTotalDonorValues'
            );

            logPlain('🧮 Totali grezzi budgetData',     this.totalBudgetValues);
            logPlain('💶 Totali formattati budgetData', this.formattedTotalBudgetValues);
            logPlain('🧮 Totali grezzi donorData',      this.totalDonorValues);
            logPlain('💶 Totali formattati donorData',  this.formattedTotalDonorValues);
        } else if (error) {
            // eslint-disable-next-line no-console
            console.error('❌ Errore Apex:', error);
        }
    }

    /* ======================================================================
       3) Colonne fisse + dinamiche
       ====================================================================== */
    get budgetColumns() {
        const staticCols = [
            {
                label: `Budget per Anno`,
                fieldName: 'linkOrText',
                type: 'url',
                typeAttributes: { label: { fieldName: 'displayName' }, target: '_self' },
                fixedWidth: 280,
                hideDefaultActions: true,
                cellAttributes: { alignment: 'left' }
            },
            { label: `Allocati\n${this.formattedTotalBudgetValues.Totale_Allocato__c || ''}`, fieldName: 'Totale_Allocato__c', type: 'currency', fixedWidth: 130, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `Pagati\n${this.formattedTotalBudgetValues.Totale_Distribuito_Pagato_Formula__c || ''}`, fieldName: 'Totale_Distribuito_Pagato_Formula__c', type: 'currency', fixedWidth: 130, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `NON Pagati\n${this.formattedTotalBudgetValues.Totale_Distribuito_NON_Pagato_Formula__c || ''}`, fieldName: 'Totale_Distribuito_NON_Pagato_Formula__c', type: 'currency', fixedWidth: 130, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `Pagamenti Aperti\n${this.formattedTotalBudgetValues.Ammontare_Pagamenti_Da_Pagare_formula__c || ''}`, fieldName: 'Ammontare_Pagamenti_Da_Pagare_formula__c', type: 'currency', fixedWidth: 160, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `Pagamenti Chiusi\n${this.formattedTotalBudgetValues.Ammontare_Pagamenti_Fatti_formula__c || ''}`, fieldName: 'Ammontare_Pagamenti_Fatti_formula__c', type: 'currency', fixedWidth: 160, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `Num Fatture\n${this.formattedTotalBudgetValues.Numero_di_Fatture_formula__c || ''}`, fieldName: 'Numero_di_Fatture_formula__c', type: 'number', fixedWidth: 130, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `Fatturati\n${this.formattedTotalBudgetValues.Totale_Ammontare_Fatture_formula__c || ''}`, fieldName: 'Totale_Ammontare_Fatture_formula__c', type: 'currency', fixedWidth: 130, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `Capienza\n${this.formattedTotalBudgetValues.Capienza__c || ''}`, fieldName: 'Capienza__c', type: 'currency', fixedWidth: 130, hideDefaultActions: true, cellAttributes: { alignment: 'left' } }
        ];
        return [...staticCols, ...this.budgetDynamicCols];
    }

    get donorColumns() {
        const staticCols = [
            {
                label: `Donatore per Anno`,
                fieldName: 'linkOrText',
                type: 'url',
                typeAttributes: { label: { fieldName: 'displayName' }, target: '_self' },
                fixedWidth: 280,
                hideDefaultActions: true,
                cellAttributes: { alignment: 'left' }
            },
            { label: `Donati\n${this.formattedTotalDonorValues.Donato_Originale_formula__c || ''}`, fieldName: 'Donato_Originale_formula__c', type: 'currency', fixedWidth: 150, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `Allocabili\n${this.formattedTotalDonorValues.Allocabile_formula__c || ''}`, fieldName: 'Allocabile_formula__c', type: 'currency', fixedWidth: 150, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `Num Donazioni\n${this.formattedTotalDonorValues.Totale_Numero_Donazioni_formula__c || ''}`, fieldName: 'Totale_Numero_Donazioni_formula__c', type: 'number', fixedWidth: 150, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `Fatturati\n${this.formattedTotalDonorValues.Totale_Fattura_formula__c || ''}`, fieldName: 'Totale_Fattura_formula__c', type: 'currency', fixedWidth: 150, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `NON Fatturati\n${this.formattedTotalDonorValues.Available_Amount__c || ''}`, fieldName: 'Available_Amount__c', type: 'currency', fixedWidth: 150, hideDefaultActions: true, cellAttributes: { alignment: 'left' } },
            { label: `Num Fatture\n${this.formattedTotalDonorValues.Totale_Numero_Fatture_formula__c || ''}`, fieldName: 'Totale_Numero_Fatture_formula__c', type: 'number', fixedWidth: 150, hideDefaultActions: true, cellAttributes: { alignment: 'left' } }
        ];
        return [...staticCols, ...this.donorDynamicCols];
    }

    /* ======================================================================
       4) Helper per colonne dinamiche
       ====================================================================== */
    buildDynamicCols(metaList = [], totalVar) {
        return metaList.map(({ label, fieldApi }) => {
            const isCountField = /(Num|Numero|Visite|Minuti|Durata)/i.test(fieldApi);
            return {
                label     : `${label}\n${this[totalVar]?.[fieldApi] || ''}`,
                fieldName : fieldApi,
                type      : isCountField ? 'number' : 'currency',
                fixedWidth: 150,
                hideDefaultActions: true,
                cellAttributes: { alignment: 'left' }
            };
        });
    }

    /* ======================================================================
       5) Totali
       ====================================================================== */
    calculateTotalValues(dataKey, totalValuesKey, formattedTotalValuesKey) {
        const records = this[dataKey] || [];

        const numericFields = new Set();
        records.forEach(rec => {
            Object.keys(rec).forEach(k => {
                const v = rec[k];
                if (typeof v === 'number' || (!isNaN(v) && v !== '')) {
                    numericFields.add(k);
                }
            });
        });

        this[totalValuesKey] = [...numericFields].reduce((tot, f) => {
            tot[f] = records.reduce((s, r) => s + (+r[f] || 0), 0);
            return tot;
        }, {});

        this.formatTotalValues(totalValuesKey, formattedTotalValuesKey);
    }

    formatTotalValues(totalValuesKey, formattedTotalValuesKey) {
        const currencyFormatter = new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR'
        });
        const numberFormatter = new Intl.NumberFormat('it-IT');

        this[formattedTotalValuesKey] = Object.keys(this[totalValuesKey]).reduce(
            (fmt, f) => {
                const raw = this[totalValuesKey][f] || 0;
                fmt[f] = /(Num|Numero|Visite|Minuti|Durata)/i.test(f)
                    ? numberFormatter.format(raw)
                    : currencyFormatter.format(raw);
                return fmt;
            },
            {}
        );
    }

    /* ======================================================================
       6) Altri helper
       ====================================================================== */
    formatDataWithLink(data) {
        return (data || []).map(r => ({
            ...r,
            displayName: r.Name,
            linkOrText : '/' + r.Id,
            Capienza__c:
                (r.Totale_Allocato__c || 0) -
                (r.Totale_Ammontare_Fatture_formula__c || 0)
        }));
    }

    /**
     * Aggrega i Reporting_Year__c per holding/Account.
     * @param {Object[]} donorData              lista raw clonata
     * @param {String[]} mandatoryNumericFields KPI dinamici da forzare
     */
    calculateAggregatedDonorData(donorData, mandatoryNumericFields = []) {
        const grouped = {};
        const figliPerHolding = donorData.reduce((m, r) => {
            if (r.Holding__c) {
                const key15 = r.Holding__c.substring(0, 15);
                (m[key15] = m[key15] || []).push(r);
            }
            return m;
        }, {});

        donorData
            .filter(r => !r.Holding__c)
            .forEach(master => {
                const master15 = master.Account__c?.substring(0, 15);
                const children = figliPerHolding[master15] || [];
                const all      = [master, ...children];

                const aggregated = {
                    Account__c      : master15,
                    Nome_Donatore__c: master.Nome_Donatore__c,
                    linkOrText      : `/${master.Id}`,
                    displayName     : master.Nome_Donatore__c
                };

                const numericFields = new Set([
                    'Donato_Originale_formula__c',
                    'Allocabile_formula__c',
                    'Totale_Numero_Donazioni_formula__c',
                    'Totale_Fattura_formula__c',
                    'Available_Amount__c',
                    'Totale_Numero_Fatture_formula__c',
                    ...mandatoryNumericFields
                ]);

                all.forEach(r => {
                    Object.keys(r).forEach(k => {
                        const v = r[k];
                        if (typeof v === 'number' || (!isNaN(v) && v !== '')) {
                            numericFields.add(k);
                        }
                    });
                });

                numericFields.forEach(f => {
                    aggregated[f] = all.reduce((s, rec) => s + (+rec[f] || 0), 0);
                });

                grouped[master15] = aggregated;
            });

        return Object.values(grouped);
    }
}