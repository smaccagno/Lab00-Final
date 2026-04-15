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
  grossAmount = 0;
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
      const [budgets, amountInfo] = await Promise.all([
        getBudgets({ programId: this.programId }),
        getCurrentAmount({ giftTransactionId: this.giftTransactionId })
      ]);
      this.budgetOptions = budgets;
      this.currentAmount = amountInfo.netAmount;
      this.grossAmount = amountInfo.grossAmount;
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
    // buildDesignationRows() chiamerà recalcTotals() alla fine, quindi non serve chiamarlo qui
    this.buildDesignationRows();
  }

  //------------------------------------------------------------------
  // Event handlers
  //------------------------------------------------------------------
  handleDesignationChange(event) {
    const idx = Number(event.target.dataset.index);
    this.rows[idx].designationId = event.detail.value;

    this.refreshRowOptions(); // ⬅️ aggiorna tutte le combobox
    // buildDesignationRows() chiamerà recalcTotals() alla fine, quindi non serve chiamarlo qui
    this.buildDesignationRows();
  }

  handlePercentChange(event) {
    const idx = Number(event.target.dataset.index);
    const pct = parseFloat(event.target.value) || 0;

    this.rows[idx].percentage = pct;
    this.rows[idx].amount = (pct / 100) * this.currentAmount;

    // forza re-render
    this.rows = [...this.rows];
    // buildDesignationRows() chiamerà recalcTotals() alla fine, quindi non serve chiamarlo qui
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
    const validRows = this.rows.filter((r) => r.designationId); // righe compilate
    
    if (validRows.length === 0) {
      this.designationRows = [];
      this.dispatchEvent(
        new FlowAttributeChangeEvent("designationRows", this.designationRows)
      );
      return;
    }

    // Controlla se tutte le percentuali sono uguali
    const firstPercentage = validRows[0].percentage;
    const allPercentagesEqual = validRows.every(
      (r) => Math.abs(r.percentage - firstPercentage) < 0.01
    );

    let finalRows;

    if (allPercentagesEqual && validRows.length > 0) {
      // Se le percentuali sono uguali, dividi l'importo totale per il numero di distribuzioni
      const amountPerAllocation = this.currentAmount / validRows.length;
      
      // Calcola quanti centesimi abbiamo (arrotondato)
      const totalCents = Math.round(this.currentAmount * 100);
      const centsPerAllocation = Math.floor(totalCents / validRows.length);
      const remainderCents = totalCents % validRows.length;

      // Distribuisci gli importi in modo che la somma sia esattamente il totale
      finalRows = validRows.map((r, index) => {
        // Le prime allocazioni ricevono i centesimi extra per compensare l'arrotondamento
        const extraCent = index < remainderCents ? 0.01 : 0;
        const finalAmount = centsPerAllocation / 100 + extraCent;
        
        return {
          ...r,
          amount: Math.round(finalAmount * 100) / 100
        };
      });
    } else {
      // Se le percentuali sono diverse, calcola gli importi proporzionalmente
      // e distribuisci eventuali differenze di arrotondamento
      const totalPercentage = validRows.reduce((sum, r) => sum + r.percentage, 0);
      
      // Calcola gli importi esatti senza arrotondamento
      const exactAmounts = validRows.map((r) => ({
        ...r,
        exactAmount: (r.percentage / totalPercentage) * this.currentAmount
      }));

      // Calcola il totale in centesimi
      const totalCents = Math.round(this.currentAmount * 100);
      
      // Distribuisci i centesimi proporzionalmente
      let allocatedCents = 0;
      const finalAmounts = exactAmounts.map((item, index) => {
        const exactCents = item.exactAmount * 100;
        const allocatedCentsForThis = index === exactAmounts.length - 1
          ? totalCents - allocatedCents // L'ultima prende i centesimi rimanenti
          : Math.round(exactCents);
        
        allocatedCents += allocatedCentsForThis;
        
        return {
          ...item,
          amount: allocatedCentsForThis / 100
        };
      });

      finalRows = finalAmounts.map((item) => ({
        designationId: item.designationId,
        percentage: item.percentage,
        amount: item.amount
      }));
    }

    // Verifica che la somma sia esattamente il totale (con tolleranza per errori di floating point)
    const finalTotal = finalRows.reduce((sum, r) => sum + r.amount, 0);
    const difference = this.currentAmount - finalTotal;
    
    if (Math.abs(difference) > 0.001 && finalRows.length > 0) {
      // Aggiusta l'ultima allocazione per compensare eventuali differenze residue
      const lastIndex = finalRows.length - 1;
      finalRows[lastIndex].amount = Math.round((finalRows[lastIndex].amount + difference) * 100) / 100;
    }

    // Aggiorna anche gli importi visualizzati nelle righe per corrispondere agli importi finali
    finalRows.forEach((finalRow) => {
      const rowIndex = this.rows.findIndex(
        (r) => r.designationId === finalRow.designationId
      );
      if (rowIndex !== -1) {
        this.rows[rowIndex].amount = finalRow.amount;
      }
    });

    // Resetta gli importi delle righe senza designationId a 0
    this.rows.forEach((row) => {
      if (!row.designationId) {
        row.amount = 0;
      }
    });

    // Forza re-render delle righe con i nuovi importi
    this.rows = [...this.rows];

    // Ricalcola i totali DOPO aver aggiornato gli importi nelle righe
    this.recalcTotals();

    // Costruisce le stringhe nel formato: Id|Percent|Amount
    this.designationRows = finalRows.map(
      (r) => {
        let truePercent = this.grossAmount ? (r.amount / this.grossAmount) * 100 : r.percentage;
        return `${r.designationId}|${truePercent}|${r.amount}`;
      }
    );

    // notifica il Flow
    this.dispatchEvent(
      new FlowAttributeChangeEvent("designationRows", this.designationRows)
    );

    console.log("[giftAllocation] designationRows →", this.designationRows);
    console.log("[giftAllocation] Total:", finalRows.reduce((sum, r) => sum + r.amount, 0), "Expected:", this.currentAmount);
  }
}