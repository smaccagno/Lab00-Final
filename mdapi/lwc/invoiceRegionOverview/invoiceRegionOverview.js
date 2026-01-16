import { LightningElement, track } from "lwc";

// Apex basato su Visit__c (senza filtro programma)
import getAggregatedRegionData from "@salesforce/apex/VisitGeoController.getAggregatedRegionData";
import getAggregatedProvinceData from "@salesforce/apex/VisitGeoController.getAggregatedProvinceData";
import getVisitsByLocalita from "@salesforce/apex/VisitGeoController.getVisitsByLocalita";

export default class InvoiceRegionOverview extends LightningElement {
  /* ---------- DATA ---------- */

  @track regionData = [];
  @track provinceData = [];
  @track localitaData = [];

  isLoading = false;

  // Totali aggregati
  totalRegions = 0;
  totalProvinces = 0;
  totalCities = 0;
  totalVisits = 0;
  totalVisitValue = 0;

  // Ordinamento di default
  regionSortedBy = "totalVisitValue";
  regionSortDirection = "desc";
  provinceSortedBy = "totalVisitValue";
  provinceSortDirection = "desc";
  localitaSortedBy = "totalVisitValue";
  localitaSortDirection = "desc";

  /* ---------- LIFECYCLE ---------- */

  connectedCallback() {
    this.loadAllData();
  }

  /* ---------- APEX CALL ---------- */

  loadAllData() {
    this.isLoading = true;

    Promise.all([
      getAggregatedRegionData(),
      getAggregatedProvinceData(),
      getVisitsByLocalita()
    ])
      .then(([regionData, provinceData, localitaData]) => {
        // Espande eventuali extraFields (anche se al momento non usati)
        this.regionData = this.flattenExtraFields(regionData);
        this.provinceData = this.flattenExtraFields(provinceData);
        this.localitaData = this.flattenExtraFields(localitaData);

        // Calcola i totali
        this.computeTotals(this.regionData);

        // Ordina i set iniziali
        this.sortData(
          "regionData",
          this.regionSortedBy,
          this.regionSortDirection
        );
        this.sortData(
          "provinceData",
          this.provinceSortedBy,
          this.provinceSortDirection
        );
        this.sortData(
          "localitaData",
          this.localitaSortedBy,
          this.localitaSortDirection
        );
      })
      .catch((error) => {
        console.error("Errore nel caricamento dati:", error);
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  /* ---------- UTILITY ---------- */

  flattenExtraFields(data) {
    return data.map((row) => {
      const flat = { ...row };
      if (row.extraFields) {
        Object.entries(row.extraFields).forEach(([key, value]) => {
          flat[key] = value;
        });
      }
      return flat;
    });
  }

  computeTotals(data) {
    this.totalRegions = data.length;
    this.totalProvinces = data.reduce(
      (sum, r) => sum + (r.numberOfProvinces || 0),
      0
    );
    this.totalCities = data.reduce(
      (sum, r) => sum + (r.numberOfCities || 0),
      0
    );
    this.totalVisits = data.reduce(
      (sum, r) => sum + (r.numberOfVisits || 0),
      0
    );
    this.totalVisitValue = data.reduce(
      (sum, r) => sum + (r.totalVisitValue || 0),
      0
    );
  }

  get totalVisitValueFormatted() {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR"
    }).format(this.totalVisitValue || 0);
  }

  /* ---------- COLONNE STATICHE ---------- */

  get regionColumns() {
    return [
      { label: "Regione", fieldName: "region", sortable: true },
      {
        label: "N. Province",
        fieldName: "numberOfProvinces",
        type: "number",
        sortable: true
      },
      {
        label: "N. Comuni",
        fieldName: "numberOfCities",
        type: "number",
        sortable: true
      },
      {
        label: "N. Visite",
        fieldName: "numberOfVisits",
        type: "number",
        sortable: true
      },
      {
        label: "Totale (€)",
        fieldName: "totalVisitValue",
        type: "currency",
        typeAttributes: { currencyCode: "EUR" },
        sortable: true
      }
    ];
  }

  get provinceColumns() {
    return [
      { label: "Provincia", fieldName: "province", sortable: true },
      {
        label: "N. Comuni",
        fieldName: "numberOfCities",
        type: "number",
        sortable: true
      },
      {
        label: "N. Visite",
        fieldName: "numberOfVisits",
        type: "number",
        sortable: true
      },
      {
        label: "Totale (€)",
        fieldName: "totalVisitValue",
        type: "currency",
        typeAttributes: { currencyCode: "EUR" },
        sortable: true
      }
    ];
  }

  get localitaColumns() {
    return [
      { label: "Località", fieldName: "name", sortable: true },
      {
        label: "N. Visite",
        fieldName: "numberOfVisits",
        type: "number",
        sortable: true
      },
      {
        label: "Totale (€)",
        fieldName: "totalVisitValue",
        type: "currency",
        typeAttributes: { currencyCode: "EUR" },
        sortable: true
      }
    ];
  }

  /* ---------- HANDLER ORDINAMENTO ---------- */

  handleRegionSort(event) {
    this.regionSortedBy = event.detail.fieldName;
    this.regionSortDirection = event.detail.sortDirection;
    this.sortData("regionData", this.regionSortedBy, this.regionSortDirection);
  }

  handleProvinceSort(event) {
    this.provinceSortedBy = event.detail.fieldName;
    this.provinceSortDirection = event.detail.sortDirection;
    this.sortData(
      "provinceData",
      this.provinceSortedBy,
      this.provinceSortDirection
    );
  }

  handleLocalitaSort(event) {
    this.localitaSortedBy = event.detail.fieldName;
    this.localitaSortDirection = event.detail.sortDirection;
    this.sortData(
      "localitaData",
      this.localitaSortedBy,
      this.localitaSortDirection
    );
  }

  sortData(dataField, sortedBy, sortDirection) {
    const clone = [...this[dataField]];
    clone.sort((a, b) => {
      let valA = a[sortedBy];
      let valB = b[sortedBy];

      if (typeof valA === "string") {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      return sortDirection === "asc"
        ? valA > valB
          ? 1
          : -1
        : valA < valB
          ? 1
          : -1;
    });
    this[dataField] = clone;
  }
}