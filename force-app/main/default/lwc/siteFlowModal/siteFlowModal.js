import { api, LightningElement } from 'lwc';

export default class SiteFlowModal extends LightningElement {

    @api flowName;
    @api inputVariables = [];
    @api title;

    closeModal(){
        this.dispatchEvent(new CustomEvent('close'));
    }

    // Chiudita automaticamente la modale quando il Flow è completo
    handleFlowStatusChange(event) {
        if (event.detail.status === 'FINISHED' || event.detail.status === 'FINISHED_SCREEN') {
            this.closeModal();
        }
    }
}