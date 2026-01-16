import { LightningElement, track, wire } from "lwc";
import getVisitWithInvoiceData from "@salesforce/apex/VisiteMediche.getVisitWithInvoiceData";
import SheetJS from "@salesforce/resourceUrl/SheetJS";
import getAvailableYears from "@salesforce/apex/VisiteMediche.getAvailableYears";
import getBeneficiaryTypes from "@salesforce/apex/VisiteMediche.getBeneficiaryTypes";
import getAvailableBudgets from "@salesforce/apex/VisiteMediche.getAvailableBudgets";
import getVisitLocations from "@salesforce/apex/VisiteMediche.getVisitLocations";
import { loadScript } from "lightning/platformResourceLoader";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

const PAGE_SIZE = 50;
const MONTHS = [
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

export default class VisiteFatture extends LightningElement {
  /* ----------------------- STATE ----------------------- */

  @track records = [];

  @track year = "";
  @track month = "";
  @track beneficiario = "";
  @track budgetId = "";

  @track yearOptions = [];
  @track monthOptions = MONTHS;
  @track beneficiaryTypeOptions = [];
  @track budgetOptions = [];
  @track allComuniData = [];
  @track cityOptions = [{ label: "Tutti i Comuni", value: "" }];
  @track provinceOptions = [{ label: "Tutte le Province", value: "" }];
  @track regionOptions = [{ label: "Tutte le Regioni", value: "" }];

  @track totalVisits = 0;
  @track totalAmount = 0;

  @track isLoading = false;
  @track offset = 0;
  @track allLoaded = false;

  @track selectedCity = "";
  @track selectedProvince = "";
  @track selectedRegion = "";

  sheetJsLoaded = false;
  observer;
  @track isExporting = false;
  @track showExportBanner = false;
  @track exportMessage = "";

  /* ---------------- DESTINATION COLUMN CONFIG ------------- */

  get columns() {
    return [
      {
        label: "Donatore",
        fieldName: "donorLink",
        type: "url",
        typeAttributes: { label: { fieldName: "donorName" }, target: "_blank" }
      },
      {
        label: "Budget",
        fieldName: "budgetLink",
        type: "url",
        typeAttributes: { label: { fieldName: "budgetName" }, target: "_blank" }
      },
      { label: "Tipo Visita", fieldName: "Visit_Type__c" },
      { label: "Quantità", fieldName: "Quantity__c", type: "number" },
      { label: "Minuti", fieldName: "Duration_in_minutes__c", type: "number" },
      { label: "Beneficiario", fieldName: "Beneficiary_Type__c" },
      { label: "Importo", fieldName: "Amount__c", type: "currency" },
      { label: "Comune", fieldName: "City__c" },
      { label: "Provincia", fieldName: "Province__c" },
      { label: "Regione", fieldName: "Region__c" },
      { label: "Centro Medico", fieldName: "Medical_Center__c" },
      { label: "Numero Fattura", fieldName: "Invoice_Number__c" },
      { label: "Data Fattura", fieldName: "Date__c", type: "date" },
      { label: "No Profit", fieldName: "Non_Profit_Signaling__c" }
    ];
  }

  /* -------------------- WIRES -------------------- */

  @wire(getAvailableBudgets)
  wiredBudgets({ data, error }) {
    if (data) {
      this.budgetOptions = [{ label: "Tutti i budget", value: "" }, ...data];
    } else if (error) {
      console.error(
        "Errore getAvailableBudgets:",
        error.body?.message || JSON.stringify(error)
      );
      this.budgetOptions = [{ label: "Tutti i budget", value: "" }];
    }
  }

  @wire(getAvailableYears)
  wiredYears({ data, error }) {
    if (data) {
      this.yearOptions = [
        { label: "Tutti gli anni", value: "" },
        ...data.map((y) => ({ label: y, value: y }))
      ];
    } else if (error) {
      console.error(
        "Errore getAvailableYears:",
        error.body?.message || JSON.stringify(error)
      );
      this.yearOptions = [{ label: "Tutti gli anni", value: "" }];
    }
  }

  @wire(getBeneficiaryTypes)
  wiredBeneficiaryTypes({ data, error }) {
    if (data) {
      this.beneficiaryTypeOptions = [
        { label: "Tutti i beneficiari", value: "" },
        ...data.map((v) => ({ label: v, value: v }))
      ];
    } else if (error) {
      console.error(
        "Errore getBeneficiaryTypes:",
        error.body?.message || JSON.stringify(error)
      );
      this.beneficiaryTypeOptions = [
        { label: "Tutti i beneficiari", value: "" }
      ];
    }
  }

  @wire(getVisitLocations)
  wiredComuni({ data, error }) {
    if (data) {
      this.allComuniData = data;
      this.buildCityProvinceRegionOptions();
    } else if (error) {
      console.error(
        "Errore getVisitLocations:",
        error.body?.message || JSON.stringify(error)
      );
      this.allComuniData = [];
      this.buildCityProvinceRegionOptions();
    }
  }

  /* ------------------- LIFECYCLE ------------------- */

  renderedCallback() {
    if (!this.sheetJsLoaded) {
      loadScript(this, SheetJS).then(() => {
        this.sheetJsLoaded = true;
      });
    }

    if (!this.observer && !this.allLoaded) {
      const target = this.template.querySelector(".sentinella");
      if (target) {
        this.observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting && !this.isLoading) {
                this.loadData(false);
              }
            });
          },
          { threshold: 1.0 }
        );
        this.observer.observe(target);
      }
    }
  }

  connectedCallback() {
    this.loadData(true);
  }

  /* ------------------- DATA LOAD ------------------- */

  loadData(reset = false) {
    if (this.isLoading || this.allLoaded) return;
    this.isLoading = true;

    const currentOffset = reset ? 0 : this.offset;

    getVisitWithInvoiceData({
      year: this.year,
      month: this.month,
      beneficiario: this.beneficiario,
      budgetId: this.budgetId,
      limitSize: PAGE_SIZE,
      offsetSize: currentOffset,
      city: this.selectedCity,
      province: this.selectedProvince,
      region: this.selectedRegion
    })
      .then((result) => {
        /* ***********  MAPPATURA RECORD  ***********
               →  Comune - Provincia - Regione ora dal record Visit__c
            */
        const newData = result.records.map((v) => ({
          ...v,
          donorLink: v.Invoice__r?.Account__c
            ? "/" + v.Invoice__r.Account__c
            : null,
          donorName: v.Invoice__r?.Account__r?.Name,
          budgetLink: v.Invoice__r?.Budget__c
            ? "/" + v.Invoice__r.Budget__c
            : null,
          budgetName: v.Invoice__r?.Budget__r?.Name,
          /* ▼  questi tre campi PRIMA arrivavano da Invoice__r */
          City__c: v.City__c,
          Province__c: v.Province__c,
          Region__c: v.Region__c,
          /* gli altri rimangono invariati */
          Medical_Center__c: v.Invoice__r?.Medical_Center__c,
          Invoice_Number__c: v.Invoice__r?.Invoice_Number__c,
          Date__c: v.Invoice__r?.Date__c,
          Non_Profit_Signaling__c: v.Invoice__r?.Non_Profit_Signaling__c
        }));

        if (reset) {
          this.records = newData;
          this.offset = newData.length;
          this.allLoaded = newData.length < PAGE_SIZE;
        } else {
          this.records = [...this.records, ...newData];
          this.offset += newData.length;
          if (newData.length < PAGE_SIZE) this.allLoaded = true;
        }

        this.totalVisits = result.totalVisits || 0;
        this.totalAmount = result.totalAmount || 0;
      })
      .catch((error) => console.error("Errore loadData:", error))
      .finally(() => {
        this.isLoading = false;
      });
  }

  /* ------------------- EXPORT EXCEL ------------------- */

  exportAllRecords() {
    this.exportExcel(true);
  }
  exportFilteredRecords() {
    this.exportExcel(false);
  }

  exportExcel(fullExport = false) {
    if (!this.sheetJsLoaded) return;

    this.isExporting = true;
    this.showExportBanner = true;
    this.exportMessage = fullExport
      ? "Esportazione di tutti i record..."
      : "Esportazione dei record filtrati...";

    const params = {
      year: fullExport ? "" : this.year,
      month: fullExport ? "" : this.month,
      beneficiario: fullExport ? "" : this.beneficiario,
      budgetId: fullExport ? "" : this.budgetId,
      limitSize: 100000,
      offsetSize: 0,
      city: fullExport ? "" : this.selectedCity,
      province: fullExport ? "" : this.selectedProvince,
      region: fullExport ? "" : this.selectedRegion
    };

    getVisitWithInvoiceData(params)
      .then((result) => {
        /* ***********  MAPPATURA EXPORT  *********** */
        const data = result.records.map((v) => ({
          Donatore: v.Invoice__r?.Account__r?.Name,
          Budget: v.Invoice__r?.Budget__r?.Name,
          "Tipo Visita": v.Visit_Type__c,
          Quantità: v.Quantity__c,
          Minuti: v.Duration_in_minutes__c,
          Beneficiario: v.Beneficiary_Type__c,
          Importo: v.Amount__c,
          Comune: v.City__c, // ← diretto da Visit__c
          Provincia: v.Province__c, // ← diretto da Visit__c
          Regione: v.Region__c, // ← diretto da Visit__c
          "Centro Medico": v.Invoice__r?.Medical_Center__c,
          "Numero Fattura": v.Invoice__r?.Invoice_Number__c,
          "Data Fattura": v.Invoice__r?.Date__c,
          "No Profit": v.Invoice__r?.Non_Profit_Signaling__c
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Visite");

        const filename = this.buildExcelFileName(!fullExport);
        XLSX.writeFile(wb, filename);

        this.dispatchEvent(
          new ShowToastEvent({
            title: "Esportazione completata",
            message: `File "${filename}" generato con successo`,
            variant: "success"
          })
        );
      })
      .catch((error) => {
        console.error("Errore export Excel:", error);
        this.exportMessage = "Errore durante l’esportazione.";
      })
      .finally(() => {
        this.isExporting = false;
        setTimeout(() => {
          this.showExportBanner = false;
          this.exportMessage = "";
        }, 5000);
      });
  }

  /* -------------- FILTRI / HANDLER -------------- */

  handleYearChange(e) {
    this.year = e.detail.value;
    this.reloadAll();
  }
  handleMonthChange(e) {
    this.month = e.detail.value;
    this.reloadAll();
  }
  handleBeneficiarioChange(e) {
    this.beneficiario = e.detail.value;
    this.reloadAll();
  }
  handleBudgetChange(e) {
    this.budgetId = e.detail.value;
    this.reloadAll();
  }

  handleCityChange(event) {
    this.selectedCity = event.detail.value;
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }

  handleProvinceChange(event) {
    this.selectedProvince = event.detail.value;
    this.buildCityProvinceRegionOptions();
    this.reloadAll();
  }

  handleRegionChange(event) {
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

  reloadAll() {
    this.offset = 0;
    this.allLoaded = false;
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.loadData(true);
  }

  /* ------------------ UTILS ------------------ */

  buildCityProvinceRegionOptions() {
    let list = this.allComuniData;
    if (this.selectedRegion) {
      list = list.filter((c) => c.region === this.selectedRegion);
    }
    if (this.selectedProvince) {
      list = list.filter((c) => c.province === this.selectedProvince);
    }
    if (this.selectedCity) {
      list = list.filter((c) => c.name === this.selectedCity);
    }

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

  buildExcelFileName(includeFilters = false) {
    const now = new Date(),
      pad = (n) => n.toString().padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    let name = `Visite Mediche Tempo Sospeso - ${timestamp}`;

    if (includeFilters) {
      const parts = [];
      if (this.year) parts.push(this.year);
      if (this.month) {
        const label = this.monthOptions.find(
          (m) => m.value === this.month
        )?.label;
        if (label) parts.push(label.replace(/\s+/g, "_"));
      }
      if (this.beneficiario) parts.push(this.beneficiario.replace(/\s+/g, "_"));
      if (this.budgetId) {
        const label = this.budgetOptions.find(
          (b) => b.value === this.budgetId
        )?.label;
        if (label) parts.push(label.replace(/\s+/g, "_"));
      }
      if (parts.length) name += " - " + parts.join("-");
    }
    return name + ".xlsx";
  }
}