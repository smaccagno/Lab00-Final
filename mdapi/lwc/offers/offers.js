import { LightningElement, track } from "lwc";
import getTicketAvailabilities from "@salesforce/apex/OffersController.getTicketAvailabilities";
import { NavigationMixin } from "lightning/navigation";

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_STATE_OPTION = { label: "Tutti gli stati", value: "" };
const DEFAULT_STRUCTURE_OPTION = { label: "Tutti i fornitori", value: "" };

const BASE_COLUMNS = [
  {
    label: "Nome",
    fieldName: "NameURL",
    type: "url",
    typeAttributes: {
      label: { fieldName: "Name" },
      target: "_self"
    },
    resizable: true
  },
  {
    label: "Tipologia",
    fieldName: "Type",
    type: "text",
    resizable: true,
    initialWidth: 300
  },
  {
    label: "Fornitore",
    fieldName: "StructureURL",
    type: "url",
    typeAttributes: {
      label: { fieldName: "StructureName" },
      target: "_self"
    },
    resizable: true
  },
  {
    label: "Spettacolo/Abbonamento",
    fieldName: "ShowSubscription",
    type: "url",
    typeAttributes: {
      label: { fieldName: "ShowSubscriptionLabel" },
      target: "_self"
    },
    resizable: true
  },
  {
    label: "Data/Ora Spettacolo",
    fieldName: "ShowDate",
    type: "date",
    typeAttributes: {
      year: "numeric",
      month: "numeric",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }
  },
  {
    label: "Quantità",
    fieldName: "NumberUses__c",
    type: "number",
    resizable: true
  },
  {
    label: "Scadenza",
    fieldName: "OfferExpirationDate__c",
    type: "date",
    resizable: true
  },
  {
    label: "Valore Commerciale (€)",
    fieldName: "PriceFull__c",
    type: "currency",
    resizable: true
  },
  {
    label: "Valore Scontato (€)",
    fieldName: "PriceDiscounted__c",
    type: "currency",
    resizable: true
  },
  {
    label: "Stato",
    fieldName: "State__c",
    type: "text",
    resizable: true
  }
];

export default class Offers extends NavigationMixin(LightningElement) {
  @track data = [];
  @track columns = BASE_COLUMNS;
  @track stateOptions = [DEFAULT_STATE_OPTION];
  @track structureOptions = [DEFAULT_STRUCTURE_OPTION];
  @track loadMoreStatus = "Loading";

  selectedStructure = "";
  selectedState = "";
  error;
  isDefaultPartner = false;

  pageSize = DEFAULT_PAGE_SIZE;
  offset = 0;
  hasMoreData = true;
  isLoading = false;
  isInitialLoad = true;

  connectedCallback() {
    this.loadData(true);
  }

  get showEmptyState() {
    return !this.isLoading && this.data.length === 0;
  }

  get tableKey() {
    return `offers-table-${this.offset}`;
  }

  async loadData(reset = false) {
    if (this.isLoading || (!this.hasMoreData && !reset)) {
      return;
    }

    this.isLoading = true;
    if (reset) {
      this.isInitialLoad = true;
      this.offset = 0;
      this.hasMoreData = true;
    }

    try {
      const response = await getTicketAvailabilities({
        states: this.selectedState ? [this.selectedState] : null,
        limitSize: this.pageSize,
        offsetSize: this.offset,
        searchTerm: null,
        includeStates: reset,
        structureId: this.selectedStructure || null
      });

      const transformedRows = (response?.records || []).map((record) =>
        this.transformRecord(record)
      );

      if (reset) {
        this.data = transformedRows;
        this.offset = transformedRows.length;
      } else {
        this.data = [...this.data, ...transformedRows];
        this.offset += transformedRows.length;
      }

      this.hasMoreData = transformedRows.length === this.pageSize;
      this.loadMoreStatus = this.hasMoreData ? "Loading" : "No more data";
      this.isDefaultPartner = response?.isDefaultPartner || false;
      this.error = undefined;

      if (reset) {
        if (response?.availableStates) {
          const uniqueStates = Array.from(
            new Set(response.availableStates.filter((value) => !!value))
          );
          this.stateOptions = [
            DEFAULT_STATE_OPTION,
            ...uniqueStates.map((stateValue) => ({
              label: stateValue,
              value: stateValue
            }))
          ];
        } else {
          this.stateOptions = [DEFAULT_STATE_OPTION];
        }

        const providerOptions = (response?.availableStructures || []).map(
          (option) => ({
            label: option?.label || "Fornitore senza nome",
            value: option?.value || ""
          })
        );
        const uniqueProviders = providerOptions.filter(
          (option, index, arr) =>
            option.value &&
            arr.findIndex((el) => el.value === option.value) === index
        );
        this.structureOptions = [
          DEFAULT_STRUCTURE_OPTION,
          ...uniqueProviders
        ];
        if (
          this.selectedStructure &&
          !uniqueProviders.some((option) => option.value === this.selectedStructure)
        ) {
          this.selectedStructure = "";
        }
      }
    } catch (err) {
      this.error = err;
      // eslint-disable-next-line no-console
      console.error("Errore nel caricamento delle offerte:", err);
      if (reset) {
        this.data = [];
        this.hasMoreData = false;
        this.loadMoreStatus = "No data";
      }
    } finally {
      this.isLoading = false;
      this.isInitialLoad = false;
    }
  }

  transformRecord(record) {
    const nameUrl = `/${record.Id}`;
    const structureUrl = record.Structure__c ? `/${record.Structure__c}` : null;
    const typeParts = [
      record.TicketType__c,
      record.IssuanceType__c,
      record.PaymentType__c
    ].filter(Boolean);
    const typeValue = typeParts.join(" ");

    let showSubscription = null;
    let showSubscriptionLabel = null;
    if (record.Show__c) {
      showSubscription = `/${record.Show__c}`;
      showSubscriptionLabel = record.Show__r ? record.Show__r.Name : record.Name;
    } else {
      showSubscription = `/${record.Id}`;
      showSubscriptionLabel =
        record.SubscriptionName__c || record.Name || "N/A";
    }

    return {
      ...record,
      NameURL: nameUrl,
      StructureURL: structureUrl,
      StructureName: record.Structure__r ? record.Structure__r.Name : null,
      ShowSubscription: showSubscription,
      ShowSubscriptionLabel: showSubscriptionLabel,
      Type: typeValue,
      ShowDate: record.Show__r ? record.Show__r.Datetime__c : null
    };
  }

  handleStateChange(event) {
    this.selectedState = event.detail.value || "";
    this.loadData(true);
  }

  handleResetFilters() {
    this.selectedState = "";
    this.selectedStructure = "";
    this.loadData(true);
  }

  handleStructureChange(event) {
    this.selectedStructure = event.detail.value || "";
    this.loadData(true);
  }

  async handleLoadMore(event) {
    const target = event ? event.target : null;
    if (this.isLoading || !this.hasMoreData) {
      if (target && typeof target.isLoading !== "undefined") {
        target.isLoading = false;
      }
      return;
    }
    if (target && typeof target.isLoading !== "undefined") {
      target.isLoading = true;
    }
    try {
      await this.loadData(false);
    } finally {
      if (target && typeof target.isLoading !== "undefined") {
        target.isLoading = false;
      }
    }
  }
}