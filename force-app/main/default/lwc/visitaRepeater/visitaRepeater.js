import { LightningElement, track, api } from "lwc";
import { FlowNavigationHandler } from "lightning/flowSupport";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import insertVisitaRecordsFromJSONString from "@salesforce/apex/FlowUtils.insertVisitaRecordsFromJSONString";
import updateVisitaRecordsFromJSONString from "@salesforce/apex/FlowUtils.updateVisitaRecordsFromJSONString";
import deleteVisits from "@salesforce/apex/FlowUtils.deleteVisits";
import getVisitById from "@salesforce/apex/FlowUtils.getVisitById";

import { FlowNavigationNextEvent } from "lightning/flowSupport";

export default class VisitaRepeater extends LightningElement {
  @track tipoVisiteList = [];
  @track visitaIds = []; // Lista degli ID delle visite create
  @track isNextEnabled = false; // Stato del pulsante Next nel Flow
  @track isSaving = false; // Stato dello spinner per Salva Visite
  @track saveButtonVariant = "brand"; // Variante del pulsante Salva Visite
  @track isSaveSuccessful = false; // Nuova variabile per gestire la visibilità del pulsante Aggiungi
  @api isComplete = false;

  @api
  invoiceId; // ID della fattura ricevuto come input dal Flow
  @api
  invoiceDate;

  @api gratuita = false;

  // Id opzionale di una visita esistente da modificare (passato dal Flow)
  @api visitaId;

  @api
  get createdVisitaIds() {
    return this.visitaIds;
  }

  set createdVisitaIds(value) {
    console.log("VisitaRepeater - Set createdVisitaIds:", value);
  }

  set isComplete(value) {
    console.log("VisitaRepeater - isComplete aggiornato a:", value);
    this.isSaveSuccessful = value;
    this.dispatchEvent(new CustomEvent("iscompletechange")); // ✅ Notifica al Flow che il valore è cambiato
  }

  get isNextDisabled() {
    return !this.isComplete; // Inverte il valore di isComplete
  }

  /** Ritorna la lista aggiungendo il sequenziale (1-based) */
  get tipoVisiteWithIndex() {
    return this.tipoVisiteList.map((visita, idx) => ({
      ...visita,
      seq: idx + 1 // Visita 1, Visita 2, …
    }));
  }

  get unsavedCount() {
    return this.tipoVisiteList.filter(v => (!v.saved) || (v.saved && v.editing)).length;
  }

  get hasUnsaved() {
    return this.unsavedCount > 0;
  }

  // Aggiorna stati Avanti/Salva coerenti con pending changes
  updateProgressFlags() {
    const stillUnsaved = this.tipoVisiteList.some(v => (!v.saved) || (v.saved && v.editing));
    this.isNextEnabled = !stillUnsaved && this.visitaIds.length > 0;
    this.isComplete = this.isNextEnabled;
    this.saveButtonVariant = stillUnsaved ? 'brand' : 'success';
  }

  notifyFlow() {
    console.log(
      "VisitaRepeater - Notifica il Flow, isComplete:",
      this.isComplete
    );
    const attributeChangeEvent = new CustomEvent("iscompletechange", {
      detail: { value: this.isComplete }
    });
    this.dispatchEvent(attributeChangeEvent);

    // ✅ Forza il Flow a ricalcolare la variabile
    const flowHandler = new FlowNavigationHandler();
    flowHandler.refreshFlowScreen();
  }

  getToday() {
    const today = new Date();
    return today.toISOString().split("T")[0]; // Formatta la data in YYYY-MM-DD
  }

  generateUniqueId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async connectedCallback() {
    console.log("VisitaRepeater - proprietà gratuita:", this.gratuita);
    // Se ho un visitaId in input, precompilo la riga in modalità modifica
    if (this.visitaId) {
      try {
        const v = await getVisitById({ visitId: this.visitaId });
        if (v) {
          const newId = this.generateUniqueId();
          const baseData = {
            tipoVisita: (v.Visit_Type__c || (v.Tipo_Visita__r && v.Tipo_Visita__r.Name) || ""),
            tipoVisitaId: v.Tipo_Visita__c || "",
            beneficiaryType: v.Beneficiary_Type__c || "",
            numeroVisite: v.Quantity__c,
            totaleMinuti: v.Duration_in_minutes__c,
            amount: v.Amount__c,
            dataVisita: v.Data_della_Visita__c ? String(v.Data_della_Visita__c) : (this.invoiceDate || this.getToday()),
            invoiceId: v.Invoice__c || this.invoiceId,
            comune: v.City__c || "",
            provincia: v.Province__c || "",
            regione: v.Region__c || ""
          };
          this.tipoVisiteList = [
            {
              id: newId,
              saved: true,
              editing: true, // bordo rosso e badge "Modificata"
              recordId: v.Id,
              className: 'visita-container editing',
              data: baseData,
              originalData: JSON.parse(JSON.stringify(baseData))
            }
          ];
          this.visitaIds = [v.Id];
          this.updateProgressFlags();
          return; // niente riga vuota
        }
      } catch (e) {
        console.error('Errore nel recupero della visita da modificare', e);
      }
    }

    // Fallback: nessuna visita da modificare ⇒ riga vuota iniziale
    if (this.tipoVisiteList.length === 0) {
      this.addTipoVisita();
    }
  }

  addTipoVisita() {
    const newId = this.generateUniqueId();
    this.tipoVisiteList = [
      ...this.tipoVisiteList,
      {
        id: newId,
        saved: false,
        editing: true,
        recordId: null,
        className: 'visita-container',
        data: {
          tipoVisita: "",
          tipoVisitaId: "",
          beneficiaryType: "",
          numeroVisite: null,
          totaleMinuti: null,
          amount: null,
          dataVisita: this.invoiceDate || this.getToday(), // ✅ Data odierna come valore di default
          invoiceId: this.invoiceId,
          comune: "",
          provincia: "",
          regione: ""
        }
      }
    ];
    console.log(
      "VisitaRepeater - Nuovo tipo visita aggiunto:",
      this.tipoVisiteList
    );
    // Disabilita Avanti finché la nuova visita non viene salvata e ripristina il blu
    this.updateProgressFlags();
    console.log("isComplete:", this.isComplete);
  }

  removeTipoVisita(event) {
    const idToRemove = event.target.dataset.id;
    console.log("VisitaRepeater - Rimuovi ID:", idToRemove);
    const v = this.tipoVisiteList.find(x => x.id === idToRemove);
    const doRemoveLocal = () => {
      this.tipoVisiteList = this.tipoVisiteList.filter((visita) => visita.id !== idToRemove);
      this.visitaIds = this.visitaIds.filter((vid) => vid !== v?.recordId);
      console.log("VisitaRepeater - Lista aggiornata:", this.tipoVisiteList);
      const hasPending = this.tipoVisiteList.some(x => (!x.saved) || (x.saved && x.editing));
      this.isComplete = !hasPending && this.visitaIds.length > 0;
      this.isNextEnabled = this.isComplete;
    };

    if (v && v.saved && v.recordId) {
      // Cancella anche a DB
      deleteVisits({ visitIds: [v.recordId] })
        .then(() => {
          this.showSuccessToast('Visita rimossa.');
          doRemoveLocal();
        })
        .catch((e) => {
          console.error('Errore cancellazione visita', e?.body?.message || e?.message || e);
          this.showErrorToast(e?.body?.message || e?.message || 'Errore nella cancellazione');
        });
    } else {
      doRemoveLocal();
    }
  }

  handleEdit(event) {
    const id = event.target.dataset.id;
    this.tipoVisiteList = this.tipoVisiteList.map(v => {
      if (v.id === id) {
        const original = v.originalData || JSON.parse(JSON.stringify(v.data));
        return { ...v, saved: true, editing: true, className: 'visita-container editing', originalData: original };
      }
      return v;
    });
    this.updateProgressFlags();
  }

  handleTipoVisitaChange(event) {
    const updatedId = event.currentTarget.dataset.id;
    const updatedData = event.detail;
    console.log("VisitaRepeater - Modifica su ID:", updatedId);
    console.log("VisitaRepeater - Dati ricevuti:", updatedData);

    if (!updatedId || !updatedData) {
      console.error("VisitaRepeater - ID o Data mancanti!");
      return;
    }

    // Se la riga è già salvata ma non in modalità editing, qualsiasi modifica equivale a cliccare "Modifica"
    this.tipoVisiteList = this.tipoVisiteList.map((visita) => {
      if (visita.id !== updatedId) return visita;
      const becameEditing = visita.saved && !visita.editing;
      const original = becameEditing ? (visita.originalData || JSON.parse(JSON.stringify(visita.data))) : visita.originalData;
      return {
        ...visita,
        data: { ...updatedData, invoiceId: this.invoiceId },
        editing: becameEditing ? true : visita.editing,
        className: becameEditing ? 'visita-container editing' : visita.className,
        originalData: original
      };
    });

    console.log("VisitaRepeater - Lista aggiornata:", JSON.stringify(this.tipoVisiteList));
    this.updateProgressFlags();
  }

  handleCancelEdit(event) {
    const id = event.target.dataset.id;
    this.tipoVisiteList = this.tipoVisiteList.map(v => {
      if (v.id !== id) return v;
      // Ripristina i valori originali salvati
      const restored = v.originalData
        ? JSON.parse(JSON.stringify(v.originalData))
        : JSON.parse(JSON.stringify(v.data));
      return {
        ...v,
        data: restored,
        editing: false,
        saved: true,
        className: 'visita-container saved',
        originalData: JSON.parse(JSON.stringify(restored))
      };
    });
    this.updateProgressFlags();
    this.notifyFlow();
  }

  handleNext() {
    console.log("📢 Navigazione Flow attivata!");
    this.dispatchEvent(new FlowNavigationNextEvent()); // Naviga avanti nel Flow
  }

  async createVisitaRecords() {
    console.log(
      "VisitaRepeater - Creazione Visite con dati:",
      this.tipoVisiteList
    );

    this.isSaving = true;
    this.saveButtonVariant = "neutral";

    try {
      // Validazione lato UI: tutti i figli devono essere validi
      const items = this.template.querySelectorAll('c-tipo-visita');
      const unsavedIds = new Set(this.tipoVisiteList.filter(v => !v.saved).map(v => v.id));
      const editingIds = new Set(this.tipoVisiteList.filter(v => v.saved && v.editing).map(v => v.id));
      if (unsavedIds.size === 0 && editingIds.size === 0) {
        this.showWarningToast('Nessuna nuova visita da salvare.');
        this.isSaving = false;
        this.saveButtonVariant = 'brand';
        return;
      }

      // Valida tutti i figli: i non interessati passeranno comunque
      let allValid = true;
      items.forEach((c) => {
        if (typeof c.validate === 'function') {
          allValid = c.validate() && allValid;
        }
      });
      if (!allValid) {
        this.saveButtonVariant = 'destructive';
        this.showErrorToast('Compila tutti i campi obbligatori prima di salvare.');
        this.isSaving = false;
        return;
      }
      const toInsert = this.tipoVisiteList.filter(v => !v.saved);
      const toUpdate = this.tipoVisiteList.filter(v => v.saved && v.editing && v.recordId);

      if (toInsert.length === 0 && toUpdate.length === 0) {
        this.showWarningToast('Nessuna visita da salvare.');
        this.isSaving = false;
        this.saveButtonVariant = 'brand';
        return;
      }

      const mappedInsert = toInsert.map((visita) => ({
        ...visita.data,
        amount: visita.data.amount != null ? Number(visita.data.amount) : 0.0,
        numeroVisite: Number(visita.data.numeroVisite),
        totaleMinuti: Number(visita.data.totaleMinuti),
        dataVisita: visita.data.dataVisita || this.getToday()
      }));

      console.log("[VR] mappedInsert (sanitized):", JSON.parse(JSON.stringify(mappedInsert)));

      // Esegui inserimenti e aggiornamenti in sequenza
      let newIds = [];
      if (mappedInsert.length > 0) {
        const jsonInsert = JSON.stringify(mappedInsert);
        console.log("VisitaRepeater - Input JSON INSERT:", jsonInsert);
        newIds = await insertVisitaRecordsFromJSONString({ jsonString: jsonInsert });
      }

      if (toUpdate.length > 0) {
        const mappedUpdate = toUpdate.map(v => ({
          ...v.data,
          visitId: v.recordId,
          amount: v.data.amount != null ? Number(v.data.amount) : 0.0,
          numeroVisite: Number(v.data.numeroVisite),
          totaleMinuti: Number(v.data.totaleMinuti),
          dataVisita: v.data.dataVisita || this.getToday()
        }));
        const jsonUpdate = JSON.stringify(mappedUpdate);
        console.log("VisitaRepeater - Input JSON UPDATE:", jsonUpdate);
        await updateVisitaRecordsFromJSONString({ jsonString: jsonUpdate });
      }

      // ✅ Aggiorna lo stato locale
      // Mark inserted: assign returned Ids to the corresponding rows by order
      let i = 0;
      this.tipoVisiteList = this.tipoVisiteList.map(v => {
        if (!v.saved) {
          const recId = newIds[i++];
          const newData = { ...v.data }; // stato salvato attuale
          return { ...v, saved: true, editing: false, recordId: recId, className: 'visita-container saved', originalData: JSON.parse(JSON.stringify(newData)) };
        }
        if (v.saved && v.editing) {
          const newData = { ...v.data };
          return { ...v, editing: false, className: 'visita-container saved', originalData: JSON.parse(JSON.stringify(newData)) };
        }
        return v;
      });
      this.visitaIds = [...this.visitaIds, ...newIds];

      // Se non rimangono visite da salvare/modificare abilita Avanti
      const stillUnsaved = this.tipoVisiteList.some(v => (!v.saved) || (v.saved && v.editing));
      this.isNextEnabled = !stillUnsaved;
      this.isComplete = !stillUnsaved;
      console.log("✅ isComplete:", this.isComplete);

      this.saveButtonVariant = "success";
      this.showSuccessToast();
    } catch (error) {
      // Estrae un messaggio utile anche per AuraHandledException e DML
      let msg = 'Errore sconosciuto';
      try {
        msg =
          (error && error.body && error.body.message) ||
          (error && error.body && error.body.pageErrors && error.body.pageErrors[0] && error.body.pageErrors[0].message) ||
          error?.message ||
          JSON.stringify(error);
      } catch (_) {}
      console.error(
        '❌ ERRORE: VisitaRepeater - Errore durante la creazione delle visite:',
        msg,
        error
      );
      this.showErrorToast(msg);

      this.saveButtonVariant = "destructive";

      if (!this.visitaIds.length) {
        this.isComplete = false;
        console.log("❌ isComplete forzato a false a causa di un errore.");
      }
    } finally {
      this.isSaving = false;
      // resta verde dopo successo; verrà sovrascritto su un nuovo tentativo
    }
  }

  showSuccessToast() {
    const event = new ShowToastEvent({
      title: "Successo",
      message: "Visite create e associate alla Fattura.",
      variant: "success"
    });
    this.dispatchEvent(event);
  }

  showErrorToast(errorMessage) {
    const event = new ShowToastEvent({
      title: "Errore",
      message: `Si è verificato un errore: ${errorMessage}`,
      variant: "error"
    });
    this.dispatchEvent(event);
  }

  showWarningToast(message) {
    const event = new ShowToastEvent({
      title: "Attenzione",
      message: message,
      variant: "warning"
    });
    this.dispatchEvent(event);
  }
}