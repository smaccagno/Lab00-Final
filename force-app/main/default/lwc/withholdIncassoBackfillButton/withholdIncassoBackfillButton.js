import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import runBackfill from '@salesforce/apex/WithholdIncassoBackfillController.runBackfill';

export default class WithholdIncassoBackfillButton extends LightningElement {
    isRunning = false;
    result;
    error;

    get hasFailures() {
        return this.result && this.result.failed > 0;
    }

    get hasSkipped() {
        return this.result && (this.result.skippedNoBudget > 0 || this.result.skippedNoData > 0);
    }

    handleRun() {
        this.isRunning = true;
        this.result = undefined;
        this.error = undefined;

        runBackfill()
            .then(data => {
                this.result = data;
                const created = data.created || 0;
                const already = data.alreadyPresent || 0;
                const failed = data.failed || 0;
                let variant = 'success';
                let title = 'Backfill completato';
                let message = `Create: ${created} · Già presenti: ${already}`;

                if (failed > 0) {
                    variant = 'warning';
                    title = 'Backfill completato con errori';
                    message += ` · Errori: ${failed}`;
                } else if (created === 0 && already > 0) {
                    variant = 'info';
                    title = 'Niente da fare';
                    message = `Tutte le ${already} donazioni hanno già la voce di incasso.`;
                } else if (created === 0 && already === 0) {
                    variant = 'info';
                    title = 'Nessuna transazione idonea';
                    message = 'Nessuna donazione con trattenuta > 0 da elaborare.';
                }

                this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
            })
            .catch(err => {
                this.error = (err && err.body && err.body.message) || 'Errore durante l\'elaborazione.';
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Errore',
                    message: this.error,
                    variant: 'error'
                }));
            })
            .finally(() => {
                this.isRunning = false;
            });
    }
}
