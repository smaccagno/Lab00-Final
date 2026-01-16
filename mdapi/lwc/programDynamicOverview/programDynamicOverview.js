/*────────────────────────────────────────────
 *  ProgramDynamicOverview.js
 *  Versione “smart width” 2025-05-28
 *───────────────────────────────────────────*/
import { LightningElement, wire, track, api } from "lwc";
import { refreshApex } from "@salesforce/apex";
import getRelatedRecords from "@salesforce/apex/RetrieveProgramInfo.getRelatedRecords";
import getAvailableYears from "@salesforce/apex/RetrieveProgramInfo.getAvailableYears";

/* eslint-disable @lwc/lwc/no-async-operation */
const normalizeType = (t) => (t ?? "currency").toString().trim().toLowerCase(); // currency / number / text
const LB = "\u2028"; // line-break che funziona senza CSS
const MIN_COL_PX = 90; // nessuna colonna scende sotto questo valore
const LABEL_OUTSIDE_THRESHOLD = 12; // percentuale sotto cui la label esce dalla barra
// mappa fra i valori di data-table nel template e le chiavi usate dallo script
const TABLE_KEY_ALIAS = {
  year: "year",
  budget: "budget",
  donor: "donor",
  budgetAgg: "budgetAgg",
  donorAgg: "donorAgg"
};
/*────────────────────────────────────────────
 * ► campi numerici/valutari hard-coded
 *───────────────────────────────────────────*/
const STATIC_NUMERIC_FIELDS = {
  Anno_Reportistica__c: [
    "Ammontare_Originale_Donato__c",
    "Totale_Allocabile__c",
    "Ammontare_Distribuzioni__c",
    "Ammontare_Distribuzioni_Pagate__c",
    "Ammontare_Distribuzioni_NON_Pagate__c",
    "Totale_NON_Distribuito__c",
    "Numero_Donazioni_Anno_Corrente__c",
    "Totale_Fatturato_Budgets__c",
    "Capienza_budgets__c",
    "Totale_Numero_Fatture__c"
  ],
  Overview_Budget_per_Anno__c: [
    "Totale_Allocato__c",
    "Totale_Distribuito_Pagato_Formula__c",
    "Totale_Distribuito_NON_Pagato_Formula__c",
    "Ammontare_Pagamenti_Da_Pagare_formula__c",
    "Ammontare_Pagamenti_Fatti_formula__c",
    "Numero_di_Fatture_formula__c",
    "Totale_Ammontare_Fatture_formula__c",
    "Capienza__c"
  ],
  Reporting_Year__c: [
    "Donato_Originale_formula__c",
    "Allocabile_formula__c",
    "Allocati_Pagati__c",
    "NonAllocati_calc__c",
    "Totale_Numero_Donazioni_formula__c",
    "Totale_Fattura_formula__c",
    "Capienza_calc__c",
    "Available_Amount__c",
    "Totale_Numero_Fatture_formula__c"
  ]
};

export default class ProgramDynamicOverview extends LightningElement {
  /*────────────────────────────────────────────
   *  ► PARAMETRI
   *───────────────────────────────────────────*/
  @api recordId; // Id del Program
  @api programDevName; // DeveloperName (opz., non lo usiamo lato JS)

  /*────────────────────────────────────────────
   *  ► STATE
   *───────────────────────────────────────────*/
  /* dataset originali (non filtrati) */
  originalYearData = [];
  originalBudgetData = [];
  originalDonorData = [];

  /* dataset da mostrare */
  @track yearData = [];
  @track budgetData = [];
  @track donorData = [];

  @track programName = "";
  @track programSummaryRows = [];
  @track formattedGraphNumbers = {};
  /* aggregati */
  @track aggregatedBudgetData = [];
  @track aggregatedDonorData = [];
  @track aggregatedDonorPerYearData = [];

  /* totali */
  @track totalYearValues = {};
  @track totalBudgetValues = {};
  @track totalDonorValues = {};
  @track aggregatedTotalBudgetValues = {};
  @track aggregatedTotalDonorValues = {};
  @track aggregatedTotalDonorPerYearValues = {};
  @track isRefreshing = false;

  /* totali formattati */
  @track formattedTotalYearValues = {};
  @track formattedTotalBudgetValues = {};
  @track formattedTotalDonorValues = {};
  @track formattedAggregatedTotalBudgetValues = {};
  @track formattedAggregatedTotalDonorValues = {};
  @track formattedAggregatedTotalDonorPerYearValues = {};

  /* UI filter */
  @track yearOptions = [];
  @track selectedYear = "";
  @track budgetsAggregatiFiltered = [];
  /* campi dinamici */
  fieldConfig = {}; // <objectApi , FieldConf[]>
  dynamicCols = {}; // cache colonne già costruite
  dynamicSummaryFields = {}; // <objectApi , Set<fieldApi>>
  _headerFixed = false;
  @track smartCols = {}; // { year: ColumnDef[], budget: ColumnDef[], … }
  charMetrics = {}; // { year: [maxLenCol1, maxLenCol2, …], … }
  resizeObservers = {};
  // Mappa: master Account (15) → somma GTD Pagate
  gtdPaidByDonor = {};
  gtdPaidByDonorYearKey = {};
  wiredRelatedResult;
  perc = {
    allocabile: 0,
    trattenuta: 0,
    allocato: 0,
    nonAllocato: 0,
    pagato: 0,
    nonPagato: 0,
    fatturato: 0,
    nonFatturato: 0,
    capienza: 0
  };
  isZeroBar = {};
  isLabelOutside = {};

  /* ---------- larghezze percentuali ---------- */

  get styleAllocabile() {
    return `width:${this.perc.allocabile}%`;
  }
  get styleTrattenuta() {
    return `width:${this.perc.trattenuta}%`;
  }
  get styleAllocato() {
    return `width:${this.perc.allocato}%`;
  }
  get styleNonAllocato() {
    return `width:${this.perc.nonAllocato}%`;
  }
  get stylePagato() {
    return `width:${this.perc.pagato}%`;
  }
  get styleNonPagato() {
    return `width:${this.perc.nonPagato}%`;
  }
  get styleFatturato() {
    return `width:${this.perc.fatturato}%`;
  }
  get styleNonFatturato() {
    return `width:${this.perc.nonFatturato}%`;
  }
  get styleGhostCapienza() {
    return `width:${this.perc.fatturato}%`;
  }
  get styleCapienza() {
    return `width:${this.perc.capienza}%`;
  }

  get zeroClassDonato() {
    return this.isZeroBar.donato ? "zero-bar" : "";
  }
  get zeroClassAllocabile() {
    return this.isZeroBar.allocabile ? "zero-bar" : "";
  }
  get zeroClassTrattenuta() {
    return this.isZeroBar.trattenuta ? "zero-bar" : "";
  }
  get zeroClassAllocato() {
    return this.isZeroBar.allocato ? "zero-bar" : "";
  }
  get zeroClassNonAllocato() {
    return this.isZeroBar.nonAllocato ? "zero-bar" : "";
  }
  get zeroClassPagato() {
    return this.isZeroBar.pagato ? "zero-bar" : "";
  }
  get zeroClassNonPagato() {
    return this.isZeroBar.nonPagato ? "zero-bar" : "";
  }
  get zeroClassFatturato() {
    return this.isZeroBar.fatturato ? "zero-bar" : "";
  }
  get zeroClassNonFatturato() {
    return this.isZeroBar.nonFatturato ? "zero-bar" : "";
  }
  get zeroClassCapienza() {
    return this.isZeroBar.capienza ? "zero-bar" : "";
  }
  get labelClassAllocabile() {
    return this.isLabelOutside.allocabile ? "label-outside" : "";
  }
  get labelClassTrattenuta() {
    return this.isLabelOutside.trattenuta ? "label-outside" : "";
  }
  get labelClassAllocato() {
    return this.isLabelOutside.allocato ? "label-outside" : "";
  }
  get labelClassPagato() {
    return this.isLabelOutside.pagato ? "label-outside" : "";
  }
  get labelClassFatturato() {
    return this.isLabelOutside.fatturato ? "label-outside" : "";
  }
  get labelClassNonFatturato() {
    return this.isLabelOutside.nonFatturato ? "label-outside" : "";
  }
  get labelClassCapienza() {
    return this.isLabelOutside.capienza ? "label-outside" : "";
  }

  get labelDonato() {
    return `Donato (${this.formattedGraphNumbers.donato})`;
  }
  get labelAllocabile() {
    return `Allocabile (${this.formattedGraphNumbers.allocabile})`;
  }
  get labelTrattenuta() {
    return `Trattenuta (${this.formattedGraphNumbers.trattenuta})`;
  }
  get labelAllocato() {
    return `Allocato (${this.formattedGraphNumbers.allocato})`;
  }
  get labelPagato() {
    return `Pagato (${this.formattedGraphNumbers.pagato})`;
  }
  get labelNonFatturato() {
    return `Non Fatturato (${this.formattedGraphNumbers.nonFatturato})`;
  }
  get labelFatturato() {
    return `Fatturato (${this.formattedGraphNumbers.fatturato})`;
  }
  get labelCapienza() {
    return `Capienza (${this.formattedGraphNumbers.capienza})`;
  }
  /*────────────────────────────────────────────
   *  ► UTIL – summary fields per oggetto
   *───────────────────────────────────────────*/
  getSummaryFields(objApi) {
    return [...(this.dynamicSummaryFields[objApi] || [])];
  }

  getFieldType(objectApi, fieldApi) {
    const arr = this.fieldConfig[objectApi] || [];
    const hit = arr.find((c) => c.fieldApi === fieldApi);
    if (hit) return normalizeType(hit.dataType);

    // fallback per campi statici noti (solo in header)
    if (STATIC_NUMERIC_FIELDS[objectApi]?.includes(fieldApi)) {
      if (fieldApi.includes("Numero") || fieldApi.includes("Count")) {
        return "number";
      }
      return "currency";
    }

    return "currency"; // default finale
  }

  /*────────────────────────────────────────────
   * ► campi numerici/valutari  = statici ∪ dinamici
   *───────────────────────────────────────────*/
  getNumericFields(objectApi) {
    /* 1) statici hard-coded */
    const staticFlds = STATIC_NUMERIC_FIELDS[objectApi] || [];

    /* 2) dinamici da fieldConfig */
    const dynamicFlds = (this.fieldConfig[objectApi] || [])
      .filter((f) => {
        const t = normalizeType(f.dataType);
        return t === "number" || t === "currency";
      })
      .map((f) => f.fieldApi);

    /* 3) unione senza duplicati */
    return Array.from(new Set(staticFlds.concat(dynamicFlds)));
  }

  /* formatter centralizzato */
  formatValue(objectApi, fieldApi, value) {
    const v = value ?? 0;
    const t = normalizeType(this.getFieldType(objectApi, fieldApi));
    const num = new Intl.NumberFormat("it-IT");
    const cur = new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR"
    });
    if (t === "number") return num.format(v);
    if (t === "currency") return cur.format(v);
    /* Text o fallback */
    return v;
  }

  /*────────────────────────────────────────────
   *  ► COMBO ANNI
   *───────────────────────────────────────────*/
  @wire(getAvailableYears)
  wiredYears({ data, error }) {
    if (data) {
      const unique = Array.from(new Set(data.map((y) => y.value))).map((v) => ({
        label: v,
        value: v
      }));
      this.yearOptions = [{ label: "Tutti gli anni", value: "" }].concat(
        unique
      );
    } else if (error) {
      // eslint-disable-next-line no-console
      console.error("Errore years", error);
    }
  }

  /*────────────────────────────────────────────
   *  ► WIRE PRINCIPALE
   *───────────────────────────────────────────*/
  @wire(getRelatedRecords, { recordId: "$recordId" })
  wiredRelated(value) {
    this.wiredRelatedResult = value;
    const { data, error } = value;
    if (error) {
      console.error("Errore record", error);
      this.isRefreshing = false;
      return;
    }
    if (!data) {
      return;
    } // loading pass
    console.log("✅ Risposta completa Apex:");
    console.log(JSON.stringify(data, null, 2));
    this.enrolledIds = new Set(data.enrolledAccountIds || []);
    /* 1) campi dinamici */
    this.fieldConfig = data.fieldConfig || {};
    this.dynamicCols = {};
    this.dynamicSummaryFields = {};
    Object.keys(this.fieldConfig).forEach((o) => {
      this.dynamicSummaryFields[o] = new Set(
        this.fieldConfig[o].filter((f) => f.isSummary).map((f) => f.fieldApi)
      );
    });

    console.log("📊 BudgetData RAW:", data.records_budget);
    console.log("📊 DonorData  RAW:", data.records_donor);
    // eslint-disable-next-line no-console
    console.log("CFG", JSON.parse(JSON.stringify(this.fieldConfig)));
    /* 2) dataset */
    this.gtdPaidByDonor = data.gtdPaidByDonor || {};
    this.gtdPaidByDonorYearKey = data.gtdPaidByDonorYear || {};
    this.originalYearData = this.formatDataWithLink(data.records_anno);
    this.originalBudgetData = this.formatBudgetDataWithLink(data.records_budget)
      // ▼  filtro lato-client
      .filter(
        (r) =>
          !this.enrolledIds.size ||
          this.enrolledIds.has(r.Budget__r?.Partner__c)
      );
    this.originalDonorData = this.formatDataWithLink(data.records_donor).filter(
      (r) => !this.enrolledIds.size || this.enrolledIds.has(r.Account__c)
    );

    console.log("📊 Budget data post-filter", this.originalBudgetData);
    console.log("📊 Donor  data post-filter", this.originalDonorData);

    /* 3) aggregazioni */
    this.aggregatedBudgetData = this.calculateAggregatedBudgetData(
      this.originalBudgetData
    ).filter((r) => !this.areAllBudgetValuesZero(r));

    this.aggregatedDonorData = this.calculateAggregatedDonorData(
      this.originalDonorData
    ).filter((r) => !this.areAllDonorValuesZero(r));

    this.aggregatedDonorPerYearData = this.calculateAggregatedDonorPerYearData(
      this.originalDonorData
    );

    /* 4) totali aggregati */
    this.calculateAggregatedTotalBudgetValues();
    this.calculateAggregatedTotalDonorValues();
    this.calculateAggregatedTotalDonorPerYearValues();
    console.log("YR-cols", this.yearColumns);
    console.log("YR sample", this.yearData[0]);
    /* 5) filtro anno iniziale */
    this.applyYearFilter();
    this.buildProgramSummary();
    // dopo buildProgramSummary() o comunque dopo i totali
    this.dynamicCols = {}; // svuota la cache delle colonne dinamiche
    this.smartCols = {}; // forza un nuovo calcolo larghezze
    this.calcCharMetrics();
    this.isRefreshing = false;
  }

  /*────────────────────────────────────────────
   * ► COSTRUISCI COLONNE DINAMICHE  (tutte con totale)
   *───────────────────────────────────────────*/
  buildDynamicColumns(objectApi) {
    if (this.dynamicCols[objectApi]) {
      return this.dynamicCols[objectApi];
    }
    const cfgArr = this.fieldConfig[objectApi] || [];

    const cols = cfgArr.map((cfg) => {
      const tot = this.getFormattedTotalForField(objectApi, cfg.fieldApi);
      const k = normalizeType(cfg.dataType);
      const type =
        k === "number" ? "number" : k === "text" ? "text" : "currency";

      /* il totale viene mostrato se esiste, indipendentemente da isSummary */

      const label = tot ? `${cfg.label}${LB}${tot}` : cfg.label;

      return {
        label,
        fieldName: cfg.fieldApi,
        type,
        initialWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      };
    });

    this.dynamicCols[objectApi] = cols;
    return cols;
  }

  async handleRefreshClick() {
    if (!this.wiredRelatedResult || this.isRefreshing) return;
    this.isRefreshing = true;
    try {
      await refreshApex(this.wiredRelatedResult);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Errore refresh", e);
    } finally {
      this.isRefreshing = false;
    }
  }
  /*────────────────────────────────────────────
   * ► Totale formattato per un singolo campo (anche on-demand)
   *───────────────────────────────────────────*/
  getFormattedTotalForField(objApi, fieldApi) {
    /* 1) se il totale era già calcolato lo ri-utilizziamo */
    const map =
      {
        Anno_Reportistica__c: this.formattedTotalYearValues,
        Overview_Budget_per_Anno__c: this.formattedTotalBudgetValues,
        Reporting_Year__c: this.formattedTotalDonorValues
      }[objApi] || {};

    if (map[fieldApi]) return map[fieldApi];

    /* 2) altrimenti lo calcoliamo al volo sul dataset corrente */
    const dataKey = {
      Anno_Reportistica__c: "yearData",
      Overview_Budget_per_Anno__c: "budgetData",
      Reporting_Year__c: "donorData"
    }[objApi];

    if (!dataKey) return "";

    const rawTot = (this[dataKey] || []).reduce(
      (s, r) => s + (r[fieldApi] || 0),
      0
    );

    return rawTot ? this.formatValue(objApi, fieldApi, rawTot) : "";
  }

  /*────────────────────────────────────────────
   *  ► COLONNE (STATICHE + DINAMICHE)
   *───────────────────────────────────────────*/
  /* ——— 3.1  Year ——— */
  _yearColsBase() {
    return [
      {
        label: "Anno",
        fieldName: "linkOrText",
        type: "url",
        typeAttributes: {
          label: { fieldName: "displayName" },
          target: "_self"
        },
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Donati${LB}${this.formattedTotalYearValues.Ammontare_Originale_Donato__c || ""}`,
        fieldName: "Ammontare_Originale_Donato__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocabili${LB}${this.formattedTotalYearValues.Totale_Allocabile__c || ""}`,
        fieldName: "Totale_Allocabile__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocati\n${this.formattedTotalYearValues.Ammontare_Distribuzioni__c || ""}`,
        fieldName: "Ammontare_Distribuzioni__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagati\n${this.formattedTotalYearValues.Ammontare_Distribuzioni_Pagate__c || ""}`,
        fieldName: "Ammontare_Distribuzioni_Pagate__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Pagati\n${this.formattedTotalYearValues.Ammontare_Distribuzioni_NON_Pagate__c || ""}`,
        fieldName: "Ammontare_Distribuzioni_NON_Pagate__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Allocati\n${this.formattedTotalYearValues.Totale_NON_Distribuito__c || ""}`,
        fieldName: "Totale_NON_Distribuito__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Donazioni\n${this.formattedTotalYearValues.Numero_Donazioni_Anno_Corrente__c || ""}`,
        fieldName: "Numero_Donazioni_Anno_Corrente__c",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Fatturati\n${this.formattedTotalYearValues.Totale_Fatturato_Budgets__c || ""}`,
        fieldName: "Totale_Fatturato_Budgets__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Capienza\n${this.formattedTotalYearValues.Capienza_budgets__c || ""}`,
        fieldName: "Capienza_budgets__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Fatture\n${this.formattedTotalYearValues.Totale_Numero_Fatture__c || ""}`,
        fieldName: "Totale_Numero_Fatture__c",
        type: "number",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      }
    ].concat(this.buildDynamicColumns("Anno_Reportistica__c"));
  }

  get yearColumns() {
    return this.smartCols.year || this._yearColsBase();
  }

  /* ——— 3.2  Budget per Anno (dettaglio) ——— */
  _budgetColsBase() {
    return [
      {
        label: "Anno",
        fieldName: "Anno__c",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: "Budget",
        fieldName: "linkOrText",
        type: "url",
        typeAttributes: {
          label: { fieldName: "displayName" },
          target: "_self"
        },
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocati\n${this.formattedTotalBudgetValues.Totale_Allocato__c || ""}`,
        fieldName: "Totale_Allocato__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagati\n${this.formattedTotalBudgetValues.Totale_Distribuito_Pagato_Formula__c || ""}`,
        fieldName: "Totale_Distribuito_Pagato_Formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Pagati\n${this.formattedTotalBudgetValues.Totale_Distribuito_NON_Pagato_Formula__c || ""}`,
        fieldName: "Totale_Distribuito_NON_Pagato_Formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagamenti Aperti\n${this.formattedTotalBudgetValues.Ammontare_Pagamenti_Da_Pagare_formula__c || ""}`,
        fieldName: "Ammontare_Pagamenti_Da_Pagare_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagamenti Chiusi\n${this.formattedTotalBudgetValues.Ammontare_Pagamenti_Fatti_formula__c || ""}`,
        fieldName: "Ammontare_Pagamenti_Fatti_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Fatturati\n${this.formattedTotalBudgetValues.Totale_Ammontare_Fatture_formula__c || ""}`,
        fieldName: "Totale_Ammontare_Fatture_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Capienza\n${this.formattedTotalBudgetValues.Capienza__c || ""}`,
        fieldName: "Capienza__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Fatture\n${this.formattedTotalBudgetValues.Numero_di_Fatture_formula__c || ""}`,
        fieldName: "Numero_di_Fatture_formula__c",
        type: "number",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      }
    ].concat(this.buildDynamicColumns("Overview_Budget_per_Anno__c"));
  }

  get budgetColumns() {
    return this.smartCols.budget || this._budgetColsBase();
  }

  /* ——— 3.3  Donor (dettaglio) ——— */
  _donorColsBase() {
    return [
      {
        label: "Anno",
        fieldName: "Anno_overview__c",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: "Donatore",
        fieldName: "linkOrText",
        type: "url",
        typeAttributes: {
          label: { fieldName: "displayName" },
          target: "_self"
        },
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Donati\n${this.formattedTotalDonorValues.Donato_Originale_formula__c || ""}`,
        fieldName: "Donato_Originale_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocabili\n${this.formattedTotalDonorValues.Allocabile_formula__c || ""}`,
        fieldName: "Allocabile_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocati\n${this.formattedTotalDonorValues.Allocati_Pagati__c || ""}`,
        fieldName: "Allocati_Pagati__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Allocati\n${this.formattedTotalDonorValues.NonAllocati_calc__c || ""}`,
        fieldName: "NonAllocati_calc__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Donazioni\n${this.formattedTotalDonorValues.Totale_Numero_Donazioni_formula__c || ""}`,
        fieldName: "Totale_Numero_Donazioni_formula__c",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Fatturati\n${this.formattedTotalDonorValues.Totale_Fattura_formula__c || ""}`,
        fieldName: "Totale_Fattura_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Capienza\n${this.formattedTotalDonorValues.Capienza_calc__c || ""}`,
        fieldName: "Capienza_calc__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Fatture\n${this.formattedTotalDonorValues.Totale_Numero_Fatture_formula__c || ""}`,
        fieldName: "Totale_Numero_Fatture_formula__c",
        type: "number",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      }
    ].concat(this.buildDynamicColumns("Reporting_Year__c"));
  }

  get donorColumns() {
    return this.smartCols.donor || this._donorColsBase();
  }

  /* ——— 3.4  Budget Aggregato ——— */
  _budgetAggColsBase() {
    return [
      {
        label: "Budget",
        fieldName: "linkOrText",
        type: "url",
        typeAttributes: {
          label: { fieldName: "displayName" },
          target: "_self"
        },
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocati\n${this.formattedAggregatedTotalBudgetValues.Totale_Allocato__c || ""}`,
        fieldName: "Totale_Allocato__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagati\n${this.formattedAggregatedTotalBudgetValues.Totale_Distribuito_Pagato_Formula__c || ""}`,
        fieldName: "Totale_Distribuito_Pagato_Formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Pagati\n${this.formattedAggregatedTotalBudgetValues.Totale_Distribuito_NON_Pagato_Formula__c || ""}`,
        fieldName: "Totale_Distribuito_NON_Pagato_Formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagamenti Aperti\n${this.formattedAggregatedTotalBudgetValues.Ammontare_Pagamenti_Da_Pagare_formula__c || ""}`,
        fieldName: "Ammontare_Pagamenti_Da_Pagare_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagamenti Chiusi\n${this.formattedAggregatedTotalBudgetValues.Ammontare_Pagamenti_Fatti_formula__c || ""}`,
        fieldName: "Ammontare_Pagamenti_Fatti_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Fatturati\n${this.formattedAggregatedTotalBudgetValues.Totale_Ammontare_Fatture_formula__c || ""}`,
        fieldName: "Totale_Ammontare_Fatture_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Capienza\n${this.formattedAggregatedTotalBudgetValues.Capienza__c || ""}`,
        fieldName: "Capienza__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Fatture\n${this.formattedAggregatedTotalBudgetValues.Numero_di_Fatture_formula__c || ""}`,
        fieldName: "Numero_di_Fatture_formula__c",
        type: "number",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      }
    ].concat(this.buildDynamicColumns("Overview_Budget_per_Anno__c"));
  }

  get budgetColumnsAgg() {
    return this.smartCols.budgetAgg || this._budgetAggColsBase();
  }

  /* ——— 3.5  Donor Aggregato ——— */

  _donorAggColsBase() {
    return [
      {
        label: "Donatore",
        fieldName: "linkOrText",
        type: "url",
        typeAttributes: {
          label: { fieldName: "displayName" },
          target: "_self"
        },
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Donati\n${this.formattedAggregatedTotalDonorValues.Donato_Originale_formula__c || ""}`,
        fieldName: "Donato_Originale_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocabili\n${this.formattedAggregatedTotalDonorValues.Allocabile_formula__c || ""}`,
        fieldName: "Allocabile_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocati\n${this.formattedAggregatedTotalDonorValues.Allocati_Pagati__c || ""}`,
        fieldName: "Allocati_Pagati__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Allocati\n${this.formattedAggregatedTotalDonorValues.NonAllocati_calc__c || ""}`,
        fieldName: "NonAllocati_calc__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Donazioni\n${this.formattedAggregatedTotalDonorValues.Totale_Numero_Donazioni_formula__c || ""}`,
        fieldName: "Totale_Numero_Donazioni_formula__c",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Fatturati\n${this.formattedAggregatedTotalDonorValues.Totale_Fattura_formula__c || ""}`,
        fieldName: "Totale_Fattura_formula__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Capienza\n${this.formattedAggregatedTotalDonorValues.Capienza_calc__c || ""}`,
        fieldName: "Capienza_calc__c",
        type: "currency",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Fatture\n${this.formattedAggregatedTotalDonorValues.Totale_Numero_Fatture_formula__c || ""}`,
        fieldName: "Totale_Numero_Fatture_formula__c",
        type: "number",
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      }
    ].concat(this.buildDynamicColumns("Reporting_Year__c"));
  }

  get donorColumnsAgg() {
    return this.smartCols.donorAgg || this._donorAggColsBase();
  }

  perc = {
    allocabile: 0,
    trattenuta: 0,
    allocato: 0,
    nonAllocato: 0,
    pagato: 0,
    nonPagato: 0,
    fatturato: 0,
    nonFatturato: 0
  };

  /*────────────────────────────────────────────
   *  ► AGGREGAZIONI  (logica invariata salvo campi rimossi)
   *───────────────────────────────────────────*/
  calculateAggregatedBudgetData(budgetData) {
    const dyn = this.getSummaryFields("Overview_Budget_per_Anno__c"); // 🔹
    const grouped = budgetData.reduce((acc, r) => {
      const key = r.Budget__c;
      if (!acc[key]) {
        acc[key] = {
          Budget__c: key,
          BudgetName: r.Budget__r?.Name || "",
          Totale_Allocato__c: 0,
          Totale_Distribuito_Pagato_Formula__c: 0,
          Totale_Distribuito_NON_Pagato_Formula__c: 0,
          Ammontare_Pagamenti_Da_Pagare_formula__c: 0,
          Ammontare_Pagamenti_Fatti_formula__c: 0,
          Totale_Ammontare_Fatture_formula__c: 0,
          Numero_di_Fatture_formula__c: 0,
          Capienza__c: 0
        };
        dyn.forEach((f) => {
          acc[key][f] = 0;
        });
      }
      acc[key].Totale_Allocato__c += r.Totale_Allocato__c || 0;
      acc[key].Totale_Distribuito_Pagato_Formula__c +=
        r.Totale_Distribuito_Pagato_Formula__c || 0;
      acc[key].Totale_Distribuito_NON_Pagato_Formula__c +=
        r.Totale_Distribuito_NON_Pagato_Formula__c || 0;
      acc[key].Ammontare_Pagamenti_Da_Pagare_formula__c +=
        r.Ammontare_Pagamenti_Da_Pagare_formula__c || 0;
      acc[key].Ammontare_Pagamenti_Fatti_formula__c +=
        r.Ammontare_Pagamenti_Fatti_formula__c || 0;
      acc[key].Totale_Ammontare_Fatture_formula__c +=
        r.Totale_Ammontare_Fatture_formula__c || 0;
      acc[key].Numero_di_Fatture_formula__c +=
        r.Numero_di_Fatture_formula__c || 0;
      acc[key].Capienza__c += r.Capienza__c || 0;
      dyn.forEach((f) => {
        acc[key][f] += r[f] || 0;
      });
      return acc;
    }, {});
    return Object.values(grouped).map((o) => ({
      ...o,
      displayName: o.BudgetName,
      linkOrText: "/" + o.Budget__c
    }));
  }

  buildFatturatoPerDonatore() {
    // mappa figli → padre ricavata dai Reporting_Year__c
    const child2parent = {};
    (this.originalDonorData || []).forEach((r) => {
      if (r.Holding__c) {
        child2parent[r.Account__c.substring(0, 15)] = r.Holding__c.substring(
          0,
          15
        );
      }
    });

    // somma importi / numero fatture dei Budget del Programma
    const out = {};
    (this.originalBudgetData || []).forEach((b) => {
      const partner = b.Budget__r?.Partner__c;
      if (!partner) return;
      const master = (
        child2parent[partner.substring(0, 15)] || partner
      ).substring(0, 15);

      if (!out[master]) out[master] = { amt: 0, num: 0 };
      out[master].amt += b.Totale_Ammontare_Fatture_formula__c || 0;
      out[master].num += b.Numero_di_Fatture_formula__c || 0;
    });
    return out;
  }

  calculateAggregatedDonorData(donorData) {
    const dyn = this.getSummaryFields("Reporting_Year__c");
    const grouped = donorData.reduce((acc, r) => {
      const isAgg = !!r.Holding__c;
      const baseId = isAgg ? r.Holding__c : r.Account__c.substring(0, 15);
      if (!acc[baseId]) {
        const baseRec = donorData.find(
          (x) =>
            !x.Holding__c &&
            x.Account__c?.substring(0, 15) === baseId &&
            x.Donor_Overview__c
        );
        acc[baseId] = {
          Account__c: baseId,
          DonorName: baseRec?.Nome_Donatore__c || "",
          Donato_Originale_formula__c: 0,
          Allocabile_formula__c: 0,
          Allocati_Pagati__c: 0,
          NonAllocati_calc__c: 0,
          Capienza_calc__c: 0,
          Totale_Numero_Donazioni_formula__c: 0,
          Totale_Fattura_formula__c: 0,
          Available_Amount__c: 0,
          Totale_Numero_Fatture_formula__c: 0,
          isAggregated: isAgg,
          DonorOverviewId: baseRec?.Donor_Overview__c
        };
        dyn.forEach((f) => {
          acc[baseId][f] = 0;
        });
      }
      acc[baseId].Donato_Originale_formula__c +=
        r.Donato_Originale_formula__c || 0;
      acc[baseId].Allocabile_formula__c += r.Allocabile_formula__c || 0;
      acc[baseId].Totale_Numero_Donazioni_formula__c +=
        r.Totale_Numero_Donazioni_formula__c || 0;
      acc[baseId].Totale_Fattura_formula__c += r.Totale_Fattura_formula__c || 0;
      acc[baseId].Available_Amount__c += r.Available_Amount__c || 0;
      acc[baseId].Totale_Numero_Fatture_formula__c +=
        r.Totale_Numero_Fatture_formula__c || 0;
      dyn.forEach((f) => {
        acc[baseId][f] += r[f] || 0;
      });
      return acc;
    }, {});

    /* ---- override Fatturato & N° fatture con dati “puliti” dal Programma --- */
    const fattMap = this.buildFatturatoPerDonatore(); // { masterId ⇒ { amt, num } }

    Object.entries(fattMap).forEach(([masterId, v]) => {
      if (grouped[masterId]) {
        grouped[masterId].Totale_Fattura_formula__c = v.amt;
        grouped[masterId].Totale_Numero_Fatture_formula__c = v.num;

        // ricalcolo NON Fatturato per coerenza
        grouped[masterId].Available_Amount__c =
          (grouped[masterId].Allocabile_formula__c || 0) - v.amt;
      }
    });

    // Valorizza “Allocati_Pagati__c” a partire dalla mappa GTD pagate per Donatore
    Object.keys(grouped).forEach((master) => {
      grouped[master].Allocati_Pagati__c = (this.gtdPaidByDonor && this.gtdPaidByDonor[master]) || 0;
      grouped[master].NonAllocati_calc__c =
        (grouped[master].Allocabile_formula__c || 0) -
        (grouped[master].Allocati_Pagati__c || 0);
      grouped[master].Capienza_calc__c =
        (grouped[master].Allocati_Pagati__c || 0) -
        (grouped[master].Totale_Fattura_formula__c || 0);
    });

    return Object.values(grouped).map((o) => ({
      ...o,
      displayName: o.DonorName,
      linkOrText: o.DonorOverviewId
        ? `#/sObject/${o.DonorOverviewId}/view`
        : null
    }));
  }

  calculateAggregatedDonorPerYearData(donorData) {
    console.log("⚙️  Aggrego i seguenti donorData:", donorData);
    const grouped = {};
    const dyn = this.getSummaryFields("Reporting_Year__c");
    const parents = donorData.filter((r) => !r.Holding__c);
    parents.forEach((p) => {
      const key = `${p.Account__c.substring(0, 15)}-${p.Anno_overview__c}`;
      const children = donorData.filter(
        (c) =>
          c.Holding__c &&
          c.Holding__c === p.Account__c.substring(0, 15) &&
          c.Anno_overview__c === p.Anno_overview__c
      );
      const all = [p, ...children];

      const agg = {
        recordIdForLink: p.Id,
        Anno_overview__c: p.Anno_overview__c,
        DonorName: p.Nome_Donatore__c || "",
        Donato_Originale_formula__c: 0,
        Allocabile_formula__c: 0,
        MasterKey__c:
          (p.Holding__c || p.Account__c || "").substring(0, 15) || null,
        Totale_Numero_Donazioni_formula__c: 0,
        Totale_Fattura_formula__c: 0,
        Available_Amount__c: 0,
        Totale_Numero_Fatture_formula__c: 0,
        NonAllocati_calc__c: 0,
        Capienza_calc__c: 0,
        isAggregated: true
      };
      dyn.forEach((f) => {
        agg[f] = 0;
      });
      all.forEach((r) => {
        agg.Donato_Originale_formula__c += r.Donato_Originale_formula__c || 0;
        agg.Allocabile_formula__c += r.Allocabile_formula__c || 0;
        agg.Totale_Numero_Donazioni_formula__c +=
          r.Totale_Numero_Donazioni_formula__c || 0;
        agg.Totale_Fattura_formula__c += r.Totale_Fattura_formula__c || 0;
        agg.Available_Amount__c += r.Available_Amount__c || 0;
        agg.Totale_Numero_Fatture_formula__c +=
          r.Totale_Numero_Fatture_formula__c || 0;
        dyn.forEach((f) => {
          agg[f] += r[f] || 0;
        });
      });
      const masterKey = agg.MasterKey__c;
      const yearVal = p.Anno_overview__c || "__NO_YEAR__";
      const yearKey = masterKey ? `${masterKey}|${yearVal}` : null;
      const allocatiFromMap = yearKey
        ? this.gtdPaidByDonorYearKey[yearKey] || 0
        : 0;
      const allocatiFallback = all.reduce(
        (sum, rec) => sum + (rec.Allocati_Pagati__c || 0),
        0
      );
      const allocatiTot = allocatiFromMap || allocatiFallback;
      console.log("📌 ALLOCATI ANNUAL", {
        masterKey,
        year: yearVal,
        yearKey,
        allocatiFromMap,
        allocatiFallback,
        allocatiTot,
        records: all
      });
      agg.Allocati_Pagati__c = allocatiTot;
      agg.NonAllocati_calc__c =
        (agg.Allocabile_formula__c || 0) - allocatiTot;
      agg.Capienza_calc__c =
        allocatiTot - (agg.Totale_Fattura_formula__c || 0);
      grouped[key] = agg;
    });
    /* ordina e colora */
    const classes = ["highlight-gray", "highlight-green", "highlight-blue"];
    const byYear = {};
    Object.values(grouped).forEach((item) => {
      if (!byYear[item.Anno_overview__c]) {
        byYear[item.Anno_overview__c] = [];
      }
      byYear[item.Anno_overview__c].push(item);
    });
    let idx = 0,
      out = [];
    Object.keys(byYear)
      .sort((a, b) => b.localeCompare(a))
      .forEach((y) => {
        const cls = classes[idx % classes.length];
        byYear[y].forEach((i) => {
          out.push({
            ...i,
            displayName: i.DonorName,
            linkOrText: "/" + i.recordIdForLink,
            rowClass: cls
          });
        });
        idx++;
      });
    return out;
  }

  /*────────────────────────────────────────────
   *  ► TOTALE AGGREGATO –  ora dinamico
   *───────────────────────────────────────────*/
  calculateAggregatedTotalBudgetValues() {
    const objApi = "Overview_Budget_per_Anno__c";
    const numericFields = this.getNumericFields(objApi);

    this.aggregatedTotalBudgetValues = numericFields.reduce((tot, f) => {
      tot[f] = this.aggregatedBudgetData.reduce((s, r) => s + (r[f] || 0), 0);
      return tot;
    }, {});

    this.formatAggregatedTotalBudgetValues();
  }

  formatAggregatedTotalBudgetValues() {
    const objApi = "Overview_Budget_per_Anno__c";
    this.formattedAggregatedTotalBudgetValues = this.formatFields(
      this.aggregatedTotalBudgetValues,
      objApi
    );
  }

  calculateAggregatedTotalDonorValues() {
    const objApi = "Reporting_Year__c";
    const numericFields = this.getNumericFields(objApi);

    const masterIds = new Set(
      this.originalDonorData
        .filter((r) => !r.Holding__c) // solo i “padri”
        .map((r) => r.Account__c.substring(0, 15))
    );
    const filtered = this.aggregatedDonorData.filter((r) =>
      masterIds.has(r.Account__c)
    );

    this.aggregatedTotalDonorValues = numericFields.reduce((tot, f) => {
      tot[f] = filtered.reduce((s, r) => s + (r[f] || 0), 0);
      return tot;
    }, {});

    this.formatAggregatedTotalDonorValues();
  }

  formatAggregatedTotalDonorValues() {
    const objApi = "Reporting_Year__c";
    this.formattedAggregatedTotalDonorValues = this.formatFields(
      this.aggregatedTotalDonorValues,
      objApi
    );
  }

  calculateAggregatedTotalDonorPerYearValues() {
    const objApi = "Reporting_Year__c";
    const numericFields = this.getNumericFields(objApi);

    const masterKeys = new Set(
      this.originalDonorData
        .filter((r) => !r.Holding__c)
        .map((r) => `${r.Account__c.substring(0, 15)}-${r.Anno_overview__c}`)
    );
    const filtered = this.aggregatedDonorPerYearData.filter((r) =>
      masterKeys.has(`${r.Account__c}-${r.Anno_overview__c}`)
    );

    this.aggregatedTotalDonorPerYearValues = numericFields.reduce((tot, f) => {
      tot[f] = filtered.reduce((s, r) => s + (r[f] || 0), 0);
      return tot;
    }, {});

    this.formattedAggregatedTotalDonorPerYearValues = this.formatFields(
      this.aggregatedTotalDonorPerYearValues,
      objApi
    );
  }

  /*────────────────────────────────────────────
   *  ► FORMATTATORI GENERICI
   *───────────────────────────────────────────*/
  formatFields(values, objectApi) {
    const out = {};
    for (const f in values) {
      out[f] = this.formatValue(objectApi, f, values[f]);
    }
    return out;
  }

  /*────────────────────────────────────────────
   *  ► FILTRI / UI
   *───────────────────────────────────────────*/
  handleYearChange(evt) {
    this.selectedYear = evt.detail.value;
    this.applyYearFilter();
    this.dynamicCols = {};
  }

  applyYearFilter() {
    /* Year */
    this.yearData = (this.originalYearData || [])
      .filter((r) => !this.selectedYear || r.Name === this.selectedYear)
      .sort((a, b) => b.Name.localeCompare(a.Name));

    /* Budget */
    this.budgetData = (this.originalBudgetData || [])
      .filter(
        (r) =>
          (!this.selectedYear || r.Anno__c === this.selectedYear) &&
          !this.areAllBudgetValuesZero(r)
      )
      .sort((a, b) => b.Anno__c.localeCompare(a.Anno__c));
    /* refresh elenco GD filtrati — viene ricalcolato dal getter
        solo quando esiste un anno selezionato                     */
    this.budgetsAggregatiFiltered = this.selectedYear
      ? this.budgetsAggregatiYear
      : [];
    /* Donor */
    this.donorData = (this.aggregatedDonorPerYearData || [])
      .filter(
        (r) =>
          (!this.selectedYear || r.Anno_overview__c === this.selectedYear) &&
          !this.areAllDonorValuesZero(r)
      )
      .sort((a, b) => b.Anno_overview__c.localeCompare(a.Anno_overview__c));

    /* Totali */
    this.calculateTotalValues(
      "yearData",
      "totalYearValues",
      "formattedTotalYearValues"
    );
    this.calculateTotalValues(
      "budgetData",
      "totalBudgetValues",
      "formattedTotalBudgetValues"
    );
    this.calculateTotalValues(
      "donorData",
      "totalDonorValues",
      "formattedTotalDonorValues"
    );
    this.buildProgramSummary();
    // dopo buildProgramSummary() o comunque dopo i totali
    this.dynamicCols = {}; // svuota la cache delle colonne dinamiche
    this.smartCols = {}; // forza un nuovo calcolo larghezze
    this.calcCharMetrics();

    ["year", "budget", "donor", "budgetAgg", "donorAgg"].forEach((key) => {
      const dt = this.template.querySelector(
        `lightning-datatable[data-table="${key}"]`
      );
      if (dt) {
        const w = dt.getBoundingClientRect().width || 1000;
        this._applySmartWidths(key, w); // genera un nuovo array columns
      }
    });
  }

  /*────────────────────────────────────────
   *  ► SMART WIDTH – calcolo “peso testo”
   *───────────────────────────────────────*/
  calcCharMetrics() {
    this.charMetrics.year = this._maxLenPerColumn(
      this.yearData,
      this._yearColsBase()
    );
    this.charMetrics.budget = this._maxLenPerColumn(
      this.budgetData,
      this._budgetColsBase()
    );
    this.charMetrics.donor = this._maxLenPerColumn(
      this.donorData,
      this._donorColsBase()
    );
    // usa ora i nomi corretti dei metodi *_AggColsBase
    this.charMetrics.budgetAgg = this._maxLenPerColumn(
      this.aggregatedBudgetData,
      this._budgetAggColsBase()
    );
    this.charMetrics.donorAgg = this._maxLenPerColumn(
      this.aggregatedDonorData,
      this._donorAggColsBase()
    );
  }

  _maxLenPerColumn(data, cols) {
    return cols.map((col) => {
      const f = col.fieldName;
      const labelLen = (col.label || "").length;
      let max = labelLen;
      data.forEach((r) => {
        const val = r[f];
        const len = (val == null ? "" : val.toString()).length;
        if (len > max) max = len;
      });
      return Math.max(1, max); // evita zero
    });
  }

  /*────────────────────────────────────────
   *  ► SMART WIDTH – applica pixel
   *───────────────────────────────────────*/
  _applySmartWidths(tableKey, tablePx) {
    // recupero il “baseCols” originale
    const baseCols = this[`_${tableKey}ColsBase`]();
    // metriche caratteri per questa tabella
    const metrics = this.charMetrics[tableKey] || [];
    const totalChars = metrics.reduce((sum, n) => sum + n, 0) || 1;

    // 1) larghezze raw proporzionali
    const rawWidths = metrics.map((m) => (m / totalChars) * tablePx);

    // 2) applico il minimo
    const clamped = rawWidths.map((w) => Math.max(MIN_COL_PX, Math.round(w)));

    // 3) ri-scalo in modo che la somma sia esattamente tablePx
    const sumClamped = clamped.reduce((s, w) => s + w, 0) || 1;
    const finalWidths = clamped.map((w) =>
      Math.round((w * tablePx) / sumClamped)
    );

    // costruisco le nuove colonne con initialWidth corretto
    const newCols = baseCols.map((col, idx) => ({
      ...col,
      initialWidth: finalWidths[idx]
    }));

    // aggiorno smartCols per questa chiave e LWC ridisegnerà la datatable
    this.smartCols = { ...this.smartCols, [tableKey]: newCols };
  }

  /*────────────────────────────────────────────
   * ► TOTALE per Year / Budget / Donor  – auto-discover
   *───────────────────────────────────────────*/
  calculateTotalValues(dataKey, totalKey, formattedKey) {
    const dataset = this[dataKey] || [];
    if (!dataset.length) {
      this[totalKey] = {};
      this[formattedKey] = {};
      return;
    }

    const objApi = {
      yearData: "Anno_Reportistica__c",
      budgetData: "Overview_Budget_per_Anno__c",
      donorData: "Reporting_Year__c"
    }[dataKey];

    /* tutti i campi numerici/valutari (statici + dinamici)                      */
    const numericFields = this.getNumericFields(objApi);

    this[totalKey] = numericFields.reduce((tot, f) => {
      tot[f] = dataset.reduce((s, r) => s + (r[f] || 0), 0);
      return tot;
    }, {});

    this[formattedKey] = this.formatFields(this[totalKey], objApi);
  }

  /*────────────────────────────────────────────
   *  ► UTILITÀ VARIE
   *───────────────────────────────────────────*/
  areAllBudgetValuesZero(rec) {
    const dyn = this.getSummaryFields("Overview_Budget_per_Anno__c");
    if (dyn.some((f) => rec[f] && rec[f] !== 0)) return false;

    const flds = [
      "Totale_Allocato__c",
      "Totale_Distribuito_Pagato_Formula__c",
      "Totale_Distribuito_NON_Pagato_Formula__c",
      "Ammontare_Pagamenti_Da_Pagare_formula__c",
      "Ammontare_Pagamenti_Fatti_formula__c",
      "Numero_di_Fatture_formula__c",
      "Totale_Ammontare_Fatture_formula__c",
      "Capienza__c"
    ];
    return flds.every((f) => !rec[f] || rec[f] === 0);
  }

  areAllDonorValuesZero(rec) {
    const dyn = this.getSummaryFields("Reporting_Year__c");
    if (dyn.some((f) => rec[f] && rec[f] !== 0)) return false;

    const flds = [
      "Donato_Originale_formula__c",
      "Allocabile_formula__c",
      "Allocati_Pagati__c",
      "NonAllocati_calc__c",
      "Capienza_calc__c",
      "Totale_Numero_Donazioni_formula__c",
      "Totale_Fattura_formula__c",
      "Available_Amount__c",
      "Totale_Numero_Fatture_formula__c"
    ];
    return flds.every((f) => !rec[f] || rec[f] === 0);
  }

  formatDataWithLink(data) {
    return (data || []).map((r) => ({
      ...r,
      displayName:
        r.Nome_Donatore__c || (r.Budget__r ? r.Budget__r.Name : r.Name),
      linkOrText: "/" + r.Id,
      Capienza__c:
        (r.Totale_Allocato__c || 0) -
        (r.Totale_Ammontare_Fatture_formula__c || 0)
    }));
  }
  formatBudgetDataWithLink(data) {
    return (data || []).map((r) => ({
      ...r,
      displayName: r.Budget__r?.Name || r.Name,
      linkOrText: "/" + r.Id,
      Capienza__c:
        (r.Totale_Allocato__c || 0) -
        (r.Totale_Ammontare_Fatture_formula__c || 0)
    }));
  }

  get budgetsAggregati() {
    /* lista usata dal template for:each  */
    return this.aggregatedBudgetData.map((r) => ({
      id: r.Budget__c, // chiave univoca (Gift Designation)
      name: r.BudgetName // lo stesso testo che appare nella tabella Budget
    }));
  }

  get budgetsAggregatiYear() {
    /* usa budgetData, che è già filtrato da applyYearFilter() */
    const uniq = new Map(); // evita duplicati
    (this.budgetData || []).forEach((r) => {
      if (!uniq.has(r.Budget__c)) {
        uniq.set(r.Budget__c, {
          id: r.Budget__c,
          name: r.Budget__r ? r.Budget__r.Name : r.displayName
        });
      }
    });
    return [...uniq.values()];
  }

  renderedCallback() {
    // 1) patch CSS per le intestazioni delle datatable
    this.template.querySelectorAll("lightning-datatable").forEach((dt) => {
      if (!dt.dataset.headerFixed && dt.shadowRoot) {
        const style = document.createElement("style");
        style.textContent = `
                thead th .slds-truncate {
                    white-space: pre-line !important;
                    max-width: 100% !important;
                }`;
        dt.shadowRoot.appendChild(style);
        dt.dataset.headerFixed = "true";
      }
    });

    // 2) smart-width + kick-off immediato
    this.template.querySelectorAll("lightning-datatable").forEach((dt) => {
      const rawKey = dt.dataset.table;
      if (!rawKey) return;

      // 2a) risolvo l'alias
      const key = TABLE_KEY_ALIAS[rawKey];
      if (!key) return;

      // 2b) registro il ResizeObserver (una sola volta per tabella)
      if (!this.resizeObservers[key]) {
        const ro = new ResizeObserver((entries) => {
          entries.forEach((e) =>
            this._applySmartWidths(key, e.contentRect.width)
          );
        });
        ro.observe(dt);
        this.resizeObservers[key] = ro;
      }

      // 2c) kick-off: applico subito lo smart-width al primo render
      if (this.smartCols[key] === undefined) {
        const width = dt.getBoundingClientRect().width;
        this._applySmartWidths(key, width);
      }
    });
  }

  disconnectedCallback() {
    Object.values(this.resizeObservers).forEach((ro) => ro.disconnect());
  }

  /**
   * Crea l’array { label, value, note? } usato nel lightning-layout iniziale.
   * Viene richiamato sia al load sia dopo il filtro per anno.
   */
  buildProgramSummary() {
    /* 1) nome programma (basta il primo record anno, se presente) */
    if (this.originalYearData.length) {
      this.programName = this.originalYearData[0].Program__r?.Name || "—";
    }

    /* 2) righe valori: prendiamo direttamente i totali già formattati */
    this.programSummaryRows = [
      {
        label: "Donato",
        value:
          this.formattedAggregatedTotalDonorValues.Donato_Originale_formula__c
      },
      {
        label: "Allocabile",
        value: this.formattedAggregatedTotalDonorValues.Allocabile_formula__c
      },
      {
        label: "Allocato",
        value: this.formattedAggregatedTotalBudgetValues.Totale_Allocato__c,
        note: "Pagato + NON Pagato"
      },
      {
        label: "Pagato",
        value:
          this.formattedAggregatedTotalBudgetValues
            .Totale_Distribuito_Pagato_Formula__c
      },
      {
        label: "NON Pagato",
        value:
          this.formattedAggregatedTotalBudgetValues
            .Totale_Distribuito_NON_Pagato_Formula__c
      },
      {
        label: "NON Allocato",
        value: this.formattedTotalYearValues.Totale_NON_Distribuito__c
      },
      {
        label: "Num Donazioni",
        value:
          this.formattedAggregatedTotalDonorValues
            .Totale_Numero_Donazioni_formula__c
      },
      {
        label: "Fatturato",
        value:
          this.formattedAggregatedTotalBudgetValues
            .Totale_Ammontare_Fatture_formula__c
      },
      {
        label: "Capienza",
        value: this.formattedAggregatedTotalBudgetValues.Capienza__c
      },
      {
        label: "Num Fatture",
        value:
          this.formattedAggregatedTotalBudgetValues.Numero_di_Fatture_formula__c
      },
      {
        label: "Pagamenti Aperti",
        value:
          this.formattedAggregatedTotalBudgetValues
            .Ammontare_Pagamenti_Da_Pagare_formula__c
      },
      {
        label: "Pagamenti Chiusi",
        value:
          this.formattedAggregatedTotalBudgetValues
            .Ammontare_Pagamenti_Fatti_formula__c
      },
      {
        label: "NON Fatturati",
        value: this.formattedAggregatedTotalDonorValues.Available_Amount__c
      }
    ];

    /* ---------- dati per il grafico ---------- */
    const money = (v) =>
      Number(
        (v || "0")
          .replace(/[^\d,-]/g, "")
          .replace(".", "")
          .replace(",", ".")
      ); // €1.234,56 → 1234.56

    const donato = money(
      this.formattedAggregatedTotalDonorValues.Donato_Originale_formula__c
    );
    const allocabile = money(
      this.formattedAggregatedTotalDonorValues.Allocabile_formula__c
    );
    const trattenuta = donato - allocabile;

    const allocato = money(
      this.formattedAggregatedTotalBudgetValues.Totale_Allocato__c
    );
    const nonAllocato = allocabile - allocato;

    const pagato = money(
      this.formattedAggregatedTotalBudgetValues
        .Totale_Distribuito_Pagato_Formula__c
    );
    const nonPagato = allocato - pagato;

    const fatturato = money(
      this.formattedAggregatedTotalBudgetValues
        .Totale_Ammontare_Fatture_formula__c
    );
    const nonFatturato = allocato - fatturato;

    const capienza = money(
      this.formattedAggregatedTotalBudgetValues.Capienza__c
    );

    /* 1) salviamo i totali (servono per % e label) */
    this.totaleDonato = donato;
    this.totFatturato = fatturato;
    this.totCapienza = capienza;
    this.totaleNonAllocato = nonAllocato;
    this.totaleNonPagato = nonPagato;
    this.totaleNonFatturato = nonFatturato;

    /* 2) percentuali (min 2 %) */
    const pct = (x) => (donato ? (x / donato) * 100 : 0);

    this.perc = {
      allocabile: pct(allocabile),
      trattenuta: pct(trattenuta),
      allocato: pct(allocato),
      nonAllocato: pct(nonAllocato),
      pagato: pct(pagato),
      nonPagato: pct(nonPagato),
      fatturato: pct(fatturato),
      nonFatturato: pct(nonFatturato),
      capienza: pct(capienza)
    };
    const THRESHOLD = 1; // se <1 % la rappresentiamo come linea
    this.isZeroBar = {};
    this.isLabelOutside = {};
    Object.keys(this.perc).forEach((k) => {
      const pctValue = this.perc[k] ?? 0;
      const normalized = Math.abs(pctValue);
      this.isZeroBar[k] = pctValue < THRESHOLD;
      this.isLabelOutside[k] =
        normalized < LABEL_OUTSIDE_THRESHOLD || this.isZeroBar[k];
    });

    /* 3) valori formattati da mostrare nel template */
    this.formattedGraphNumbers = {
      donato:
        this.formattedAggregatedTotalDonorValues.Donato_Originale_formula__c,
      allocabile:
        this.formattedAggregatedTotalDonorValues.Allocabile_formula__c,
      allocato: this.formattedAggregatedTotalBudgetValues.Totale_Allocato__c,
      trattenuta: this.formatValue(
        "Reporting_Year__c",
        "Donato_Originale_formula__c",
        trattenuta
      ),
      pagato:
        this.formattedAggregatedTotalBudgetValues
          .Totale_Distribuito_Pagato_Formula__c,
      nonPagato: this.formatValue(
        "Overview_Budget_per_Anno__c",
        "Totale_Distribuito_NON_Pagato_Formula__c",
        nonPagato
      ),
      nonAllocato: this.formatValue(
        "Overview_Budget_per_Anno__c",
        "Totale_NON_Distribuito__c",
        nonAllocato
      ),
      fatturato:
        this.formattedAggregatedTotalBudgetValues
          .Totale_Ammontare_Fatture_formula__c,
      nonFatturato: this.formatValue(
        "Reporting_Year__c",
        "Available_Amount__c",
        nonFatturato
      ),
      capienza: this.formattedAggregatedTotalBudgetValues.Capienza__c
    };
  }
}