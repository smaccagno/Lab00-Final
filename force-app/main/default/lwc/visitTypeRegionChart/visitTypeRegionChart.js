import { LightningElement, track } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import SheetJS from "@salesforce/resourceUrl/SheetJS";
import getVisitTypeCountsByRegion from "@salesforce/apex/VisitGeoController.getVisitTypeCountsByRegion";
import getVisitLocations from "@salesforce/apex/VisiteMediche.getVisitLocations";
import generatePdf from "@salesforce/apex/VisitTypeExportController.generatePdf";

export default class VisitTypeRegionChart extends LightningElement {
  @track groupedData = [];
  @track allComuniData = [];
  @track cityOptions = [{ label: "Tutti i Comuni", value: "" }];
  @track provinceOptions = [{ label: "Tutte le Province", value: "" }];
  @track regionOptions = [{ label: "Tutte le Regioni", value: "" }];

  @track selectedCity = "";
  @track selectedProvince = "";
  @track selectedRegion = "";

  isLoading = false;
  sheetJsLoaded = false;
  isExporting = false;

  connectedCallback() {
    this.loadLocations();
    this.loadData();
  }

  renderedCallback() {
    if (!this.sheetJsLoaded) {
      loadScript(this, SheetJS).then(() => {
        this.sheetJsLoaded = true;
      });
    }
  }

  /* ------- DATA LOAD ------- */

  loadLocations() {
    getVisitLocations()
      .then((data) => {
        this.allComuniData = data || [];
        this.buildCityProvinceRegionOptions();
      })
      .catch((error) => {
        console.error("Errore getVisitLocations", error);
        this.allComuniData = [];
        this.buildCityProvinceRegionOptions();
      });
  }

  loadData() {
    this.isLoading = true;
    getVisitTypeCountsByRegion({
      city: this.selectedCity,
      province: this.selectedProvince,
      region: this.selectedRegion
    })
      .then((data) => {
        const list = data || [];
        // Group by region + calcolo max globale
        const map = new Map();
        let globalMax = 0;
        list.forEach((row) => {
          const region = row.region || "(Senza regione)";
          if (!map.has(region)) {
            map.set(region, []);
          }
          const qty = Number(row.quantity || 0);
          map.get(region).push({ visitType: row.visitType || "N/D", quantity: qty });
          if (qty > globalMax) globalMax = qty;
        });

        const grouped = Array.from(map.entries()).map(([region, items]) => {
          const sorted = items.sort((a, b) => b.quantity - a.quantity);
          const totalQty = sorted.reduce((sum, i) => sum + i.quantity, 0);
          const enhanced = sorted.map((item) => ({
            ...item,
            styleWidth: `width: ${
              globalMax
                ? ((item.quantity / globalMax) * 100).toFixed(2)
                : 0
            }%`
          }));
          const regionLabel =
            this.selectedCity && this.selectedProvince
              ? `${this.selectedRegion || region} - ${this.selectedProvince} - ${this.selectedCity}`
              : this.selectedProvince
                ? `${this.selectedRegion || region} - ${this.selectedProvince}`
                : region;

          return {
            region,
            displayName: regionLabel,
            items: enhanced,
            totalQuantity: totalQty
          };
        });

        this.groupedData = grouped;
      })
      .catch((error) => console.error("Errore getVisitTypeCountsByRegion", error))
      .finally(() => {
        this.isLoading = false;
      });
  }

  /* ------- FILTER HANDLERS ------- */
  handleCityChange(event) {
    this.selectedCity = event.detail.value;
    if (this.selectedCity) {
      const match = this.allComuniData.find((c) => c.name === this.selectedCity);
      if (match) {
        this.selectedProvince = match.province || "";
        this.selectedRegion = match.region || "";
      }
    }
    this.buildCityProvinceRegionOptions();
    this.loadData();
  }
  handleProvinceChange(event) {
    this.selectedProvince = event.detail.value;
    if (this.selectedProvince) {
      const match = this.allComuniData.find(
        (c) => c.province === this.selectedProvince
      );
      if (match) {
        this.selectedRegion = match.region || "";
      }
    }
    this.buildCityProvinceRegionOptions();
    this.loadData();
  }
  handleRegionChange(event) {
    this.selectedRegion = event.detail.value;
    this.buildCityProvinceRegionOptions();
    this.loadData();
  }

  resetCity() {
    this.selectedCity = "";
    this.selectedProvince = "";
    this.selectedRegion = "";
    this.buildCityProvinceRegionOptions();
    this.loadData();
  }
  resetProvince() {
    if (this.isProvinceResetDisabled) return;
    this.selectedProvince = "";
    this.selectedRegion = "";
    this.buildCityProvinceRegionOptions();
    this.loadData();
  }
  resetRegion() {
    if (this.isRegionResetDisabled) return;
    this.selectedRegion = "";
    this.buildCityProvinceRegionOptions();
    this.loadData();
  }

  /* ------- OPTIONS BUILD ------- */
  buildCityProvinceRegionOptions() {
    let list = this.allComuniData;
    if (this.selectedRegion) list = list.filter((c) => c.region === this.selectedRegion);
    if (this.selectedProvince) list = list.filter((c) => c.province === this.selectedProvince);
    if (this.selectedCity) list = list.filter((c) => c.name === this.selectedCity);

    const toPick = (arr) => Array.from(new Set(arr)).sort().map((n) => ({ label: n, value: n }));
    const cities = toPick(list.map((c) => c.name).filter(Boolean));
    const provinces = toPick(list.map((c) => c.province).filter(Boolean));
    const regions = toPick(list.map((c) => c.region).filter(Boolean));

    this.cityOptions = [{ label: "Tutti i Comuni", value: "" }, ...cities];
    this.provinceOptions = [{ label: "Tutte le Province", value: "" }, ...provinces];
    this.regionOptions = [{ label: "Tutte le Regioni", value: "" }, ...regions];
  }

  get isProvinceResetDisabled() {
    return !this.selectedProvince || !!this.selectedCity;
  }

  get isRegionResetDisabled() {
    return !this.selectedRegion || !!this.selectedCity || !!this.selectedProvince;
  }

  get isCityResetDisabled() {
    return !this.selectedCity;
  }

  /* ------- EXPORT ------- */
  exportFiltered() {
    this.exportData(false);
  }

  exportAll() {
    this.exportData(true);
  }

  exportData(fullExport = false) {
    if (!this.sheetJsLoaded) return;
    this.isExporting = true;

    const params = {
      city: fullExport ? "" : this.selectedCity,
      province: fullExport ? "" : this.selectedProvince,
      region: fullExport ? "" : this.selectedRegion
    };

    getVisitTypeCountsByRegion(params)
      .then((data) => {
        const list = data || [];
        const tableRows = list.map((r) => ({
          Regione: r.region || "(Non valorizzata)",
          "Tipo Visita": r.visitType || "N/D",
          Quantità: Number(r.quantity || 0)
        }));

        const graphRows = this.buildGraphRows(list, fullExport);

        const wsData = XLSX.utils.json_to_sheet(tableRows);
        const wsGraph = XLSX.utils.json_to_sheet(graphRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsData, "Visite per Tipo");
        XLSX.utils.book_append_sheet(wb, wsGraph, "Vista Grafico");

        const filename = this.buildFileName(!fullExport);
        XLSX.writeFile(wb, filename);
      })
      .catch((error) => console.error("Errore export", error))
      .finally(() => {
        this.isExporting = false;
      });
  }

  /* ------- EXPORT PDF ------- */
  exportPdfFiltered() {
    this.exportPdf(false);
  }

  exportPdfAll() {
    this.exportPdf(true);
  }

  exportPdf(fullExport = false) {
    this.isExporting = true;
    generatePdf({
      city: fullExport ? "" : this.selectedCity,
      province: fullExport ? "" : this.selectedProvince,
      region: fullExport ? "" : this.selectedRegion
    })
      .then((b64) => {
        const link = document.createElement("a");
        link.href = "data:application/pdf;base64," + b64;
        link.download = this.buildFileName(!fullExport).replace(".xlsx", ".pdf");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch((err) => console.error("Errore export PDF", err))
      .finally(() => {
        this.isExporting = false;
      });
  }

  buildFileName(includeFilters = false) {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, "0");
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    let name = "Visite per Localita e Tipo";
    if (includeFilters) {
      const parts = [];
      if (this.selectedRegion) parts.push(this.selectedRegion.replace(/\s+/g, "_"));
      if (this.selectedProvince) parts.push(this.selectedProvince.replace(/\s+/g, "_"));
      if (this.selectedCity) parts.push(this.selectedCity.replace(/\s+/g, "_"));
      if (parts.length) name += " - " + parts.join("-");
    }
    return `${name} - ${ts}.xlsx`;
  }

  buildGraphRows(list, fullExport) {
    if (!list.length) return [];

    // Aggrega per regione con label coerente ai filtri attivi
    const map = new Map();
    let maxQty = 0;
    list.forEach((row) => {
      const region = row.region || "(Senza regione)";
      const regionLabel =
        this.selectedCity && !fullExport
          ? `${this.selectedRegion || region} - ${this.selectedProvince} - ${this.selectedCity}`
          : this.selectedProvince && !fullExport
            ? `${this.selectedRegion || region} - ${this.selectedProvince}`
            : region;

      if (!map.has(regionLabel)) map.set(regionLabel, []);
      const qty = Number(row.quantity || 0);
      map.get(regionLabel).push({ type: row.visitType || "N/D", qty });
      if (qty > maxQty) maxQty = qty;
    });

    const graphRows = [];
    const barLen = (qty) =>
      maxQty ? Math.max(1, Math.round((qty / maxQty) * 20)) : 1;

    map.forEach((items, label) => {
      const total = items.reduce((s, i) => s + i.qty, 0);
      items
        .sort((a, b) => b.qty - a.qty)
        .forEach((item) => {
          graphRows.push({
            Sezione: label,
            "Tipo Visita": item.type,
            Quantità: item.qty,
            "% rispetto max": maxQty ? Math.round((item.qty / maxQty) * 100) + "%" : "0%",
            Bar: "█".repeat(barLen(item.qty)),
            Totale_Sezione: total
          });
        });
      graphRows.push({}); // riga vuota separatrice
    });

    return graphRows;
  }
}