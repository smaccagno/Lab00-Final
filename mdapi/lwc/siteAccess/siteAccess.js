import { LightningElement, track } from 'lwc';
import LOGO from '@salesforce/contentAssetUrl/lab00';

import getAccountByStructureCode from '@salesforce/apex/SiteController.getAccountByStructureCode';

export default class SiteAccess extends LightningElement {
    @track logo = LOGO;
    isButtonDisabled = true;
    error;

    get code(){
        return this.refs?.code?.value;
    }

    handleCodeChange(){
        this.setError(false);
        this.isButtonDisabled = !(/^[A-Za-z0-9]{16}$/.test(this.code));
    }

    login(){
        const code = this.code?.replace(/[^A-Za-z0-9]/g, '');

        if (code) {
            this.loading(true);
            getAccountByStructureCode({code})
            .then(account => {
                this.dispatchEvent(new CustomEvent('login', { detail: { account }}));
            })
            .catch(error => {
                this.setError(true);
                console.error(error);
            })
            .finally(() => {
                this.loading(false);
            });
        }
    }

    setError(error){
        this.error = error ? 'Codice struttura non valido' : undefined;
    }

    loading(loading){
        this.dispatchEvent(new CustomEvent('loading', { detail: loading }));
    }
}