import { LightningElement, wire } from "lwc";
import getAnnoReportisticaData from "@salesforce/apex/ListViewAnnoReportistica.getAnnoReportisticaData";
import { NavigationMixin } from "lightning/navigation";

export default class ListViewAnnoReportistica extends NavigationMixin(
  LightningElement
) {
  groupedData = [];
  error;

  @wire(getAnnoReportisticaData)
  wiredData({ error, data }) {
    if (data) {
      this.error = null;

      const groupedByYear = {};

      data.forEach((wrapper) => {
        const record = wrapper.record;
        const year = record.Name;
        const yearId = record.Id;
        const programId = record.Programma__c;
        const programName = record.Programma__r?.Name || "N/A";

        // Colonne dinamiche definite da custom metadata

        const dynamicColumns =
          wrapper.dynamicFields?.map((f) => ({
            label: f.label,
            fieldName: f.fieldApi,
            type: this.getColumnType(f.dataType)
          })) || [];

        console.groupCollapsed(
          `🧩 Colonne dinamiche per il programma "${programName}" (developerName: "${record.Programma__r?.Name}")`
        );
        console.table(
          wrapper.dynamicFields?.map((f) => ({
            field: f.fieldApi,
            label: f.label,
            isSummary: f.isSummary,
            sequence: f.sequence
          }))
        );
        console.groupEnd();

        const baseColumns = [
          {
            label: "Programma",
            fieldName: "programLink",
            type: "url",
            typeAttributes: {
              label: { fieldName: "programName" },
              target: "_self"
            }
          },
          {
            label: "Donati",
            fieldName: "Ammontare_Originale_Donato__c",
            type: "currency"
          },
          {
            label: "Allocabili",
            fieldName: "Totale_Allocabile__c",
            type: "currency"
          },
          {
            label: "Allocati",
            fieldName: "Ammontare_Distribuzioni__c",
            type: "number"
          },
          {
            label: "Pagati",
            fieldName: "Ammontare_Distribuzioni_Pagate__c",
            type: "currency"
          },
          {
            label: "NON Pagati",
            fieldName: "Totale_NON_Distribuito__c",
            type: "currency"
          },
          {
            label: "Num Donazioni",
            fieldName: "Numero_Donazioni_Anno_Corrente__c"
          },
          {
            label: "Fatturati",
            fieldName: "Totale_Fatturato_Budgets__c",
            type: "currency"
          },
          {
            label: "Capienza",
            fieldName: "Capienza_budgets__c",
            type: "currency"
          },
          { label: "Num Fatture", fieldName: "Totale_Numero_Fatture__c" }
        ];

        const enrichedRecord = {
          ...record,
          programLink: `/lightning/r/Anno_Reportistica__c/${record.Id}/view`,
          programName: `${year} - ${programName}`
        };

        if (!groupedByYear[year]) {
          groupedByYear[year] = {
            year,
            yearId,
            tables: []
          };
        }

        let yearTables = groupedByYear[year].tables;
        let existingTable = yearTables.find((t) => t.programId === programId);
        if (!existingTable) {
          existingTable = {
            programId,
            programName,
            columns: [...baseColumns, ...dynamicColumns],
            records: []
          };
          yearTables.push(existingTable);
        }

        existingTable.records.push(enrichedRecord);
      });

      this.groupedData = Object.values(groupedByYear).sort((a, b) =>
        b.year.localeCompare(a.year)
      );
    } else {
      this.error = error;
      this.groupedData = [];
    }
  }

  getColumnType(sfDataType) {
    switch (sfDataType) {
      case "Currency":
        return "currency";
      case "Number":
        return "number";
      case "Percent":
        return "percent";
      default:
        return "text";
    }
  }

  navigateToRecord(event) {
    event.preventDefault();
    const recordId = event.target.dataset.id;
    this[NavigationMixin.Navigate]({
      type: "standard__recordPage",
      attributes: {
        recordId: recordId,
        actionName: "view"
      }
    });
  }
}