import { LightningElement, api, track } from "lwc";
import getBudgets from "@salesforce/apex/GiftAllocationController.getBudgets";
import getCurrentAmount from "@salesforce/apex/GiftAllocationController.getCurrentAmount";
import {
  FlowAttributeChangeEvent,
  FlowNavigationNextEvent
} from "lightning/flowSupport";

export default class GiftAllocation extends LightningElement {
  // API property: passati dal record page (o dal genitore)
  @api programId;
  @api giftTransactionId;

  // Stato reattivo
  @track budgetOptions = []; // lista option {label, value}
  @track rows = []; // righe dinamiche

  currentAmount = 0;
  ready = false;
  error;
  totalPercentage = 0;
  totalAmount = 0;

  percentError = false;
  amountError = false;
  // contatore progressivo per l'id interno delle righe
  nextRowId = 0;
  @api isValid = false; // ⇦ output per il Flow
  @api designationsJson = "[]";
  @api designationRows = [];
  //------------------------------------------------------------------
  // Lifecycle
  //------------------------------------------------------------------
  connectedCallback() {
    this.initData();
  }

  //------------------------------------------------------------------
  // Init – query Apex contemporanee
  //------------------------------------------------------------------
  async initData() {
    try {
      const [budgets, amount] = await Promise.all([
        getBudgets({ programId: this.programId }),
        getCurrentAmount({ giftTransactionId: this.giftTransactionId })
      ]);
      this.budgetOptions = budgets;
      this.currentAmount = amount;
      this.addRow(); // crea la prima riga
      this.refreshRowOptions();
      this.recalcTotals();
      this.buildDesignationRows();
      this.ready = true;
      console.log("[giftAllocation] isValid (iniziale):", this.isValid);
    } catch (err) {
      this.error = err;
      /* eslint-disable-next-line no-console */
      console.error(err);
    }
  }

  //------------------------------------------------------------------
  // Gestione righe
  //------------------------------------------------------------------
  addRow() {
    this.rows = [
      ...this.rows,
      {
        id: this.nextRowId++,
        designationId: null,
        percentage: 0,
        amount: 0,
        availableOptions: this.budgetOptions // iniziale
      }
    ];
    this.refreshRowOptions(); // ⬅️ nuovo
    this.recalcTotals();
    this.buildDesignationRows();
  }

  //------------------------------------------------------------------
  // Event handlers
  //------------------------------------------------------------------
  handleDesignationChange(event) {
    const idx = Number(event.target.dataset.index);
    this.rows[idx].designationId = event.detail.value;

    this.refreshRowOptions(); // ⬅️ aggiorna tutte le combobox
    this.recalcTotals();
    this.buildDesignationRows();
  }

  handlePercentChange(event) {
    const idx = Number(event.target.dataset.index);
    const pct = parseFloat(event.target.value) || 0;

    this.rows[idx].percentage = pct;
    this.rows[idx].amount = (pct / 100) * this.currentAmount;

    // forza re-render
    this.rows = [...this.rows];
    this.recalcTotals();
    this.buildDesignationRows();
  }

  refreshRowOptions() {
    // 1. raccolgo tutti i budget già selezionati
    const selected = new Set(
      this.rows.map((r) => r.designationId).filter((id) => id) // scarta null/undefined
    );

    // 2. per ogni riga genero le opzioni:
    //    - includo SEMPRE la propria selezione (per non farla sparire)
    //    - escludo quelle già scelte in altre righe
    this.rows = this.rows.map((r) => {
      const opts = this.budgetOptions.filter(
        (o) => o.value === r.designationId || !selected.has(o.value)
      );
      return { ...r, availableOptions: opts };
    });
  }

  recalcTotals() {
    const totals = this.rows.reduce(
      (acc, r) => {
        acc.pct += Number(r.percentage) || 0;
        acc.amt += Number(r.amount) || 0;
        return acc;
      },
      { pct: 0, amt: 0 }
    );

    // arrotondamento a 2 decimali per evitare errori di floating-point
    this.totalPercentage = Math.round(totals.pct * 100) / 100;
    this.totalAmount = Math.round(totals.amt * 100) / 100;

    // ±0.01 di tolleranza
    this.percentError = Math.abs(this.totalPercentage - 100) > 0.01;
    this.amountError = Math.abs(this.totalAmount - this.currentAmount) > 0.01;

    // calcola validità complessiva
    const newValidity = !(this.percentError || this.amountError);
    // ►► LOG istantaneo del nuovo valore
    console.log("[giftAllocation] isValid (calcolato):", newValidity);
    // se lo stato è cambiato   ➜   notifica il Flow
    if (this.isValid !== newValidity) {
      this.isValid = newValidity;
      // ►► LOG quando dispatchiamo l’evento
      console.log("[giftAllocation] isValid (dispatch):", this.isValid);
      this.dispatchEvent(new FlowAttributeChangeEvent("isValid", this.isValid));
    }
  }
  //------------------------------------------------------------------
  // Getter di servizio: eventuale salvataggio dal genitore
  //------------------------------------------------------------------
  /**
   * Restituisce le allocazioni (può essere invocato da esterno).
   * [
   *   { designationId: 'a01...', percentage: 25, amount: 1234.56 },
   *   ...
   * ]
   */
  @api
  getAllocations() {
    return this.rows.map((r) => ({
      designationId: r.designationId,
      percentage: r.percentage,
      amount: r.amount
    }));
  }

  handleNext() {
    // invia l’evento che ordina al Flow di passare alla schermata successiva
    this.dispatchEvent(new FlowNavigationNextEvent());
  }

  // helper che costruisce l'array
  buildDesignationRows() {
    this.designationRows = this.rows
      .filter((r) => r.designationId) // righe compilate
      .map(
        (r) =>
          // formato:  Id|Percent|Amount  (pipe come delimitatore)
          `${r.designationId}|${r.percentage}|${r.amount}`
      );

    // notifica il Flow
    this.dispatchEvent(
      new FlowAttributeChangeEvent("designationRows", this.designationRows)
    );

    console.log("[giftAllocation] designationRows →", this.designationRows);
  }
}