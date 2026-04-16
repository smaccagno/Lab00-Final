import { LightningElement, wire } from 'lwc';
import getDashboardData from '@salesforce/apex/BudgetAppDashboardController.getDashboardData';
import getProgramDetails from '@salesforce/apex/BudgetAppDashboardController.getProgramDetails';

export default class BudgetAppDashboard extends LightningElement {
    accountId;
    programs = [];
    programOptions = [];
    selectedProgramId;
    yearlyData = null;
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
                this.programs = data.programs;
                this.programOptions = data.programs.map(p => {
                    return { label: p.Name, value: p.Id };
                });
            }
        } else if (error) {
            console.error(error);
        }
    }

    handleGlobalDateChange(event) {
        this.globalDate = event.target.value;
        this.fetchProgramData();
    }

    handleProgramChange(event) {
        this.selectedProgramId = event.detail.value;
        this.fetchProgramData();
    }

    fetchProgramData() {
        if (this.selectedProgramId) {
            getProgramDetails({ programId: this.selectedProgramId, filterDate: this.globalDate })
                .then(result => {
                    let groupedByYear = {};
                    
                    result.forEach(item => {
                        // Skip if both are 0
                        if (item.effettivo === 0 && item.previsto === 0) return;
                        
                        if (!groupedByYear[item.anno]) {
                            groupedByYear[item.anno] = [];
                        }
                        groupedByYear[item.anno].push({ ...item, cssClass: '' });
                    });

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
                })
                .catch(error => {
                    console.error(error);
                    this.yearlyData = null;
                });
        } else {
            this.yearlyData = null;
        }
    }
}
