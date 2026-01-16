import { LightningElement, api, wire, track } from "lwc";
import getRelatedRecords from "@salesforce/apex/RetrieveDonatore.getRelatedRecords";

const STATIC_COLUMNS = [
  {
    label: "Codice",
    fieldName: "recordLink",
    type: "url",
    typeAttributes: { label: { fieldName: "name" }, target: "_self" }
  },
  { label: "Donati", fieldName: "totalOriginalDonation", type: "currency" },
  { label: "Allocabili", fieldName: "totalAllocable", type: "currency" },
  { label: "Num Donazioni", fieldName: "totalDonations", type: "number" },
  { label: "Fatturati", fieldName: "totalInvoiced", type: "currency" },
  { label: "NON Fatturati", fieldName: "notInvoiced", type: "currency" },
  { label: "Num Fatture", fieldName: "numInvoices", type: "number" }
];

export default class OverviewDonatore extends LightningElement {
  @api recordId;
  @track programTables = [];
  hasError = false;

  @wire(getRelatedRecords, { accountId: "$recordId" })
  wiredData({ error, data }) {
    if (error) {
      console.error("Errore Apex:", error);
      this.hasError = true;
      return;
    }

    if (!data) return;

    this.hasError = false;

    const tables = data.map((program) => {
      const dynamicColumns = this.buildDynamicColumns(
        program.dynamicFields || []
      );
      const columns = [...STATIC_COLUMNS, ...dynamicColumns];

      const aggregateRows = program.aggregate
        ? [this.flattenRow(program.aggregate)]
        : [];

      const dettagliRows = (program.dettagli || []).map((r) =>
        this.flattenRow(r)
      );

      const rows = (program.rows || []).map((r) => this.flattenRow(r));

      return {
        programmaId: program.programmaId,
        programmaName: program.programmaName,
        columns,
        aggregateRows,
        dettagliRows,
        rows
      };
    });

    this.programTables = tables;
  }

  flattenRow(row) {
    const dynamicFields = row.extraFields || {};
    return {
      ...row,
      programLink: "/" + row.programmaId,
      name: row.donorName || row.name,
      recordLink: row.donorLink || "/" + row.fakeId,
      ...dynamicFields
    };
  }

  buildDynamicColumns(dynamicFields) {
    const TYPE_MAP = {
      number: "number",
      currency: "currency",
      percent: "percent"
    };

    return dynamicFields.map((f) => {
      const lwcType = TYPE_MAP[(f.dataType || "").toLowerCase()] || "text";

      const column = {
        label: f.label,
        fieldName: f.fieldApi,
        type: lwcType
      };

      if (lwcType !== "text") {
        column.cellAttributes = { alignment: "right" };
      }

      if (lwcType === "currency") {
        column.typeAttributes = {
          currencyCode: "EUR",
          minimumFractionDigits: 2
        };
      }

      return column;
    });
  }
}