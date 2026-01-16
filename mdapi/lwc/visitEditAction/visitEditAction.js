import { LightningElement, api, wire, track } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import INVOICE_FIELD from '@salesforce/schema/Visit__c.Invoice__c';
import fsc_modalFlow from 'c/fsc_modalFlow';
import { CloseActionScreenEvent } from 'lightning/actions';

export default class VisitEditAction extends LightningElement {
  @api recordId; // Visit__c Id
  @track launched = false;

  @wire(getRecord, { recordId: '$recordId', fields: [INVOICE_FIELD] })
  async wiredVisit({ data, error }) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Errore caricamento visita per edit flow', error);
      this.dispatchEvent(new CloseActionScreenEvent());
      return;
    }
    if (data && !this.launched) {
      this.launched = true;
      const invoiceId = data.fields.Invoice__c && data.fields.Invoice__c.value;
      try {
        await fsc_modalFlow.open({
          label: 'Modifica Visita',
          size: 'large',
          description: 'Modifica visita medica',
          flowNameToInvoke: 'Inserisci_Visite_Mediche',
          flowParams: [
            { name: 'recordId', type: 'String', value: invoiceId || '' },
            { name: 'visitaId', type: 'String', value: this.recordId }
          ],
          flowFinishBehavior: 'NONE'
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Errore apertura flow di modifica', e);
      } finally {
        this.dispatchEvent(new CloseActionScreenEvent());
      }
    }
  }
}