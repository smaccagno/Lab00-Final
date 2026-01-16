/*──────────────────────────────────────────────
 * TicketList.js  – LWC
 * Rev. 2025-06-01
 *────────────────────────────────────────────*/
import { LightningElement, api, wire, track } from "lwc";
import getRelatedRecords from "@salesforce/apex/TicketController.getRelatedRecords";
import getAvailableYears from "@salesforce/apex/TicketController.getAvailableYears";
import getBudgetId from "@salesforce/apex/TicketController.getBudgetId";
import getAvailableBudgets from "@salesforce/apex/TicketController.getAvailableBudgets";
import getAllComuni from "@salesforce/apex/TicketController.getAllComuni";
import getAvailableTypes from "@salesforce/apex/TicketController.getAvailableTypes";

// ↳ EXPORT
import SheetJS from "@salesforce/resourceUrl/SheetJS";
import { loadScript } from "lightning/platformResourceLoader";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

const PAGE_SIZE = 50;

export default class Biglietti extends LightningElement {
  /*────────────────── STATE */
  @api recordId;
  @track relatedData = [];
  @track yearOptions = [];
  @track budgetOptions = [];
  @track cityOptions = [];
  @track provinceOptions = [];
  @track regionOptions = [];

  @track typeOptions = [];
  selectedType = "";

  @track noBudgetFound = false; // ► TRUE ⇒ UI bloccata
  get uiDisabled() {
    // ► getter unico per il template
    return this.noBudgetFound;
  }
  selectedYear = String(new Date().getFullYear());
  selectedMonth = "";
  monthOptions = [
    { label: "Tutti i Mesi", value: "" },
    { label: "Gennaio", value: "1" },
    { label: "Febbraio", value: "2" },
    { label: "Marzo", value: "3" },
    { label: "Aprile", value: "4" },
    { label: "Maggio", value: "5" },
    { label: "Giugno", value: "6" },
    { label: "Luglio", value: "7" },
    { label: "Agosto", value: "8" },
    { label: "Settembre", value: "9" },
    { label: "Ottobre", value: "10" },
    { label: "Novembre", value: "11" },
    { label: "Dicembre", value: "12" }
  ];
  invoiceNumberFilter = "";

  selectedBudgetId = "";
  hideBudget = false; // → combobox nascosta
  userBudgetId = ""; // budget fisso (se DEFAULT_PRG__c = false)

  selectedCity = "";
  selectedProvince = "";
  selectedRegion = "";
  allComuniData = [];

  /* loader / paging */
  isLoadingInit = true;
  isLoadingMore = false;
  allLoaded = false;
  offset = 0;

  /* totali */
  totalTickets = 0; // somma Uses__c
  totalAmount = 0; // somma Price__c

  /* excel */
  sheetJsLoaded = false;
  isExporting = false;

  /* sorting */
  sortDirection = "asc";
  sortedBy = "";

  /*────────────────── INIT */
  /*────────────────── INIT */
  connectedCallback() {
    console.log("[TicketList] connectedCallback – init");

    getAvailableTypes()
      .then((data) => {
        this.typeOptions = [
          { label: "Tutte le Tipologie", value: "" },
          ...data.map((t) => ({ label: t, value: t }))
        ];
      })
      .catch((err) => console.error("Errore getAvailableTypes", err));

    getBudgetId()
      .then((bw) => {
        console.log("[TicketList] getBudgetId ➜", JSON.stringify(bw));

        if (!bw || !bw.value) {
          console.warn(
            "[TicketList] nessun Budget associato all’utente – UI bloccata"
          );
          this.noBudgetFound = true;
          this.isLoadingInit = false;
          return Promise.resolve(); // short-circuit
        }

        // ► budget presente
        this.hideBudget = !bw.isDefault;
        this.userBudgetId = this.hideBudget ? bw.value : "";

        console.log(
          "[TicketList] hideBudget:",
          this.hideBudget,
          "| userBudgetId:",
          this.userBudgetId
        );

        // se la combobox Budget è visibile, carico le opzioni
        return this.hideBudget ? [] : getAvailableBudgets();
      })
      .then((budgets) => {
        console.log(
          "[TicketList] getAvailableBudgets ➜",
          budgets?.length || 0,
          "record(s)"
        );

        if (budgets && budgets.length) {
          this.budgetOptions = [
            { label: "Tutti i Budget", value: "" },
            ...budgets
          ];
        }
      })
      .finally(() => {
        console.log("[TicketList] init – noBudgetFound:", this.noBudgetFound);
        if (!this.noBudgetFound) this.reloadAll();
      });
  }

  renderedCallback() {
    if (!this.sheetJsLoaded) {
      loadScript(this, SheetJS)
        .then(() => (this.sheetJsLoaded = true))
        .catch((e) => console.error("SheetJS", e));
    }
  }

  get mustDisableYear() {
    return this.selectedType === "Abbonamento";
  }

  get disableYearFilter() {
    return this.mustDisableYear || this.uiDisabled;
  }

  /*────────────────── WIRE */
  @wire(getAvailableYears)
  wiredYears({ error, data }) {
    if (data) {
      this.yearOptions = [
        { label: "Tutti gli anni", value: "" },
        ...data.map((y) => ({ label: y, value: y }))
      ];
    } else if (error) console.error(error);
  }

  @wire(getAllComuni)
  wiredComuni({ error, data }) {
    if (data) {
      this.allComuniData = data;
      this.buildCityProvinceRegionOptions();
    } else if (error) console.error(error);
  }

  /*────────────────── BUILD LOCATION LISTS */
  buildCityProvinceRegionOptions() {
    let list = this.allComuniData;
    if (this.selectedRegion)
      list = list.filter((c) => c.region === this.selectedRegion);
    if (this.selectedProvince)
      list = list.filter((c) => c.province === this.selectedProvince);
    if (this.selectedCity)
      list = list.filter((c) => c.name === this.selectedCity);

    const pick = (arr) => arr.sort().map((n) => ({ label: n, value: n }));
    const cities = [...new Set(list.map((c) => c.name))];
    const provinces = [...new Set(list.map((c) => c.province).filter(Boolean))];
    const regions = [...new Set(list.map((c) => c.region).filter(Boolean))];

    this.cityOptions = [
      { label: "Tutti i Comuni", value: "" },
      ...pick(cities)
    ];
    this.provinceOptions = [
      { label: "Tutte le Province", value: "" },
      ...pick(provinces)
    ];
    this.regionOptions = [
      { label: "Tutte le Regioni", value: "" },
      ...pick(regions)
    ];
  }

  /*────────────────── HANDLERS – filtri */

  handleYearChange = (e) => {
    if (this.uiDisabled) return;
    this.selectedYear = e.detail.value;
    this.reloadAll();
  };
  handleMonthChange = (e) => {
    if (this.uiDisabled) return;
    this.selectedMonth = e.detail.value;
    this.reloadAll();
  };
  handleInvoiceNumberChange = (e) => {
    if (this.uiDisabled) return;
    this.invoiceNumberFilter = e.detail.value;
    this.reloadAll();
  };
  handleBudgetChange = (e) => {
    if (this.uiDisabled) return;
    this.selectedBudgetId = e.detail.value;
    this.reloadAll();
  };

  handleTypeChange = (e) => {
    if (this.uiDisabled) return;
    this.selectedType = e.detail.value;

    // Se "Abbonamento", disattiva anno
    if (this.selectedType === "Abbonamento") {
      this.selectedYear = "";
    }

    this.reloadAll();
  };

  handleCityChange(e) {
    if (this.uiDisabled) return;
    this.selectedCity = e.detail.value;
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }
  handleProvinceChange(e) {
    if (this.uiDisabled) return;
    this.selectedProvince = e.detail.value;
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }
  handleRegionChange(e) {
    if (this.uiDisabled) return;
    this.selectedRegion = e.detail.value;
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }

  resetCity() {
    if (this.uiDisabled) return;
    this.selectedCity = "";
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }
  resetProvince() {
    if (this.uiDisabled) return;
    this.selectedProvince = "";
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }
  resetRegion() {
    if (this.uiDisabled) return;
    this.selectedRegion = "";
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }

  /*────────────────── DATATABLE COLUMNS */
  get columns() {
    const base = [
      {
        label: "Codice Ticket",
        fieldName: "recordLink",
        type: "url",
        typeAttributes: { label: { fieldName: "Name" }, target: "_self" }
      },
      {
        label: "Offerta",
        fieldName: "offerLink",
        type: "url",
        typeAttributes: { label: { fieldName: "offerName" }, target: "_self" }
      },
      {
        label: "Spettacolo",
        fieldName: "showLink",
        type: "url",
        typeAttributes: { label: { fieldName: "showName" }, target: "_self" }
      },
      { label: "Quantità", fieldName: "Uses__c", type: "number" },
      {
        label: "Prezzo (€)",
        fieldName: "Price__c",
        type: "currency",
        typeAttributes: { currencyCode: "EUR" }
      },
      {
        label: "Fattura",
        fieldName: "invoiceLink",
        type: "url",
        typeAttributes: { label: { fieldName: "invoiceName" }, target: "_self" }
      },
      { label: "Numero Fattura", fieldName: "invoiceNumber" },
      { label: "Comune", fieldName: "City__c" },
      { label: "Provincia", fieldName: "Province__c" },
      { label: "Regione", fieldName: "Region__c" }
    ];
    if (!this.hideBudget) {
      base.push(
        { label: "Budget", fieldName: "budgetName" },
        { label: "Donatore", fieldName: "accountName" }
      );
    }
    if (this.selectedType !== "Abbonamento") {
      base.push({
        label: "Data Spettacolo",
        fieldName: "ShowDate",
        type: "date"
      });
    }

    return base;
  }

  /*────────────────── SORT */
  sortBy(field, reverse) {
    return (a, b) => reverse * ((a[field] > b[field]) - (b[field] > a[field]));
  }
  onHandleSort(event) {
    const { fieldName, sortDirection } = event.detail;
    this.relatedData = [...this.relatedData].sort(
      this.sortBy(fieldName, sortDirection === "asc" ? 1 : -1)
    );
    this.sortedBy = fieldName;
    this.sortDirection = sortDirection;
  }

  /*────────────────── LOAD DATA */
  async loadData(reset = false) {
    if (this.uiDisabled || this.isLoadingMore) return;

    if (reset) {
      this.offset = 0;
      this.allLoaded = false;
      this.relatedData = [];
      this.isLoadingInit = true;
    } else {
      this.isLoadingMore = true;
    }

    try {
      const result = await getRelatedRecords({
        year: this.selectedYear,
        month: this.selectedMonth,
        invoiceNumber: this.invoiceNumberFilter,
        budgetId: this.hideBudget
          ? this.userBudgetId
          : this.selectedBudgetId || "",
        limitSize: PAGE_SIZE,
        offsetSize: this.offset,
        city: this.selectedCity,
        province: this.selectedProvince,
        region: this.selectedRegion,
        type: this.selectedType
      });

      const rows = result.records.map((r) => ({
        Id: r.Id,
        Name: r.Name,
        Uses__c: r.Uses__c,
        Price__c: r.Price__c,
        City__c: r.City__c,
        Province__c: r.Province__c,
        Region__c: r.Region__c,
        recordLink: "/" + r.Id,
        offerLink: r.TicketAvailability__c
          ? "/" + r.TicketAvailability__c
          : "#",
        offerName: r.TicketAvailability__r
          ? r.TicketAvailability__r.Name
          : "N/A",
        showLink: r.Show__c ? "/" + r.Show__c : "#",
        showName: r.Show__r ? r.Show__r.Name : "N/A",
        ShowDate: r.Show__r ? r.Show__r.Datetime__c : null,
        invoiceLink: r.Invoice__c ? "/" + r.Invoice__c : "#",
        invoiceName: r.Invoice__r ? r.Invoice__r.Name : "N/A",
        invoiceNumber: r.Invoice__r ? r.Invoice__r.Invoice_Number__c : "",
        budgetName: r.Invoice__r?.Budget__r?.Name ?? "N/A",
        accountName: r.Invoice__r?.Account__r?.Name ?? "N/A",
        Type__c: r.Type__c
      }));

      this.relatedData = [...this.relatedData, ...rows];
      this.offset += rows.length;
      if (rows.length < PAGE_SIZE) this.allLoaded = true;

      if (reset) {
        this.totalTickets = result.totalUses ?? 0;
        this.totalAmount = result.totalAmount;
      }
    } catch (e) {
      console.error("getRelatedRecords", e);
    } finally {
      this.isLoadingInit = false;
      this.isLoadingMore = false;
    }
  }

  handleLoadMore() {
    if (!this.allLoaded && !this.isLoadingMore) {
      this.loadData(false);
    }
  }

  reloadAll() {
    if (this.uiDisabled) {
      this.relatedData = [];
      this.totalTickets = this.totalAmount = 0;
      return;
    }
    this.loadData(true);
  }

  /*────────────────── EXPORT EXCEL */
  exportAllRecords() {
    if (this.uiDisabled) return;
    this.exportExcel(true);
  }
  exportFilteredRecords() {
    if (this.uiDisabled) return;
    this.exportExcel(false);
  }

  buildExcelFileName(includeFilters) {
    const now = new Date();
    const pad = (x) => String(x).padStart(2, "0");
    let name = `Ticket_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;

    if (includeFilters) {
      const p = [];
      if (this.selectedYear) p.push(this.selectedYear);
      if (this.selectedMonth)
        p.push(
          this.monthOptions.find((m) => m.value === this.selectedMonth)?.label
        );
      if (!this.hideBudget && this.selectedBudgetId)
        p.push(
          this.budgetOptions.find((b) => b.value === this.selectedBudgetId)
            ?.label
        );
      if (p.length) name += "_" + p.join("-");
    }
    return name.replace(/\s+/g, "_") + ".xlsx";
  }

  exportExcel(fullExport = false) {
    if (!this.sheetJsLoaded) return;
    this.isExporting = true;

    const params = {
      year: fullExport ? "" : this.selectedYear,
      month: fullExport ? "" : this.selectedMonth,
      invoiceNumber: "",
      budgetId: fullExport
        ? ""
        : this.hideBudget
          ? this.userBudgetId
          : this.selectedBudgetId || "",
      limitSize: 100000,
      offsetSize: 0,
      city: fullExport ? "" : this.selectedCity,
      province: fullExport ? "" : this.selectedProvince,
      region: fullExport ? "" : this.selectedRegion,
      type: this.selectedType
    };

    getRelatedRecords(params)
      .then((res) => {
        const data = res.records.map((r) => {
          const row = {
            Codice_Ticket: r.Name,
            Offerta: r.TicketAvailability__r?.Name || "",
            Spettacolo: r.Show__r?.Name || "",
            Data: r.Show__r?.Datetime__c || "",
            Quantità: r.Uses__c,
            Importo: r.Price__c,
            Comune: r.City__c || "",
            Provincia: r.Province__c || "",
            Regione: r.Region__c || "",
            Numero_Fattura: r.Invoice__r?.Invoice_Number__c || ""
          };
          if (!this.hideBudget) {
            row.Budget = r.Invoice__r?.Budget__r?.Name || "";
            row.Donatore = r.Invoice__r?.Account__r?.Name || "";
          }
          return row;
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Ticket");
        XLSX.writeFile(wb, this.buildExcelFileName(!fullExport));

        this.dispatchEvent(
          new ShowToastEvent({
            title: "Esportazione completata",
            message: "File Excel generato con successo.",
            variant: "success"
          })
        );
      })
      .catch((err) => {
        console.error(err);
        this.dispatchEvent(
          new ShowToastEvent({
            title: "Errore export",
            message: "Problemi durante l’esportazione.",
            variant: "error"
          })
        );
      })
      .finally(() => (this.isExporting = false));
  }
}