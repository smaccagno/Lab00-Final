import { LightningElement } from 'lwc';

export default class Launcher extends LightningElement {
    tabs = [
        { id: '1', label: 'Donatori', url: '/lightning/o/Account/list' },
        { id: '2', label: 'Programmi', url: '/lightning/o/Program/list' },
        { id: '3', label: 'Donazioni', url: '/lightning/n/Donazioni' },
        { id: '4', label: 'Allocazioni', url: '/lightning/n/Allocazioni' },
        { id: '5', label: 'Campagne', url: '/lightning/o/Campaign/list' },
        { id: '6', label: 'Fatture', url: '/lightning/n/Fatture' },
        { id: '7', label: 'Pagamenti', url: '/lightning/o/Payment__c/list' },
        { id: '8', label: 'Visite Mediche', url: '/lightning/n/Visite_Mediche' },
        { id: '9', label: 'Anni di Reportistica', url: '/lightning/n/Anni_di_Reportistica' },
        { id: '10', label: 'Donatori per Programma', url: '/lightning/o/Donor_Overview__c/list' },
        { id: '11', label: 'Budgets per Programma', url: '/lightning/o/GiftDesignation/list' },
        { id: '12', label: 'Budget per Anno', url: '/lightning/o/Overview_Budget_per_Anno__c/list' },
        { id: '13', label: 'Donatori per Anno', url: '/lightning/o/Reporting_Year__c/list' },
        { id: '14', label: 'Reportistica', url: '/lightning/n/Reportistica' }
    ];
}