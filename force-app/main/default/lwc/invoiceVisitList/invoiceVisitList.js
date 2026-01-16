import { LightningElement, api, track } from 'lwc';
import getVisitsByInvoice from '@salesforce/apex/InvoiceVisitController.getVisitsByInvoice';
import fsc_modalFlow from 'c/fsc_modalFlow';
import { NavigationMixin } from 'lightning/navigation';
import { getFocusedTabInfo, isConsoleNavigation, openSubtab, openTab } from 'lightning/platformWorkspaceApi';

const COLUMNS = [
  {
    label: 'Codice',
    type: 'button',
    initialWidth: 200,
    typeAttributes: {
      label: { fieldName: 'Name' },
      name: 'open',
      title: 'Apri record',
      variant: 'base'
    }
  },
  { label: 'Tipo Visita', fieldName: 'Visit_Type__c' },
  { label: 'Data', fieldName: 'Data_della_Visita__c', type: 'date' },
  { label: 'Beneficiario', fieldName: 'Beneficiary_Type__c' },
  { label: 'Comune', fieldName: 'City__c' },
  { label: 'Provincia', fieldName: 'Province__c' },
  { label: 'Regione', fieldName: 'Region__c' },
  { label: 'Minuti', fieldName: 'Duration_in_minutes__c', type: 'number' },
  { label: 'Numero', fieldName: 'Quantity__c', type: 'number' },
  { label: 'Ammontare', fieldName: 'Amount__c', type: 'currency' },
  {
    label: ' ',
    type: 'button',
    initialWidth: 120,
    typeAttributes: {
      label: 'Modifica',
      name: 'edit',
      title: 'Modifica',
      variant: 'neutral'
    },
    cellAttributes: { alignment: 'center' }
  }
];

export default class InvoiceVisitList extends NavigationMixin(LightningElement) {
  @api recordId; // Invoice__c Id
  @track rows = [];
  @track isLoading = false;
  columns = COLUMNS;

  connectedCallback() {
    this.refresh();
  }

  async refresh() {
    try {
      this.isLoading = true;
      const data = await getVisitsByInvoice({ invoiceId: this.recordId });
      // Clona per forzare rerender anche se la reference fosse riutilizzata
      this.rows = JSON.parse(JSON.stringify(data || []));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Errore caricamento visite', e);
    } finally {
      this.isLoading = false;
    }
  }

  handleRefresh() {
    this.refresh();
  }

  async handleRowAction(event) {
    const action = event.detail.action.name;
    const row = event.detail.row;
    if (action === 'open') {
      await this.openRecordTab(row.Id);
    } else if (action === 'edit') {
      await fsc_modalFlow.open({
        label: 'Modifica Visita',
        size: 'large',
        description: 'Modifica visita medica',
        flowNameToInvoke: 'Inserisci_Visite_Mediche',
        flowParams: [
          { name: 'recordId', type: 'String', value: this.recordId },
          { name: 'visitaId', type: 'String', value: row.Id }
        ],
        flowFinishBehavior: 'NONE'
      });
      // Dopo la chiusura del flow prova a ricaricare la lista
      this.refresh();
    }
  }

  async openRecordTab(recordId) {
    const pageRef = {
      type: 'standard__recordPage',
      attributes: {
        recordId,
        objectApiName: 'Visit__c',
        actionName: 'view'
      }
    };
    try {
      const inConsole = await isConsoleNavigation();
      if (inConsole) {
        try {
          const focused = await getFocusedTabInfo();
          if (focused && focused.tabId) {
            await openSubtab({ parentTabId: focused.tabId, pageReference: pageRef, focus: true });
            return;
          }
        } catch (e) {
          // fallback to openTab if no focused tab
        }
        await openTab({ pageReference: pageRef, focus: true });
      } else {
        // Fallback per non-console
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this[NavigationMixin.Navigate](pageRef);
      }
    } catch (e) {
      // Se la workspace API non è disponibile, usa navigazione standard
      // eslint-disable-next-line no-console
      console.error('Errore apertura tab console:', e);
      this[NavigationMixin.Navigate](pageRef);
    }
  }

  async handleAdd() {
    await fsc_modalFlow.open({
      label: 'Aggiungi Visite',
      size: 'large',
      description: 'Inserisci nuove visite mediche',
      flowNameToInvoke: 'Inserisci_Visite_Mediche',
      flowParams: [
        { name: 'recordId', type: 'String', value: this.recordId }
      ],
      flowFinishBehavior: 'NONE'
    });
    this.refresh();
  }
}