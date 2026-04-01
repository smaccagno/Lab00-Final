import { api, LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { getFocusedTabInfo, isConsoleNavigation, openSubtab, openTab } from 'lightning/platformWorkspaceApi';

export default class InvoiceExcelEditorLauncher extends NavigationMixin(LightningElement) {
    @api programId;
    @api partnerBudgetId;
    
    async handleOpenEditor() {
        // Per una Lightning App Page, dobbiamo usare l'URL diretto della pagina
        // Il formato corretto è /lightning/app/{appId}/c__{pageApiName}
        // Ma senza conoscere l'app ID, possiamo provare con il formato Navigation Item
        // che funziona se la pagina è configurata come Navigation Item nell'app
        const pageRef = {
            type: 'standard__navItemPage',
            attributes: {
                apiName: 'InvoiceExcelEditor'
            },
            state: {
                ...(this.programId ? { c__programId: this.programId } : {}),
                ...(this.partnerBudgetId ? { c__partnerBudgetId: this.partnerBudgetId } : {})
            }
        };
        
        try {
            // Verifica se siamo in una console Salesforce
            const inConsole = await isConsoleNavigation();
            
            if (inConsole) {
                try {
                    // Prova prima ad aprire come subtab del tab corrente
                    const focused = await getFocusedTabInfo();
                    if (focused && focused.tabId) {
                        await openSubtab({ 
                            parentTabId: focused.tabId, 
                            pageReference: pageRef, 
                            focus: true 
                        });
                        return;
                    }
                } catch (e) {
                    // Se non c'è un tab focalizzato, continua con openTab
                }
                
                // Apri come nuovo tab nella console
                await openTab({ pageReference: pageRef, focus: true });
            } else {
                // Se non siamo in console, usa navigazione standard
                this[NavigationMixin.Navigate](pageRef);
            }
        } catch (error) {
            // Fallback: se la Workspace API non è disponibile, usa navigazione standard
            console.error('Errore apertura tab console:', error);
            this[NavigationMixin.Navigate](pageRef);
        }
    }
}