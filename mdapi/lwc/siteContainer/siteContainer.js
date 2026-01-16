import { api, LightningElement, track } from 'lwc';

export default class SiteContainer extends LightningElement {

    @track account;

    accessGranted = false;
    loading = false;

    handleLogin(event){
        this.account = event.detail.account;
        this.accessGranted = true;
    }

    handleLoading(event){
        if (event.detail) {
            this.startLoading();
        } else {
            this.endLoading();
        }
    }

    startLoading(){
        this.loading = true;
    }

    endLoading(){
        this.loading = false;
    }
}