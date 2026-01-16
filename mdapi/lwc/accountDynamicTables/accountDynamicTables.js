import { LightningElement, track } from "lwc";
import getAccountTables from "@salesforce/apex/AccountDynamicTableCtrl.getAccountTables";

export default class AccountDynamicTables extends LightningElement {
  @track tables;
  @track error;

  normalizeLabel(label) {
    if (typeof label !== "string") {
      return label;
    }
    return label === "Struttura" ? "Fornitore" : label;
  }

  get errorMessage() {
    if (!this.error) {
      return "";
    }
    // LWC / fetch errors possono avere vari formati
    if (Array.isArray(this.error.body)) {
      return this.error.body.map((e) => e.message).join(" | ");
    }
    if (typeof this.error.body === "string") {
      return this.error.body;
    }
    return this.error.message || JSON.stringify(this.error);
  }

  connectedCallback() {
    this.loadTables();
  }

  async loadTables() {
    try {
      const rawTables = await getAccountTables();

      // -----------  ➜  ENRICH: URL + colonne  ----------- //
      this.tables = rawTables.map((tbl) => {
        /* 1.  aggiungiamo _recordUrl a ogni riga */
        const rows = tbl.rows.map((r) => ({ ...r, _recordUrl: "/" + r.Id }));

        /* 2.  trasformiamo la colonna Name in link */
        const columns = tbl.columns.map((c) => {
          const label = this.normalizeLabel(c.label);
          if (c.fieldName === "Nome_Donatore__c") {
            // <-- Nome Donatore
            return {
              label,
              fieldName: "_recordUrl", // usa l’URL appena creato
              type: "url",
              typeAttributes: {
                label: { fieldName: "Nome_Donatore__c" }
              }
            };
          }
          return { ...c, label }; // tutte le altre colonne invariate
        });

        return {
          ...tbl,
          recordTypeLabel: this.normalizeLabel(tbl.recordTypeLabel),
          columns,
          rows
        };
      });

      /* ----------- LOG leggibile  ----------- */
      console.table(
        this.tables.flatMap((t) =>
          t.rows.map((r) => ({
            id: r.Id,
            name: r.Name,
            url: r._recordUrl
          }))
        )
      );
      /* ----------- fine LOG ----------- */

      this.error = undefined;
    } catch (e) {
      this.error = e;
      this.tables = undefined;
    }
  }
}