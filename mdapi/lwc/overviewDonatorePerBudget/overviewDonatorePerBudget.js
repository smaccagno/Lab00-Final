import { LightningElement, api, wire, track } from 'lwc';
import getAllDataForLWC from '@salesforce/apex/AssegnazioneFattureADonatore.getAllDataForLWC';

export default class AssegnazioneFattureADonatore extends LightningElement {
    @api programId;
    @track error;
    @track isLoading = true;

    fullProgramList = [];
    fullAnnoList = [];
    fullBudgetList = [];
    fullReportingYearList = [];
    fullGTDList = [];
    fullInvoiceList = [];
    fullGiftDesignationList = [];
    budgetIdsFromSelectedDesignation = [];

    selectedProgram = '';
    selectedAnno = '';
    @track selectedGiftDesignation = ''; // aggiungi @track qui

    programOptions = [];
    annoOptions = [];
    budgetOptions = [];

    columnsDonatori = [
        { label: 'Donatore', fieldName: 'donatoreName', type: 'text' },
        { label: 'Somma Distribuita (€)', fieldName: 'sommaDistribuita', type: 'currency' },
        { label: 'Totale Fatturato (€)', fieldName: 'totaleFatturato', type: 'currency' },
        { label: 'Capienza (€)', fieldName: 'capienza', type: 'currency' }
    ];

    donatoriData = [];
    donatoriDataWithUpdate = [];
    originalDonatoriData = [];

    selectedDonatoreId = null;
    selectedSecondaryDonatoreId = null;
    selectedSorgenteName = null;
    selectedDestinatarioName = null;

    fattureData = [];
    selectedFattureAmount = 0;
    selectedFatture = [];
    @track preselectedInvoiceIds = [];
    @api invoiceId;
    @track showProgramWarning = false;

    columnsFatture = [
        { label: 'Codice', fieldName: 'Name', type: 'text' },
        { label: 'Numero Fattura', fieldName: 'Invoice_Number__c', type: 'text' },
        { label: 'Data Fattura', fieldName: 'Date__c', type: 'date' },
        { label: 'Data Competenza', fieldName: 'Data_di_Competenza__c', type: 'date' },
        { label: 'Centro Medico', fieldName: 'Medical_Center__c', type: 'text' },
        { label: 'Ente No Profit', fieldName: 'Non_Profit_Signaling__c', type: 'text' },
        { label: 'Attuale Assegnazione', fieldName: 'Nome_Donatore__c', type: 'text' },
        { label: 'Importo (€)', fieldName: 'Totale_Fattura__c', type: 'currency' }
    ];

    renderedCallback() {
        if (!this.selectedProgram) {
            this.showProgramWarning = true;
        }
        if (this.isLoading || this.initialized) return;
        this.initialized = true;

        if (this.invoiceId) {
            this.initFromInvoice();
        }
    }

    get showDonatoreSorgente() {
        return !this.invoiceId;
    }

    get donatoreDestColClass() {
        return this.showDonatoreSorgente
            ? 'slds-col slds-size_1-of-2 slds-p-left_small'
            : 'slds-col slds-size_1-of-1';
    }

    async initFromInvoice() {
        try {
            this.isLoading = true;

            const result  = await getAllDataForLWC();
            const fattura = result.invoiceList.find(inv => inv.Id === this.invoiceId);

            if (!fattura) { this.error = 'Fattura non trovata'; return; }

            // carica i blob di dati come prima
            this.fullProgramList       = result.programList            || [];
            this.fullAnnoList          = result.annoReportisticaList   || [];
            this.fullBudgetList        = result.budgetList             || [];
            this.fullReportingYearList = result.reportingYearList      || [];
            this.fullGTDList           = result.giftTransactionDesignationList || [];
            this.fullInvoiceList       = result.invoiceList            || [];
            this.fullGiftDesignationList = result.giftDesignationList  || [];

            /* ------------------------------------------------------------------ */
            /*  ⚠  Niente selectedAnno → lasciamo '' così la capienza è complessiva */
            /* ------------------------------------------------------------------ */

            /* Budget (GiftDesignation) ricavato dalla relazione */
            this.selectedGiftDesignation = fattura.Overview_Budget_per_Anno__r
                ? fattura.Overview_Budget_per_Anno__r.Budget__c
                : null;

            /* Programma: confrontiamo i primi 15 caratteri */
            const programma15   = fattura.Programma__c;               // 15 char
            const fullProgram   = this.fullProgramList.find(p => p.Id.startsWith(programma15));
            this.selectedProgram = fullProgram ? fullProgram.Id : null;

            /* Aggiorniamo combo (anche se poi sono nascosti) e dati */
            this.computeBudgetOptions();
            this.computeDonatoriData();      //  ←  qui selectedAnno è vuoto ⇒ aggregato

            /* ------------------ fattura già presente e preselezionata ------------------ */
            this.preselectedInvoiceIds = [this.invoiceId];
            this.fattureData           = [{ ...fattura, id: fattura.Id }];
            this.selectedFatture       = this.fattureData;
            this.selectedFattureAmount = fattura.Totale_Fattura__c || 0;

            /* sorgente: impostato ma la colonna resterà nascosta (showDonatoreSorgente = false) */
            this.selectedDonatoreId  = fattura.Reporting_Year__c;
            this.selectedSorgenteName = fattura.Nome_Donatore__c;

            /* calcola capienza nel donatore destinatario (sarà aggiornata dopo la scelta) */
            this.updateFatturatoConAssegnazioneTemporanea();
        } catch (e) {
            this.error = e.message || JSON.stringify(e);
        } finally {
            this.isLoading = false;
        }
    }


    get notProgramSelected() {
        return !this.selectedProgram;
    }

    @wire(getAllDataForLWC)
    wiredData({ error, data }) {
        if (data) {
            console.log('GTD DEBUG:\n' + data.gtdDebugInfo);
            this.fullProgramList = data.programList || [];
            this.fullAnnoList = data.annoReportisticaList || [];
            this.fullBudgetList = data.budgetList || [];
            this.fullReportingYearList = data.reportingYearList || [];
            this.fullGTDList = data.giftTransactionDesignationList || [];
            this.fullInvoiceList = data.invoiceList || [];
            this.fullGiftDesignationList = data.giftDesignationList || [];
            this.programOptions = this.fullProgramList.map(prog => ({ label: prog.Name, value: prog.Id }));
            if (this.programId) {
              this.selectedProgram = this.programId;
              // 1) Popolo combobox Anno
              this.computeAnnoOptions();
              // 2) Popolo combobox Budget
              this.computeBudgetOptions();
              // 3) Calcolo i dati donatori
              this.computeDonatoriData();
            }
            this.isLoading = false;
        } else if (error) {
            this.error = error;
            this.isLoading = false;
        }
    }

    get hasData() {
        return !this.isLoading && !this.error;
    }

    handleProgramChange(event) {
        this.selectedProgram = event.detail.value;
        this.selectedAnno = '';
        this.selectedGiftDesignation = '';
        this.showProgramWarning = false;
        this.computeAnnoOptions();
        this.computeBudgetOptions();
        this.computeDonatoriData();
    }

    handleAnnoChange(event) {
        if (!this.selectedProgram) {
            this.showProgramWarning = true;
            return;
        }
        this.selectedAnno = event.detail.value;
        this.budgetOptions = []; // forzo reset dropdown
        this.selectedGiftDesignation = '';
        this.budgetIdsFromSelectedDesignation = [];
        this.computeBudgetOptions();
        this.computeDonatoriData();
    }

    handleBudgetChange(event) {
        if (!this.selectedProgram) {
            this.showProgramWarning = true;
            return;
        }
        this.selectedGiftDesignation = event.detail.value;
        this.updateBudgetIdsFromGiftDesignation();
        this.computeDonatoriData();
        if (this.selectedDonatoreId) this.computeFattureData();
    }

    updateBudgetIdsFromGiftDesignation() {
        if (!this.selectedGiftDesignation) {
            this.budgetIdsFromSelectedDesignation = [];
            return;
        }

        const selectedGDId = this.selectedGiftDesignation;

        this.budgetIdsFromSelectedDesignation = this.fullBudgetList
            .filter(b => b.Budget__c === selectedGDId && (!this.selectedAnno || b.Anno__c === this.selectedAnno))
            .map(b => b.Id);
    }

    computeBudgetOptions() {
        const options = this.fullGiftDesignationList.map(gd => ({ label: gd.Name, value: gd.Id }));
        this.budgetOptions = [{ label: 'Tutti i budget', value: '' }, ...options];
        this.updateBudgetIdsFromGiftDesignation();
    }

    computeFattureData() {
        if (!this.selectedDonatoreId) {
            this.fattureData = [];
            return;
        }

        const filtered = this.fullInvoiceList.filter(inv =>
            inv.Reporting_Year__c === this.selectedDonatoreId &&
            (!this.selectedGiftDesignation || this.budgetIdsFromSelectedDesignation.includes(inv.Overview_Budget_per_Anno__c))
        );

        this.fattureData = filtered.map(inv => ({ ...inv, id: inv.Id }));
    }

    handleDonatoreRowSelection(event) {
        const selectedRows = event.detail.selectedRows;
        if (selectedRows.length > 0) {
            const fullId = selectedRows[0].id;
            this.selectedDonatoreId = fullId.split('_')[0];
            this.selectedSorgenteName = selectedRows[0].donatoreName;
            this.computeFattureData();
        } else {
            this.selectedDonatoreId = null;
            this.selectedSorgenteName = null;
            this.fattureData = [];
            this.selectedFattureAmount = 0;
        }
        this.updateFatturatoConAssegnazioneTemporanea();
    }

    handleSecondaryDonatoreRowSelection(event) {
        const selectedRows = event.detail.selectedRows;
        if (selectedRows.length > 0) {
            const fullId = selectedRows[0].id;
            /*  ➜  Se l’id inizia con 'agg_' lo teniamo intero,
                    altrimenti continuiamo a prendere la parte prima di '_'  */
            if (fullId.startsWith('agg_')) {
                this.selectedSecondaryDonatoreId = fullId;          // agg_<Nome>
            } else {
                this.selectedSecondaryDonatoreId = fullId.split('_')[0];
            }

            this.selectedDestinatarioName = selectedRows[0].donatoreName;
        } else {
            this.selectedSecondaryDonatoreId = null;
            this.selectedDestinatarioName   = null;
        }

        this.updateFatturatoConAssegnazioneTemporanea();
    }

    handleFattureSelection(event) {
        const selectedRows = event.detail.selectedRows;
        this.selectedFatture = selectedRows;
        this.selectedFattureAmount = selectedRows.reduce((acc, row) => acc + (row.Totale_Fattura__c || 0), 0);
        this.updateFatturatoConAssegnazioneTemporanea();
    }

    computeAnnoOptions() {
        const options = [...new Set(this.fullAnnoList
            .filter(a => a.Programma__c === this.selectedProgram)
            .map(a => a.Name))]
            .map(name => ({ label: name, value: name }));
        this.annoOptions = [{ label: 'Tutti gli anni', value: '' }, ...options];
    }

    computeDonatoriData() {
        const aggregazioneBase = [];
        const reportingYearMap = new Map(this.fullReportingYearList.map(ry => [ry.Id, ry.Year__c]));

        const holdings = this.fullReportingYearList.filter(ry =>
            !ry.Holding__c && (!this.selectedProgram || ry.Programma__c === this.selectedProgram)
        );

        holdings.forEach(holding => {
            const accountId15 = holding.Account__c?.substring(0, 15);
            const figli = this.fullReportingYearList.filter(ry => ry.Holding__c === accountId15 && ry.Year__c === holding.Year__c);
            const cluster = [holding, ...figli];
            const reportingYearIds = cluster.map(ry => ry.Id);

            const gtdFiltered = this.fullGTDList.filter(gtd => {
                const reportingYearId = gtd.GiftTransaction?.Reporting_Year__c;
                const competenzaYear = gtd.Data_di_Competenza__c ? new Date(gtd.Data_di_Competenza__c).getFullYear().toString() : null;
                const yearMatch = competenzaYear === holding.Year__c && (!this.selectedAnno || competenzaYear === this.selectedAnno);

                return (
                    reportingYearIds.includes(reportingYearId) &&
                    (!this.selectedGiftDesignation || this.budgetIdsFromSelectedDesignation.includes(gtd.Overview_Budget_per_Anno__c)) &&
                    yearMatch
                );
            });

            const sommaDistribuita = gtdFiltered.reduce((acc, cur) => acc + (cur.Amount || 0), 0);

            const invFiltered = this.fullInvoiceList.filter(inv =>
                reportingYearIds.includes(inv.Reporting_Year__c) &&
                (!this.selectedGiftDesignation || this.budgetIdsFromSelectedDesignation.includes(inv.Overview_Budget_per_Anno__c)) &&
                (!this.selectedAnno || inv.Anno_di_Competenza__c === holding.Year__c)
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

        let finalRows;
        if (this.selectedAnno) {
            finalRows = aggregazioneBase.filter(row => row.year === this.selectedAnno);
        } else {
            const grouped = new Map();
            aggregazioneBase.forEach(row => {
                const nomeDonatore = row.donatoreName;
                if (!grouped.has(nomeDonatore)) {
                    grouped.set(nomeDonatore, {
                        id: `agg_${nomeDonatore}`,
                        donatoreName: nomeDonatore,
                        sommaDistribuita: 0,
                        totaleFatturato: 0
                    });
                }
                const agg = grouped.get(nomeDonatore);
                agg.sommaDistribuita += row.sommaDistribuita;
                agg.totaleFatturato += row.totaleFatturato;
            });
            finalRows = [...grouped.values()].map(row => ({
                ...row,
                capienza: row.sommaDistribuita - row.totaleFatturato
            }));
        }

        // ⬇️  Righe non‑vuote (left table)
        const righeNonZero = finalRows.filter(row =>
            row.sommaDistribuita !== 0 || row.totaleFatturato !== 0 || row.capienza !== 0
        );

        // 1)  Per i calcoli di aggiornamento vogliamo TUTTE le righe (anche a zero)
        this.originalDonatoriData = JSON.parse(JSON.stringify(finalRows));

        // 2)  Tabella di sinistra: solo righe non‑vuote
        this.donatoriData = JSON.parse(JSON.stringify(righeNonZero));

        // 3)  Tabella di destra: tutte le righe, comprese quelle a zero
        this.donatoriDataWithUpdate = JSON.parse(JSON.stringify(finalRows));
    }

    updateFatturatoConAssegnazioneTemporanea() {
        const aggiornato = JSON.parse(JSON.stringify(this.originalDonatoriData));
        const delta = this.selectedFattureAmount;

        const sorgente = aggiornato.find(d => d.id.startsWith(this.selectedDonatoreId));
        const destinatario = aggiornato.find(d => d.id.startsWith(this.selectedSecondaryDonatoreId));

        if (sorgente) {
            sorgente.totaleFatturato -= delta;
            sorgente.capienza = sorgente.sommaDistribuita - sorgente.totaleFatturato;
        }

        if (destinatario) {
            destinatario.totaleFatturato += delta;
            destinatario.capienza = destinatario.sommaDistribuita - destinatario.totaleFatturato;
        }

        this.donatoriDataWithUpdate = aggiornato;
    }

    @api get selectedInvoiceIds() {
        return this.selectedFatture.map(row => row.Id);
    }

    @api get sourceReportingYearId() {
        return this.selectedDonatoreId;
    }

    @api
    get targetReportingYearId() {
        // Se non è stata fatta alcuna selezione, restituiamo null
        if (!this.selectedSecondaryDonatoreId) {
            return null;
        }

        /* ------------------------------------------------------------
          Caso standard: id già valido (15 o 18 caratteri Salesforce)
        ------------------------------------------------------------ */
        if (!this.selectedSecondaryDonatoreId.startsWith('agg_')) {
            return this.selectedSecondaryDonatoreId;
        }

        /* ------------------------------------------------------------
          Caso aggregato: id = 'agg_<Nome Donatore>'
          ➜ ricaviamo il Nome e cerchiamo un Reporting_Year__c “holding”
        ------------------------------------------------------------ */
        const donatoreName = this.selectedSecondaryDonatoreId.substring(4); // rimuove 'agg_'

        // Trova il primo record holding con quel nome
        const holding = this.fullReportingYearList.find(
            ry => !ry.Holding__c && ry.Nome_Donatore__c === donatoreName
        );

        // Ritorna l'Id del record se trovato, altrimenti null
        return holding ? holding.Id : null;
    }
}