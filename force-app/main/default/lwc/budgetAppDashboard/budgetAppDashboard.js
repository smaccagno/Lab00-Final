import { LightningElement, wire, track } from 'lwc';
import getDashboardData from '@salesforce/apex/BudgetAppDashboardController.getDashboardData';
import getProgramDetailsData from '@salesforce/apex/BudgetAppDashboardController.getProgramDetailsData';

export default class BudgetAppDashboard extends LightningElement {
    accountId;
    programs = [];
    programOptions = [];
    selectedProgramId;
    @track yearlyData = null;
    @track programSummaryData = null;
    globalDate = new Date().toISOString().split('T')[0];

    columns = [
        { label: 'Tipo', fieldName: 'tipo', type: 'text', cellAttributes: { class: { fieldName: 'cssClass' } } },
        { label: 'Categoria', fieldName: 'categoria', type: 'text', cellAttributes: { class: { fieldName: 'cssClass' } } },
        { label: 'Previsto', fieldName: 'previsto', type: 'currency', typeAttributes: { currencyCode: 'EUR' }, cellAttributes: { class: { fieldName: 'cssClass' } } },
        { label: 'Effettivo', fieldName: 'effettivo', type: 'currency', typeAttributes: { currencyCode: 'EUR' }, cellAttributes: { class: { fieldName: 'cssClass' } } }
    ];

    @wire(getDashboardData)
    wiredData({ error, data }) {
        if (data) {
            this.accountId = data.accountId;
            if (data.programs) {
                this.programs = data.programs.map(p => {
                    return {
                        ...p,
                        DisplayName: p.Program__r ? p.Program__r.Name : p.Name
                    };
                });
                this.programOptions = this.programs.map(p => {
                    return { label: p.DisplayName, value: p.Id };
                });
            }
        } else if (error) {
            console.error(error);
        }
    }

    @wire(getProgramDetailsData, { programId: '$selectedProgramId', selectedDateStr: '$globalDate' })
    wiredProgramDetails({ error, data }) {
        if (data) {
            this.processProgramData(data);
        } else if (error) {
            console.error(error);
            this.yearlyData = null;
            this.programSummaryData = null;
        }
    }

    handleGlobalDateChange(event) {
        this.globalDate = event.target.value;
    }

    handleProgramChange(event) {
        this.selectedProgramId = event.detail.value;
    }

    processProgramData(result) {
        let groupedByYear = {};
        let programTotals = {};
        let totalIncassiPrev = 0, totalIncassiEff = 0;
        let totalSpesePrev = 0, totalSpeseEff = 0;
        
        result.forEach(item => {
            // Skip if both are 0
            if (item.effettivo === 0 && item.previsto === 0) return;
            
            let rowClass = '';
            if (item.tipo === 'Incasso') rowClass = 'slds-text-color_success';
            else if (item.tipo === 'Spesa') rowClass = 'slds-text-color_error';

            if (!groupedByYear[item.anno]) {
                groupedByYear[item.anno] = [];
            }
            groupedByYear[item.anno].push({ ...item, cssClass: rowClass });

            // Program Summary Aggregation
            let key = item.tipo + '_' + item.categoria;
            if (!programTotals[key]) {
                programTotals[key] = {
                    id: 'tot_' + key,
                    tipo: item.tipo,
                    categoria: item.categoria,
                    previsto: 0,
                    effettivo: 0,
                    cssClass: rowClass
                };
            }
            programTotals[key].previsto += item.previsto;
            programTotals[key].effettivo += item.effettivo;

            if (item.tipo === 'Incasso') {
                totalIncassiPrev += item.previsto;
                totalIncassiEff += item.effettivo;
            } else if (item.tipo === 'Spesa') {
                totalSpesePrev += item.previsto;
                totalSpeseEff += item.effettivo;
            }
        });

        // Build Summary Data
        let summaryData = Object.values(programTotals);
        summaryData.sort((a, b) => {
            if (a.tipo !== b.tipo) {
                if (a.tipo === 'Incasso') return -1;
                if (b.tipo === 'Incasso') return 1;
                return a.tipo.localeCompare(b.tipo);
            }
            return a.categoria.localeCompare(b.categoria);
        });

        if (summaryData.length > 0) {
            summaryData.push({
                id: 'tot_cashflow',
                tipo: 'CASH FLOW TOTALE',
                categoria: '',
                previsto: totalIncassiPrev - totalSpesePrev,
                effettivo: totalIncassiEff - totalSpeseEff,
                cssClass: 'slds-text-title_bold slds-theme_shade'
            });
            this.programSummaryData = summaryData;
        } else {
            this.programSummaryData = null;
        }

        let yearlyDataArray = [];
        for (let anno in groupedByYear) {
            let yearRecords = groupedByYear[anno];
            
            // Sort records: Incasso first, then Spesa, then Categoria
            yearRecords.sort((a, b) => {
                if (a.tipo !== b.tipo) {
                    if (a.tipo === 'Incasso') return -1;
                    if (b.tipo === 'Incasso') return 1;
                    return a.tipo.localeCompare(b.tipo);
                }
                return a.categoria.localeCompare(b.categoria);
            });

            // Calculate Cash Flow
            let incassiPrev = 0, incassiEff = 0, spesePrev = 0, speseEff = 0;
            yearRecords.forEach(r => {
                if (r.tipo === 'Incasso') {
                    incassiPrev += r.previsto;
                    incassiEff += r.effettivo;
                } else if (r.tipo === 'Spesa') {
                    spesePrev += r.previsto;
                    speseEff += r.effettivo;
                }
            });

            let cfPrev = incassiPrev - spesePrev;
            let cfEff = incassiEff - speseEff;

            // Add summary row
            yearRecords.push({
                id: 'summary_' + anno,
                tipo: 'CASH FLOW',
                categoria: '',
                previsto: cfPrev,
                effettivo: cfEff,
                cssClass: 'slds-text-title_bold slds-theme_shade'
            });

            // Assign ids
            yearRecords.forEach((r, idx) => {
                if (!r.id) r.id = anno + '_' + idx;
            });

            yearlyDataArray.push({
                anno: anno,
                data: yearRecords
            });
        }

        // Sort years descending
        yearlyDataArray.sort((a, b) => b.anno.localeCompare(a.anno));
        
        this.yearlyData = yearlyDataArray.length > 0 ? yearlyDataArray : null;
    }
}
