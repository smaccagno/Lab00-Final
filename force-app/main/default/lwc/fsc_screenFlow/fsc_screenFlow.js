import {LightningElement, api} from 'lwc';
// import {FlowAttributeChangeEvent, FlowNavigationNextEvent} from 'lightning/flowSupport';

export default class ScreenFlow extends LightningElement {
    @api width;
    @api height;
    @api flowName;
    @api name;
    @api flowParams;
    @api saveParams;
    saveStatus;
    url;
    _messageHandler;

    @api    // Flow Navigation Actions
    availableActions = [];

    connectedCallback() {
        let sfIdent = '.com'; //in a previous version this was set to force.com by doing so it breaks on experience cloud where enhanced domain is enabled
        this.url = window.location.href.substring(0, window.location.href.indexOf(sfIdent) + sfIdent.length);

        this._messageHandler = (event) => {     // screenFlow.page does a postMessage whenever the flow status changes
            const sameOrigin = event.origin === this.url;
            const trustedPayload = event.data && event.data.flowOrigin === this.url;
            if (!sameOrigin && !trustedPayload) {
                return;
            }
            const moveEvt = new CustomEvent('flowstatuschange', {
                detail: {
                    flowStatus: event.data.flowStatus,
                    flowParams: event.data.flowParams,
                    name: this.name,
                    flowName: this.flowName
                }
            });
            this.saveStatus = event.data.flowStatus;
            this.saveParams = event.data.flowParams;
            this.dispatchEvent(moveEvt);
        };
        window.addEventListener("message", this._messageHandler);
    }

    disconnectedCallback() { 
        if (this._messageHandler) {
            window.removeEventListener("message", this._messageHandler);
            this._messageHandler = null;
        }
        const exitEvt = new CustomEvent('flowstatuschange', {
            detail: {
                flowStatus: this.saveStatus,
                flowParams: this.saveParams,
                name: this.name,
                flowName: this.flowName,
                flowExit: true
            }
        });      
        this.dispatchEvent(exitEvt);      
    }

    // handleGoNext() {
    //     // check if NEXT is allowed on this screen
    //     if (this.availableActions.find(action => action === 'NEXT')) {
    //         // navigate to the next screen
    //         const navigateNextEvent = new FlowNavigationNextEvent();
    //         this.dispatchEvent(navigateNextEvent);
    //     }
    // }

    get fullUrl() {
        let params = (this.flowParams ? '&params=' + encodeURIComponent(this.flowParams) : '');
        let origin = (this.url ? '&origin=' + encodeURI(this.url) : '');
        return this.url + '/apex/fsc_screenFlow?flowname=' + this.flowName +  params+origin;
    }
}