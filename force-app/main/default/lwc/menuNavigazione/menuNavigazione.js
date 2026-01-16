export default class MenuNavigazione extends LightningElement {
    tabs = [
        { id: '1', label: 'Accounts', url: '/lightning/o/Account/list' },
        { id: '2', label: 'Programmi', url: '/lightning/o/Program/list' },
        { id: '3', label: 'Donazioni', url: '/lightning/o/GiftTransaction/List' },
        { id: '4', label: 'Allocazioni', url: '/lightning/n/Allocazioni' },
        { id: '5', label: 'Campagne', url: '/lightning/o/Campaign/list' },
        { id: '6', label: 'Fatture', url: '/lightning/o/Invoice__c/list' },
        { id: '7', label: 'Pagamenti', url: '/lightning/o/Payment__c/list' },
        { id: '8', label: 'Visite Mediche', url: '/lightning/o/Visit__c/list' },
        { id: '9', label: 'Anni di Reportistica', url: '/lightning/o/Anno_Reportistica__c/list' },
        { id: '10', label: 'Donatori', url: '/lightning/o/Donor_Overview__c/list' },
        { id: '11', label: 'Budgets', url: '/lightning/o/GiftDesignation/list' },
        { id: '12', label: 'Budget per Anno', url: '/lightning/o/Overview_Budget_per_Anno__c/list' },
        { id: '13', label: 'Donatori per Anno', url: '/lightning/o/Reporting_Year__c/list' },
        { id: '14', label: 'Reportistica', url: '/lightning/n/Reportistica' }
    ];
}