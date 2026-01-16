import { LightningElement, api, wire, track } from "lwc";
import getRelatedRecords from "@salesforce/apex/VisiteMediche.getRelatedRecords";
import getAvailableYears from "@salesforce/apex/VisiteMediche.getAvailableYears";
import getTipiVisita from "@salesforce/apex/VisiteMediche.getTipiVisita";
import getBeneficiaryTypes from "@salesforce/apex/VisiteMediche.getBeneficiaryTypes";
import getBudgetId from "@salesforce/apex/VisiteMediche.getBudgetId";
import getAvailableBudgets from "@salesforce/apex/VisiteMediche.getAvailableBudgets";
import getAllComuni from "@salesforce/apex/VisiteMediche.getAllComuni";
import getAvailableDonors from "@salesforce/apex/VisiteMediche.getAvailableDonors";

// -------------- ❇️  IMPORT per esportare -------------
import SheetJS from "@salesforce/resourceUrl/SheetJS";
import { loadScript } from "lightning/platformResourceLoader";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
// -----------------------------------------------------

const PAGE_SIZE = 50;

export default class VisiteMediche extends LightningElement {
  @api recordId;
  @track relatedData = [];
  @track noBudgetFound = false; // TRUE ⇒ componente bloccato

  get uiDisabled() {
    return this.noBudgetFound; // true ⇒ tutti i campi non editabili
  }

  totalMinutes = 0;
  totalVisits = 0;
  totalAmount = 0;
  // Filtri e setup
  yearOptions = [];
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
  selectedBeneficiaryType = "";
  beneficiaryTypeOptions = [];
  @track budgetOptions = [];
  @track selectedBudgetId = "";
  @track donorOptions = [];
  @track selectedDonorId = "";
  @track tipoVisite = [];
  @track selectedTipoVisitaName = "";
  @track selectedTipoVisite = [];
  @track filteredSuggestions = [];
  @track tipoVisitaDropdownVisible = false;
  @track showTipoVisitaError = false;

  @track hideBudget = false; // se true → combobox nascosta
  @track allComuniData = [];
  userBudgetId = ""; // id del budget “fisso” (solo se NON di default)

  isLoadingInit = true; // ❗ spinner centrale iniziale
  isLoadingMore = false; // ❗ spinner coda datatable
  sortDirection = "asc";
  sortedBy = "";
  invoiceNumberFilter = "";
  budgetId = null;

  pageSize = PAGE_SIZE;
  offset = 0;
  allLoaded = false;

  sheetJsLoaded = false;
  isExporting = false; // mostra spinner

  @track cityOptions = [];
  @track provinceOptions = [];
  @track regionOptions = [];

  @track selectedCity = "";
  @track selectedProvince = "";
  @track selectedRegion = "";

  get mustChooseProgram() {
    return this.noBudgetFound; // o altra logica tua se serve
  }

  connectedCallback() {
    console.log("[VisiteList] connectedCallback – init");

    getBudgetId()
      .then((bw) => {
        console.log("[VisiteList] getBudgetId ➜", JSON.stringify(bw));

        if (!bw || !bw.value) {
          console.warn(
            "[VisiteList] nessun Budget associato all’utente – UI bloccata"
          );
          this.noBudgetFound = true;
          this.isLoadingInit = false;
          return Promise.resolve(); // short-circuit
        }

        // ► budget presente
        this.hideBudget = !bw.isDefault;
        this.userBudgetId = bw.value; // 👈 FIX: valorizzo sempre userBudgetId

        console.log(
          "[VisiteList] hideBudget:",
          this.hideBudget,
          "| userBudgetId:",
          this.userBudgetId
        );

        // se la combobox Budget è visibile, carico le opzioni budget in parallelo al caricamento donatori
        return this.hideBudget ? [] : getAvailableBudgets();
      })
      .then((budgets) => {
        console.log(
          "[VisiteList] getAvailableBudgets ➜",
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
      .then(() => this.reloadDonors())
      .finally(() => {
        console.log("[VisiteList] init – noBudgetFound:", this.noBudgetFound);
        if (!this.noBudgetFound) {
          console.log("✅ Chiamo reloadAll con budgetId:", this.userBudgetId);
          this.reloadAll();
        }
      });
  }

  renderedCallback() {
    // Carico SheetJS una sola volta
    if (!this.sheetJsLoaded) {
      loadScript(this, SheetJS)
        .then(() => {
          this.sheetJsLoaded = true;
        })
        .catch((err) => console.error("Errore SheetJS:", err));
    }
  }

  handleCityChange(event) {
    if (this.uiDisabled) return;
    this.selectedCity = event.detail.value;
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }
  handleProvinceChange(event) {
    if (this.uiDisabled) return;
    this.selectedProvince = event.detail.value;
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }
  handleRegionChange(event) {
    if (this.uiDisabled) return;
    this.selectedRegion = event.detail.value;
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }

  resetCity() {
    this.selectedCity = "";
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }
  resetProvince() {
    this.selectedProvince = "";
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }
  resetRegion() {
    this.selectedRegion = "";
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }

  @wire(getAvailableYears)
  wiredYears({ error, data }) {
    if (data) {
      console.log("✅ Anni ricevuti:", JSON.stringify(data));
      this.yearOptions = [
        { label: "Tutti gli anni", value: "" },
        ...data.map((year) => ({ label: year, value: year }))
      ];
    } else if (error) {
      console.error(
        "❌ Errore nel recupero anni:",
        error.body?.message || JSON.stringify(error)
      );
    }
  }

  @wire(getBeneficiaryTypes)
  wiredBeneficiaries({ error, data }) {
    if (data) {
      console.log("✅ Tipi Beneficiari ricevuti:", JSON.stringify(data));
      this.beneficiaryTypeOptions = [
        { label: "Tutti i Beneficiari", value: "" },
        ...data.map((b) => ({ label: b, value: b }))
      ];
    } else if (error) {
      console.error(
        "❌ Errore nel recupero tipi beneficiari:",
        error.body?.message || JSON.stringify(error)
      );
    }
  }

  @wire(getTipiVisita)
  wiredTipiVisita({ error, data }) {
    if (data) {
      console.log("✅ Tipi Visita ricevuti:", JSON.stringify(data));
      this.tipoVisite = data.map((t) => t.Name);
    } else if (error) {
      console.error(
        "❌ Errore nel recupero tipi visita:",
        error.body?.message || JSON.stringify(error)
      );
    }
  }

  /* ---------------- comuni ---------------- */
  @wire(getAllComuni)
  wiredComuni({ error, data }) {
    if (data) {
      this.allComuniData = data;
      this.buildCityProvinceRegionOptions();
    } else if (error) console.error(error);
  }

  get hasSelectedTipoVisite() {
    return this.selectedTipoVisite.length > 0;
  }

  // Handlers (tutti i filtri chiamano solo reloadAll)
  handleResetTipoVisite() {
    if (this.uiDisabled) return;
    this.selectedTipoVisite = [];
    this.reloadAll();
  }
  handleBudgetChange(event) {
    if (this.uiDisabled) return;
    const value = event.detail.value;
    this.selectedBudgetId = value === "" ? null : value;
    console.log("[VisiteList] handleBudgetChange ➜", this.selectedBudgetId);
    this.reloadAll();
  }
  handleYearChange(e) {
    if (this.uiDisabled) return;
    this.selectedYear = e.detail.value;
    this.reloadDonors();
    this.reloadAll();
  }
  handleMonthChange(event) {
    if (this.uiDisabled) return;
    this.selectedMonth = event.detail.value;
    this.reloadDonors();
    this.reloadAll();
  }
  handleBeneficiaryTypeChange(event) {
    if (this.uiDisabled) return;
    this.selectedBeneficiaryType = event.detail.value;
    this.reloadAll();
  }
  handleDonorChange(event) {
    if (this.uiDisabled) return;
    this.selectedDonorId = event.detail.value;
    this.reloadAll();
  }
  handleInvoiceNumberChange(event) {
    if (this.uiDisabled) return;
    this.invoiceNumberFilter = event.detail.value;
    this.reloadAll();
  }
  handleTipoVisitaInput(event) {
    if (this.uiDisabled) return;
    const query = event.target.value.trim();
    this.selectedTipoVisitaName = query;
    this.showTipoVisitaError = false;
    if (!query) {
      this.filteredSuggestions = this.tipoVisite
        .filter((name) => !this.selectedTipoVisite.includes(name))
        .sort();
    } else {
      this.filteredSuggestions = this.tipoVisite
        .filter(
          (name) =>
            name.toLowerCase().includes(query.toLowerCase()) &&
            !this.selectedTipoVisite.includes(name)
        )
        .sort();
    }
    this.tipoVisitaDropdownVisible = this.filteredSuggestions.length > 0;
    this.showTipoVisitaError = query && this.filteredSuggestions.length === 0;
  }
  handleTipoVisitaFocus() {
    this.filteredSuggestions = this.tipoVisite
      .filter((name) => !this.selectedTipoVisite.includes(name))
      .sort();
    this.tipoVisitaDropdownVisible = this.filteredSuggestions.length > 0;
  }
  handleTipoVisitaBlur() {
    setTimeout(() => {
      this.tipoVisitaDropdownVisible = false;
    }, 200);
  }
  handleSuggestionClick(event) {
    const selected = event.currentTarget.dataset.name;
    if (!this.selectedTipoVisite.includes(selected)) {
      this.selectedTipoVisite = [...this.selectedTipoVisite, selected];
    }
    this.selectedTipoVisitaName = "";
    this.filteredSuggestions = [];
    this.tipoVisitaDropdownVisible = false;
    this.showTipoVisitaError = false;
    this.reloadAll();
  }
  handleTipoVisitaConfirm() {
    const customValue = this.selectedTipoVisitaName.trim();
    if (!customValue || this.selectedTipoVisite.includes(customValue)) return;
    this.selectedTipoVisite = [...this.selectedTipoVisite, customValue];
    this.selectedTipoVisitaName = "";
    this.filteredSuggestions = [];
    this.tipoVisitaDropdownVisible = false;
    this.showTipoVisitaError = false;
    this.reloadAll();
  }
  removeTipoVisita(event) {
    const nameToRemove = event.target.dataset.name;
    this.selectedTipoVisite = this.selectedTipoVisite.filter(
      (v) => v !== nameToRemove
    );
    this.reloadAll();
  }

  // Ricarica elenco Donatori coerente con ProgramEnrollment/periodo
  reloadDonors() {
    return getAvailableDonors({
      year: this.selectedYear || "",
      month: this.selectedMonth || "",
      programId: null
    })
      .then((donors) => {
        const opts = (donors || []).map((d) => ({ label: d.name, value: d.id }));
        const prev = this.selectedDonorId;
        this.donorOptions = [{ label: "Tutti i Donatori", value: "" }, ...opts];
        if (!this.donorOptions.some((o) => o.value === prev)) {
          this.selectedDonorId = "";
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("Errore getAvailableDonors (Visite):", err);
        this.donorOptions = [{ label: "Tutti i Donatori", value: "" }];
      });
  }

  /** handler nativo del datatable */
  handleLoadMore() {
    if (!this.allLoaded && !this.isLoadingMore) {
      this.loadData(false);
    }
  }

  get columns() {
    const baseColumns = [
      {
        label: "Codice Visita",
        fieldName: "recordLink",
        type: "url",
        typeAttributes: { label: { fieldName: "Name" }, target: "_self" }
      },
      { label: "Tipo Visita", fieldName: "typeVisitName" },
      { label: "Quantità", fieldName: "Quantity__c" },
      { label: "Minuti di Visita", fieldName: "Duration_in_minutes__c" },
      { label: "Beneficiario", fieldName: "Beneficiary_Type__c" },
      {
        label: "Ammontare",
        fieldName: "Amount__c",
        type: "currency",
        typeAttributes: { currencyCode: "EUR" }
      },
      {
        label: "Data della Visita",
        fieldName: "Data_della_Visita__c",
        type: "date"
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
      baseColumns.push(
        { label: "Budget", fieldName: "budgetName" },
        { label: "Donatore", fieldName: "accountName" }
      );
    }
    return baseColumns;
  }

  /** caricamento iniziale + pagine successive */
  async loadData(reset) {
    if (this.noBudgetFound || this.isLoadingMore) return;

    if (reset) {
      this.offset = 0;
      this.allLoaded = false;
      this.relatedData = [];
      this.isLoadingInit = true;
    } else {
      this.isLoadingMore = true;
    }

    try {
      const data = await getRelatedRecords({
        year: this.selectedYear,
        tipoVisita: this.selectedTipoVisite.join(","),
        month: this.selectedMonth,
        beneficiario: this.selectedBeneficiaryType,
        invoiceNumber: this.invoiceNumberFilter,
        budgetId: this.hideBudget
          ? this.userBudgetId
          : this.selectedBudgetId
            ? this.selectedBudgetId
            : null,
        donorId: this.selectedDonorId || null,
        limitSize: this.pageSize,
        offsetSize: this.offset,
        city: this.selectedCity,
        province: this.selectedProvince,
        region: this.selectedRegion
      });

      console.group("📊 Risultati getRelatedRecords");
      console.log("📝 Query finale:", data.query);
      console.log("📝 Query aggregata:", data.aggQuery);
      console.log("📈 Totali:", {
        totalMinutes: data.totalMinutes,
        totalVisits: data.totalVisits,
        totalAmount: data.totalAmount
      });
      console.log("📋 Record ricevuti:", data.records?.length || 0);
      console.log(
        "📋 Records dettagliati:",
        JSON.stringify(data.records, null, 2)
      );
      console.groupEnd();

      const rows = data.records.map((r) => ({
        Id: r.Id,
        Name: r.Name,
        Beneficiary_Type__c: r.Beneficiary_Type__c,
        Duration_in_minutes__c: r.Duration_in_minutes__c,
        Quantity__c: r.Quantity__c,
        Amount__c: r.Amount__c,
        Data_della_Visita__c: r.Data_della_Visita__c,
        budgetName: r.Invoice__r?.Budget__r?.Name ?? "N/A",
        accountName: r.Invoice__r?.Account__r?.Name ?? "N/A",
        recordLink: "/" + r.Id,
        typeVisitName: r.Tipo_Visita__r ? r.Tipo_Visita__r.Name : "N/A",
        invoiceLink: r.Invoice__r ? "/" + r.Invoice__r.Id : "/" + r.Invoice__c,
        invoiceName: r.Invoice__r ? r.Invoice__r.Name : "N/A",
        invoiceNumber: r.Invoice__r ? r.Invoice__r.Invoice_Number__c : "N/A",
        City__c: r.City__c,
        Province__c: r.Province__c,
        Region__c: r.Region__c
      }));

      console.log("✅ Mappatura righe completata:", rows.length);

      this.relatedData = [...this.relatedData, ...rows];
      this.offset += rows.length;
      if (rows.length < this.pageSize) this.allLoaded = true;

      if (reset) {
        this.totalMinutes = data.totalMinutes;
        this.totalVisits = data.totalVisits;
        this.totalAmount = data.totalAmount;
      }
    } catch (err) {
      console.error("getRelatedRecords", err);
    } finally {
      this.isLoadingInit = false;
      this.isLoadingMore = false;
    }
  }

  reloadAll() {
    if (this.uiDisabled) {
      this.relatedData = [];
      this.totalMinutes = this.totalVisits = this.totalAmount = 0;
      return;
    }
    this.loadData(true);
  }

  sortBy(field, reverse, primer) {
    const key = primer ? (x) => primer(x[field]) : (x) => x[field];
    return (a, b) => {
      a = key(a);
      b = key(b);
      return reverse * ((a > b) - (b > a));
    };
  }

  onHandleSort(event) {
    const { fieldName: sortedBy, sortDirection } = event.detail;
    const cloneData = [...this.relatedData];
    cloneData.sort(this.sortBy(sortedBy, sortDirection === "asc" ? 1 : -1));
    this.relatedData = cloneData;
    this.sortDirection = sortDirection;
    this.sortedBy = sortedBy;
  }

  buildCityProvinceRegionOptions() {
    let list = this.allComuniData;
    if (this.selectedRegion)
      list = list.filter((c) => c.region === this.selectedRegion);
    if (this.selectedProvince)
      list = list.filter((c) => c.province === this.selectedProvince);
    if (this.selectedCity)
      list = list.filter((c) => c.name === this.selectedCity);

    const toPick = (arr) => arr.sort().map((n) => ({ label: n, value: n }));
    const cities = [...new Set(list.map((c) => c.name))];
    const provinces = [...new Set(list.map((c) => c.province).filter(Boolean))];
    const regions = [...new Set(list.map((c) => c.region).filter(Boolean))];

    this.cityOptions = [{ label: "Tutti i Comuni", value: "" }].concat(
      toPick(cities)
    );
    this.provinceOptions = [{ label: "Tutte le Province", value: "" }].concat(
      toPick(provinces)
    );
    this.regionOptions = [{ label: "Tutte le Regioni", value: "" }].concat(
      toPick(regions)
    );
  }

  /** Ritorna un nome file univoco includendo eventuali filtri. */
  buildExcelFileName(includeFilters = false) {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;

    let name = `Visite_Mediche_${timestamp}`;

    if (includeFilters) {
      const parts = [];
      if (this.selectedYear) parts.push(this.selectedYear);
      if (this.selectedMonth) {
        const monthLabel = this.monthOptions.find(
          (m) => m.value === this.selectedMonth
        )?.label;
        if (monthLabel) parts.push(monthLabel.replace(/\s+/g, "_"));
      }
      if (this.selectedBeneficiaryType)
        parts.push(this.selectedBeneficiaryType.replace(/\s+/g, "_"));
      if (!this.budgetId && this.selectedBudgetId) {
        const budgetLabel = this.budgetOptions.find(
          (b) => b.value === this.selectedBudgetId
        )?.label;
        if (budgetLabel) parts.push(budgetLabel.replace(/\s+/g, "_"));
      }
      if (parts.length) name += "_" + parts.join("-");
    }
    return name + ".xlsx";
  }
  /** Click su "Esporta Lista completa in Excel" */
  exportAllRecords() {
    if (this.uiDisabled) return; // blocca il click
    this.exportExcel(true); // senza filtri
  }

  /** Click su "Esporta tutti i dati filtrati" */
  exportFilteredRecords() {
    if (this.uiDisabled) return;
    this.exportExcel(false); // con filtri
  }

  /** Esporta i dati in Excel usando SheetJS */
  exportExcel(fullExport = false) {
    if (this.noBudgetFound || !this.sheetJsLoaded) return;
    this.isExporting = true;

    let budgetParam;
    if (this.hideBudget) {
      // budget “bloccato” (DEFAULT_PRG__c = FALSE) → va sempre filtrato
      budgetParam = this.userBudgetId;
    } else {
      // combobox visibile
      budgetParam = fullExport
        ? "" // export completo: nessun filtro
        : this.selectedBudgetId || "";
    }
    // Parametri per Apex
    const params = {
      year: fullExport ? "" : this.selectedYear,
      tipoVisita: fullExport ? "" : this.selectedTipoVisite.join(","),
      month: fullExport ? "" : this.selectedMonth,
      beneficiario: fullExport ? "" : this.selectedBeneficiaryType,
      invoiceNumber: "", // non serve in export completo/filtrato
      budgetId: budgetParam,
      donorId: fullExport ? "" : this.selectedDonorId,
      limitSize: 100000, // export fino a 100k righe
      offsetSize: 0,
      city: fullExport ? "" : this.selectedCity,
      province: fullExport ? "" : this.selectedProvince,
      region: fullExport ? "" : this.selectedRegion
    };

    getRelatedRecords(params)
      .then((result) => {
        // Mappatura campi per Excel
        const excelData = result.records.map((v) => {
          const row = {
            "Codice Visita": v.Name,
            "Tipo Visita": v.Tipo_Visita__r ? v.Tipo_Visita__r.Name : "",
            Quantità: v.Quantity__c,
            Minuti: v.Duration_in_minutes__c,
            Beneficiario: v.Beneficiary_Type__c,
            "Importo (€)": v.Amount__c,
            "Data Visita": v.Data_della_Visita__c,
            Comune: v.City__c ?? "",
            Provincia: v.Province__c ?? "",
            Regione: v.Region__c ?? "",
            "Numero Fattura": v.Invoice__r ? v.Invoice__r.Invoice_Number__c : ""
          };

          // aggiungi solo se il componente NON ha un budget fisso
          if (!this.budgetId) {
            row["Budget"] = v.Invoice__r?.Budget__r?.Name ?? "";
            row["Donatore"] = v.Invoice__r?.Account__r?.Name ?? "";
          }

          return row;
        });

        // Crea file Excel
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Visite");
        const filename = this.buildExcelFileName(!fullExport);
        XLSX.writeFile(wb, filename);

        // Toast finale
        this.dispatchEvent(
          new ShowToastEvent({
            title: "Esportazione completata",
            message: `File "${filename}" creato con successo.`,
            variant: "success"
          })
        );
      })
      .catch((err) => {
        console.error("Errore exportExcel:", err);
        this.dispatchEvent(
          new ShowToastEvent({
            title: "Errore",
            message: "Si è verificato un problema durante l’esportazione.",
            variant: "error"
          })
        );
      })
      .finally(() => {
        this.isExporting = false;
      });
  }
}