import { LightningElement } from 'lwc';
import { subscribe, unsubscribe, onError } from 'lightning/empApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import userId from '@salesforce/user/Id';

const CHANNEL = '/event/Allineamento_Programma_Completato__e';

export default class AllineamentoProgrammaToastListener extends LightningElement {
  subscription = null;

  connectedCallback() {
    this.subscribeToEvent();
  }

  disconnectedCallback() {
    this.unsubscribeFromEvent();
  }

  async subscribeToEvent() {
    try {
      this.subscription = await subscribe(CHANNEL, -1, (event) => {
        const payload = event?.data?.payload || event?.payload || event?.data;
        if (!payload) return;
        const targetUserId = payload.UserId__c || payload.userId__c;
        const message =
          payload.Message__c ||
          payload.message__c ||
          'Fatture Shadow, Overview Donatore e Budget Anno sono stati aggiornati correttamente.';
        if (targetUserId && String(targetUserId) === String(userId)) {
          this.dispatchEvent(
            new ShowToastEvent({
              title: 'Allineamento Programma completato',
              message,
              variant: 'success'
            })
          );
        }
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('allineamentoProgrammaToastListener subscribe error:', err);
    }

    onError((error) => {
      // eslint-disable-next-line no-console
      console.error('allineamentoProgrammaToastListener empApi error:', error);
    });
  }

  async unsubscribeFromEvent() {
    if (this.subscription) {
      try {
        await unsubscribe(this.subscription);
        this.subscription = null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('allineamentoProgrammaToastListener unsubscribe error:', err);
      }
    }
  }
}