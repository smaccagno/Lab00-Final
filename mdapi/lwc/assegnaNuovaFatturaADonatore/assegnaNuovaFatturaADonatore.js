import { LightningElement, api, wire, track } from 'lwc';
import getAllDataForLWCWithParams from '@salesforce/apex/AssegnazioneFattureADonatore.getAllDataForLWCWithParams';

export default class AssegnaNuovaFatturaADonatore extends LightningElement {
    @track error;
    @track isLoading = true;

    // Dati completi
    fullReportingYearList = [];
    fullGTDList = [];
    fullInvoiceList = [];

    // Dati visibili
    donatoriData = [];

    // Input da Flow
    @api selectedProgram;
    @api selectedAnno;
    @api selectedBudget;

    // Output per Flow
    selectedDonatoreId = null;
    selectedSorgenteName = null;

    columnsDonatori = [
        { label: 'Donatore', fieldName: 'donatoreName', type: 'text' },
        { label: 'Somma Distribuita (€)', fieldName: 'sommaDistribuita', type: 'currency' },
        { label: 'Totale Fatturato (€)', fieldName: 'totaleFatturato', type: 'currency' },
        { label: 'Capienza (€)', fieldName: 'capienza', type: 'currency' }
    ];

    connectedCallback() {
        console.log('📥 Parametri ricevuti dal Flow:');
        console.log('➡️  Programma:', this.selectedProgram);
        console.log('➡️  Anno:', this.selectedAnno);
        console.log('➡️  Budget:', this.selectedBudget);
    }

    @wire(getAllDataForLWCWithParams, {
        selectedProgram: '$selectedProgram',
        selectedGiftDesignation: '$selectedBudget',
        selectedAnno: '$selectedAnno',
        embeddedMode: false
    })
    wiredData({ error, data }) {
        if (data) {
            try {
                console.log('📦 Risultato APEX getAllDataForLWCWithParams:', JSON.parse(JSON.stringify(data)));
            } catch (e) {
                console.warn('⚠️ Errore nel parsing JSON:', e);
            }
            console.log('📄 Query GTD:', data.gtdQueryString);
            console.log('📄 Query Invoice:', data.invoiceQueryString);
            console.log('📃 GTD ricevuti:', data.giftTransactionDesignationList?.length);
            console.log('📃 Invoices ricevute:', data.invoiceList?.length);
            console.log('📃 ReportingYear ricevuti:', data.reportingYearList?.length);

            this.fullReportingYearList = data.reportingYearList || [];
            this.fullGTDList = data.giftTransactionDesignationList || [];
            this.fullInvoiceList = data.invoiceList || [];
            this.isLoading = false;
            this.computeDonatoriData();
        } else if (error) {
            console.error('❌ Errore nella chiamata Apex:', error);
            this.error = error;
            this.isLoading = false;
        }
    }

    get hasData() {
        return !this.isLoading && !this.error;
    }

    handleDonatoreRowSelection(event) {
        const selectedRows = event.detail.selectedRows;
        if (selectedRows.length > 0) {
            const fullId = selectedRows[0].id;
            this.selectedDonatoreId = fullId.split('_')[0];
            this.selectedSorgenteName = selectedRows[0].donatoreName;
        } else {
            this.selectedDonatoreId = null;
            this.selectedSorgenteName = null;
        }
    }

    computeDonatoriData() {
        const aggregazioneBase = [];

        const holdings = this.fullReportingYearList.filter(ry =>
            !ry.Holding__c &&
            ry.Programma__c?.startsWith(this.selectedProgram)
        );

        console.log('🔍 Holdings trovati:', holdings.length);

        holdings.forEach(holding => {
            const accountId15 = holding.Account__c?.substring(0, 15);
            const figli = this.fullReportingYearList.filter(ry =>
                ry.Holding__c === accountId15 && ry.Year__c === holding.Year__c
            );
            const cluster = [holding, ...figli];
            const reportingYearIds = cluster.map(ry => ry.Id);

            const gtdFiltered = this.fullGTDList.filter(gtd =>
                reportingYearIds.includes(gtd.GiftTransaction?.Reporting_Year__c) &&
                (!this.selectedBudget || gtd.Overview_Budget_per_Anno__c === this.selectedBudget) &&
                (!this.selectedAnno || gtd.Anno_Distribuzione__c === holding.Year__c)
            );
            const sommaDistribuita = gtdFiltered.reduce((acc, cur) => acc + (cur.Amount || 0), 0);

            const invFiltered = this.fullInvoiceList.filter(inv =>
                reportingYearIds.includes(inv.Reporting_Year__c) &&
                (!this.selectedBudget || inv.Overview_Budget_per_Anno__c === this.selectedBudget) &&
                (!this.selectedAnno || inv.Anno_di_Competenza__c === this.selectedAnno)
            );
            const totaleFatturato = invFiltered.reduce((acc, cur) => acc + (cur.Totale_Fattura__c || 0), 0);

            aggregazioneBase.push({
                id: `${holding.Id}_${holding.Year__c}`,
                donatoreName: holding.Nome_Donatore__c,
                year: holding.Year__c,
                sommaDistribuita,
                totaleFatturato,
                capienza: sommaDistribuita - totaleFatturato
            });
        });

        const definitivi = aggregazioneBase
            .filter(row =>
                row.sommaDistribuita !== 0 || row.totaleFatturato !== 0 || row.capienza !== 0
            );

        this.donatoriData = definitivi;
    }

    // Output per Flow
    @api get sourceReportingYearId() {
        return this.selectedDonatoreId;
    }
}