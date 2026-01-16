import { LightningElement, api, wire, track } from "lwc";
import { traceApex, wireTracer, resolveSoql } from "c/tracer";
import getRelatedRecords from "@salesforce/apex/Distribuzioni.getRelatedRecords";
import getAvailableYears from "@salesforce/apex/Distribuzioni.getAvailableYears";
import getAvailablePrograms from "@salesforce/apex/Distribuzioni.getAvailablePrograms";
import getAvailableStatuses from "@salesforce/apex/Distribuzioni.getAvailableStatuses";
import getBudgetIdForCurrentUser from "@salesforce/apex/Distribuzioni.getBudgetIdForCurrentUser";
import getAvailableBudgets from "@salesforce/apex/Distribuzioni.getAvailableBudgets";

/* ────────────── DEBUG helper ────────────── */
const DEBUG = true;
const dbg = (...args) => {
  if (DEBUG) console.log(...args);
};

/* ---------- COLONNE ---------- */
const ALL_COLUMNS = [
  {
    label: "Allocazione",
    fieldName: "recordLink",
    type: "url",
    typeAttributes: { label: { fieldName: "Title__c" }, target: "_self" }
  },
  {
    label: "Donazione",
    fieldName: "transLink",
    type: "url",
    typeAttributes: { label: { fieldName: "transName" }, target: "_self" }
  },
  {
    label: "€ Allocato",
    fieldName: "Amount",
    type: "currency",
    typeAttributes: { currencyCode: "EUR" }
  },
  { label: "% della Donazione", fieldName: "formattedPercent", type: "text" },
  { label: "Data Allocazione", fieldName: "Data_di_Distribuzione__c" },
  { label: "Data Pagamento", fieldName: "Data_di_Pagamento__c" },
  {
    label: "Pagamento",
    fieldName: "paymentLink",
    type: "url",
    typeAttributes: { label: { fieldName: "paymentName" }, target: "_self" }
  },
  { label: "Stato", fieldName: "StatusLabel" },
  {
    label: "Anno di Budget",
    fieldName: "budgetLink",
    type: "url",
    typeAttributes: { label: { fieldName: "budgetName" }, target: "_self" }
  }
];

/* Colonne quando il Budget utente è NON-default (pick-list nascosta) */
const COLUMNS_WITH_BUDGET = ALL_COLUMNS.filter(
  (c) => !["transLink", "budgetLink", "formattedPercent"].includes(c.fieldName)
);
const COLUMNS_WITH_BUDGET_RENAMED = COLUMNS_WITH_BUDGET.map((c) => {
  const mapping = {
    recordLink: "Donazione",
    Amount: "Somma Ricevuta",
    Data_di_Distribuzione__c: "Data Donazione",
    Data_di_Pagamento__c: "Data Bonifico"
  };
  return { ...c, label: mapping[c.fieldName] || c.label };
});

export default class Distribuzioni extends LightningElement {
  /* ============== proprietà reactive ============== */
  @api recordId;

  noBudgetFound = false; // TRUE ⇒ nessun budget ↔ blocca tutto
  relatedData = [];
  yearOptions = [];
  programOptions = [];
  statusOptions = [];

  selectedYear = String(new Date().getFullYear());
  selectedProgram = "";
  selectedStatus = "";
  @track selectedBudgetId = "";

  totalPaid = 0;
  totalDistributed = 0;

  isLoading = false;
  isBudgetLoaded = false; // indica che il wire budget è terminato
  hideBudget = false; // true ⇒ pick-list Budget nascosta
  userBudgetId = ""; // budget fisso (NON-default)
  showProgramFilter = true; // false se esiste un solo Programma
  @track budgetOptions = [];

  async connectedCallback() {
    dbg("connectedCallback()");
    try {
      const res = await getBudgetIdForCurrentUser();
      dbg("Budget current user (imperativo):", JSON.stringify(res));
    } catch (e) {
      console.error("Errore getBudgetIdForCurrentUser:", e);
    }
  }

  /* ------------------ GETTERS UI ------------------ */
  get cardTitle() {
    return this.hideBudget
      ? "Dettagli delle Donazioni"
      : "Lista delle Allocazioni";
  }
  get totalPaidLabel() {
    return this.hideBudget
      ? "Totale Somme ricevute nell'anno selezionato:"
      : "Totale Allocazioni Pagate nell'anno selezionato:";
  }
  get totalDistributedLabel() {
    return this.hideBudget
      ? "Totale Somme da ricevere nell'anno selezionato:"
      : "Totale Allocazioni Da Pagare nell'anno selezionato:";
  }
  /** disabilita i filtri se il Programma non è scelto */
  get mustChooseProgram() {
    return this.noBudgetFound || (!this.selectedProgram && !this.isLoading);
  }
  /** wire parameter; undefined blocca la query finché non c'è il Programma */
  get programParam() {
    return this.noBudgetFound ? undefined : this.selectedProgram || undefined;
  }
  /** budget effettivamente da passare all'Apex */
  get effectiveBudgetId() {
    return this.noBudgetFound
      ? null // non verrà passato all’Apex
      : this.hideBudget
        ? this.userBudgetId
        : this.selectedBudgetId || "";
  }
  /** pronto a mostrare datatable+totali */
  get isReady() {
    return (
      this.isBudgetLoaded && !this.noBudgetFound && !this.mustChooseProgram
    );
  }

  /* ============ WIRE: Budget utente ============ */
  @wire(getBudgetIdForCurrentUser)
  wiredBudget({ error, data }) {
    dbg("wiredBudget ➜ data:", data, "error:", error);
    /* ① priming run: nessun dato né errore → lascia che arrivi la risposta */
    if (!error && !data) {
      return;
    }
    if (error || !data || !data.id) {
      /* ⇨ nessun budget legato all’utente */
      this.noBudgetFound = true;
      this.isBudgetLoaded = true; // sblocca la UI (mostrerà il messaggio)
      return;
    }
    console.groupCollapsed("[DBG] ► wiredBudget – payload Apex");
    console.log("error:", error);
    console.log("data :", JSON.stringify(data));
    console.groupEnd();
    /* --- Budget trovato --- */
    if (data.isDefault) {
      this.hideBudget = false;
      this.userBudgetId = "";
    } else {
      this.hideBudget = true;
      this.userBudgetId = data.id;
    }
    this.columns = this.hideBudget ? COLUMNS_WITH_BUDGET_RENAMED : ALL_COLUMNS;
    this.isBudgetLoaded = true;
    /* se la pick-list Budget sarà visibile carichiamo le opzioni */
    if (!this.hideBudget) this.loadBudgetOptions();
  }

  /* ============ WIRE: Stati ============ */
  @wire(getAvailableStatuses)
  wiredStatus({ error, data }) {
    dbg("wiredStatus ➜", { error, data });
    if (data) {
      this.statusOptions = [
        { label: "Tutti gli Stati", value: "" },
        ...data.map((d) => ({ label: d.label, value: d.value }))
      ];
    } else if (error) console.error("Stati:", error);
  }

  /* ============ WIRE: Anni ============ */
  @wire(getAvailableYears)
  wiredYears(value) {
    wireTracer("getAvailableYears", {}, value);
    const { error, data } = value;
    if (data) {
      const curr = String(new Date().getFullYear());
      this.yearOptions = [
        { label: "Tutti gli Anni", value: "" },
        ...data.map((y) => ({ label: y, value: y }))
      ];
      this.selectedYear = data.includes(curr) ? curr : "";
    } else if (error) console.error("Anni:", error);
  }

  /* ============ WIRE: Programmi (dipende dal budget fisso) ============ */
  @wire(getAvailablePrograms, { budgetId: "$userBudgetId" })
  wiredPrograms({ error, data }) {
    dbg("wiredPrograms ➜", { error, data });
    if (data) {
      this.programOptions = data.records.map((p) => ({
        label: p.Name,
        value: p.Id
      }));

      /* auto-selezione + show/hide filtro */
      if (this.programOptions.length === 1) {
        // "Tutti" + 1 vero Programma
        this.showProgramFilter = false;
        this.selectedProgram = this.programOptions[0].value;
      } else {
        this.showProgramFilter = true;
      }

      if (!this.programOptions.some((o) => o.value === this.selectedProgram)) {
        this.selectedProgram = "";
      }
      /* aggiorna la pick-list Budget se visibile */
      if (!this.hideBudget) this.loadBudgetOptions();
    } else if (error) console.error("Programmi:", error);
  }

  /* ============ WIRE: Dati Allocazioni ============ */
  @wire(getRelatedRecords, {
    year: "$selectedYear",
    program: "$programParam",
    status: "$selectedStatus",
    budgetId: "$effectiveBudgetId"
  })
  wiredData(value) {
    const params = {
      year: this.selectedYear,
      status: this.selectedStatus,
      program: this.programParam,
      budgetId: this.effectiveBudgetId
    };
    wireTracer("getRelatedRecords", params, value);

    const { error, data } = value;
    dbg("wiredData ➜", { error, data });
    if (error) {
      console.error("Allocazioni:", error);
      return;
    }
    if (!data) return;
    console.log(
      "%cSOQL-RESOLVED",
      "color:#22d3ee;font-weight:bold",
      resolveSoql(data.query, params)
    );
    dbg(`⇢ Query eseguita: ${data.query}`);
    dbg(`⇢ Record restituiti: ${data.records.length}`);
    this.relatedData = data.records.map((r) => ({
      ...r,
      recordLink: "/" + r.Id,
      budgetLink: "/" + r.Overview_Budget_per_Anno__c,
      budgetName: r.Overview_Budget_per_Anno__r?.Name,
      transLink: "/" + r.GiftTransactionId,
      transName: r.GiftTransaction?.Name,
      paymentLink: r.Payment__c ? "/" + r.Payment__c : undefined,
      paymentName: r.Payment__r?.Name || "",
      formattedPercent: r.Percent + "%"
    }));
    this.totalPaid = data.totalPaid;
    this.totalDistributed = data.totalDistributed;
    this.isLoading = false;
  }

  /* ============ metodi supporto ============ */
  async loadBudgetOptions() {
    if (!this.selectedProgram) return; // niente Programma → niente chiamata
    dbg("loadBudgetOptions() – programId:", this.selectedProgram);

    try {
      // ✅ oggetto parametri corretto
      const opts = await traceApex(getAvailableBudgets, {
        programId: this.selectedProgram || ""
      });
      dbg("loadBudgetOptions() – opts:", opts); // log DOPO la risposta

      this.budgetOptions = [{ label: "Tutti i Budget", value: "" }, ...opts];
      if (!this.budgetOptions.some((o) => o.value === this.selectedBudgetId)) {
        this.selectedBudgetId = "";
      }
    } catch (e) {
      console.error("loadBudgetOptions:", e);
    }
  }

  /* ============ HANDLERS ============ */
  handleYearChange = (e) => {
    dbg("handleYearChange ➜", e.detail.value);
    this.isLoading = true;
    this.selectedYear = e.detail.value;
  };
  handleStatusChange = (e) => {
    dbg("handleStatusChange ➜", e.detail.value);
    this.isLoading = true;
    this.selectedStatus = e.detail.value;
  };
  handleProgramChange = (e) => {
    dbg("handleProgramChange ➜", e.detail.value);
    this.isLoading = true;
    this.selectedProgram = e.detail.value;
    if (!this.hideBudget) this.loadBudgetOptions();
  };
  handleBudgetChange = (e) => {
    dbg("handleBudgetChange ➜", e.detail.value);
    this.isLoading = true;
    this.selectedBudgetId = e.detail.value;
  };

  /* ============ ORDINAMENTO ============ */
  sortBy(field, rev, primer) {
    const key = primer ? (x) => primer(x[field]) : (x) => x[field];
    return (a, b) => rev * ((key(a) > key(b)) - (key(b) > key(a)));
  }
  defaultSortDirection = "asc";
  sortDirection = "asc";
  sortedBy = "";
  onHandleSort(e) {
    const { fieldName, sortDirection } = e.detail;
    this.relatedData = [...this.relatedData].sort(
      this.sortBy(fieldName, sortDirection === "asc" ? 1 : -1)
    );
    this.sortDirection = sortDirection;
    this.sortedBy = fieldName;
  }
}