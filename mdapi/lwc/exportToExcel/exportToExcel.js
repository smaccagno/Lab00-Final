import { api, LightningElement } from 'lwc';
import SheetJS from '@salesforce/resourceUrl/SheetJS';
import { loadScript } from 'lightning/platformResourceLoader';

export default class ExportToExcel extends LightningElement {

    @api jsonData = {};
    @api fileName = Date.now();
    @api buttonLabel = 'Esporta in Excel';
    @api classes = 'slds-m-left_x-small';
    @api variant = 'brand';

    connectedCallback() {
        loadScript(this, SheetJS).then(() => {
            console.log('SheetJS loaded, version:', XLSX.version);
        });
    }

    exportToExcel() {
        const jsonData = [...this.jsonData];

        // crea il foglio a partire dal JSON
        const worksheet = XLSX.utils.json_to_sheet(jsonData);

        // calcolo larghezze colonne (header + valori)
        const keys = Object.keys(jsonData[0] || {});
        const colWidths = keys.map(key => {
            // lunghezza dell’intestazione
            const headerLength = key.length;
            // lunghezza massima dei valori nella colonna
            const maxCellLength = Math.max(
                ...jsonData.map(row => row[key] ? row[key].toString().length : 0),
                headerLength
            );
            return { wch: maxCellLength + 2 }; // +2 per padding
        });

        worksheet['!cols'] = colWidths; // applica larghezze

        // crea il workbook
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, this.fileName);

        // genera il file Excel
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this.fileName}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

}