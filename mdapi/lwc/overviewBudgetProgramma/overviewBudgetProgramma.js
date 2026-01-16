import { LightningElement, api, wire, track } from "lwc";
import { refreshApex } from "@salesforce/apex";

/*─── APEX ────────────────────────────────────────────────────────────*/
import getActivePrograms from "@salesforce/apex/RetrieveBudgetAnno.getActiveProgramsForCurrentUser";
import getBudgetsByProgram from "@salesforce/apex/RetrieveBudgetAnno.getBudgetsByProgram";
// ★ NEW → vecchio metodo, usato solo se recordId è valorizzato
import getRelatedRecordsWithFields from "@salesforce/apex/RetrieveBudgetAnno.getRelatedRecordsWithFields";

/*─── COLONNE STATICHE ────────────────────────────────────────────────*/
const LOG_PREFIX = "[overviewBudgetProgramma]";

const toLogPayload = (value) => {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    console.warn(`${LOG_PREFIX} log payload serialization failed`, e);
    return value;
  }
};

const log = (label, payload) => {
  if (payload === undefined) {
    console.log(`${LOG_PREFIX} ${label}`);
    return;
  }
  console.log(`${LOG_PREFIX} ${label}`, toLogPayload(payload));
};

const STATIC_COLUMNS = [
  {
    label: "Codice",
    fieldName: "recordLink",
    type: "url",
    typeAttributes: { label: { fieldName: "Name" }, target: "_self" }
  },
  { label: "Anno", fieldName: "Anno__c" },
  { label: "Allocati", fieldName: "Totale_Allocato__c", type: "currency" },
  {
    label: "Pagati",
    fieldName: "Totale_Distribuito_Pagato_Formula__c",
    type: "currency"
  },
  {
    label: "NON Pagati",
    fieldName: "Totale_Distribuito_NON_Pagato_Formula__c",
    type: "currency"
  },
  {
    label: "Pagamenti Aperti",
    fieldName: "Ammontare_Pagamenti_Da_Pagare_formula__c",
    type: "currency"
  },
  {
    label: "Pagamenti Chiusi",
    fieldName: "Ammontare_Pagamenti_Fatti_formula__c",
    type: "currency"
  },
  {
    label: "Num Fatture",
    fieldName: "Numero_di_Fatture_formula__c",
    type: "number"
  },
  {
    label: "Fatturati",
    fieldName: "Totale_Ammontare_Fatture_formula__c",
    type: "currency"
  },
  { label: "Capienza", fieldName: "Capienza__c", type: "currency" }
];

/* colonne da mostrare nella vista "Programma" (senza recordId) -------------*/
const PROGRAM_VIEW_COLUMNS = {
  Anno__c: "Anno",
  Totale_Allocato__c: "Donati",
  Totale_Distribuito_Pagato_Formula__c: "Pagati",
  Totale_Distribuito_NON_Pagato_Formula__c: "Pagamento in corso",
  Totale_Ammontare_Fatture_formula__c: "Fatturati",
  Capienza__c: "Capienza", // ← NEW,
  Numero_di_Fatture_formula__c: "Numero di Fatture"
};

export default class OverviewBudgetProgramma extends LightningElement {
  /*──────────────────────── INPUT DAL PARENT ─────────────────────*/
  @api recordId; // se valorizzato, segue la logica “vecchia”

  /*──────────────────────── STATO UI ─────────────────────────────*/
  @track programOptions = []; // combobox options
  @track showProgramPicker = false;
  @track programId; // Program selezionato dall’utente
  wiredProgramsResult;
  wiredBudgetsResult;
  wiredBudgetsByRecordResult;
  isRefreshing = false;

  /*──────────────────────── DATI TABELLA ─────────────────────────*/
  @track columns = [];
  @track relatedData = [];
  @track fieldConfig = {}; // { fieldApi → type }

  /*──────────────────────── ORDINAMENTO ──────────────────────────*/
  sortDirection = "desc";
  sortedBy = "Anno__c";

  /*──────────────────────── TITOLI ───────────────────────────────*/
  get cardTitle() {
    return "Vista del Budget per Anno";
  }

  /*================================================================
   * 1) SE recordId ***NON*** è presente → flusso “Program Enrollment”
   *===============================================================*/
  @wire(getActivePrograms)
  wiredPrograms(value) {
    this.wiredProgramsResult = value;
    const { data, error } = value;
    if (this.recordId) {
      log("wiredPrograms skipped (recordId present)", this.recordId);
      return; // ★ NEW → ignora se input recordId
    }
    log("wiredPrograms invoked", {
      hasData: !!data,
      hasError: !!error
    });
    if (error) {
      console.error(`${LOG_PREFIX} wiredPrograms error`, error);
      return;
    }
    if (!data) {
      log("wiredPrograms empty response");
      return;
    }

    log("wiredPrograms data", data);
    this.programOptions = data.map((p) => ({
      label: p.programName,
      value: p.programId
    }));
    log("wiredPrograms options", this.programOptions);

    if (this.programOptions.length === 1) {
      this.programId = this.programOptions[0].value;
      this.showProgramPicker = false;
    } else if (this.programOptions.length > 1) {
      this.showProgramPicker = true;
    }
    log("wiredPrograms state", {
      programId: this.programId,
      showProgramPicker: this.showProgramPicker
    });
  }

  /* budgets by Program (solo se recordId non è settato) */
  @wire(getBudgetsByProgram, { programId: "$programId" })
  wiredBudgets(value) {
    this.wiredBudgetsResult = value;
    const { data, error } = value;
    if (this.recordId) {
      log("wiredBudgets skipped (recordId present)", this.recordId);
      return; // ★ NEW
    }
    log("wiredBudgets invoked", {
      programId: this.programId,
      hasData: !!data,
      hasError: !!error
    });
    if (error) {
      console.error(`${LOG_PREFIX} wiredBudgets error`, error);
      return;
    }
    if (!data) {
      log("wiredBudgets empty response");
      return;
    }

    log("wiredBudgets data", data);
    const debugEntries = toLogPayload(data.debugInfo) || [];
    debugEntries.forEach((entry, index) => {
      log(`wiredBudgets SOQL[${index}]`, entry);
    });

    const sanitizedRecords = toLogPayload(data.records) || [];
    if (sanitizedRecords.length) {
      const tableData = sanitizedRecords.map((row) => ({
        Id: row.Id,
        Name: row.Name,
        Anno__c: row.Anno__c,
        Totale_Allocato__c: row.Totale_Allocato__c,
        Totale_Ammontare_Fatture_formula__c:
          row.Totale_Ammontare_Fatture_formula__c,
        Capienza__c: row.Capienza__c
      }));
      console.table(tableData);
    }
    this.processResult(data, { programView: true });
  }

  /* combobox change */
  handleProgramChange(event) {
    this.programId = event.detail.value;
    log("handleProgramChange", {
      selectedProgramId: this.programId,
      optionsCount: this.programOptions.length
    });
  }

  /*================================================================
   * 2) SE recordId ***È*** presente → flusso “storico” (senza picker)
   *===============================================================*/
  @wire(getRelatedRecordsWithFields, { parentId: "$recordId" })
  wiredBudgetsByRecord(value) {
    this.wiredBudgetsByRecordResult = value;
    const { data, error } = value;
    if (!this.recordId) {
      log("wiredBudgetsByRecord skipped (no recordId)");
      return; // ★ NEW
    }
    log("wiredBudgetsByRecord invoked", {
      recordId: this.recordId,
      hasData: !!data,
      hasError: !!error
    });
    if (error) {
      console.error(`${LOG_PREFIX} wiredBudgetsByRecord error`, error);
      return;
    }
    if (!data) {
      log("wiredBudgetsByRecord empty response");
      return;
    }

    log("wiredBudgetsByRecord data", data);
    const debugEntries = toLogPayload(data.debugInfo) || [];
    debugEntries.forEach((entry, index) => {
      log(`wiredBudgetsByRecord SOQL[${index}]`, entry);
    });

    const sanitizedRecords = toLogPayload(data.records) || [];
    if (sanitizedRecords.length) {
      const tableData = sanitizedRecords.map((row) => ({
        Id: row.Id,
        Name: row.Name,
        Anno__c: row.Anno__c,
        Totale_Allocato__c: row.Totale_Allocato__c,
        Totale_Ammontare_Fatture_formula__c:
          row.Totale_Ammontare_Fatture_formula__c,
        Capienza__c: row.Capienza__c
      }));
      console.table(tableData);
    }
    // con recordId NON applichiamo il filtro fallback
    this.processResult(data);
  }

  async handleRefreshClick() {
    this.isRefreshing = true;
    const refreshPromises = [];

    if (this.recordId) {
      if (this.wiredBudgetsByRecordResult) {
        refreshPromises.push(refreshApex(this.wiredBudgetsByRecordResult));
      }
    } else {
      if (this.wiredProgramsResult) {
        refreshPromises.push(refreshApex(this.wiredProgramsResult));
      }
      if (this.wiredBudgetsResult) {
        refreshPromises.push(refreshApex(this.wiredBudgetsResult));
      }
    }

    try {
      if (refreshPromises.length) {
        await Promise.all(refreshPromises);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} handleRefreshClick`, error);
    } finally {
      this.isRefreshing = false;
    }
  }

  /*================================================================
   * comune: costruzione colonne, righe e totali
   *===============================================================*/
  processResult(data, { programView = false } = {}) {
    log("processResult start", {
      programView,
      recordCount: data?.records?.length || 0,
      dynamicFieldsCount: data?.dynamicFields?.length || 0
    });
    /* 1. mappa tipi dinamici */
    this.fieldConfig = {};
    (data.dynamicFields || []).forEach((f) => {
      this.fieldConfig[f.fieldApi] =
        f.Type__c?.toLowerCase().trim() || "currency";
    });

    /* 2. colonne */
    let cols = [
      ...STATIC_COLUMNS,
      ...(data.dynamicFields || []).map((f) => {
        const t = (f.Type__c || "").toLowerCase().trim();
        const numeric = t === "currency" || t === "number";
        return {
          label: f.label,
          fieldName: f.fieldApi,
          type: numeric ? t : "text",
          cellAttributes: { alignment: numeric ? "right" : "left" }
        };
      })
    ];

    if (programView) {
      cols = cols
        /* 1. tieni solo le statiche elencate in PROGRAM_VIEW_COLUMNS
                + tutte le dinamiche (che non esistono in STATIC_COLUMNS) */
        .filter(
          (c) =>
            PROGRAM_VIEW_COLUMNS.hasOwnProperty(c.fieldName) ||
            !STATIC_COLUMNS.find((s) => s.fieldName === c.fieldName)
        )
        /* 2. rinomina le etichette secondo la mappa */
        .map((c) => {
          const newLabel = PROGRAM_VIEW_COLUMNS[c.fieldName];
          return newLabel ? { ...c, label: newLabel } : c;
        });
    }
    this.columns = cols;
    log("processResult columns", {
      columnsCount: cols.length,
      columnNames: cols.map((c) => c.fieldName)
    });

    /* 3. righe */
    this.relatedData = (data.records || [])
      .map((r) => ({ ...r, recordLink: "/" + r.Id }))
      .sort((a, b) => b.Anno__c - a.Anno__c);
    log("processResult relatedData", {
      rows: this.relatedData.length,
      sample: toLogPayload(this.relatedData[0])
    });

    /* 4. totali */
    this.computeTotals();
  }

  /*──────────────────────── TOTALI ───────────────────────────────*/
  totalsList = [];

  /* euristica sul tipo campo (riusa fieldConfig/statica) */
  getFieldType(fieldName) {
    const meta = this.fieldConfig?.[fieldName];
    if (meta === "currency" || meta === "number") return meta;

    const staticCol = STATIC_COLUMNS.find((c) => c.fieldName === fieldName);
    if (
      staticCol &&
      (staticCol.type === "currency" || staticCol.type === "number")
    )
      return staticCol.type;

    if (/Numero|Count/i.test(fieldName)) return "number";
    return "text";
  }

  /*──────────────────────── TOTALI ───────────────────────────────*/
  computeTotals() {
    log("computeTotals start", {
      columns: this.columns.length,
      rows: this.relatedData.length
    });
    const fmtEUR = new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR"
    });
    const fmtINT = new Intl.NumberFormat("it-IT");

    const sums = [];

    this.columns.forEach((col) => {
      const field = col.fieldName;
      if (field === "Anno__c") return;
      /* ① Estrae i valori, ② li converte sempre in Number,
         ③ scarta NaN o null */
      const nums = this.relatedData
        .map((r) => {
          const v = r[field];
          if (v === null || v === undefined || v === "") return NaN;
          return typeof v === "number" ? v : Number(v);
        })
        .filter((v) => !isNaN(v));

      if (!nums.length) return; // nessun dato numerico da sommare

      const total = nums.reduce((a, v) => a + v, 0);

      /* tipo valuta/numero */
      const type = col.type || this.getFieldType(field);

      sums.push({
        label: col.label,
        fieldName: field,
        value: total,
        formatted:
          type === "currency" ? fmtEUR.format(total) : fmtINT.format(total)
      });
    });

    this.totalsList = sums;
    log("computeTotals result", {
      totalsCount: sums.length,
      totals: toLogPayload(sums)
    });
  }

  get showTotals() {
    return !this.recordId && this.totalsList.length > 0;
  }

  /* colonna SINISTRA: Donati, Pagati, Pagamento in corso, Fatturati, Capienza */
  get totalsLeft() {
    const order = [
      "Totale_Allocato__c", // Donati
      "Totale_Distribuito_Pagato_Formula__c", // Pagati
      "Totale_Distribuito_NON_Pagato_Formula__c", // Pagamento in corso
      "Totale_Ammontare_Fatture_formula__c", // Fatturati
      "Capienza__c" // Capienza
    ];
    return order
      .map((api) => this.totalsList.find((t) => t.fieldName === api))
      .filter(Boolean);
  }

  /* colonna DESTRA: Numero di Fatture + tutti i campi dinamici */
  get totalsRight() {
    const leftSet = new Set(this.totalsLeft.map((t) => t.fieldName));
    const right = [];

    /* Numero di Fatture come primo elemento, se presente */
    const numFat = this.totalsList.find(
      (t) => t.fieldName === "Numero_di_Fatture_formula__c"
    );
    if (numFat && !leftSet.has(numFat.fieldName)) {
      right.push(numFat);
      leftSet.add(numFat.fieldName);
    }

    /* tutti gli altri (dinamici o non inclusi a sinistra) */
    this.totalsList.forEach((t) => {
      if (!leftSet.has(t.fieldName)) right.push(t);
    });
    return right;
  }

  /* ordinamento datatable */
  onHandleSort(event) {
    const { fieldName: sortedBy, sortDirection } = event.detail;

    const clone = [...this.relatedData];
    clone.sort((x, y) => {
      const a = x[sortedBy];
      const b = y[sortedBy];
      return sortDirection === "asc" ? (a > b ? 1 : -1) : a < b ? 1 : -1;
    });

    this.relatedData = clone;
    this.sortDirection = sortDirection;
    this.sortedBy = sortedBy;
    log("onHandleSort", { sortedBy, sortDirection });
  }
}