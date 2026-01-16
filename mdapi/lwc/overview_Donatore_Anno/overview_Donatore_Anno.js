import { LightningElement, api, wire, track } from "lwc";
import getRecords from "@salesforce/apex/RetrieveDonatoreAnno.getRecords";

const STATIC_COLUMNS = [
  {
    label: "Codice",
    fieldName: "recordLink",
    type: "url",
    typeAttributes: { label: { fieldName: "Name" }, target: "_self" }
  },
  { label: "Anno", fieldName: "Anno_overview__c" },
  {
    label: "Donati",
    fieldName: "Ammontare_Originale_Donato_Anno_Corrente__c",
    type: "currency"
  },
  {
    label: "Allocabili",
    fieldName: "Current_Year_Donation_Amount__c",
    type: "currency"
  },
  {
    label: "Num Donazioni",
    fieldName: "Current_Year_Donation_Number__c",
    type: "number"
  },
  {
    label: "Fatturati",
    fieldName: "Total_Invoice_Amount__c",
    type: "currency"
  },
  {
    label: "NON Fatturati",
    fieldName: "Available_Amount__c",
    type: "currency"
  },
  {
    label: "Num Fatture",
    fieldName: "Totale_Numero_di_Fatture__c",
    type: "number"
  }
];

export default class OverviewDonatoreAnno extends LightningElement {
  @api recordId;

  @track aggregato = [];
  @track figli = [];
  @track columns = STATIC_COLUMNS;
  @track hasFigli = false;

  @wire(getRecords, { reportingYearId: "$recordId" })
  wiredData({ data, error }) {
    if (error) {
      console.error("Errore Apex:", error);
      return;
    }
    if (!data) return;

    const records = data.rawRecords || [];
    const dynamicFields = data.dynamicFields || [];

    console.log(
      "📦 Lista completa dei record ricevuti:",
      JSON.parse(JSON.stringify(records))
    );

    const recordMap = new Map(records.map((r) => [r.Id, r]));
    const current = recordMap.get(this.recordId);

    if (!current) return;

    const isHolding = !current.Holding__c;
    const holdingKey = isHolding
      ? String(current.Account__c).substring(0, 15)
      : current.Holding__c;
    const currentAnno = current.Anno_overview__c;
    const currentProgram = current.Programma__c;

    /*----------------------------------------------
     *  Costruzione colonne dinamiche  (NUOVO)
     *---------------------------------------------*/
    const TYPE_MAP = {
      number: "number",
      currency: "currency",
      percent: "percent"
    };

    const dynamicCols = dynamicFields.map((f) => {
      // normalizza il valore del metadata
      const lwcType = TYPE_MAP[(f.dataType || "").toLowerCase()] || "text";

      const col = {
        label: f.label,
        fieldName: f.fieldApi,
        type: lwcType
      };

      // opzionale: allineamento a destra esplicito
      if (lwcType !== "text") {
        col.cellAttributes = { alignment: "right" };
      }

      // formattazione aggiuntiva per le valute
      if (lwcType === "currency") {
        col.typeAttributes = {
          currencyCode: "EUR",
          minimumFractionDigits: 2
        };
      }

      return col;
    });

    this.columns = [...STATIC_COLUMNS, ...dynamicCols];

    // Identificazione figli compatibili
    const figliValidi = records.filter((r) => {
      const isFiglio =
        r.Holding__c === holdingKey &&
        r.Anno_overview__c === currentAnno &&
        r.Programma__c === currentProgram;
      return isFiglio;
    });

    if (isHolding) {
      // Aggregazione dati
      const aggregati = [current, ...figliValidi];
      const aggRow = this.aggregate(aggregati, dynamicFields);
      this.aggregato = [aggRow];

      this.figli = figliValidi.map((r) =>
        this.mapSingleRecord(r, dynamicFields)
      );
      this.hasFigli = this.figli.length > 0;
    } else {
      this.aggregato = [this.mapSingleRecord(current, dynamicFields)];
      this.hasFigli = false;
    }
  }

  aggregate(records, dynamicFields) {
    const total = {
      recordLink: "/" + records[0].Id,
      Name: records[0].Nome_Donatore__c || records[0].Name,
      Anno_overview__c: records[0].Anno_overview__c,
      Ammontare_Originale_Donato_Anno_Corrente__c: 0,
      Current_Year_Donation_Amount__c: 0,
      Current_Year_Donation_Number__c: 0,
      Total_Invoice_Amount__c: 0,
      Available_Amount__c: 0,
      Totale_Numero_di_Fatture__c: 0
    };

    // Somma i valori
    records.forEach((r) => {
      total.Ammontare_Originale_Donato_Anno_Corrente__c +=
        r.Ammontare_Originale_Donato_Anno_Corrente__c || 0;
      total.Current_Year_Donation_Amount__c +=
        r.Current_Year_Donation_Amount__c || 0;
      total.Current_Year_Donation_Number__c +=
        r.Current_Year_Donation_Number__c || 0;
      total.Total_Invoice_Amount__c += r.Total_Invoice_Amount__c || 0;
      total.Available_Amount__c += r.Available_Amount__c || 0;
      total.Totale_Numero_di_Fatture__c += r.Totale_Numero_di_Fatture__c || 0;

      dynamicFields.forEach((f) => {
        if (["currency", "number", "percent"].includes(f.dataType)) {
          total[f.fieldApi] = total[f.fieldApi] || 0;
          total[f.fieldApi] += r[f.fieldApi] || 0;
        } else {
          // non numerico: mantieni il primo valore incontrato
          if (total[f.fieldApi] === undefined) {
            total[f.fieldApi] = r[f.fieldApi];
          }
        }
      });
    });

    return total;
  }

  mapSingleRecord(r, dynamicFields) {
    const mapped = {
      recordLink: "/" + r.Id,
      Name: r.Nome_Donatore__c || r.Name,
      Anno_overview__c: r.Anno_overview__c,
      Ammontare_Originale_Donato_Anno_Corrente__c:
        r.Ammontare_Originale_Donato_Anno_Corrente__c,
      Current_Year_Donation_Amount__c: r.Current_Year_Donation_Amount__c,
      Current_Year_Donation_Number__c: r.Current_Year_Donation_Number__c,
      Total_Invoice_Amount__c: r.Total_Invoice_Amount__c,
      Available_Amount__c: r.Available_Amount__c,
      Totale_Numero_di_Fatture__c: r.Totale_Numero_di_Fatture__c
    };

    dynamicFields.forEach((f) => {
      mapped[f.fieldApi] = r[f.fieldApi];
    });

    return mapped;
  }
}