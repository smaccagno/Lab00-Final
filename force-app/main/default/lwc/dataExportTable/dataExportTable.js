import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAllTableData from '@salesforce/apex/DataExportController.getAllTableData';
import SheetJS from '@salesforce/resourceUrl/SheetJS';
import { loadScript } from 'lightning/platformResourceLoader';

export default class DataExportTable extends LightningElement {
    tableData = [];
    isLoading = true;
    error;
    sheetJSInitialized = false;

    columns = [
        { label: 'Comune', fieldName: 'comune', type: 'text' },
        { label: 'Provincia', fieldName: 'provincia', type: 'text' },
        { label: 'Regione', fieldName: 'regione', type: 'text' },
        { label: 'Tipo Visita', fieldName: 'tipoVisita', type: 'text' },
        { label: 'Beneficiario', fieldName: 'beneficiario', type: 'text' },
        { label: 'Centro Medico', fieldName: 'centroMedico', type: 'text' },
        { label: 'Ente No Profit', fieldName: 'enteNoProfit', type: 'text' },
        { label: 'No Profit Category', fieldName: 'noProfitCategory', type: 'text' },
        { label: 'Boolean', fieldName: 'booleanValue', type: 'text' },
        { label: 'Partner', fieldName: 'partner', type: 'text' }
    ];

    @wire(getAllTableData)
    wiredTableData({ error, data }) {
        if (data) {
            this.tableData = data;
            this.isLoading = false;
            this.error = undefined;
        } else if (error) {
            this.error = error;
            this.isLoading = false;
            this.showToast('Errore', 'Errore nel caricamento dei dati: ' + (error.body?.message || error.message), 'error');
        }
    }

    connectedCallback() {
        // Carica SheetJS per l'esportazione Excel
        loadScript(this, SheetJS)
            .then(() => {
                this.sheetJSInitialized = true;
            })
            .catch(error => {
                console.error('Errore nel caricamento di SheetJS:', error);
                this.showToast('Errore', 'Impossibile caricare la libreria per l\'esportazione Excel', 'error');
            });
    }

    get hasData() {
        return this.tableData && this.tableData.length > 0;
    }

    get dataCount() {
        return this.tableData ? this.tableData.length : 0;
    }

    get isButtonDisabled() {
        return this.isLoading || !this.hasData;
    }

    get maxRowCount() {
        return 1000;
    }

    exportToExcel() {
        if (!this.sheetJSInitialized) {
            this.showToast('Errore', 'La libreria Excel non è ancora caricata. Attendere qualche istante.', 'error');
            return;
        }

        if (!this.hasData) {
            this.showToast('Attenzione', 'Nessun dato da esportare', 'warning');
            return;
        }

        try {
            // Prepara i dati per l'esportazione
            const jsonData = this.tableData.map(row => ({
                'Comune': row.comune || '',
                'Provincia': row.provincia || '',
                'Regione': row.regione || '',
                'Tipo Visita': row.tipoVisita || '',
                'Beneficiario': row.beneficiario || '',
                'Centro Medico': row.centroMedico || '',
                'Ente No Profit': row.enteNoProfit || '',
                'No Profit Category': row.noProfitCategory || '',
                'Boolean': row.booleanValue || '',
                'Partner': row.partner || ''
            }));

            // Crea il foglio di lavoro
            const worksheet = XLSX.utils.json_to_sheet(jsonData);

            // Calcola le larghezze delle colonne
            const keys = Object.keys(jsonData[0] || {});
            const colWidths = keys.map(key => {
                const headerLength = key.length;
                const maxCellLength = Math.max(
                    ...jsonData.map(row => row[key] ? row[key].toString().length : 0),
                    headerLength
                );
                return { wch: Math.min(maxCellLength + 2, 50) }; // Max 50 caratteri
            });
            worksheet['!cols'] = colWidths;

            // Crea il workbook
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Dati');

            // Genera il file Excel
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });

            // Scarica il file
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            a.download = `Export_Dati_${timestamp}.xlsx`;
            a.click();
            URL.revokeObjectURL(a.href);

            this.showToast('Successo', `Esportati ${this.dataCount} record in Excel`, 'success');
        } catch (error) {
            console.error('Errore durante l\'esportazione:', error);
            this.showToast('Errore', 'Errore durante l\'esportazione: ' + error.message, 'error');
        }
    }

    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(evt);
    }
}
