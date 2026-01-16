import { LightningElement, api, wire, track } from "lwc";
import getAllDataForLWCWithParams from "@salesforce/apex/AssegnazioneFattureADonatore.getAllDataForLWCWithParams";
import getEnrolledAccountsOnDate from "@salesforce/apex/AssegnazioneFattureADonatore.getEnrolledAccountsOnDate";
import getInvoicesChunk from "@salesforce/apex/AssegnazioneFattureADonatore.getInvoicesChunk";
import getEnrolledAccountsOnYear from "@salesforce/apex/AssegnazioneFattureADonatore.getEnrolledAccountsOnYear";

/*────────────────────────────────────────────
 *  COSTANTI & UTILITY
 *───────────────────────────────────────────*/
const LB = "\u2028"; // line-break coerente con altri LWC
const NORMAL = "number";
const CURRENCY = "currency";
const normalizeType = (t) => (t ?? "currency").toString().trim().toLowerCase();
/* ─── lookup GTD → Reporting_Year ─── */
const GTD_DONOR_FIELD = "Overview_Donatore_per_Anno__c";
const toNum = (v) => (v == null || v === "" ? 0 : Number(v));
export default class AssegnazioneFattureADonatore extends LightningElement {
  @api programId;
  @api budgetId;
  @track error;
  @track isLoading = true;
  /**  ───────── stati ausiliari per la selezione aggregata ───────── */
  @track isAggregatedSelection = false; // true ⇒ riga “agg_<Donatore>”
  aggregatedDonorName = ""; // Nome Donatore dell’aggregato
  fullProgramList = [];
  fullAnnoList = [];
  fullBudgetList = [];
  fullReportingYearList = [];
  fullGTDList = [];
  fullInvoiceList = [];
  fullGiftDesignationList = [];
  budgetIdsFromSelectedDesignation = [];

  selectedProgram = "";
  selectedAnno = "";
  @track selectedGiftDesignation = ""; // aggiungi @track qui

  programOptions = [];
  annoOptions = [];
  budgetOptions = [];

  /*────────── metadati dinamici ──────────*/
  @track fieldConfig = {}; // <objApi , FieldConf[]>
  @track dynamicSummaryFields = {}; // set per oggetto
  dynamicColsDonatori = []; // cache colonne extra
  @track headerTotals = { sommaDistribuita: 0, totaleFatturato: 0, capienza: 0, dynamic: {} };
  @track enrolledIds = new Set();
  @track rightEligibleAccountIds = new Set();
  // Indice aggregati server-side: key = `${RY}_${Anno}` → somma Totale_Fattura__c
  invoiceTotalsIndex = {};
  // Debug embedded
  debugEmbedded = true; // abilita log diagnostici in modalità embedded
  /*────────── colonne statiche ──────────*/
  staticColumnsDonatori = [
    { label: "Donatore", fieldName: "donatoreName", type: "text" },
    {
      label: "Somma Distribuita",
      fieldName: "sommaDistribuita",
      type: CURRENCY
    },
    { label: "Totale Fatturato", fieldName: "totaleFatturato", type: CURRENCY },
    { label: "Capienza", fieldName: "capienza", type: CURRENCY }
  ];

  /** getter usato dal template – aggiunge dinamiche e totali in header */
  get columnsDonatori() {
    let cols = this.staticColumnsDonatori;
    if (this.embeddedMode) {
      if (!this.dynamicColsDonatori.length) {
        this.dynamicColsDonatori = this.buildDynamicColumns("Invoice__c");
      }
      cols = [...this.staticColumnsDonatori, ...this.dynamicColsDonatori];
    }

    const fmtCur = (v) => this.formatHeaderValue(v, 'currency');
    const totals = this.headerTotals || {};
    const dynTotals = totals.dynamic || {};

    return cols.map((col) => {
      const c = { ...col };
      if (c.fieldName === "sommaDistribuita") {
        c.label = `Somma Distribuita\n${fmtCur(totals.sommaDistribuita || 0)}`;
      } else if (c.fieldName === "totaleFatturato") {
        c.label = `Totale Fatturato\n${fmtCur(totals.totaleFatturato || 0)}`;
      } else if (c.fieldName === "capienza") {
        c.label = `Capienza\n${fmtCur(totals.capienza || 0)}`;
      } else if (this.embeddedMode && dynTotals[c.fieldName] != null) {
        const hdrVal = this.formatHeaderValue(dynTotals[c.fieldName] || 0, c.type);
        c.label = `${col.label}\n${hdrVal}`;
      }
      return c;
    });
  }

  /*──────── getters “puliti” per il @wire ────────*/
  get _wireProgram() {
    /* embedded: usa l’@api programId se selectedProgram è vuoto */
    if (!this.selectedProgram && this.programId) return this.programId;
    return this.selectedProgram || null;
  }
  get _wireGiftDes() {
    if (!this.selectedGiftDesignation && this.budgetId) return this.budgetId;
    return this.selectedGiftDesignation || null;
  }
  get _wireAnno() {
    return this.selectedAnno || null;
  }

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
  invoiceOffset = 0;
  invoicePageSize = 50;
  hasMoreInvoices = false;
  isLoadingMoreInvoices = false;
  invoicePaginationCursor = null;

  @api embeddedMode = false; // default è false (modalità interattiva)

  /* ─── aggiungi subito dopo le altre proprietà @track ─── */
  @track errorObj; // l’oggetto grezzo restituito dal wire

  get errorMessage() {
    // Mostra prima l'eventuale stringa di errore esplicita
    if (this.error) {
      if (typeof this.error === 'string') return this.error;
      try { return JSON.stringify(this.error); } catch (e) { return String(this.error); }
    }
    if (!this.errorObj) return "";
    if (this.errorObj.body && this.errorObj.body.message)
      return this.errorObj.body.message;
    if (this.errorObj.message) return this.errorObj.message;
    try { return JSON.stringify(this.errorObj); } catch (e) { return String(this.errorObj); }
  }

  @api
  set anno(value) {
    this.selectedAnno = value;
    if (this.selectedProgram) {
      this.computeBudgetOptions();
      // Aggiorna enrollment per anno e poi ricalcola
      this.refreshEnrolledIdsForCurrentFilters()
        .then(() => this.computeDonatoriData())
        .catch(() => this.computeDonatoriData());
    }
  }

  get anno() {
    return this.selectedAnno;
  }

  /**  key-field esatto delle due righe selezionate nelle tabelle DONATORI  */
  selectedDonorRowKey = null; // es.: '0015z00000abcdeAAA_2024'  oppure  'agg_Mario Rossi'
  selectedDestRowKey = null;

  // Colonne base fatture: senza "Centro Medico" e "Ente No Profit" (dinamiche se configurate)
  get columnsFatture() {
    const base = [
      { label: "Codice", fieldName: "Name", type: "text" },
      { label: "Numero Fattura", fieldName: "Invoice_Number__c", type: "text" },
      { label: "Data Fattura", fieldName: "Date__c", type: "date" },
      {
        label: "Data Competenza",
        fieldName: "Data_di_Competenza__c",
        type: "date"
      },
      {
        label: "Attuale Assegnazione",
        fieldName: "Nome_Donatore__c",
        type: "text"
      },
      { label: "Importo (€)", fieldName: "Totale_Fattura__c", type: "currency" }
    ];

    // Aggiungi eventuali colonne dinamiche per Invoice__c se presenti in configurazione Programma
    const dyn = this.buildDynamicInvoiceColumns();
    if (!dyn.length) return base;

    // Evita duplicati rispetto alle colonne base
    const baseFields = new Set(base.map((c) => c.fieldName));
    const extra = dyn.filter((c) => !baseFields.has(c.fieldName));
    return [...base, ...extra];
  }

  // Costruisce le colonne dinamiche per Invoice__c (mostra anche non-summary)
  buildDynamicInvoiceColumns() {
    const cfgArr = this.fieldConfig?.Invoice__c || [];
    if (!cfgArr.length) return [];
    const mapType = (t) => {
      const tt = normalizeType(t);
      if (tt === "currency") return "currency";
      if (tt === "number") return "number";
      if (tt === "date" || tt === "datetime") return "date";
      return "text";
    };
    return cfgArr
      .map((c) => ({
        label: c.label,
        fieldName: c.fieldApi,
        type: mapType(c.dataType),
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      }));
  }

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

  // Altezza contenitore tabella fatture: minimale se invoiceId presente
  get invoiceTableContainerStyle() {
    return this.invoiceId ? 'height: 120px;' : 'height: 300px;';
  }

  get showDonatoreDestinatario() {
    return !this.embeddedMode;
  }

  get showFilters() {
    return !this.embeddedMode;
  }

  get showInvoicesSection() {
    return !this.embeddedMode;
  }

  get showDonatoreSorgente() {
    return !this.invoiceId;
  }

  get showInvoiceSelectionLabel() {
    if (this.invoiceId) return false;
    if (!this.selectedDonatoreId) return false;
    return !!this.selectedDestinatarioName;
  }

  get targetDonorName() {
    if (this.invoiceId) {
      return this.selectedSorgenteName;
    }
    return this.selectedDestinatarioName || "";
  }

  get donatoreDestColClass() {
    return this.showDonatoreSorgente
      ? "slds-col slds-size_1-of-2 slds-p-left_small"
      : "slds-col slds-size_1-of-1";
  }

  get maxRowSelection() {
    return this.embeddedMode ? 0 : 1;
  }

  async initFromInvoice() {
    try {
      this.isLoading = true;
      // eslint-disable-next-line no-console
      console.log('[initFromInvoice] start', { invoiceId: this.invoiceId, programId: this.programId });

      // Passa il Programma se disponibile, così Apex include i campi dinamici Invoice__c
      const result = await getAllDataForLWCWithParams({
        selectedProgram: this.programId || null,
        selectedGiftDesignation: null,
        selectedAnno: null
      });
      // eslint-disable-next-line no-console
      console.log('[initFromInvoice] wrapper received', {
        programList: (result.programList || []).length,
        annoList: (result.annoReportisticaList || []).length,
        budgetList: (result.budgetList || []).length,
        reportingYearList: (result.reportingYearList || []).length,
        invoiceList: (result.invoiceList || []).length
      });
      const fattura = result.invoiceList.find(
        (inv) => inv.Id === this.invoiceId
      );

      if (!fattura) {
        this.error = "Fattura non trovata";
        return;
      }

      // carica i blob di dati come prima
      this.fullProgramList = result.programList || [];
      this.fullAnnoList = result.annoReportisticaList || [];
      this.fullBudgetList = result.budgetList || [];
      this.fullBudgetList = this.fullBudgetList.filter(
        (b) =>
          this.enrolledIds.size === 0 ||
          this.enrolledIds.has((b.Budget__r?.Partner__c || "").substring(0, 15))
      );
      this.fullReportingYearList = result.reportingYearList || [];
      this.fullGTDList = result.giftTransactionDesignationList || [];
      this.fullInvoiceList = result.invoiceList || [];
      this.fullGiftDesignationList = result.giftDesignationList || [];

      /* ------------------------------------------------------------------ */
      /*  ⚠  Niente selectedAnno → lasciamo '' così la capienza è complessiva */
      /* ------------------------------------------------------------------ */

      /* Budget (GiftDesignation) ricavato dalla relazione */
      this.selectedGiftDesignation = fattura.Overview_Budget_per_Anno__r
        ? fattura.Overview_Budget_per_Anno__r.Budget__c
        : null;

      if (this.programId) {
        // ► caso standard del tuo flow di creazione Fattura
        this.selectedProgram = this.programId; // già 18 char
        console.log(
          "[DBG] selectedProgram da @api programId =",
          this.selectedProgram
        );
      } else {
        // ► fallback legacy (rare: componente usato in altri contesti)
        const programma15 = (fattura.Programma__c || "").substring(0, 15);
        const fullProgram = this.fullProgramList.find((p) =>
          p.Id.startsWith(programma15)
        );
        this.selectedProgram = fullProgram ? fullProgram.Id : null;
        console.log(
          "[DBG] selectedProgram da fattura      =",
          this.selectedProgram
        );
      }
      /* Aggiorniamo combo (anche se poi sono nascosti) */
      this.computeBudgetOptions();

      /* ► Filtro aggiuntivo: Donatori con enrollment attivo alla data di competenza */
      const compDate = fattura.Data_di_Competenza__c || fattura.Date__c;
      if (this.selectedProgram && compDate) {
        try {
          const accs = await getEnrolledAccountsOnDate({
            programId: this.selectedProgram,
            competenceDate: compDate
          });
          const set = new Set();
          (accs || []).forEach((id) => {
            set.add(id);
            set.add((id || "").substring(0, 15));
          });
          this.enrolledIds = set;
          // In modalità "Tutti gli anni" (nessun anno selezionato) non restringere i destinatari
          this.rightEligibleAccountIds = new Set();
          console.log("📌 Enrolled on invoice date (15):", [...this.enrolledIds]);
        } catch (e) {
          // in caso d'errore, lascia la logica base
          // eslint-disable-next-line no-console
          console.error("getEnrolledAccountsOnDate error:", e);
        }
      }

      // Ora calcola i dati con il nuovo filtro enrollment
      this.computeDonatoriData();

      /* ------------------ fattura già presente e preselezionata ------------------ */
      this.preselectedInvoiceIds = [this.invoiceId];
      this.fattureData = [{ ...fattura, id: fattura.Id }];
      this.selectedFatture = this.fattureData;
      this.selectedFattureAmount = fattura.Totale_Fattura__c || 0;
      this.hasMoreInvoices = false; // disabilita infinite loading
      this.isLoadingMoreInvoices = false;

      /* sorgente: impostato ma la colonna resterà nascosta (showDonatoreSorgente = false) */
      this.selectedDonatoreId = fattura.Reporting_Year__c;
      this.selectedSorgenteName = fattura.Nome_Donatore__c;

      /* calcola capienza nel donatore destinatario (sarà aggiornata dopo la scelta) */
      this.updateFatturatoConAssegnazioneTemporanea();
    } catch (e) {
      this.errorObj = e;
      this.error = (e && e.body && e.body.message) || e.message || (()=>{ try {return JSON.stringify(e);} catch(_) {return String(e);} })();
      // eslint-disable-next-line no-console
      console.error('[initFromInvoice] Errore:', this.error, e);
    } finally {
      this.isLoading = false;
    }
  }

  get notProgramSelected() {
    return !this.selectedProgram;
  }

  /** Classe colonna sorgente: metà o piena larghezza a seconda di quella dest */
  get donatoreSrcColClass() {
    return this.showDonatoreDestinatario
      ? "slds-col slds-size_1-of-2 slds-p-right_small"
      : "slds-col slds-size_1-of-1";
  }

  @wire(
    getAllDataForLWCWithParams /* si ri-invocherà ogni volta             */,
    {
      selectedProgram: "$_wireProgram",
      selectedGiftDesignation: "$_wireGiftDes",
      selectedAnno: "$_wireAnno"
    }
  )
  wiredData({ error, data }) {
    if (data) {
      /* MOD-LOG #1  ─────────────────────────────────────────────── */
      console.groupCollapsed("LOG#1  ▶︎ wiredData – payload Apex");
      console.log("programList          =", (data.programList || []).length);
      console.log(
        "annoReportisticaList =",
        (data.annoReportisticaList || []).length
      );
      console.log(
        "reportingYearList    =",
        (data.reportingYearList || []).length
      );
      console.log("enrolledAccountIds   =", data.enrolledAccountIds);
      console.groupEnd();
      console.log("GTD DEBUG:\n" + data.gtdDebugInfo);

      const set = new Set();
      (data.enrolledAccountIds || []).forEach((id) => {
        set.add(id);
        set.add(id.substring(0, 15));
      });
      this.enrolledIds = set;
      // Non filtrare la tabella destinatari fino a quando non viene scelto un anno specifico
      this.rightEligibleAccountIds = new Set();
      console.log("📌 Enrolled AccountId (15):", [...this.enrolledIds]);

      this.fullProgramList = data.programList || [];
      this.fullAnnoList = data.annoReportisticaList || [];
      this.fullBudgetList = data.budgetList || [];
      this.fullReportingYearList = data.reportingYearList || [];
      this.fullGTDList = data.giftTransactionDesignationList || [];
      this.fullInvoiceList = data.invoiceList || [];
      this.invoiceTotalsIndex = data.invoiceTotalsByRyYear || {};
      // Inizializza paging fatture
      this.invoicePageSize = 50;
      this.invoiceOffset = this.fullInvoiceList.length;
      this.hasMoreInvoices = this.fullInvoiceList.length >= this.invoicePageSize;
      this.updateInvoicePaginationCursorFromList(this.fullInvoiceList);
      this.fullGiftDesignationList = data.giftDesignationList || [];
      this.programOptions = this.fullProgramList.map((prog) => ({
        label: prog.Name,
        value: prog.Id
      }));
      console.log("🟢 invoiceList size =", this.fullInvoiceList.length);
      if (this.fullInvoiceList.length) {
        console.log("🟢 invoice sample =", this.fullInvoiceList[0]);
      }
      // Debug: Log Reporting_Year__c distribution in fullInvoiceList
      const ryDistribution = {};
      this.fullInvoiceList.forEach(inv => {
        const ryId = inv.Reporting_Year__c;
        if (ryId) {
          ryDistribution[ryId] = (ryDistribution[ryId] || 0) + 1;
        }
      });
      console.log("[AFD-DEBUG] Reporting_Year__c distribution in fullInvoiceList:", ryDistribution);
      console.log("[AFD-DEBUG] Total unique Reporting_Year__c values:", Object.keys(ryDistribution).length);
      // Log sample invoices with their Reporting_Year__c
      const sampleSize = Math.min(10, this.fullInvoiceList.length);
      for (let i = 0; i < sampleSize; i++) {
        const inv = this.fullInvoiceList[i];
        console.log(`[AFD-DEBUG] fullInvoiceList[${i}]: Id=${inv.Id}, Reporting_Year__c=${inv.Reporting_Year__c}, Nome_Donatore__c=${inv.Nome_Donatore__c}, Date__c=${inv.Date__c}`);
      }
      /*── fieldConfig dinamico ──*/
      this.fieldConfig = data.fieldConfig || {};
      console.log(
        "🟣 CFG Invoice__c =",
        (this.fieldConfig.Invoice__c || []).map((c) => c.fieldApi)
      );
      Object.keys(this.fieldConfig).forEach((obj) => {
        this.dynamicSummaryFields[obj] = new Set(
          this.fieldConfig[obj]
            .filter((f) => f.isSummary)
            .map((f) => f.fieldApi)
        );
      });

      if (this.embeddedMode) {
        /* ► Programma (come prima) */
        if (this.programId) {
          this.selectedProgram = this.programId;
        }

        /* ► Budget: il padre ci passa l’Id dell’OB; va convertito in GD */
        if (this.budgetId) {
          // ← Id di Overview_Budget_per_Anno__c
          const ob = this.fullBudgetList.find((b) => b.Id === this.budgetId);
          this.selectedGiftDesignation = ob ? ob.Budget__c : ""; // ← Id di GiftDesignation
        } else {
          this.selectedGiftDesignation = "";
        }
      }

      // in entrambi i casi, embedded o standalone, prepariamo i dati base
      this.computeAnnoOptions();
      this.computeBudgetOptions();
      this.updateBudgetIdsFromGiftDesignation();
      if (this.embeddedMode || this.selectedProgram) {
        this.computeDonatoriData();
        this.isLoading = false; // spinner OFF
      } else {
        // assicuro comunque lo svuotamento
        this.donatoriData = this.donatoriDataWithUpdate = [];
      }

      this.isLoading = false;
    } else if (error) {
      // ↳ salva l'oggetto completo e stampa comunque la stringa
      this.errorObj = error;
      const msg =
        error.body && error.body.message
          ? error.body.message
          : JSON.stringify(error);
      console.error("Apex wire error →", msg, error); // vedi sia testo che raw
      this.error = msg;
      this.isLoading = false;
    }
  }

  get hasData() {
    return !this.isLoading && !this.error;
  }

  get hasFatture() {
    return Array.isArray(this.fattureData) && this.fattureData.length > 0;
  }

  /*────────────────────────────────────────────
+ * ► buildDynamicColumns – replica logica Program Overview
+ *───────────────────────────────────────────*/
  buildDynamicColumns(objectApi) {
    const cfgArr = this.fieldConfig[objectApi] || [];
    if (!cfgArr.length) return [];

    return cfgArr
      .filter((c) => c.isSummary) // solo campi summary
      .map((c) => {
        const t = normalizeType(c.dataType);
        const type =
          t === NORMAL ? "number" : t === CURRENCY ? "currency" : "text";
        return {
          label: c.label,
          fieldName: c.fieldApi,
          type,
          fixedWidth: 130,
          hideDefaultActions: true,
          cellAttributes: { alignment: "left" }
        };
      });
  }

  // Formattazione header coerente con Program Overview
  formatHeaderValue(value, type) {
    try {
      const n = Number(value || 0);
      if (type === 'currency') {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
      }
      if (type === 'number') {
        return new Intl.NumberFormat('it-IT').format(n);
      }
      return String(value ?? '');
    } catch (e) {
      return String(value ?? '');
    }
  }

  handleProgramChange(event) {
    this.isLoading = true;
    this.selectedProgram = event.detail.value;
    this.selectedAnno = "";
    this.selectedGiftDesignation = "";
    this.showProgramWarning = false;
    this.donatoriData = [];
    this.donatoriDataWithUpdate = [];
    this.fattureData = [];
    this.computeAnnoOptions();
    this.computeBudgetOptions();
    this.recomputeHeaderTotals();
  }

  handleAnnoChange(event) {
    if (!this.selectedProgram) {
      this.showProgramWarning = true;
      return;
    }
    this.selectedAnno = event.detail.value;
    this.budgetOptions = []; // forzo reset dropdown
    this.selectedGiftDesignation = "";
    this.budgetIdsFromSelectedDesignation = [];
    this.computeBudgetOptions();
    // Aggiorna l'elenco di AccountId con enrollment valido per l'anno
    this.refreshEnrolledIdsForCurrentFilters()
      .then(() => this.computeDonatoriData())
      .catch(() => this.computeDonatoriData());
    this.recomputeHeaderTotals();
  }

  handleBudgetChange(event) {
    if (!this.selectedProgram) {
      this.showProgramWarning = true;
      return;
    }
    this.selectedGiftDesignation = event.detail.value;
    this.updateBudgetIdsFromGiftDesignation();
    // Se è selezionato un anno, assicura che l'enrollment sia aggiornato
    const p = this.selectedAnno
      ? this.refreshEnrolledIdsForCurrentFilters()
      : Promise.resolve();
    p.then(() => this.computeDonatoriData()).catch(() => this.computeDonatoriData());
    if (this.selectedDonatoreId) {
      this.computeFattureData().catch(err => {
        console.error('[computeDonatoriData] Errore in computeFattureData:', err);
      });
    }
    this.recomputeHeaderTotals();
  }

  // Aggiorna this.enrolledIds in base a Programma e Anno selezionati
  async refreshEnrolledIdsForCurrentFilters() {
    try {
      if (!this.selectedProgram) return;
      if (!this.selectedAnno) {
        // Tutti gli anni → mostra tutti i donatori (nessun filtro PE a destra)
        this.rightEligibleAccountIds = new Set();
        return;
      }
      const accs = await getEnrolledAccountsOnYear({
        programId: this.selectedProgram,
        year: this.selectedAnno
      });
      const set = new Set();
      (accs || []).forEach((id) => {
        set.add(id);
        set.add((id || "").substring(0, 15));
      });
      this.rightEligibleAccountIds = set;
      // eslint-disable-next-line no-console
      console.log("📌 Eligible destinatari on selected year (15):", [...this.rightEligibleAccountIds]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("getEnrolledAccountsOnYear error:", e);
    }
  }

  updateBudgetIdsFromGiftDesignation() {
    /* se la GD corrente non è tra le opzioni mostrate ⇒ reset */
    const validGdIds = new Set(this.budgetOptions.map((o) => o.value));
    if (
      this.selectedGiftDesignation &&
      !validGdIds.has(this.selectedGiftDesignation)
    ) {
      this.selectedGiftDesignation = "";
    }

    /* calcola gli OB per la GD (rispettando Programma + Anno) */
    this.budgetIdsFromSelectedDesignation = this.fullBudgetList
      .filter(
        (ob) =>
          (!this.selectedProgram || ob.Programma__c === this.selectedProgram) &&
          (!this.selectedAnno || ob.Anno__c === this.selectedAnno) &&
          (!this.selectedGiftDesignation ||
            ob.Budget__c === this.selectedGiftDesignation)
      )
      .map((ob) => ob.Id);
  }

  computeBudgetOptions() {
    /* ① filtra le Overview_Budget_per_Anno (“OB”) legate al Programma selezionato */
    const allowedObIds = new Set(
      this.fullBudgetList
        .filter(
          (
            ob // OB = Overview_Budget_per_Anno__c
          ) =>
            (!this.selectedProgram ||
              ob.Programma__c === this.selectedProgram) &&
            (!this.selectedAnno || ob.Anno__c === this.selectedAnno)
        )
        .map((ob) => ob.Budget__c) // Budget__c ⇒ Id della Gift Designation padre
    );

    /* ② tieni solo i GiftDesignation collegati alle OB filtrate */
    const options = this.fullGiftDesignationList
      .filter((gd) => allowedObIds.has(gd.Id))
      .map((gd) => ({ label: gd.Name, value: gd.Id }))
      .sort((a, b) => a.label.localeCompare(b.label));

    /* ③ “Tutti i budget” + opzioni filtrate */
    this.budgetOptions = [{ label: "Tutti i budget", value: "" }, ...options];

    /* ④ ricalcola la lista di OB valide per la GD selezionata */
    this.updateBudgetIdsFromGiftDesignation();
  }

  /**
   * Carica le fatture per un Reporting Year specifico se non sono già presenti in fullInvoiceList.
   * Ritorna una Promise che si risolve quando le fatture sono state caricate.
   */
  async loadInvoicesForReportingYear(reportingYearId) {
    // Inizializza il set di Reporting Year già caricati completamente se non esiste
    if (!this.fullyLoadedReportingYears) {
      this.fullyLoadedReportingYears = new Set();
    }
    
    // Se abbiamo già caricato completamente questo Reporting Year, non ricaricare
    if (this.fullyLoadedReportingYears.has(reportingYearId)) {
      console.log(`[loadInvoicesForRY] Reporting Year ${reportingYearId} già caricato completamente`);
      return;
    }
    
    // Verifica se abbiamo già fatture per questo Reporting Year
    const existingInvoices = this.fullInvoiceList.filter(
      inv => inv.Reporting_Year__c === reportingYearId
    );
    
    // Se abbiamo già molte fatture (più di 20), probabilmente sono già state caricate tutte
    // In questo caso, segna come caricato completamente
    if (existingInvoices.length > 20) {
      console.log(`[loadInvoicesForRY] Già presenti ${existingInvoices.length} fatture per RY ${reportingYearId}, considerato già caricato`);
      this.fullyLoadedReportingYears.add(reportingYearId);
      return;
    }
    
    console.log(`[loadInvoicesForRY] Caricamento fatture per Reporting Year ${reportingYearId}`);
    
    // Carica le fatture per questo Reporting Year specifico
    let hasMore = true;
    let lastInvoiceDate = null;
    let lastCreatedDate = null;
    let lastInvoiceId = null;
    const loadedInvoices = [];
    
    while (hasMore) {
      try {
        const chunk = await getInvoicesChunk({
          selectedProgram: this.selectedProgram || null,
          selectedGiftDesignation: this.selectedGiftDesignation || null,
          selectedAnno: this.selectedAnno || null,
          limitSize: 200, // Carica più fatture per volta quando filtriamo per RY
          offsetSize: 0, // Non usato con keyset pagination
          lastInvoiceDate: lastInvoiceDate,
          lastCreatedDate: lastCreatedDate,
          lastInvoiceId: lastInvoiceId,
          reportingYearId: reportingYearId
        });
        
        if (chunk && chunk.length > 0) {
          // Aggiungi solo le fatture che non sono già presenti
          const newInvoices = chunk.filter(
            inv => !this.fullInvoiceList.some(existing => existing.Id === inv.Id)
          );
          loadedInvoices.push(...newInvoices);
          
          // Aggiorna il cursore per la prossima pagina
          const lastInv = chunk[chunk.length - 1];
          lastInvoiceDate = lastInv.Date__c;
          lastCreatedDate = lastInv.CreatedDate;
          lastInvoiceId = lastInv.Id;
          
          hasMore = chunk.length === 200; // Continua se abbiamo caricato un chunk completo
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error('[loadInvoicesForRY] Errore nel caricamento:', error);
        hasMore = false;
      }
    }
    
    // Aggiungi le fatture caricate a fullInvoiceList con deduplicazione robusta
    if (loadedInvoices.length > 0) {
      const beforeCount = this.fullInvoiceList.length;
      const beforeIds = new Set(this.fullInvoiceList.map(inv => inv.Id));
      
      // Filtra solo le fatture che non sono già presenti (controllo finale prima di aggiungere)
      const trulyNewInvoices = loadedInvoices.filter(
        inv => !beforeIds.has(inv.Id)
      );
      
      if (trulyNewInvoices.length > 0) {
        // Aggiungi solo le fatture veramente nuove
        this.fullInvoiceList = [...this.fullInvoiceList, ...trulyNewInvoices];
        
        // Deduplicazione finale per sicurezza (rimuove eventuali duplicati esistenti)
        const seenIds = new Set();
        this.fullInvoiceList = this.fullInvoiceList.filter(inv => {
          if (seenIds.has(inv.Id)) {
            return false;
          }
          seenIds.add(inv.Id);
          return true;
        });
        
        console.log(`[loadInvoicesForRY] Caricate ${trulyNewInvoices.length} nuove fatture per RY ${reportingYearId} (${loadedInvoices.length - trulyNewInvoices.length} duplicate filtrate)`);
        
        // Se abbiamo caricato meno di 200 fatture, significa che abbiamo raggiunto la fine
        // Segna questo Reporting Year come caricato completamente
        if (loadedInvoices.length < 200) {
          this.fullyLoadedReportingYears.add(reportingYearId);
          console.log(`[loadInvoicesForRY] Reporting Year ${reportingYearId} caricato completamente (${trulyNewInvoices.length} fatture totali)`);
        }
      } else {
        console.log(`[loadInvoicesForRY] Tutte le ${loadedInvoices.length} fatture erano già presenti per RY ${reportingYearId}`);
        // Se non abbiamo caricato nuove fatture ma ne avevamo già molte, segna come caricato completamente
        if (existingInvoices.length > 20) {
          this.fullyLoadedReportingYears.add(reportingYearId);
        }
      }
    } else {
      // Se non ci sono fatture da caricare, segna come caricato completamente
      this.fullyLoadedReportingYears.add(reportingYearId);
      console.log(`[loadInvoicesForRY] Nessuna fattura trovata per RY ${reportingYearId}, segnato come caricato completamente`);
    }
  }

  async computeFattureData() {
    // Costruisci il set di OB consentiti in base ai filtri correnti
    let obList = this.fullBudgetList.filter(
      (ob) =>
        (!this.selectedProgram || ob.Programma__c === this.selectedProgram) &&
        (!this.selectedAnno || ob.Anno__c === this.selectedAnno)
    );
    if (this.selectedGiftDesignation) {
      obList = obList.filter((ob) => ob.Budget__c === this.selectedGiftDesignation);
    }
    const allowedBudgetIds = new Set(obList.map((b) => b.Id));
    console.log(
      "[CFD] computeFattureData called:",
      "selectedDonorRowKey=",
      this.selectedDonorRowKey,
      "selectedDonatoreId=",
      this.selectedDonatoreId,
      "isAggregatedSelection=",
      this.isAggregatedSelection
    );
    /* ─── 1)  selezione aggregata (id = 'agg_<Donatore>') ─── */
    if (this.selectedDonorRowKey && this.isAggregatedSelection) {
      console.log("[CFD] Branch: AGGREGATA per", this.aggregatedDonorName);
      console.log("[CFD] selectedDonorRowKey:", this.selectedDonorRowKey);
      console.log("[CFD] selectedAnno:", this.selectedAnno);
      const donorName = this.selectedSorgenteName; // già salvato nell'handler
      console.log("[CFD] Cercando Reporting Year per donatore:", donorName);
      
      // Per "NON ASSEGNATO", cerca direttamente i Reporting Year con quel nome
      // invece di usare la logica delle holdings
      const allRyIds = [];
      
      if (donorName === "NON ASSEGNATO") {
        // Cerca direttamente i Reporting Year con nome "NON ASSEGNATO"
        const nonAssegnatoRys = this.fullReportingYearList.filter(
          (ry) => {
            const matchName = ry.Nome_Donatore__c === "NON ASSEGNATO";
            const matchProgram = !this.selectedProgram || ry.Programma__c === this.selectedProgram;
            const matchAnno = !this.selectedAnno || ry.Year__c === this.selectedAnno;
            return matchName && matchProgram && matchAnno;
          }
        );
        
        console.log("[CFD] Trovati Reporting Year per NON ASSEGNATO:", nonAssegnatoRys.length, nonAssegnatoRys.map(ry => ({ id: ry.Id, name: ry.Nome_Donatore__c, year: ry.Year__c, program: ry.Programma__c })));
        
        nonAssegnatoRys.forEach((ry) => {
          console.log("[CFD-DEBUG] Aggiungendo RY ID NON ASSEGNATO a allRyIds:", ry.Id);
          allRyIds.push(ry.Id);
        });
      } else {
        // Per altri donatori, usa la logica delle holdings
      const holdings = this.fullReportingYearList.filter(
          (ry) => {
            const matchHolding = !ry.Holding__c;
            const matchName = ry.Nome_Donatore__c === donorName;
            const matchProgram = !this.selectedProgram || ry.Programma__c === this.selectedProgram;
            const matchAnno = !this.selectedAnno || ry.Year__c === this.selectedAnno;
            
            return matchHolding && matchName && matchProgram && matchAnno;
          }
        );
        console.log("[CFD] Holdings trovate:", holdings.length, holdings.map(h => ({ id: h.Id, name: h.Nome_Donatore__c, year: h.Year__c, program: h.Programma__c })));
        
      holdings.forEach((h) => {
        const acc15 = h.Account__c?.substring(0, 15);
          const hId15 = h.Id?.substring(0, 15);
          console.log("[CFD-DEBUG] Holding trovata:", { id: h.Id, name: h.Nome_Donatore__c, account: h.Account__c, acc15: acc15, hId15: hId15, year: h.Year__c });
          
          // Cerca Reporting Year che corrispondono alla holding
          const matchingRys = this.fullReportingYearList.filter(
            (ry) =>
              ry.Id === h.Id ||
              (ry.Holding__c === acc15 &&
                (!this.selectedAnno || ry.Year__c === h.Year__c)) ||
              (ry.Holding__c === hId15 &&
                (!this.selectedAnno || ry.Year__c === h.Year__c))
          );
          
          console.log("[CFD] Per holding", h.Id, "trovati", matchingRys.length, "Reporting Year");
          console.log("[CFD-DEBUG] Matching RY IDs:", matchingRys.map(ry => ({ 
            id: ry.Id, 
            name: ry.Nome_Donatore__c, 
            year: ry.Year__c, 
            holding: ry.Holding__c,
            matchType: ry.Id === h.Id ? 'ID_MATCH' : (ry.Holding__c === acc15 ? 'HOLDING_ACC15_MATCH' : 'HOLDING_ID15_MATCH')
          })));
          
          // Cerca anche Reporting Year che hanno Holding__c uguale all'ID completo della holding
          const additionalRys = this.fullReportingYearList.filter(
            (ry) =>
              ry.Holding__c === h.Id &&
              !matchingRys.some(mr => mr.Id === ry.Id) &&
              (!this.selectedAnno || ry.Year__c === h.Year__c)
          );
          
          if (additionalRys.length > 0) {
            console.log("[CFD-DEBUG] Trovati", additionalRys.length, "Reporting Year aggiuntivi con Holding__c =", h.Id);
            console.log("[CFD-DEBUG] Additional RY IDs:", additionalRys.map(ry => ({ id: ry.Id, name: ry.Nome_Donatore__c, year: ry.Year__c, holding: ry.Holding__c })));
            matchingRys.push(...additionalRys);
          }
          
          matchingRys.forEach((ry) => {
            console.log("[CFD-DEBUG] Aggiungendo RY ID a allRyIds:", ry.Id);
            allRyIds.push(ry.Id);
          });
        });
      }
      console.log("[CFD] allRyIds totale:", allRyIds.length, allRyIds);
      console.log("[CFD-DEBUG] allRyIds[0] (primo ID cercato):", allRyIds[0], "tipo:", typeof allRyIds[0]);
      
      // Carica le fatture per i Reporting Year trovati se non sono già presenti
      if (allRyIds.length > 0) {
        console.log("[CFD] Caricamento fatture per Reporting Year:", allRyIds);
        
        for (const ryId of allRyIds) {
          await this.loadInvoicesForReportingYear(ryId);
        }
      }

      const list = this.fullInvoiceList.filter(
        (inv) => {
          const matchRY = allRyIds.includes(inv.Reporting_Year__c);
          const matchGiftDesignation = !this.selectedGiftDesignation ||
            this.budgetIdsFromSelectedDesignation.includes(
              inv.Overview_Budget_per_Anno__c
            );
          const matchAnno = !this.selectedAnno ||
            inv.Anno_di_Competenza__c === this.selectedAnno;
          
          return matchRY && matchGiftDesignation && matchAnno;
        }
      );
      console.log(
        "[CFD] Invoices trovate (agg):",
        list.length,
        list.map((i) => i.Id)
      );
      
      // Rimuovi duplicati dalla lista finale usando Set
      const seenIds = new Set();
      const deduplicatedList = list.filter(inv => {
        if (seenIds.has(inv.Id)) {
          return false;
        }
        seenIds.add(inv.Id);
        return true;
      });
      
      this.fattureData = deduplicatedList.map((inv) => ({ ...inv, id: inv.Id }));
      return;
    }

    /* ─── 2)  selezione puntuale (id = 'a1B3…_2024') ─── */
    if (!this.selectedDonatoreId) {
      // Nessun donatore selezionato: mostra tutte le fatture coerenti con i filtri Programma/Budget/Anno
      const list = this.fullInvoiceList.filter(
        (inv) =>
          (allowedBudgetIds.size === 0 ||
            allowedBudgetIds.has(inv.Overview_Budget_per_Anno__c)) &&
          (!this.selectedAnno || inv.Anno_di_Competenza__c === this.selectedAnno)
      );
      console.log("[CFD] Nessun donatore selezionato → fatture filtrate:", list.map((i) => i.Id));
      this.fattureData = list.map((inv) => ({ ...inv, id: inv.Id }));
      return;
    }
    console.log(
      "[CFD] Branch: PUNTUALE per Reporting_Year__c =",
      this.selectedDonatoreId
    );
    
    // Carica le fatture per questo Reporting Year se non sono già presenti
    await this.loadInvoicesForReportingYear(this.selectedDonatoreId);
    
    const list = this.fullInvoiceList.filter(
      (inv) =>
        inv.Reporting_Year__c === this.selectedDonatoreId &&
        allowedBudgetIds.has(inv.Overview_Budget_per_Anno__c) &&
        (!this.selectedGiftDesignation ||
          this.budgetIdsFromSelectedDesignation.includes(
            inv.Overview_Budget_per_Anno__c
          )) &&
        (!this.selectedAnno || inv.Anno_di_Competenza__c === this.selectedAnno)
    );
    console.log(
      "[CFD] Invoices trovate:",
      list.map((i) => i.Id)
    );
    this.fattureData = list.map((inv) => ({ ...inv, id: inv.Id }));
  }

  // ───────── handleDonatoreRowSelection ─────────
  handleDonatoreRowSelection(event) {
    if (this.embeddedMode) return; // <— disabilita logica embedded
    const row = event.detail.selectedRows[0];
    console.log(
      "[SRC] handleDonatoreRowSelection RAW:",
      event.detail.selectedRows
    );

    if (!row) {
      console.log("[SRC] Deselezione completa – resetto tutto");
      this.selectedDonorRowKey = null;
      this.selectedDonatoreId = null;
      this.isAggregatedSelection = false;
      this.aggregatedDonorName = "";
      this.selectedSorgenteName = null;
      this.fattureData = [];
      this.selectedFattureAmount = 0;
      this.updateFatturatoConAssegnazioneTemporanea();
      return;
    }

    console.log("[SRC] Riga selezionata:", row);
    this.selectedDonorRowKey = row.id;
    // Considera aggregata anche la riga speciale "nonass_YYYY" (NON ASSEGNATO per anno)
    // E anche quando il nome del donatore è "NON ASSEGNATO" (anche se è un Reporting_Year reale)
    this.isAggregatedSelection =
      row.id.startsWith("agg_") || 
      row.id.startsWith("nonass_") ||
      row.donatoreName === "NON ASSEGNATO";
    this.aggregatedDonorName = this.isAggregatedSelection
      ? row.donatoreName
      : "";
    this.selectedDonatoreId = this.isAggregatedSelection
      ? row.id
      : row.id.split("_")[0];
    this.selectedSorgenteName = row.donatoreName;

    console.log("[SRC] selectedDonorRowKey   =", this.selectedDonorRowKey);
    console.log("[SRC] isAggregatedSelection =", this.isAggregatedSelection);
    console.log("[SRC] aggregatedDonorName   =", this.aggregatedDonorName);
    console.log("[SRC] selectedDonatoreId    =", this.selectedDonatoreId);
    console.log("[SRC] selectedSorgenteName  =", this.selectedSorgenteName);

    this.computeFattureData().catch(err => {
      console.error('[handleDonatoreRowSelection] Errore in computeFattureData:', err);
    });
    this.updateFatturatoConAssegnazioneTemporanea();
  }

  updateInvoicePaginationCursorFromList(list) {
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) {
      this.invoicePaginationCursor = null;
      return;
    }
    const last = rows[rows.length - 1];
    this.invoicePaginationCursor = {
      lastDate: last && last.Date__c ? last.Date__c : null,
      lastCreatedDate: last && last.CreatedDate ? last.CreatedDate : null,
      lastInvoiceId: last && last.Id ? last.Id : null
    };
  }

  // Infinite loading per la tabella fatture
  async handleInvoiceLoadMore(event) {
    const table = event?.target;
    if (this.isLoadingMoreInvoices || !this.hasMoreInvoices) {
      if (table) table.isLoading = false;
      return;
    }
    this.isLoadingMoreInvoices = true;
    if (table) table.isLoading = true;
    try {
      const prog = this.selectedProgram || null;
      const gd = this.selectedGiftDesignation || null;
      const anno = this.selectedAnno || null;
      const chunk = await getInvoicesChunk({
        selectedProgram: prog,
        selectedGiftDesignation: gd,
        selectedAnno: anno,
        limitSize: this.invoicePageSize,
        offsetSize: this.invoiceOffset,
        lastInvoiceDate: this.invoicePaginationCursor
          ? this.invoicePaginationCursor.lastDate
          : null,
        lastCreatedDate: this.invoicePaginationCursor
          ? this.invoicePaginationCursor.lastCreatedDate
          : null,
        lastInvoiceId: this.invoicePaginationCursor
          ? this.invoicePaginationCursor.lastInvoiceId
          : null,
        reportingYearId: null // Non filtrare per Reporting Year in questo caso
      });
      const newRows = (chunk || []).map((inv) => ({ ...inv, id: inv.Id }));
      if (newRows.length) {
        this.fullInvoiceList = [...(this.fullInvoiceList || []), ...newRows];
        this.invoiceOffset = this.fullInvoiceList.length;
        this.hasMoreInvoices = newRows.length === this.invoicePageSize;
        this.updateInvoicePaginationCursorFromList(this.fullInvoiceList);
      } else {
        this.hasMoreInvoices = false;
      }
      this.computeFattureData().catch(err => {
        console.error('[loadMoreInvoices] Errore in computeFattureData:', err);
      });
    } catch (e) {
      this.errorObj = e;
      this.error = (e && e.body && e.body.message) || e.message || (()=>{ try {return JSON.stringify(e);} catch(_) {return String(e);} })();
      // eslint-disable-next-line no-console
      console.error('[initFromInvoice] Errore:', this.error, e);
      this.hasMoreInvoices = false;
    } finally {
      this.isLoadingMoreInvoices = false;
      if (table) table.isLoading = false;
    }
  }

  // ───────── handleSecondaryDonatoreRowSelection ─────────
  handleSecondaryDonatoreRowSelection(event) {
    if (this.embeddedMode) return; // <— disabilita logica embedded
    const row = event.detail.selectedRows[0];
    console.log(
      "[DST] handleSecondaryDonatoreRowSelection RAW:",
      event.detail.selectedRows
    );

    if (!row) {
      console.log("[DST] Deselezione destinatario – resetto secondario");
      this.selectedDestRowKey = null;
      this.selectedSecondaryDonatoreId = null;
      this.selectedDestinatarioName = null;
      this.updateFatturatoConAssegnazioneTemporanea();
      return;
    }

    console.log("[DST] Riga destinatario selezionata:", row);
    this.selectedDestRowKey = row.id;
    // Destinatario aggregato anche se id è "nonass_YYYY"
    this.selectedSecondaryDonatoreId =
      row.id.startsWith("agg_") || row.id.startsWith("nonass_")
      ? null
      : row.id.split("_")[0];
    this.selectedDestinatarioName = row.donatoreName;

    console.log("[DST] selectedDestRowKey          =", this.selectedDestRowKey);
    console.log(
      "[DST] selectedSecondaryDonatoreId =",
      this.selectedSecondaryDonatoreId
    );
    console.log(
      "[DST] selectedDestinatarioName    =",
      this.selectedDestinatarioName
    );

    this.updateFatturatoConAssegnazioneTemporanea();
  }

  // ───────── handleFattureSelection ─────────
  handleFattureSelection(event) {
    const selectedRows = event.detail.selectedRows;
    this.selectedFatture = selectedRows;
    this.selectedFattureAmount = selectedRows.reduce(
      (acc, row) => acc + toNum(row.Totale_Fattura__c),
      0
    );

    console.log(
      "[INV] Fatture selezionate IDs:",
      selectedRows.map((r) => r.Id)
    );
    console.log("[INV] selectedFattureAmount =", this.selectedFattureAmount);

    this.updateFatturatoConAssegnazioneTemporanea();
  }

  computeAnnoOptions() {
    const options = [
      ...new Set(
        this.fullAnnoList
          .filter((a) => a.Programma__c === this.selectedProgram)
          .map((a) => a.Name)
      )
    ].map((name) => ({ label: name, value: name }));
    this.annoOptions = [{ label: "Tutti gli anni", value: "" }, ...options];
  }

  isDefaultOrFree(account) {
    return (
      account && (account.DEFAULT__c === true || account.GRATUITO__c === true)
    );
  }
  /*────────────────────────────────────────────
   * ► COSTRUZIONE RIGHE DONATORI + FATTURATO
   *───────────────────────────────────────────*/
  computeDonatoriData() {
    /* ─── Interactive mode: se il programma non è ancora scelto
      nascondi completamente le tabelle ───────────────────────── */
    if (!this.embeddedMode && !this.selectedProgram) {
      this.originalDonatoriData = [];
      this.donatoriData = [];
      this.donatoriDataWithUpdate = [];
      this.fattureData = [];
      this.recomputeHeaderTotals();
      return; // ⬅️  stop: niente tabelle
    }

    if (
      !Array.isArray(this.fullReportingYearList) ||
      !this.fullReportingYearList.length ||
      !Array.isArray(this.fullBudgetList) ||
      !Array.isArray(this.fullGTDList) ||
      !Array.isArray(this.fullInvoiceList)
    ) {
      console.warn(
        "computeDonatoriData() - skip: liste non ancora inizializzate"
      );
      this.recomputeHeaderTotals();
      return;
    }

    /* MOD-LOG #2  ─────────────────────────────────────────────── */
    console.groupCollapsed("LOG#2  ▶︎ computeDonatoriData – parametri");
    console.log("selectedProgram      =", this.selectedProgram);
    console.log("selectedAnno         =", this.selectedAnno);
    console.log("selectedGiftDes      =", this.selectedGiftDesignation);
    console.log("enrolledIds (size)   =", this.enrolledIds.size, [
      ...this.enrolledIds
    ]);
    console.groupEnd();

    if (!this.invoiceId) {
      this.fattureData = [];
    }

    /* MOD-LOG #3 – funnel filtraggio base (Programma/Anno/enrollment) */
    const allRy = this.fullReportingYearList;
    const stepProg = allRy.filter(
      (ry) => !this.selectedProgram || ry.Programma__c === this.selectedProgram
    );
    const stepAnno = stepProg.filter(
      (ry) => !this.selectedAnno || ry.Year__c === this.selectedAnno
    );
    // Tabella di sinistra: NON filtrare per ProgramEnrollment (per tua richiesta).
    // Mantieni solo l'esclusione dei conti Default/Gratuito quando in contesto invoice.
    const stepEnroll = stepAnno.filter((ry) => {
      if (!this.invoiceId) return true;
      const acc = ry.Account__r;
      return !(acc && (acc.DEFAULT__c === true || acc.GRATUITO__c === true));
    });

    console.groupCollapsed("LOG#3 ▶︎ RY funnel");
    console.log("all RY                 =", allRy.length);
    console.log("after Programma filter =", stepProg.length);
    console.log("after Anno filter      =", stepAnno.length);
    console.log("after enrolled filter  =", stepEnroll.length);
    console.groupEnd();

    const allowedBudgetIds = new Set(this.fullBudgetList.map((b) => b.Id));
    const dynInvoice = [...(this.dynamicSummaryFields["Invoice__c"] || [])];
    const rowsTmp = [];

    // Raggruppa per cluster (holding/account15 + anno)
    const clusterMap = new Map();
    stepEnroll.forEach((ry) => {
      const groupId = ry.Holding__c || ry.Account__c?.substring(0, 15);
      const annoTarget = this.selectedAnno || ry.Year__c;
      const key = `${groupId}_${annoTarget}`;
      if (!clusterMap.has(key)) {
        clusterMap.set(key, {
          groupId,
          annoTarget,
          ryIds: [],
          donorName: ry.Nome_Donatore__c,
          rootNameCandidate: !ry.Holding__c ? ry.Nome_Donatore__c : null
        });
      }
      const bucket = clusterMap.get(key);
      bucket.ryIds.push(ry.Id);
      if (!ry.Holding__c && !bucket.rootNameCandidate) {
        bucket.rootNameCandidate = ry.Nome_Donatore__c;
      }
      // se non abbiamo rootNameCandidate usa l'ultimo nome visto
      if (!bucket.rootNameCandidate) bucket.donorName = ry.Nome_Donatore__c;
    });

    if (this.embeddedMode && this.debugEmbedded) {
      console.groupCollapsed("EMB ▶︎ Clusters costruiti (per gruppo/anno)");
      clusterMap.forEach((v, k) => {
        console.log(`- key=${k} donor='${v.rootNameCandidate || v.donorName}' anno=${v.annoTarget} ryIds=${v.ryIds.length}`);
      });
      console.groupEnd();
    }

    // Costruisce le righe per ogni cluster
    clusterMap.forEach((bucket, key) => {
      const ryIds = bucket.ryIds;
      const annoTarget = bucket.annoTarget;
      const donorName = bucket.rootNameCandidate || bucket.donorName;

      // Appartenenza al cluster: non richiedere necessariamente che il RY sia presente in ryIds
      // ma basta che il suo groupId (holding/account15) e l'anno combacino con il bucket
      const belongsToBucket = (gtd) => {
        const ryId = gtd[GTD_DONOR_FIELD];
        const ry = (this.fullReportingYearList || []).find((r) => r.Id === ryId);
        if (!ry) return false;
        const grp = ry.Holding__c || ry.Account__c?.substring(0, 15);
        const yr = this.selectedAnno || ry.Year__c;
        return grp === bucket.groupId && yr === annoTarget;
      };

      const gtdFiltered = this.fullGTDList.filter((gtd) =>
        allowedBudgetIds.has(gtd.Overview_Budget_per_Anno__c) &&
        (!this.selectedGiftDesignation ||
          this.budgetIdsFromSelectedDesignation.includes(
            gtd.Overview_Budget_per_Anno__c
          )) &&
        gtd.Anno_Distribuzione__c === annoTarget &&
        belongsToBucket(gtd)
      );
      const gtdSum = gtdFiltered.reduce((tot, g) => tot + toNum(g.Amount), 0);

      // Fatturato: usa aggregati server-side completi
      let fatturato = 0;
      if (this.selectedAnno) {
        // Con anno selezionato somma solo per quell'anno
        ryIds.forEach((ryId) => {
          const key = `${ryId}_${annoTarget}`; // annoTarget == selectedAnno
          fatturato += toNum(this.invoiceTotalsIndex[key]);
        });
      } else {
        // "Tutti gli anni": somma tutte le annualità disponibili per ciascun RY
        const idxKeys = Object.keys(this.invoiceTotalsIndex || {});
        ryIds.forEach((ryId) => {
          const prefix = `${ryId}_`;
          idxKeys.forEach((k) => {
            if (k.startsWith(prefix)) {
              fatturato += toNum(this.invoiceTotalsIndex[k]);
            }
          });
        });
      }

      const row = {
        id: `${ryIds[0]}_${annoTarget}`,
        donatoreName: donorName,
        year: annoTarget,
        sommaDistribuita: gtdSum,
        totaleFatturato: fatturato,
        capienza: gtdSum - fatturato,
        clusterRyIds: ryIds
      };
      dynInvoice.forEach((f) => (row[f] = 0));
      rowsTmp.push(row);

      if (this.embeddedMode && this.debugEmbedded) {
        console.log(
          `[ROW] donor='${donorName}' anno=${annoTarget} ryIds=${ryIds.length} ` +
            `GTDsum=${gtdSum} INVsum=${fatturato} cap=${row.capienza}`
        );
      }
    });

    // Spiega inclusione/esclusione GTD in embedded (diagnostica)
    if (this.embeddedMode && this.debugEmbedded) {
      try {
        const stepEnrollIdSet = new Set(stepEnroll.map((r) => r.Id));
        const byBudget = new Map();
        (this.fullGTDList || []).forEach((g) => {
          if (!allowedBudgetIds.has(g.Overview_Budget_per_Anno__c)) return;
          if (
            this.selectedGiftDesignation &&
            !this.budgetIdsFromSelectedDesignation.includes(
              g.Overview_Budget_per_Anno__c
            )
          )
            return;
          if (this.selectedProgram && g.Programma__c !== this.selectedProgram)
            return;
          const arr = byBudget.get(g.Overview_Budget_per_Anno__c) || [];
          arr.push(g);
          byBudget.set(g.Overview_Budget_per_Anno__c, arr);
        });
        console.groupCollapsed("EMB ▶︎ GTD explain (per budget selezionato)");
        byBudget.forEach((list, obId) => {
          console.log(`OB=${obId} count=${list.length}`);
          list.forEach((g) => {
            const ryId = g[GTD_DONOR_FIELD];
            const ry = (this.fullReportingYearList || []).find((r) => r.Id === ryId);
            const inStep = stepEnrollIdSet.has(ryId);
            const annoRy = ry?.Year__c;
            const donorName = ry?.Nome_Donatore__c;
            const key = `${(ry?.Holding__c || ry?.Account__c?.substring(0, 15) || '?')}_${this.selectedAnno || annoRy}`;
            const inCluster = clusterMap.has(key) && clusterMap.get(key).ryIds.includes(ryId);
            const annoMatch = !this.selectedAnno || g.Anno_Distribuzione__c === (this.selectedAnno || annoRy);
            const include = inStep && inCluster && annoMatch;
            console.log(
              ` - GTD ${g.Id} amt=${g.Amount} anno=${g.Anno_Distribuzione__c} ` +
                `→ RY=${ryId} donor='${donorName || '?'}' ryYear=${annoRy} ` +
                `inStep=${inStep} inCluster=${inCluster} annoMatch=${annoMatch} -> include=${include}`
            );
          });
        });
        console.groupEnd();
      } catch (e) {
        console.warn("EMB ▶︎ errore GTD explain:", e);
      }
    }

    // Aggiungi una riga "NON ASSEGNATO" per GTD senza link al Reporting_Year
    // Questo consente di includere allocazioni presenti nel budget/anno ma non associate a nessun Donatore/Anno
    try {
      const extraGtd = this.fullGTDList.filter((gtd) =>
        allowedBudgetIds.has(gtd.Overview_Budget_per_Anno__c) &&
        (!this.selectedGiftDesignation ||
          this.budgetIdsFromSelectedDesignation.includes(
            gtd.Overview_Budget_per_Anno__c
          )) &&
        (!this.selectedProgram || gtd.Programma__c === this.selectedProgram) &&
        !gtd[GTD_DONOR_FIELD] // nessun link a Reporting_Year__c
      );

      // Seleziona gli anni pertinenti: o uno specifico, o tutti quelli presenti negli extra
      const years = this.selectedAnno
        ? [this.selectedAnno]
        : [...new Set(extraGtd.map((g) => g.Anno_Distribuzione__c).filter(Boolean))];

      if (this.embeddedMode && this.debugEmbedded) {
        console.groupCollapsed("EMB ▶︎ GTD senza Reporting_Year (NON ASSEGNATO)");
        console.log("count=", extraGtd.length);
        const byYear = {};
        extraGtd.forEach(g => {
          const y = g.Anno_Distribuzione__c || '—';
          byYear[y] = (byYear[y] || 0) + toNum(g.Amount);
        });
        Object.keys(byYear).sort().forEach(y => console.log(`anno=${y} somma=${byYear[y]}`));
        console.groupEnd();
      }

      years.forEach((yy) => {
        const sum = extraGtd
          .filter((g) => !yy || g.Anno_Distribuzione__c === yy)
          .reduce((tot, g) => tot + toNum(g.Amount), 0);
        if (sum > 0) {
          const r = {
            id: this.selectedAnno ? `nonass_${yy}` : `agg_NON ASSEGNATO`,
            donatoreName: "NON ASSEGNATO",
            year: yy || "",
            sommaDistribuita: sum,
            totaleFatturato: 0,
            capienza: sum,
            clusterRyIds: []
          };
          dynInvoice.forEach((f) => (r[f] = 0));
          rowsTmp.push(r);

          if (this.embeddedMode && this.debugEmbedded) {
            console.log(`[ROW] donor='NON ASSEGNATO' anno=${yy} GTDsum=${sum} INVsum=0 cap=${sum}`);
          }
        }
      });
    } catch (e) {
      console.warn("Errore aggiungendo riga NON ASSEGNATO:", e);
    }

    if (this.embeddedMode && dynInvoice.length) {
      rowsTmp.forEach((r) => {
        // Dinamiche: per ora manteniamo somma client sui chunk disponibili
        const invForCluster = this.fullInvoiceList.filter(
          (inv) =>
            r.clusterRyIds.includes(inv.Reporting_Year__c) &&
            inv.Anno_di_Competenza__c === r.year
        );
        invForCluster.forEach((inv) => dynInvoice.forEach((f) => (r[f] += inv[f] || 0)));
      });
    }

    const grouped = new Map();

    rowsTmp.forEach((r) => {
      const key = this.selectedAnno
        ? `${r.donatoreName}_${r.year}`
        : r.donatoreName;

      if (!grouped.has(key)) {
        grouped.set(key, {
          id: this.selectedAnno ? r.id : `agg_${r.donatoreName}`,
          donatoreName: r.donatoreName,
          year: r.year,
          sommaDistribuita: 0,
          totaleFatturato: 0
        });
        if (this.embeddedMode)
          dynInvoice.forEach((f) => (grouped.get(key)[f] = 0));
      }

      const agg = grouped.get(key);
      agg.sommaDistribuita += r.sommaDistribuita;
      agg.totaleFatturato += r.totaleFatturato;
      if (this.embeddedMode) dynInvoice.forEach((f) => (agg[f] += r[f] || 0));
    });

    const finalRows = [...grouped.values()].map((r) => ({
      ...r,
      capienza: r.sommaDistribuita - r.totaleFatturato
    }));

    if (this.embeddedMode && this.debugEmbedded) {
      console.groupCollapsed("EMB ▶︎ Righe finali (dopo aggregazione per Donatore/Anno)");
      const tot = finalRows.reduce((a, r) => a + toNum(r.sommaDistribuita), 0);
      finalRows
        .sort((a, b) => a.donatoreName.localeCompare(b.donatoreName))
        .forEach((r) => {
          console.log(
            `${r.donatoreName} [anno=${r.year || '—'}] ` +
              `SommaDistribuita=${r.sommaDistribuita} Fatturato=${r.totaleFatturato} Capienza=${r.capienza}`
          );
        });
      console.log("EMB ▶︎ Totale SommaDistribuita =", tot);
      console.groupEnd();
    }

    // Filtra i donatori con Account DEFAULT o GRATUITO
    const excludedAccounts15 = new Set(
      this.fullReportingYearList
        .filter(
          (ry) =>
            ry.Account__r &&
            (ry.Account__r.DEFAULT__c === true ||
              ry.Account__r.GRATUITO__c === true)
        )
        .map((ry) => ry.Account__c?.substring(0, 15))
    );

    /* MOD-LOG #4  – blacklist DEFAULT/GRATUITO */
    console.groupCollapsed("LOG#4  ▶︎ blacklist DEFAULT/GRATUITO");
    console.log("excludedAccounts15 =", [...excludedAccounts15]);
    console.log("invoiceId context? =", !!this.invoiceId);
    console.groupEnd();

    const isExcludedDonor = (donatoreName) => {
      const ry = this.fullReportingYearList.find(
        (r) =>
          !r.Holding__c &&
          r.Nome_Donatore__c === donatoreName &&
          (!this.selectedProgram || r.Programma__c === this.selectedProgram)
      );
      return ry && excludedAccounts15.has(ry.Account__c?.substring(0, 15));
    };

    // Visibili a sinistra (sempre tutti, se embedded o tabella sorgente)
    const visibleRowsLeft = this.embeddedMode
      ? finalRows // embedded: sempre tutto
      : finalRows;

    // Visibili a destra (filtrati solo in modalità interattiva con tabella destra attiva)
    const visibleRowsRight =
      this.embeddedMode || !this.showDonatoreDestinatario
        ? finalRows // embedded o tabella nascosta
        : finalRows.filter((r) => {
            // Destinatari: includi anche righe con tutti i totali a zero,
            // perché potrebbero essere target validi per assegnazioni future.

            // Se NON siamo nella modalità “invoice”, i Default/Gratuito DEVONO comparire
            if (!this.invoiceId) {
              // Inoltre, applica filtro ProgramEnrollment per DEST destinatari
              const ry = this.fullReportingYearList.find(
                (x) =>
                  !x.Holding__c &&
                  x.Nome_Donatore__c === r.donatoreName &&
                  (!this.selectedProgram || x.Programma__c === this.selectedProgram)
              );
              if (ry && this.selectedAnno) {
                const acc15 = (ry.Account__c || '').substring(0, 15);
                if (
                  this.rightEligibleAccountIds &&
                  this.rightEligibleAccountIds.size > 0 &&
                  !this.rightEligibleAccountIds.has(acc15) &&
                  !this.rightEligibleAccountIds.has(ry.Account__c)
                ) {
                  return false;
                }
              }
              return true;
            }

            // Se c’è invoiceId ⇒ nascondili
            const acc = this.fullReportingYearList.find(
              (ry) =>
                !ry.Holding__c &&
                ry.Nome_Donatore__c === r.donatoreName &&
                (!this.selectedProgram ||
                  ry.Programma__c === this.selectedProgram)
            )?.Account__r;
            return !this.isDefaultOrFree(acc);
          });

    // Sync dati
    this.originalDonatoriData = JSON.parse(JSON.stringify(finalRows));
    this.donatoriData = visibleRowsLeft; // tabella sinistra
    this.donatoriDataWithUpdate = visibleRowsRight; // tabella destra

    console.log(
      "🔵 computeDonatoriData END — left:",
      visibleRowsLeft.length,
      "right:",
      visibleRowsRight.length
    );
    // Aggiorna totali header
    this.recomputeHeaderTotals();
  }

  isExcludedDonorByName(donorName) {
    const ry = this.fullReportingYearList.find(
      (r) =>
        !r.Holding__c &&
        r.Nome_Donatore__c === donorName &&
        (!this.selectedProgram || r.Programma__c === this.selectedProgram)
    );
    return this.isDefaultOrFree(ry?.Account__r);
  }

  // ───────── updateFatturatoConAssegnazioneTemporanea ─────────
  updateFatturatoConAssegnazioneTemporanea() {
    const rows = JSON.parse(JSON.stringify(this.originalDonatoriData));
    const delta = toNum(this.selectedFattureAmount);

    console.log(
      "[UPD] *** Inizio updateFatturatoConAssegnazioneTemporanea ***"
    );
    console.log("[UPD] originalDonatoriData count =", rows.length);
    console.log("[UPD] delta (Totale selezionato)   =", delta);
    console.log(
      "[UPD] Source key                   =",
      this.selectedDonorRowKey
    );
    console.log(
      "[UPD] Dest   key                   =",
      this.selectedDestRowKey
    );

    rows.forEach((r) => {
      console.log(
        `[UPD] Controllo riga id=${r.id}: ` +
          `matchSRC=${r.id === this.selectedDonorRowKey}, ` +
          `matchDST=${r.id === this.selectedDestRowKey}`
      );

      if (r.id === this.selectedDonorRowKey) {
        console.log(
          `[UPD] → APPLICO SUBTRAZIONE su SRC prima: tot=${r.totaleFatturato}, cap=${r.capienza}`
        );
        r.totaleFatturato = toNum(r.totaleFatturato) - delta; // o + delta
        r.capienza = (r.sommaDistribuita || 0) - r.totaleFatturato;
        console.log(
          `[UPD] → APPLICO SUBTRAZIONE su SRC dopo:  tot=${r.totaleFatturato}, cap=${r.capienza}`
        );
      } else if (r.id === this.selectedDestRowKey) {
        console.log(
          `[UPD] → APPLICO ADDIZIONE su DST prima:    tot=${r.totaleFatturato}, cap=${r.capienza}`
        );
        r.totaleFatturato = (r.totaleFatturato || 0) + delta;
        r.capienza = (r.sommaDistribuita || 0) - r.totaleFatturato;
        console.log(
          `[UPD] → APPLICO ADDIZIONE su DST dopo:     tot=${r.totaleFatturato}, cap=${r.capienza}`
        );
      }
    });

    // Mantieni la stessa visibilità della tabella destinatari:
    // - embedded o tabella destra nascosta: mostra tutte le righe
    // - altrimenti: non rimuovere righe a zero; con invoiceId escludi solo Default/Gratuito
    const filteredRows = (this.embeddedMode || !this.showDonatoreDestinatario)
      ? rows
      : rows.filter((r) => {
          if (!this.invoiceId) return true;
          return !this.isExcludedDonorByName(r.donatoreName);
        });

    console.log("[UPD] *** Fine update – righe aggiornate ***", filteredRows);
    this.donatoriDataWithUpdate = filteredRows;
    this.recomputeHeaderTotals();
  }

  // Totali per intestazioni (Somma Distribuita, Totale Fatturato, Capienza + dinamici)
  recomputeHeaderTotals() {
    const rows = (this.donatoriDataWithUpdate && this.donatoriDataWithUpdate.length)
      ? this.donatoriDataWithUpdate
      : (this.donatoriData || []);

    let sommaDistribuita = 0;
    let totaleFatturato = 0;
    let capienza = 0;

    rows.forEach(r => {
      sommaDistribuita += toNum(r.sommaDistribuita);
      totaleFatturato += toNum(r.totaleFatturato);
      capienza += toNum(r.capienza);
    });

    const dynamicTotals = {};
    if (this.embeddedMode) {
      const dynFields = [...(this.dynamicSummaryFields['Invoice__c'] || [])];
      dynFields.forEach(f => {
        dynamicTotals[f] = rows.reduce((acc, r) => acc + toNum(r[f]), 0);
      });
    }

    this.headerTotals = {
      sommaDistribuita,
      totaleFatturato,
      capienza,
      dynamic: dynamicTotals
    };
  }

  @api get selectedInvoiceIds() {
    return this.selectedFatture.map((row) => row.Id);
  }

  resolveReportingYearByKey(rowKey) {
    if (!rowKey) {
      return null;
    }
    const list = Array.isArray(this.fullReportingYearList)
      ? this.fullReportingYearList
      : [];
    const isAggregate =
      rowKey.startsWith("agg_") || rowKey.startsWith("nonass_");
    if (isAggregate) {
      const nome = rowKey.startsWith("agg_")
        ? rowKey.substring(4)
        : "NON ASSEGNATO";
      return (
        list.find(
          (ry) =>
            !ry.Holding__c &&
            ry.Nome_Donatore__c === nome &&
            (!this.selectedProgram || ry.Programma__c === this.selectedProgram) &&
            (!this.selectedAnno || ry.Year__c === this.selectedAnno)
        ) || null
      );
    }
    const targetId = rowKey.split("_")[0];
    return list.find((ry) => ry.Id === targetId) || null;
  }

  @api
  get sourceReportingYearId() {
    const record = this.resolveReportingYearByKey(this.selectedDonorRowKey);
    return record ? record.Id : null;
  }

  @api
  get targetReportingYearId() {
    const record = this.resolveReportingYearByKey(this.selectedDestRowKey);
    return record ? record.Id : null;
  }

  @api
  get targetAccountId() {
    const record = this.resolveReportingYearByKey(this.selectedDestRowKey);
    if (!record) {
      return null;
    }
    return record.Account__c || record.Holding__c || null;
  }
}