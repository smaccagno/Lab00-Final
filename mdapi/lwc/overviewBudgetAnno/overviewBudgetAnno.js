import { LightningElement, api, wire, track } from "lwc";
import getSingleRecord from "@salesforce/apex/RetrieveBudgetAnno.getSingleRecord";

const STATIC_COLUMNS = [
  {
    label: "Codice",
    fieldName: "recordLink", // Questo campo conterrà il link
    type: "url", // Il tipo sarà 'url'
    typeAttributes: {
      label: { fieldName: "Name" }, // Mostra il nome del record come testo del link
      target: "_self" // Apri il link nella stessa scheda
    }
  },
  { label: "Anno", fieldName: "Anno__c", type: "text", align: "right" },
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

function normalizeType(t) {
  return (t ?? "currency").toString().trim().toLowerCase(); // 'number', 'currency', 'text'
}

export default class overviewBudgetAnno extends LightningElement {
  @api recordId;
  @track columns = [];
  @track relatedData = [];
  sortDirection = "desc";
  sortedBy = "Anno__c";
  @track fieldConfig = {}; // fieldApi → type (da Program_Field_Config__mdt)

  @wire(getSingleRecord, { recordId: "$recordId" })
  wiredData({ error, data }) {
    if (data) {
      this.fieldConfig = {};
      (data.dynamicFields || []).forEach((f) => {
        console.log(`[DEBUG FIELD] ${f.fieldApi} → ${f.Type__c}`); // AGGIUNGI QUESTO
        this.fieldConfig[f.fieldApi] = f.dataType;
      });

      this.columns = [
        ...STATIC_COLUMNS,
        ...(data.dynamicFields || []).map((f) => ({
          label: f.label,
          fieldName: f.fieldApi,
          type: this.getFieldType(f.fieldApi),
          metadataType: this.getFieldType(f.fieldApi)
        }))
      ];

      this.relatedData = (data.records || [])
        .map((rec) => ({
          ...rec,
          recordLink: "/" + rec.Id
        }))
        .sort((a, b) => b.Anno__c - a.Anno__c);
    } else if (error) {
      console.error("Errore Apex:", error);
    }
  }

  getFieldType(fieldApi) {
    // 1. Se il tipo è definito esplicitamente dal metadata, lo usiamo
    const type = this.fieldConfig?.[fieldApi];
    if (type) return normalizeType(type);

    // 2. Fallback solo per contatori
    if (fieldApi.includes("Numero") || fieldApi.includes("Count")) {
      return "number";
    }

    // 3. Default fallback: 'currency'
    return "currency";
  }

  onHandleSort(event) {
    const { fieldName: sortedBy, sortDirection } = event.detail;
    const cloneData = [...this.relatedData];

    const key = (x) => x[sortedBy];
    cloneData.sort((a, b) => {
      a = key(a);
      b = key(b);
      return sortDirection === "asc" ? a - b : b - a;
    });

    this.relatedData = cloneData;
    this.sortDirection = sortDirection;
    this.sortedBy = sortedBy;
  }
}