import { LightningElement, api, wire, track } from "lwc";
import getRawRecords from "@salesforce/apex/RetrieveDonatoreProgramma.getRawRecords";

export default class Overview_Donatore_Programma extends LightningElement {
  @api recordId;

  @track columns = [];
  @track relatedData = [];
  @track childData = [];
  @track hasChildren = false;

  defaultSortDirection = "desc";
  sortDirection = "desc";
  sortedBy = "Anno_overview__c";
  normalizeType(t) {
    const normalized = (t ?? "").toString().trim().toLowerCase();
    if (normalized.includes("curr")) return "currency";
    if (normalized.includes("num")) return "number";
    if (normalized.includes("text")) return "text";
    if (normalized.includes("percent")) return "percent";
    if (normalized.includes("date")) return "date";
    return "text";
  }
  staticColumns = [
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

  @wire(getRawRecords, { parentId: "$recordId" })
  wiredData({ error, data }) {
    if (data) {
      const dynamicFields = data.dynamicFields || [];
      const allRecords = data.records || [];

      // Costruzione colonne dinamiche
      const dynamicCols = dynamicFields.map((f) => ({
        label: f.label,
        fieldName: f.fieldApi,
        type: this.normalizeType(f.dataType)
      }));
      this.columns = [...this.staticColumns, ...dynamicCols];

      const root = allRecords.find(
        (r) => r.Donor_Overview__c === this.recordId
      );
      if (!root) return;

      const isHolding = !root.Holding__c;
      const holdingKey = isHolding
        ? String(root.Account__c).substring(0, 15)
        : root.Holding__c;

      // Raggruppamento per anno
      const grouped = {};
      for (const r of allRecords) {
        const isChild = r.Holding__c === holdingKey;
        const isHoldingRec =
          !r.Holding__c &&
          r.Account__c &&
          String(r.Account__c).substring(0, 15) === holdingKey;
        if (!(isChild || isHoldingRec)) continue;

        const anno = r.Anno_overview__c;
        if (!anno) continue;

        if (!grouped[anno]) grouped[anno] = [];
        grouped[anno].push(r);
      }

      const aggregati = [];
      const figli = [];

      for (const anno in grouped) {
        const group = grouped[anno];
        const aggregate = {
          fakeId: anno + "_" + Math.floor(Math.random() * 1000000),
          Anno_overview__c: anno,
          Ammontare_Originale_Donato_Anno_Corrente__c: 0,
          Current_Year_Donation_Amount__c: 0,
          Current_Year_Donation_Number__c: 0,
          Total_Invoice_Amount__c: 0,
          Available_Amount__c: 0,
          Totale_Numero_di_Fatture__c: 0
        };

        let holdingRecord = null;

        for (const r of group) {
          const isHoldingRec =
            !r.Holding__c &&
            r.Account__c &&
            String(r.Account__c).substring(0, 15) === holdingKey;
          if (!holdingRecord && isHoldingRec) holdingRecord = r;

          // Campi statici
          aggregate.Ammontare_Originale_Donato_Anno_Corrente__c +=
            r.Ammontare_Originale_Donato_Anno_Corrente__c || 0;
          aggregate.Current_Year_Donation_Amount__c +=
            r.Current_Year_Donation_Amount__c || 0;
          aggregate.Current_Year_Donation_Number__c +=
            r.Current_Year_Donation_Number__c || 0;
          aggregate.Total_Invoice_Amount__c += r.Total_Invoice_Amount__c || 0;
          aggregate.Available_Amount__c += r.Available_Amount__c || 0;
          aggregate.Totale_Numero_di_Fatture__c +=
            r.Totale_Numero_di_Fatture__c || 0;

          // Campi dinamici
          dynamicFields.forEach((f) => {
            aggregate[f.fieldApi] =
              (aggregate[f.fieldApi] || 0) + (r[f.fieldApi] || 0);
          });
        }

        const fallback = group[0];
        aggregate.Name =
          holdingRecord?.Nome_Donatore__c ||
          holdingRecord?.Name ||
          fallback.Name;
        aggregate.recordLink = "/" + (holdingRecord?.Id || fallback.Id);
        aggregati.push(aggregate);

        for (const r of group) {
          if (r.Id === holdingRecord?.Id) continue;
          if (r.Donor_Overview__c !== this.recordId) continue;

          const child = {
            fakeId: r.Id,
            Name: r.Nome_Donatore__c || r.Name,
            Anno_overview__c: r.Anno_overview__c,
            recordLink: "/" + r.Id,
            Ammontare_Originale_Donato_Anno_Corrente__c:
              r.Ammontare_Originale_Donato_Anno_Corrente__c,
            Current_Year_Donation_Amount__c: r.Current_Year_Donation_Amount__c,
            Current_Year_Donation_Number__c: r.Current_Year_Donation_Number__c,
            Total_Invoice_Amount__c: r.Total_Invoice_Amount__c,
            Available_Amount__c: r.Available_Amount__c,
            Totale_Numero_di_Fatture__c: r.Totale_Numero_di_Fatture__c
          };

          dynamicFields.forEach((f) => {
            child[f.fieldApi] = r[f.fieldApi];
          });

          figli.push(child);
        }
      }

      this.relatedData = aggregati.sort(
        (a, b) => b.Anno_overview__c - a.Anno_overview__c
      );
      this.childData = figli.sort(
        (a, b) => b.Anno_overview__c - a.Anno_overview__c
      );
      this.hasChildren = figli.length > 0;
    }
  }
}