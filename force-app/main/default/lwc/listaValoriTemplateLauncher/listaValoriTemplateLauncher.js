import { LightningElement } from 'lwc';
import { openTab, setTabLabel } from 'lightning/platformWorkspaceApi';

export default class ListaValoriTemplateLauncher extends LightningElement {
    connectedCallback() {
        // Apre automaticamente il tab Lista_Valori_Template quando il componente viene caricato
        this.openListaValoriTemplate();
    }

    openListaValoriTemplate() {
        const apiName = 'Lista_Valori_Template';
        const label = 'Lista Valori Template';
        const url = `/lightning/n/${apiName}`;

        openTab({ url, label })
            .then((tabId) => {
                if (tabId) {
                    return setTabLabel({ tabId, label });
                }
            })
            .catch((error) => {
                // eslint-disable-next-line no-console
                console.error('Errore nell\'apertura del tab Lista_Valori_Template:', error);
            });
    }
}