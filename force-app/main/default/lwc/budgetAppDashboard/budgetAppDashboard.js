import { LightningElement, wire } from 'lwc';
import getDashboardData from '@salesforce/apex/BudgetAppDashboardController.getDashboardData';
import getProgramDetails from '@salesforce/apex/BudgetAppDashboardController.getProgramDetails';

export default class BudgetAppDashboard extends LightningElement {
    accountId;
    programs = [];
    programOptions = [];
    selectedProgramId;
    programData = null;
    globalDate = new Date().toISOString().split('T')[0];

    columns = [
        { label: 'Anno', fieldName: 'anno', type: 'text', sortable: true },
        { label: 'Tipo', fieldName: 'tipo', type: 'text', sortable: true },
        { label: 'Categoria', fieldName: 'categoria', type: 'text', sortable: true },
        { label: 'Previsto', fieldName: 'previsto', type: 'currency', typeAttributes: { currencyCode: 'EUR' } },
        { label: 'Effettivo', fieldName: 'effettivo', type: 'currency', typeAttributes: { currencyCode: 'EUR' } },
        { label: 'Totale', fieldName: 'totale', type: 'currency', typeAttributes: { currencyCode: 'EUR' } }
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
                    // Add a unique id for datatable and sort
                    let formattedData = result.map((item, index) => {
                        return { ...item, id: index.toString() };
                    });
                    
                    // Sort by Tipo ("Incasso" before "Spesa"), then Anno descending, then Categoria
                    formattedData.sort((a, b) => {
                        if (a.tipo !== b.tipo) {
                            // "Incasso" should come before "Spesa"
                            if (a.tipo === 'Incasso') return -1;
                            if (b.tipo === 'Incasso') return 1;
                            return a.tipo.localeCompare(b.tipo);
                        }
                        if (a.anno !== b.anno) return b.anno.localeCompare(a.anno);
                        return a.categoria.localeCompare(b.categoria);
                    });
                    
                    this.programData = formattedData;
                })
                .catch(error => {
                    console.error(error);
                    this.programData = null;
                });
        } else {
            this.programData = null;
        }
    }
}
