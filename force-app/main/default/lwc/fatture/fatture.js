/****************************************************************************************
 *  invoices.js – LWC “Lista Fatture”
 *  • Nessuna opzione “Tutti i Programmi”: l’utente deve scegliere un Programma.
 *  • Se il Programma non è selezionato non parte alcuna query, compare un messaggio rosso.
 *  • Colonne e totali sono costruiti al 100 % dai metadati dinamici.
 ****************************************************************************************/
import { LightningElement, api, wire, track } from "lwc";
import SheetJS from "@salesforce/resourceUrl/SheetJS";
import { loadScript } from "lightning/platformResourceLoader";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import LightningConfirm from "lightning/confirm";
import { getFocusedTabInfo, refreshTab } from "lightning/platformWorkspaceApi";
import { refreshApex } from "@salesforce/apex";
/* ---------------- Apex ---------------- */
import getRelatedRecords from "@salesforce/apex/Fatture.getRelatedRecords";
import deleteInvoice from "@salesforce/apex/Fatture.deleteInvoice";
import getAvailableYears from "@salesforce/apex/Fatture.getAvailableYears";
import getAvailableBudgets from "@salesforce/apex/Fatture.getAvailableBudgets";
import getAvailablePrograms from "@salesforce/apex/Fatture.getAvailablePrograms";
import getProgramsForBudget from "@salesforce/apex/Fatture.getProgramsForBudget";
import getAvailableDonors from "@salesforce/apex/Fatture.getAvailableDonors";
import getUserBudget from "@salesforce/apex/Fatture.getUserBudget";

function formatValue(api, value) {
  const isInt = /(Num|Numero|Visite|Minuti|Duration|Durata|Count)/i.test(api);
  return isInt
    ? new Intl.NumberFormat("it-IT").format(value || 0)
    : new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR"
      }).format(value || 0);
}

/* ---------------- Colonne base ---------------- */
const COLS_FULL_BASE = [
  {
    label: "Codice Fattura",
    fieldName: "recordLink",
    type: "url",
    typeAttributes: { label: { fieldName: "Name" }, target: "_self" }
  },
  {
    label: "Budget",
    fieldName: "budgetLink",
    type: "url",
    typeAttributes: { label: { fieldName: "Nome_Budget__c" }, target: "_self" }
  },
  {
    label: "Budget per Anno",
    fieldName: "budgetAnnoLink",
    type: "url",
    typeAttributes: {
      label: { fieldName: "Overview_Budget_Anno__c" },
      target: "_self"
    }
  },
  {
    label: "Data di Competenza",
    fieldName: "Data_di_Competenza__c",
    type: "date"
  },
  { label: "Numero Fattura", fieldName: "Invoice_Number__c", type: "text" },
  { label: "Ammontare", fieldName: "Totale_Fattura__c", type: "currency" },
  {
    label: "Donatore",
    fieldName: "donorLink",
    type: "url",
    typeAttributes: {
      label: { fieldName: "Nome_Donatore__c" },
      target: "_self"
    }
  }
];

const COLS_NOBUDGET_BASE = [
  {
    label: "Codice Fattura",
    fieldName: "recordLink",
    type: "url",
    typeAttributes: { label: { fieldName: "Name" }, target: "_self" }
  },
  {
    label: "Data di Competenza",
    fieldName: "Data_di_Competenza__c",
    type: "date"
  },
  { label: "Numero Fattura", fieldName: "Invoice_Number__c", type: "text" },
  { label: "Ammontare", fieldName: "Totale_Fattura__c", type: "currency" },
  { label: "Donatore", fieldName: "Nome_Donatore__c", type: "text" }
];

const fmtNumber = new Intl.NumberFormat("it-IT");
const fmtCurrency = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR"
});

const MONTH_OPTIONS = [
  { label: "Tutti i mesi", value: "" },
  { label: "Gennaio", value: "1" },
  { label: "Febbraio", value: "2" },
  { label: "Marzo", value: "3" },
  { label: "Aprile", value: "4" },
  { label: "Maggio", value: "5" },
  { label: "Giugno", value: "6" },
  { label: "Luglio", value: "7" },
  { label: "Agosto", value: "8" },
  { label: "Settembre", value: "9" },
  { label: "Ottobre", value: "10" },
  { label: "Novembre", value: "11" },
  { label: "Dicembre", value: "12" }
];

/* ============================================================================= */
export default class Invoices extends LightningElement {
  @api recordId;
  noBudgetFound = false; // ← quando TRUE blocca tutto
  /* ---------- stato ---------- */
  @track hideBudget = false;
  @track columns = [];
  @track relatedData = [];
  @track dynamicCols = [];
  @track totalsByField = {}; // { api ➜ somma }
  @track budgetOptions = [];
  @track programOptions = [];
  @track donorOptions = [];
  @track yearOptions = [];
  @track totalsSummary = []; // ← array { api , label , formatted }
  @track monthOptions = MONTH_OPTIONS;
  defaultDonorFiltered = false;
  @track showProgramFilter = true;
  // Mantiene l'ultimo meta dinamico per aggiornare il riepilogo anche in append
  latestDynamicMeta = [];

  allComuniData = [];
  isLoading = false;
  // Chiave per invalidare lo storable cache di Apex quando necessario
  refreshKey = "";

  /* ---------- filtri ---------- */
  selectedYear = String(new Date().getFullYear());
  selectedMonth = "";
  selectedBudget = "";
  selectedProgram = ""; // obbligatorio
  selectedDonor = "";
  invoiceNumberFilter = "";

  /* ---------- sort ---------- */
  defaultSortDirection = "asc";
  sortDirection = "asc";
  sortedBy = "";

  currentOffset = 0;
  pageSize = 50; // o il numero di righe da caricare per pagina
  hasMoreData = true;
  isLoadingMore = false;
  wiredDonorResult;
  userBudgetId = "";
  // Export
  sheetJsLoaded = false;
  isExporting = false;
  /* ====================================================== */
  connectedCallback() {
    this.init();
    // Carica SheetJS una sola volta per i pulsanti di export
    loadScript(this, SheetJS)
      .then(() => (this.sheetJsLoaded = true))
      .catch((err) => console.error("[Fatture] Errore SheetJS:", err));
  }

  async init() {
    this.isLoading = true;
    try {
      const ub = await getUserBudget();
      if (!ub || !ub.id) {
        /* ⇨ nessun budget ⇒ blocca il componente */
        this.noBudgetFound = true;
        this.columns = []; // niente colonne
        this.relatedData = []; // niente righe
        return; // esce senza ulteriori chiamate
      }

      /* --- budget trovato --- */
      if (ub && ub.id) {
        this.userBudgetId = ub.id; // lo salvi sempre

        if (ub.isDefault) {
          // ➜ budget di default: mostra il filtro e NON pre-filtrare
          this.hideBudget = false;
          this.selectedBudget = ""; // ← vuoto ➜ nessuna clausola Budget__c nella query
        } else {
          // ➜ budget non di default: nascondi e blocca la ricerca su quel budget
          this.hideBudget = true;
          this.selectedBudget = ub.id; // continuerà a comparire nel SOQL
        }

        this.defaultDonorFiltered = false;
      }

      this.columns = this.hideBudget ? COLS_NOBUDGET_BASE : COLS_FULL_BASE;
      await this.loadProgramOptions();

      // 🟢 Carica i dati solo se il Programma è già selezionato
      if (this.selectedProgram) {
        await this.loadData(true); // reset iniziale
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoading = false;
    }
    if (this.wiredDonorResult) {
      await refreshApex(this.wiredDonorResult);
    }
  }

  /* ---------------- opzione Programma (obblig.) ---------------- */
  /* ---------------- opzione Programma (obblig.) ---------------- */
  async loadProgramOptions() {
    try {
      // 1. recupera i programmi collegati al budget (o tutti se budget vuoto)
      const data = this.selectedBudget
        ? await getProgramsForBudget({ bid: this.selectedBudget })
        : await getAvailablePrograms();

      // 2. popola la combo (N.B. nessuna voce “Tutti i Programmi”)
      this.programOptions = data.map((p) => ({ label: p.name, value: p.id }));
      this.showProgramFilter = this.programOptions.length > 1;
      /* 3. auto-selezione:
       *    – se la lista contiene UN SOLO elemento
       *    – e non c'è già un Programma selezionato
       */
      if (this.programOptions.length === 1 && !this.selectedProgram) {
        this.selectedProgram = this.programOptions[0].value;
        // carica subito le fatture (reset = true)
        await this.loadData(true);
      } else if (
        this.selectedProgram &&
        !this.programOptions.some((p) => p.value === this.selectedProgram)
      ) {
        // se il programma precedentemente selezionato non è più valido
        this.selectedProgram = "";
      }
    } catch (e) {
      console.error(e);
    }
  }

  /* ---------------- budgets ---------------- */
  @wire(getAvailableBudgets, { pid: "$selectedProgram" })
  wiredBudgets({ error, data }) {
    if (data && !this.hideBudget) {
      this.budgetOptions = data.map((b) => ({ label: b.name, value: b.id }));
      if (!this.budgetOptions.some((o) => o.value === this.selectedBudget))
        this.selectedBudget = "";
    } else if (error) console.error(error);
  }

  /* ---------------- anni ---------------- */
  @wire(getAvailableYears)
  wiredYears({ error, data }) {
    if (data) {
      this.yearOptions = [{ label: "Tutti gli anni", value: "" }].concat(
        data.map((y) => ({ label: y, value: y }))
      );
    } else if (error) console.error(error);
  }

  /* ---------------- donatori ---------------- */
  @wire(getAvailableDonors)
  wiredDonors(result) {
    // ✔️ ricevi l’oggetto completo
    this.wiredDonorResult = result; // lo salvi per refreshApex
    const { error, data } = result; // destrutturi

    if (error) {
      console.error("Errore nel recupero donatori:", error);
      return;
    }
    if (!data) return;

    let list = data; // data è array di { id , name , isDefault }

    // ► se il budget è nascosto dobbiamo escludere quello di default
    if (this.hideBudget && !this.defaultDonorFiltered) {
      list = list.filter((d) => !d.isDefault);
      this.defaultDonorFiltered = true;
    }

    this.donorOptions = [
      { label: "Tutti i donatori", value: "" },
      ...list.map((d) => ({ label: d.name, value: d.id }))
    ];

    // se l’opzione selezionata è stata appena filtrata via, azzera il filtro
    if (!this.donorOptions.some((o) => o.value === this.selectedDonor)) {
      this.selectedDonor = "";
    }
  }

  /* ---------------- GETTER per bloccare il wire ---------------- */
  get programParam() {
    return this.selectedProgram || undefined;
  }

  /* -------------------------------------------------------------
   *  loadData – versione corretta: ricalcola i totali solo
   *  quando reset === true e non li sovrascrive nelle pagine after.
   * ----------------------------------------------------------- */
  async loadData(reset = false) {
    if (this.noBudgetFound || this.isLoadingMore || !this.selectedProgram) {
      return;
    }

    this.isLoadingMore = true;

    try {
      /* ---------- query Apex ---------- */
      const data = await getRelatedRecords({
        year: this.selectedYear,
        budgetId: this.selectedBudget,
        month: this.selectedMonth ? Number(this.selectedMonth) : "",
        programId: this.selectedProgram,
        donorId: this.selectedDonor,
        invoiceNumber: this.invoiceNumberFilter,
        limitSize: this.pageSize,
        offsetSize: reset ? 0 : this.currentOffset,
        refreshKey: this.refreshKey
      });

      /* ---------- gestisci totali SOLO al primo chunk ---------- */
      if (reset) {
        this.totalsByField = data.totalsByField || {};
      }

      /* ---------- mappa righe ---------- */
      const newRows = (data.records || []).map((r) => ({
        ...r,
        recordLink: "/" + r.Id,
        budgetLink: r.Budget__c ? "/" + r.Budget__c : null,
        budgetAnnoLink: r.Overview_Budget_Anno__c
          ? "/" + r.Overview_Budget_Anno__c
          : null,
        donorLink: r.Account__c ? "/" + r.Account__c : null
      }));

      if (reset) {
        this.relatedData = newRows;
        this.currentOffset = newRows.length;
      } else {
        this.relatedData = [...this.relatedData, ...newRows];
        this.currentOffset += newRows.length;
      }

      this.hasMoreData = newRows.length === this.pageSize;

      /* ---------- (ri)costruisci colonne & riepilogo totali ---------- */
      if (reset) {
        /* ① Colonne dinamiche con totali aggiornati */
        this.latestDynamicMeta = data.dynamicColumnsMeta || [];
        this.dynamicCols = this.latestDynamicMeta.map((m) => {
          const colType =
            m.dataType === "currency"
              ? "currency"
              : m.dataType === "number"
                ? "number"
                : "text";

          let colLabel = m.label;
          if (m.dataType !== "text") {
            const tot = this.totalsByField[m.fieldApi]; // ← usa i totali salvati
            if (tot !== undefined) {
              const formatted =
                m.dataType === "currency"
                  ? fmtCurrency.format(tot)
                  : fmtNumber.format(tot);
              colLabel += "\n" + formatted;
            }
          }

          return {
            label: colLabel,
            fieldName: m.fieldApi,
            type: colType,
            cellAttributes: { alignment: "left" }
          };
        });

        /* ② Colonne base + totale “Ammontare” */
        const baseTemplate = this.hideBudget
          ? COLS_NOBUDGET_BASE
          : COLS_FULL_BASE;
        const base = baseTemplate.map((c) => ({ ...c })); // clona

        const totAmm = this.totalsByField.Totale_Fattura__c;
        if (totAmm !== undefined) {
          const col = base.find((c) => c.fieldName === "Totale_Fattura__c");
          if (col) col.label = `${col.label}\n${fmtCurrency.format(totAmm)}`;
        }

        /* ③ Applica alla datatable */
        // Colonna azioni: pulsante icona Elimina
        const deleteCol = {
          type: "button-icon",
          label: "",
          initialWidth: 50,
          typeAttributes: {
            iconName: "utility:delete",
            name: "delete",
            title: "Elimina",
            variant: "border-filled",
            alternativeText: "Elimina"
          }
        };

        this.columns = [...base, ...this.dynamicCols, deleteCol];
        this.buildTotalsSummary(this.latestDynamicMeta);
      } else {
        // In append aggiorna comunque il riepilogo per il conteggio righe
        this.buildTotalsSummary(this.latestDynamicMeta);
      }
    } catch (error) {
      console.error(error);
    } finally {
      this.isLoadingMore = false;
      this.isLoading = false;
    }
  }

  /* ---------------- ROW ACTIONS ---------------- */
  async handleRowAction(event) {
    const actionName = event.detail?.action?.name;
    const row = event.detail?.row;
    if (!actionName || !row) return;

    if (actionName === "delete") {
      try {
        let confirmed = false;
        try {
          confirmed = await LightningConfirm.open({
            message: `Confermi l'eliminazione della fattura?`,
            label: "Conferma eliminazione",
            variant: "header"
          });
        } catch (e) {
          // Fallback nel caso LightningConfirm non sia disponibile
          // eslint-disable-next-line no-alert
          confirmed = window.confirm("Confermi l'eliminazione della fattura?");
        }

        if (!confirmed) return;

        const deletedId = row.Id;
        // Eliminazione server
        await deleteInvoice({ invoiceId: deletedId });
        // Rimuovi subito la riga dalla tabella per riflettere la cancellazione
        this.relatedData = (this.relatedData || []).filter(r => r.Id !== deletedId);

        this.dispatchEvent(
          new ShowToastEvent({
            title: "Record eliminato",
            message: "La fattura è stata eliminata correttamente.",
            variant: "success"
          })
        );

        // Ricarica dati e totali in base ai filtri correnti (busta cache)
        this.refreshKey = String(Date.now());
        this.isLoading = true;
        await this.loadData(true);
        // Se siamo in una Lightning Console, prova a refreshare il tab
        try {
          const info = await getFocusedTabInfo();
          if (info && info.tabId) {
            await refreshTab({ tabId: info.tabId, includeAllSubtabs: false });
          }
        } catch (e) {
          // Non in console o API non disponibile: ignora
        }
      } catch (error) {
        console.error("Errore durante l'eliminazione:", error);
        const msg = error?.body?.message || "Operazione non riuscita.";
        this.dispatchEvent(
          new ShowToastEvent({
            title: "Errore eliminazione",
            message: msg,
            variant: "error"
          })
        );
      } finally {
        this.isLoading = false;
      }
    }
  }

  buildTotalsSummary(dynamicMeta = []) {
    const summary = [];

    /* 0) Numero Fatture: totale globale dai totali Apex (fallback: righe caricate) */
    const serverCount = this.totalsByField && this.totalsByField.__rowCount__;
    const countVal = serverCount !== undefined ? serverCount : (this.relatedData ? this.relatedData.length : 0);
    summary.push({
      api: "__rowCount__",
      label: "Numero Fatture",
      formatted: fmtNumber.format(countVal)
    });

    /* 1) Totale fatturato: c’è sempre */
    if (this.totalsByField.Totale_Fattura__c !== undefined) {
      summary.push({
        api: "Totale_Fattura__c",
        label: "Totale Fatturato",
        formatted: fmtCurrency.format(this.totalsByField.Totale_Fattura__c)
      });
    }

    /* 2) KPI dinamici in ordine metadata */
    dynamicMeta.forEach((m) => {
      if (m.dataType === "text") return;
      const val = this.totalsByField[m.fieldApi];
      if (val === undefined) return;
      const formatted =
        m.dataType === "currency"
          ? fmtCurrency.format(val)
          : fmtNumber.format(val); // m.dataType === 'number'

      summary.push({ api: m.fieldApi, label: m.label, formatted });
    });

    this.totalsSummary = summary;
  }

  async handleRefreshClick() {
    this.refreshKey = String(Date.now());
    this.currentOffset = 0;
    this.hasMoreData = true;
    this.relatedData = [];
    this.dynamicCols = [];
    this.totalsSummary = [];
    this.totalsByField = {};
    try {
      await this.init();
    } catch (error) {
      console.error("[Fatture] Errore durante l'aggiornamento:", error);
      const message =
        error?.body?.message ||
        error?.message ||
        "Impossibile aggiornare la lista fatture.";
      this.dispatchEvent(
        new ShowToastEvent({
          title: "Errore aggiornamento",
          message,
          variant: "error"
        })
      );
    }
  }
  /* ===================== FILTRI HANDLER ===================== */
  handleYearChange(e) {
    this.isLoading = true;
    this.selectedYear = e.detail.value;
    this.loadData(true); // reset
  }
  handleMonthChange(e) {
    this.isLoading = true;
    this.selectedMonth = e.detail.value;
    this.loadData(true); // reset
  }
  handleProgramChange(e) {
    this.isLoading = true;
    this.selectedProgram = e.detail.value;
    this.loadData(true); // reset
  }
  handleDonorChange(e) {
    this.isLoading = true;
    this.selectedDonor = e.detail.value;
    this.loadData(true); // reset
  }
  handleInvoiceNumberChange(e) {
    this.isLoading = true;
    this.invoiceNumberFilter = e.detail.value;
    this.loadData(true); // reset
  }
  async handleBudgetChange(e) {
    this.isLoading = true;
    this.selectedBudget = e.detail.value;

    // 1) ricarica i Programmi collegati al budget scelto
    await this.loadProgramOptions();

    // 2) se il Programma attuale è ancora valido ricarica subito le fatture,
    //    altrimenti l’utente dovrà sceglierne uno (compare il messaggio rosso)
    if (this.selectedProgram) {
      await this.loadData(true); // reset = true
    }

    this.isLoading = false;
  }

  handleScroll(event) {
    const element = event.target;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 10) {
      if (this.hasMoreData && !this.isLoadingMore) {
        this.loadData(false); // append
      }
    }
  }

  /* ---------------- SORT ---------------- */
  onHandleSort(e) {
    const { fieldName, sortDirection } = e.detail;
    const rev = sortDirection === "asc" ? 1 : -1;
    this.relatedData = [...this.relatedData].sort(
      (a, b) =>
        rev * ((a[fieldName] > b[fieldName]) - (b[fieldName] > a[fieldName]))
    );
    this.sortedBy = fieldName;
    this.sortDirection = sortDirection;
  }

  /* ---------------- helper per template ---------------- */
  get mustChooseProgram() {
    return this.noBudgetFound || (!this.selectedProgram && !this.isLoading);
  }

  /* ===================== EXPORT EXCEL ===================== */
  buildExcelFileName(includeFilters = false) {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    let name = `Fatture_${timestamp}`;
    if (includeFilters) {
      const parts = [];
      if (this.selectedYear) parts.push(this.selectedYear);
      if (this.selectedMonth) {
        const monthLabel = this.monthOptions.find((m) => m.value === this.selectedMonth)?.label;
        if (monthLabel) parts.push(monthLabel.replace(/\s+/g, "_"));
      }
      if (this.selectedProgram) {
        const p = this.programOptions.find((x) => x.value === this.selectedProgram)?.label;
        if (p) parts.push(p.replace(/\s+/g, "_"));
      }
      if (!this.hideBudget && this.selectedBudget) {
        const b = this.budgetOptions.find((x) => x.value === this.selectedBudget)?.label;
        if (b) parts.push(b.replace(/\s+/g, "_"));
      }
      if (this.selectedDonor) {
        const d = this.donorOptions.find((x) => x.value === this.selectedDonor)?.label;
        if (d) parts.push(d.replace(/\s+/g, "_"));
      }
      if (this.invoiceNumberFilter) parts.push(this.invoiceNumberFilter.replace(/\s+/g, "_"));
      if (parts.length) name += "_" + parts.join("-");
    }
    return name + ".xlsx";
  }

  exportAllRecords() {
    if (this.mustChooseProgram || !this.sheetJsLoaded) return;
    this.exportExcel(true);
  }

  exportFilteredRecords() {
    if (this.mustChooseProgram || !this.sheetJsLoaded) return;
    this.exportExcel(false);
  }

  exportExcel(fullExport = false) {
    if (this.mustChooseProgram || !this.sheetJsLoaded) return;
    this.isExporting = true;

    const params = {
      year: fullExport ? "" : this.selectedYear,
      budgetId: fullExport ? "" : this.selectedBudget,
      month: fullExport ? "" : (this.selectedMonth ? Number(this.selectedMonth) : ""),
      programId: this.selectedProgram,
      donorId: fullExport ? "" : this.selectedDonor,
      invoiceNumber: fullExport ? "" : this.invoiceNumberFilter,
      limitSize: 100000,
      offsetSize: 0,
      refreshKey: this.refreshKey
    };

    getRelatedRecords(params)
      .then((data) => {
        const records = data.records || [];
        const excelData = records.map((r) => {
          const row = {
            "Codice Fattura": r.Name,
            "Numero Fattura": r.Invoice_Number__c,
            "Data di Competenza": r.Data_di_Competenza__c,
            "Ammontare (€)": r.Totale_Fattura__c,
            Donatore: r.Nome_Donatore__c || ""
          };
          if (!this.hideBudget) {
            row["Budget"] = r.Nome_Budget__c || "";
            row["Budget per Anno"] = r.Overview_Budget_Anno__c || "";
          }
          // KPI dinamici
          (data.dynamicColumnsMeta || []).forEach((m) => {
            row[m.label] = r[m.fieldApi];
          });
          return row;
        });

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Fatture");
        const filename = this.buildExcelFileName(!fullExport);
        XLSX.writeFile(wb, filename);

        this.dispatchEvent(
          new ShowToastEvent({
            title: "Esportazione completata",
            message: `File "${filename}" creato con successo.`,
            variant: "success"
          })
        );
      })
      .catch((err) => {
        console.error("[Fatture] exportExcel error:", err);
        this.dispatchEvent(
          new ShowToastEvent({
            title: "Errore",
            message: "Si è verificato un problema durante l’esportazione.",
            variant: "error"
          })
        );
      })
      .finally(() => (this.isExporting = false));
  }
}