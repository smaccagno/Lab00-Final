import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAllTableData from '@salesforce/apex/DataExportSorrisoSospesoController.getAllTableData';
import SheetJS from '@salesforce/resourceUrl/SheetJS';
import { loadScript } from 'lightning/platformResourceLoader';

export default class DataExportTableSorrisoSospeso extends LightningElement {
    tableData = [];
    isLoading = true;
    error;
    sheetJSInitialized = false;

    columns = [
        { label: 'Comune', fieldName: 'comune', type: 'text' },
        { label: 'Provincia', fieldName: 'provincia', type: 'text' },
        { label: 'Regione', fieldName: 'regione', type: 'text' },
        { label: 'Tipologia', fieldName: 'tipologia', type: 'text' },
        { label: 'Fornitore', fieldName: 'fornitore', type: 'text' },
        { label: 'Tipologia Spettacolo', fieldName: 'tipologiaSpettacolo', type: 'text' },
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
        loadScript(this, SheetJS)
            .then(() => {
                this.sheetJSInitialized = true;
            })
            .catch((error) => {
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
            const jsonData = this.tableData.map((row) => ({
                'Comune': row.comune || '',
                'Provincia': row.provincia || '',
                'Regione': row.regione || '',
                'Tipologia': row.tipologia || '',
                'Fornitore': row.fornitore || '',
                'Tipologia Spettacolo': row.tipologiaSpettacolo || '',
                'Boolean': row.booleanValue || '',
                'Partner': row.partner || ''
            }));

            const worksheet = XLSX.utils.json_to_sheet(jsonData);

            const keys = Object.keys(jsonData[0] || {});
            const colWidths = keys.map((key) => {
                const headerLength = key.length;
                const maxCellLength = Math.max(
                    ...jsonData.map((row) => (row[key] ? row[key].toString().length : 0)),
                    headerLength
                );
                return { wch: Math.min(maxCellLength + 2, 50) };
            });
            worksheet['!cols'] = colWidths;

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Dati');

            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });

            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            a.download = `Export_Lista_Valori_Sorriso_Sospeso_${timestamp}.xlsx`;
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