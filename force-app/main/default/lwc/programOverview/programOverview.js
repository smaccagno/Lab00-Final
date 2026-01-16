import { LightningElement, wire, track, api } from "lwc";
import getRelatedRecords from "@salesforce/apex/ProgramOverview.getRelatedRecords";
import getAvailableYears from "@salesforce/apex/ProgramOverview.getAvailableYears";
import multilineHeader from "c/multilineHeader";

export default class ProgramOverview extends LightningElement {
  @api recordId;
  @track yearData = [];
  @track budgetData = [];
  @track donorData = [];
  @track yearOptions = [];
  @track selectedYear = ""; // Filtro per Anno

  @track totalYearValues = {};
  @track totalBudgetValues = {};
  @track totalDonorValues = {};

  @track formattedTotalYearValues = {};
  @track formattedTotalBudgetValues = {};
  @track formattedTotalDonorValues = {};

  originalYearData = [];
  originalBudgetData = [];
  originalDonorData = [];

  @track aggregatedBudgetData = [];
  @track aggregatedTotalBudgetValues = {};
  @track formattedAggregatedTotalBudgetValues = {};

  @track aggregatedDonorData = [];
  @track aggregatedTotalDonorValues = {};
  @track formattedAggregatedTotalDonorValues = {};

  @track aggregatedDonorPerYearData = [];
  @track aggregatedTotalDonorPerYearValues = {};
  @track formattedAggregatedTotalDonorPerYearValues = {};

  get yearColumns() {
    return [
      {
        label: `Anno`,
        fieldName: "linkOrText",
        type: "url",
        typeAttributes: {
          label: { fieldName: "displayName" },
          target: "_self"
        },
        fixedWidth: 90,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Donati\n${this.formattedTotalYearValues.Ammontare_Originale_Donato__c || ""}`,
        fieldName: "Ammontare_Originale_Donato__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocabili\n${this.formattedTotalYearValues.Totale_Allocabile__c || ""}`,
        fieldName: "Totale_Allocabile__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocati\n${this.formattedTotalYearValues.Ammontare_Distribuzioni__c || ""}`,
        fieldName: "Ammontare_Distribuzioni__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagati\n${this.formattedTotalYearValues.Ammontare_Distribuzioni_Pagate__c || ""}`,
        fieldName: "Ammontare_Distribuzioni_Pagate__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Pagati\n${this.formattedTotalYearValues.Ammontare_Distribuzioni_NON_Pagate__c || ""}`,
        fieldName: "Ammontare_Distribuzioni_NON_Pagate__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Allocati\n${this.formattedTotalYearValues.Totale_NON_Distribuito__c || ""}`,
        fieldName: "Totale_NON_Distribuito__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Donazioni\n${this.formattedTotalYearValues.Numero_Donazioni_Anno_Corrente__c || ""}`,
        fieldName: "Numero_Donazioni_Anno_Corrente__c",
        fixedWidth: 120,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Fatturati\n${this.formattedTotalYearValues.Totale_Fatturato_Budgets__c || ""}`,
        fieldName: "Totale_Fatturato_Budgets__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Capienza\n${this.formattedTotalYearValues.Capienza_budgets__c || ""}`,
        fieldName: "Capienza_budgets__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Fatture\n${this.formattedTotalYearValues.Totale_Numero_Fatture__c || ""}`,
        fieldName: "Totale_Numero_Fatture__c",
        fixedWidth: 110,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Minuti Visite\n${this.formattedTotalYearValues.Totale_Minuti_Visite_Budgets__c || ""}`,
        fieldName: "Totale_Minuti_Visite_Budgets__c",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Visite\n${this.formattedTotalYearValues.Totale_Visite_Budgets__c || ""}`,
        fieldName: "Totale_Visite_Budgets__c",
        fixedWidth: 110,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      }
    ];
  }

  get budgetColumnsAgg() {
    return [
      {
        label: `Budget`,
        fieldName: "linkOrText",
        type: "url",
        typeAttributes: {
          label: { fieldName: "displayName" },
          target: "_self"
        },
        fixedWidth: 280,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocati\n${this.formattedAggregatedTotalBudgetValues.Totale_Allocato__c || ""}`,
        fieldName: "Totale_Allocato__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagati\n${this.formattedAggregatedTotalBudgetValues.Totale_Distribuito_Pagato_Formula__c || ""}`,
        fieldName: "Totale_Distribuito_Pagato_Formula__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Pagati\n${this.formattedAggregatedTotalBudgetValues.Totale_Distribuito_NON_Pagato_Formula__c || ""}`,
        fieldName: "Totale_Distribuito_NON_Pagato_Formula__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagamenti Aperti\n${this.formattedAggregatedTotalBudgetValues.Ammontare_Pagamenti_Da_Pagare_formula__c || ""}`,
        fieldName: "Ammontare_Pagamenti_Da_Pagare_formula__c",
        type: "currency",
        fixedWidth: 160,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagamenti Chiusi\n${this.formattedAggregatedTotalBudgetValues.Ammontare_Pagamenti_Fatti_formula__c || ""}`,
        fieldName: "Ammontare_Pagamenti_Fatti_formula__c",
        type: "currency",
        fixedWidth: 160,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Fatture\n${this.formattedAggregatedTotalBudgetValues.Numero_di_Fatture_formula__c || ""}`,
        fieldName: "Numero_di_Fatture_formula__c",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Fatturati\n${this.formattedAggregatedTotalBudgetValues.Totale_Ammontare_Fatture_formula__c || ""}`,
        fieldName: "Totale_Ammontare_Fatture_formula__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Capienza\n${this.formattedAggregatedTotalBudgetValues.Capienza__c || ""}`,
        fieldName: "Capienza__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Minuti Visite\n${this.formattedAggregatedTotalBudgetValues.Totale_Minuti_di_Visita_formula__c || ""}`,
        fieldName: "Totale_Minuti_di_Visita_formula__c",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Visite\n${this.formattedAggregatedTotalBudgetValues.Totale_Numero_di_Visite_formula__c || ""}`,
        fieldName: "Totale_Numero_di_Visite_formula__c",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      }
    ];
  }

  get donorColumnsAgg() {
    return [
      {
        label: `Donatore`,
        fieldName: "linkOrText",
        type: "url",
        typeAttributes: {
          label: { fieldName: "displayName" },
          target: "_self"
        },
        fixedWidth: 280,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Donati\n${this.formattedAggregatedTotalDonorValues.Donato_Originale_formula__c || ""}`,
        fieldName: "Donato_Originale_formula__c",
        type: "currency",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocabili\n${this.formattedAggregatedTotalDonorValues.Allocabile_formula__c || ""}`,
        fieldName: "Allocabile_formula__c",
        type: "currency",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Donazioni\n${this.formattedAggregatedTotalDonorValues.Totale_Numero_Donazioni_formula__c || ""}`,
        fieldName: "Totale_Numero_Donazioni_formula__c",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Fatturati\n${this.formattedAggregatedTotalDonorValues.Totale_Fattura_formula__c || ""}`,
        fieldName: "Totale_Fattura_formula__c",
        type: "currency",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Fatturati\n${this.formattedAggregatedTotalDonorValues.Available_Amount__c || ""}`,
        fieldName: "Available_Amount__c",
        type: "currency",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Fatture\n${this.formattedAggregatedTotalDonorValues.Totale_Numero_Fatture_formula__c || ""}`,
        fieldName: "Totale_Numero_Fatture_formula__c",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Minuti Visite\n${this.formattedAggregatedTotalDonorValues.Totale_Durata_Visite_formula__c || ""}`,
        fieldName: "Totale_Durata_Visite_formula__c",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Visite\n${this.formattedAggregatedTotalDonorValues.Totale_Numero_di_Visite_formula__c || ""}`,
        fieldName: "Totale_Numero_di_Visite_formula__c",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      }
    ];
  }

  get budgetColumns() {
    return [
      {
        label: `Anno`,
        fieldName: "Anno__c",
        fixedWidth: 90,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Budget`,
        fieldName: "linkOrText",
        type: "url",
        typeAttributes: {
          label: { fieldName: "displayName" },
          target: "_self"
        },
        fixedWidth: 280,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocati\n${this.formattedTotalBudgetValues.Totale_Allocato__c || ""}`,
        fieldName: "Totale_Allocato__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagati\n${this.formattedTotalBudgetValues.Totale_Distribuito_Pagato_Formula__c || ""}`,
        fieldName: "Totale_Distribuito_Pagato_Formula__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Pagati\n${this.formattedTotalBudgetValues.Totale_Distribuito_NON_Pagato_Formula__c || ""}`,
        fieldName: "Totale_Distribuito_NON_Pagato_Formula__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagamenti Aperti\n${this.formattedTotalBudgetValues.Ammontare_Pagamenti_Da_Pagare_formula__c || ""}`,
        fieldName: "Ammontare_Pagamenti_Da_Pagare_formula__c",
        type: "currency",
        fixedWidth: 160,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Pagamenti Chiusi\n${this.formattedTotalBudgetValues.Ammontare_Pagamenti_Fatti_formula__c || ""}`,
        fieldName: "Ammontare_Pagamenti_Fatti_formula__c",
        type: "currency",
        fixedWidth: 160,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Fatture\n${this.formattedTotalBudgetValues.Numero_di_Fatture_formula__c || ""}`,
        fieldName: "Numero_di_Fatture_formula__c",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Fatturati\n${this.formattedTotalBudgetValues.Totale_Ammontare_Fatture_formula__c || ""}`,
        fieldName: "Totale_Ammontare_Fatture_formula__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Capienza\n${this.formattedTotalBudgetValues.Capienza__c || ""}`,
        fieldName: "Capienza__c",
        type: "currency",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Minuti Visite\n${this.formattedTotalBudgetValues.Totale_Minuti_di_Visita_formula__c || ""}`,
        fieldName: "Totale_Minuti_di_Visita_formula__c",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Visite\n${this.formattedTotalBudgetValues.Totale_Numero_di_Visite_formula__c || ""}`,
        fieldName: "Totale_Numero_di_Visite_formula__c",
        fixedWidth: 130,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      }
    ];
  }

  get donorColumns() {
    return [
      {
        label: `Anno`,
        fieldName: "Anno_overview__c",
        fixedWidth: 90,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Donatore`,
        fieldName: "linkOrText",
        type: "url",
        typeAttributes: {
          label: { fieldName: "displayName" },
          target: "_self"
        },
        fixedWidth: 280,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Donati\n${this.formattedTotalDonorValues.Donato_Originale_formula__c || ""}`,
        fieldName: "Donato_Originale_formula__c",
        type: "currency",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Allocabili\n${this.formattedTotalDonorValues.Allocabile_formula__c || ""}`,
        fieldName: "Allocabile_formula__c",
        type: "currency",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Donazioni\n${this.formattedTotalDonorValues.Totale_Numero_Donazioni_formula__c || ""}`,
        fieldName: "Totale_Numero_Donazioni_formula__c",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Fatturati\n${this.formattedTotalDonorValues.Totale_Fattura_formula__c || ""}`,
        fieldName: "Totale_Fattura_formula__c",
        type: "currency",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `NON Fatturati\n${this.formattedTotalDonorValues.Available_Amount__c || ""}`,
        fieldName: "Available_Amount__c",
        type: "currency",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Fatture\n${this.formattedTotalDonorValues.Totale_Numero_Fatture_formula__c || ""}`,
        fieldName: "Totale_Numero_Fatture_formula__c",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Minuti Visite\n${this.formattedTotalDonorValues.Totale_Durata_Visite_formula__c || ""}`,
        fieldName: "Totale_Durata_Visite_formula__c",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      },
      {
        label: `Num Visite\n${this.formattedTotalDonorValues.Totale_Numero_di_Visite_formula__c || ""}`,
        fieldName: "Totale_Numero_di_Visite_formula__c",
        fixedWidth: 150,
        hideDefaultActions: true,
        cellAttributes: { alignment: "left" }
      }
    ];
  }

  @wire(getAvailableYears)
  wiredYears({ error, data }) {
    if (data) {
      const uniqueYears = Array.from(new Set(data.map((y) => y.value))).map(
        (value) => ({ label: value, value })
      );
      this.yearOptions = [{ label: "Tutti gli anni", value: "" }].concat(
        uniqueYears
      );
    } else if (error) {
      console.error("Error retrieving years:", error);
    }
  }

  @wire(getRelatedRecords, { recordId: "$recordId" })
  wiredRecords({ error, data }) {
    if (data) {
      this.originalYearData = this.formatDataWithLink(data.records_anno);
      this.originalBudgetData = this.formatBudgetDataWithLink(
        data.records_budget
      );
      this.originalDonorData = this.formatDataWithLink(data.records_donor);

      this.aggregatedDonorData = this.calculateAggregatedDonorData(
        this.originalDonorData
      ).filter((record) => !this.areAllDonorValuesZero(record));

      this.aggregatedDonorPerYearData =
        this.calculateAggregatedDonorPerYearData(this.originalDonorData);

      this.aggregatedBudgetData = this.calculateAggregatedBudgetData(
        this.originalBudgetData
      ).filter((record) => !this.areAllBudgetValuesZero(record));

      this.calculateAggregatedTotalDonorValues();
      this.calculateAggregatedTotalDonorPerYearValues();
      this.calculateAggregatedTotalBudgetValues();

      this.applyYearFilter();
    } else if (error) {
      console.error("Error retrieving related records:", error);
    }
  }

  calculateAggregatedBudgetData(budgetData) {
    // Raggruppa i record per Budget__c
    const groupedBudgetData = budgetData.reduce((acc, record) => {
      const key = record.Budget__c;
      if (!acc[key]) {
        acc[key] = {
          Budget__c: key,
          BudgetName: record.Budget__r?.Name || "",
          Totale_Allocato__c: 0,
          Totale_Distribuito_Pagato_Formula__c: 0,
          Totale_Distribuito_NON_Pagato_Formula__c: 0,
          Ammontare_Pagamenti_Da_Pagare_formula__c: 0,
          Ammontare_Pagamenti_Fatti_formula__c: 0,
          Totale_Ammontare_Fatture_formula__c: 0,
          Totale_Minuti_di_Visita_formula__c: 0,
          Totale_Numero_di_Visite_formula__c: 0,
          Numero_di_Fatture_formula__c: 0,
          Capienza__c: 0
        };
      }
      acc[key].Totale_Allocato__c += record.Totale_Allocato__c || 0;
      acc[key].Totale_Distribuito_Pagato_Formula__c +=
        record.Totale_Distribuito_Pagato_Formula__c || 0;
      acc[key].Totale_Distribuito_NON_Pagato_Formula__c +=
        record.Totale_Distribuito_NON_Pagato_Formula__c || 0;
      acc[key].Ammontare_Pagamenti_Da_Pagare_formula__c +=
        record.Ammontare_Pagamenti_Da_Pagare_formula__c || 0;
      acc[key].Ammontare_Pagamenti_Fatti_formula__c +=
        record.Ammontare_Pagamenti_Fatti_formula__c || 0;
      acc[key].Totale_Ammontare_Fatture_formula__c +=
        record.Totale_Ammontare_Fatture_formula__c || 0;
      acc[key].Totale_Minuti_di_Visita_formula__c +=
        record.Totale_Minuti_di_Visita_formula__c || 0;
      acc[key].Totale_Numero_di_Visite_formula__c +=
        record.Totale_Numero_di_Visite_formula__c || 0;
      acc[key].Numero_di_Fatture_formula__c +=
        record.Numero_di_Fatture_formula__c || 0;
      acc[key].Capienza__c += record.Capienza__c || 0;
      return acc;
    }, {});

    // Trasforma l'oggetto in un array
    return Object.values(groupedBudgetData).map((item) => ({
      ...item,
      displayName: item.BudgetName,
      linkOrText: "/" + item.Budget__c
    }));
  }

  calculateAggregatedTotalBudgetValues() {
    const fields = [
      "Totale_Allocato__c",
      "Totale_Distribuito_Pagato_Formula__c",
      "Totale_Distribuito_NON_Pagato_Formula__c",
      "Ammontare_Pagamenti_Da_Pagare_formula__c",
      "Ammontare_Pagamenti_Fatti_formula__c",
      "Numero_di_Fatture_formula__c", //  ← corretto
      "Totale_Ammontare_Fatture_formula__c",
      "Totale_Minuti_di_Visita_formula__c",
      "Totale_Numero_di_Visite_formula__c",
      "Capienza__c"
    ];

    this.aggregatedTotalBudgetValues = fields.reduce((totals, field) => {
      totals[field] = this.aggregatedBudgetData.reduce(
        (sum, record) => sum + (record[field] || 0),
        0
      );
      return totals;
    }, {});

    this.formatAggregatedTotalBudgetValues();
  }

  formatAggregatedTotalBudgetValues() {
    const currencyFormatter = new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR"
    });
    const numberFormatter = new Intl.NumberFormat("it-IT");

    const numberFields = [
      "Numero_di_Fatture_formula__c",
      "Totale_Numero_di_Visite_formula__c",
      "Totale_Minuti_di_Visita_formula__c",
      "Totale_Numero_Donazioni_formula__c",
      "Totale_Numero_Fatture_formula__c"
    ];

    this.formattedAggregatedTotalBudgetValues = Object.keys(
      this.aggregatedTotalBudgetValues
    ).reduce((formattedTotals, field) => {
      formattedTotals[field] = numberFields.includes(field)
        ? numberFormatter.format(this.aggregatedTotalBudgetValues[field] || 0)
        : currencyFormatter.format(
            this.aggregatedTotalBudgetValues[field] || 0
          );
      return formattedTotals;
    }, {});
  }

  calculateAggregatedDonorData(donorData) {
    const grouped = donorData.reduce((acc, record) => {
      const isAggregated = !!record.Holding__c;
      const baseId = isAggregated
        ? record.Holding__c
        : record.Account__c.substring(0, 15);

      if (!acc[baseId]) {
        const baseRecord = donorData.find(
          (r) =>
            !r.Holding__c &&
            r.Account__c?.substring(0, 15) === baseId &&
            r.Donor_Overview__c
        );

        acc[baseId] = {
          Account__c: baseId,
          DonorName: baseRecord?.Nome_Donatore__c || "",
          Donato_Originale_formula__c: 0,
          Allocabile_formula__c: 0,
          Totale_Numero_Donazioni_formula__c: 0,
          Totale_Fattura_formula__c: 0,
          Available_Amount__c: 0,
          Totale_Numero_Fatture_formula__c: 0,
          Totale_Durata_Visite_formula__c: 0,
          Totale_Numero_di_Visite_formula__c: 0,
          isAggregated: isAggregated,
          DonorOverviewId: baseRecord?.Donor_Overview__c
        };
      }

      acc[baseId].Donato_Originale_formula__c +=
        record.Donato_Originale_formula__c || 0;
      acc[baseId].Allocabile_formula__c += record.Allocabile_formula__c || 0;
      acc[baseId].Totale_Numero_Donazioni_formula__c +=
        record.Totale_Numero_Donazioni_formula__c || 0;
      acc[baseId].Totale_Fattura_formula__c +=
        record.Totale_Fattura_formula__c || 0;
      acc[baseId].Available_Amount__c += record.Available_Amount__c || 0;
      acc[baseId].Totale_Numero_Fatture_formula__c +=
        record.Totale_Numero_Fatture_formula__c || 0;
      acc[baseId].Totale_Durata_Visite_formula__c +=
        record.Totale_Durata_Visite_formula__c || 0;
      acc[baseId].Totale_Numero_di_Visite_formula__c +=
        record.Totale_Numero_di_Visite_formula__c || 0;

      return acc;
    }, {});

    return Object.values(grouped).map((item) => ({
      ...item,
      displayName: item.DonorName,
      linkOrText: item.DonorOverviewId
        ? `#/sObject/${item.DonorOverviewId}/view`
        : null
    }));
  }

  calculateAggregatedTotalDonorValues() {
    const fields = [
      "Donato_Originale_formula__c",
      "Allocabile_formula__c",
      "Totale_Numero_Donazioni_formula__c",
      "Totale_Fattura_formula__c",
      "Available_Amount__c",
      "Totale_Numero_Fatture_formula__c",
      "Totale_Durata_Visite_formula__c",
      "Totale_Numero_di_Visite_formula__c"
    ];

    // Trova gli account master (quelli che non sono figli aggregati)
    const masterIds = new Set(
      this.originalDonorData
        .filter((r) => !r.Holding__c)
        .map((r) => r.Account__c.substring(0, 15))
    );

    // Tieni solo i record aggregati finali che sono account master
    const filtered = this.aggregatedDonorData.filter((r) =>
      masterIds.has(r.Account__c)
    );

    this.aggregatedTotalDonorValues = fields.reduce((totals, field) => {
      totals[field] = filtered.reduce(
        (sum, record) => sum + (record[field] || 0),
        0
      );
      return totals;
    }, {});

    this.formattedAggregatedTotalDonorValues = this.formatFields(
      this.aggregatedTotalDonorValues
    );
  }

  formatAggregatedTotalDonorValues() {
    const currencyFormatter = new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR"
    });
    const numberFormatter = new Intl.NumberFormat("it-IT");

    this.formattedAggregatedTotalDonorValues = Object.keys(
      this.aggregatedTotalDonorValues
    ).reduce((formattedTotals, field) => {
      formattedTotals[field] =
        field.includes("Num") || field.includes("Visits")
          ? numberFormatter.format(this.aggregatedTotalDonorValues[field] || 0)
          : currencyFormatter.format(
              this.aggregatedTotalDonorValues[field] || 0
            );
      return formattedTotals;
    }, {});
  }

  calculateAggregatedDonorPerYearData(donorData) {
    const grouped = {};

    // Mappa di riferimento rapida dei record
    const recordsById = donorData.reduce((map, record) => {
      map[record.Id] = record;
      return map;
    }, {});

    // Trova i record padri (Holding__c null)
    const parentRecords = donorData.filter((r) => !r.Holding__c);

    parentRecords.forEach((parent) => {
      const parentKey = `${parent.Account__c.substring(0, 15)}-${parent.Anno_overview__c}`;

      // Trova figli validi
      const children = donorData.filter(
        (child) =>
          child.Holding__c &&
          child.Holding__c === parent.Account__c.substring(0, 15) &&
          child.Anno_overview__c === parent.Anno_overview__c
      );

      const allRecords = [parent, ...children];

      const aggregated = {
        recordIdForLink: parent.Id,
        Anno_overview__c: parent.Anno_overview__c,
        DonorName: parent.Nome_Donatore__c || "",
        Donato_Originale_formula__c: 0,
        Allocabile_formula__c: 0,
        Totale_Numero_Donazioni_formula__c: 0,
        Totale_Fattura_formula__c: 0,
        Available_Amount__c: 0,
        Totale_Numero_Fatture_formula__c: 0,
        Totale_Durata_Visite_formula__c: 0,
        Totale_Numero_di_Visite_formula__c: 0,
        isAggregated: true
      };

      allRecords.forEach((r) => {
        aggregated.Donato_Originale_formula__c +=
          r.Donato_Originale_formula__c || 0;
        aggregated.Allocabile_formula__c += r.Allocabile_formula__c || 0;
        aggregated.Totale_Numero_Donazioni_formula__c +=
          r.Totale_Numero_Donazioni_formula__c || 0;
        aggregated.Totale_Fattura_formula__c +=
          r.Totale_Fattura_formula__c || 0;
        aggregated.Available_Amount__c += r.Available_Amount__c || 0;
        aggregated.Totale_Numero_Fatture_formula__c +=
          r.Totale_Numero_Fatture_formula__c || 0;
        aggregated.Totale_Durata_Visite_formula__c +=
          r.Totale_Durata_Visite_formula__c || 0;
        aggregated.Totale_Numero_di_Visite_formula__c +=
          r.Totale_Numero_di_Visite_formula__c || 0;
      });

      grouped[parentKey] = aggregated;
    });

    // Ordina per anno e assegna colore alternato
    const yearColorClasses = [
      "highlight-gray",
      "highlight-green",
      "highlight-blue"
    ];
    const groupedByYear = {};

    Object.values(grouped).forEach((item) => {
      if (!groupedByYear[item.Anno_overview__c]) {
        groupedByYear[item.Anno_overview__c] = [];
      }
      groupedByYear[item.Anno_overview__c].push(item);
    });

    let colorIndex = 0;
    const finalList = [];

    Object.keys(groupedByYear)
      .sort((a, b) => b.localeCompare(a))
      .forEach((anno) => {
        const group = groupedByYear[anno];
        const rowClass = yearColorClasses[colorIndex % yearColorClasses.length];
        group.forEach((r) => {
          finalList.push({
            ...r,
            displayName: r.DonorName,
            linkOrText: "/" + r.recordIdForLink,
            rowClass
          });
        });
        colorIndex++;
      });

    return finalList;
  }

  calculateAggregatedTotalDonorPerYearValues() {
    const fields = [
      "Donato_Originale_formula__c",
      "Allocabile_formula__c",
      "Totale_Numero_Donazioni_formula__c",
      "Totale_Fattura_formula__c",
      "Available_Amount__c",
      "Totale_Numero_Fatture_formula__c",
      "Totale_Durata_Visite_formula__c",
      "Totale_Numero_di_Visite_formula__c"
    ];

    const masterKeys = new Set(
      this.originalDonorData
        .filter((r) => !r.Holding__c)
        .map((r) => `${r.Account__c.substring(0, 15)}-${r.Anno_overview__c}`)
    );

    const filtered = this.aggregatedDonorPerYearData.filter((r) =>
      masterKeys.has(`${r.Account__c}-${r.Anno_overview__c}`)
    );

    this.aggregatedTotalDonorPerYearValues = fields.reduce((totals, field) => {
      totals[field] = filtered.reduce(
        (sum, record) => sum + (record[field] || 0),
        0
      );
      return totals;
    }, {});

    this.formattedAggregatedTotalDonorPerYearValues = this.formatFields(
      this.aggregatedTotalDonorPerYearValues
    );
  }

  formatFields(values) {
    const currencyFormatter = new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR"
    });
    const numberFormatter = new Intl.NumberFormat("it-IT");

    // ⇣  REGEXP che intercetta sia “Num” sia “Numero” ecc.
    const isNumberField = (field) => /(num|numero|visite|minuti)/i.test(field);

    return Object.keys(values).reduce((formatted, field) => {
      formatted[field] = isNumberField(field)
        ? numberFormatter.format(values[field] || 0)
        : currencyFormatter.format(values[field] || 0);
      return formatted;
    }, {});
  }

  formatDataWithLink(data) {
    return (data || []).map((record) => ({
      ...record,
      displayName:
        record.Nome_Donatore__c ||
        (record.Budget__r ? record.Budget__r.Name : record.Name),
      linkOrText: "/" + record.Id,
      Capienza__c:
        (record.Totale_Allocato__c || 0) -
        (record.Totale_Ammontare_Fatture_formula__c || 0)
    }));
  }

  formatBudgetDataWithLink(data) {
    return (data || []).map((record) => ({
      ...record,
      displayName: record.Budget__r?.Name || record.Name,
      linkOrText: "/" + record.Id,
      Capienza__c:
        (record.Totale_Allocato__c || 0) -
        (record.Totale_Ammontare_Fatture_formula__c || 0)
    }));
  }

  handleYearChange(event) {
    this.selectedYear = event.detail.value;
    this.applyYearFilter();
  }

  areAllBudgetValuesZero(record) {
    const fields = [
      "Totale_Allocato__c",
      "Totale_Distribuito_Pagato_Formula__c",
      "Totale_Distribuito_NON_Pagato_Formula__c",
      "Ammontare_Pagamenti_Da_Pagare_formula__c",
      "Ammontare_Pagamenti_Fatti_formula__c",
      "Numero_di_Fatture_formula__c",
      "Totale_Ammontare_Fatture_formula__c",
      "Totale_Minuti_di_Visita_formula__c",
      "Totale_Numero_di_Visite_formula__c",
      "Capienza__c"
    ];
    return fields.every((field) => !record[field] || record[field] === 0);
  }

  areAllDonorValuesZero(record) {
    const fields = [
      "Donato_Originale_formula__c",
      "Allocabile_formula__c",
      "Totale_Numero_Donazioni_formula__c",
      "Totale_Fattura_formula__c",
      "Available_Amount__c",
      "Totale_Numero_Fatture_formula__c",
      "Totale_Durata_Visite_formula__c",
      "Totale_Numero_di_Visite_formula__c"
    ];
    return fields.every((field) => !record[field] || record[field] === 0);
  }

  applyYearFilter() {
    this.yearData = (this.originalYearData || [])
      .filter(
        (record) => !this.selectedYear || record.Name === this.selectedYear
      )
      .sort((a, b) => b.Name.localeCompare(a.Name));

    this.budgetData = (this.originalBudgetData || [])
      .filter(
        (record) =>
          (!this.selectedYear || record.Anno__c === this.selectedYear) &&
          !this.areAllBudgetValuesZero(record)
      )
      .sort((a, b) => b.Anno__c.localeCompare(a.Anno__c));

    this.donorData = (this.aggregatedDonorPerYearData || [])
      .filter(
        (record) =>
          (!this.selectedYear ||
            record.Anno_overview__c === this.selectedYear) &&
          !this.areAllDonorValuesZero(record)
      )
      .sort((a, b) => b.Anno_overview__c.localeCompare(a.Anno_overview__c));

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
  }

  calculateTotalValues(dataKey, totalValuesKey, formattedTotalValuesKey) {
    const fields = {
      yearData: [
        "Ammontare_Originale_Donato__c",
        "Totale_Allocabile__c",
        "Ammontare_Distribuzioni__c",
        "Ammontare_Distribuzioni_Pagate__c",
        "Ammontare_Distribuzioni_NON_Pagate__c",
        "Totale_NON_Distribuito__c",
        "Numero_Donazioni_Anno_Corrente__c",
        "Totale_Fatturato_Budgets__c",
        "Capienza_budgets__c",
        "Totale_Numero_Fatture__c",
        "Totale_Minuti_Visite_Budgets__c",
        "Totale_Visite_Budgets__c"
      ],
      budgetData: [
        "Totale_Allocato__c",
        "Totale_Distribuito_NON_Pagato_Formula__c",
        "Totale_Distribuito_Pagato_Formula__c",
        "Ammontare_Pagamenti_Da_Pagare_formula__c",
        "Ammontare_Pagamenti_Fatti_formula__c",
        "Numero_di_Fatture_formula__c",
        "Totale_Ammontare_Fatture_formula__c",
        "Totale_Minuti_di_Visita_formula__c",
        "Totale_Numero_di_Visite_formula__c",
        "Capienza__c"
      ],
      donorData: [
        "Donato_Originale_formula__c",
        "Allocabile_formula__c",
        "Totale_Numero_Donazioni_formula__c",
        "Totale_Fattura_formula__c",
        "Available_Amount__c",
        "Totale_Numero_Fatture_formula__c",
        "Totale_Durata_Visite_formula__c",
        "Totale_Numero_di_Visite_formula__c"
      ]
    }[dataKey];

    this[totalValuesKey] = fields.reduce((totals, field) => {
      totals[field] = this[dataKey].reduce(
        (sum, record) => sum + (record && record[field] ? record[field] : 0),
        0
      );
      return totals;
    }, {});

    this[formattedTotalValuesKey] = this.formatFields(this[totalValuesKey]);
  }

  formatTotalValues(totalValuesKey, formattedTotalValuesKey) {
    const currencyFormatter = new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR"
    });
    const numberFormatter = new Intl.NumberFormat("it-IT");

    this[formattedTotalValuesKey] = Object.keys(this[totalValuesKey]).reduce(
      (formattedTotals, field) => {
        formattedTotals[field] =
          field.includes("Num") ||
          field.includes("Visite") ||
          field.includes("Numero")
            ? numberFormatter.format(this[totalValuesKey][field] || 0)
            : currencyFormatter.format(this[totalValuesKey][field] || 0);
        return formattedTotals;
      },
      {}
    );
  }

  /**  Forza gli header della lightning-datatable a rispettare i \n  */
  renderedCallback() {
    /* con Synthetic Shadow i nodi interni sono visibili al template */
    const headers = this.template.querySelectorAll(
      "lightning-datatable th .slds-truncate"
    );

    /* se non ci sono ancora header la tabella non è pronta:   */
    /* il codice verrà rieseguito al prossimo render            */
    if (!headers.length) {
      return;
    }

    headers.forEach((el) => {
      /* rende effettivo l’andata a capo */
      el.style.whiteSpace = "pre-wrap";
      /* opz.: evita i puntini di overflow */
      el.style.textOverflow = "unset";
    });
  }
}