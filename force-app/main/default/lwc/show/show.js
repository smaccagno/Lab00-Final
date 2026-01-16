import { LightningElement, api, wire, track } from 'lwc';
import { getPicklistValues, getObjectInfo } from 'lightning/uiObjectInfoApi';
import { FlowAttributeChangeEvent } from 'lightning/flowSupport';

import SHOW_OBJECT from '@salesforce/schema/Show__c';
import TYPE_FIELD from '@salesforce/schema/Show__c.Type__c';

import getRecords from '@salesforce/apex/FlowController.getRecords';

export default class Show extends LightningElement {
    @track filteredSuggestions = [];
    dropdownStyle = 'display: none;';
    showErrorMessage = false;
    showTypeInput = false;
    isClickingSuggestion = false;
    isInputValid = true;

    /** NEW */
    @api showId;
    @api selectedShow = '';
    @api selectedType = '';
    @api selectedDatetime = '';
    @api selectedShowId;
    @track shows = [];
    @track types = [];
    showDatetimeInput = false;

    get inputClass() {
        return `no-padding-input ${this.isInputValid ? '' : 'slds-has-error'}`.trim();
    }

    get showSummary(){
        return this.selectedShowId || (this.createNewShow && this.selectedShow && this.selectedType && this.selectedDatetime);
    }

    get dateString(){
        return this.selectedDatetime ? new Date(this.selectedDatetime).toLocaleString() : '';
    }

    get createNewShow(){
        return !!!this.selectedShowId;
    }

    @wire(getRecords, {objectApiName: 'Show__c', fields: ['Id', 'Name', 'Type__c', 'Datetime__c']})
    wiredRecords({ error, data }) {
        if (data) {
            this.shows = data;
            if (this.showId) setTimeout(() => this.selectShow(this.showId), 100)
        } else if (error) {
            console.error('errore', error);
        }
    }

    @wire(getObjectInfo, { objectApiName: SHOW_OBJECT })
    showObjectInfo;

    @wire(getPicklistValues, { recordTypeId: '$showObjectInfo.data.defaultRecordTypeId', fieldApiName: TYPE_FIELD })
    picklistHandler({ data, error }) {
        if (data) {
            this.types = data.values.map(type => {
                return {
                    label: type.label,
                    value: type.value
                }
            });
        } else if (error) {
            console.error(error);
        }
    }

    handleInputChange(event) {
        const query = event.target?.value?.trim()?.toLowerCase();

        this.selectedShowId = null;
        this.showTypeInput = false;
        this.selectedType = '';
        this.selectedDatetime = '';
        this.showErrorMessage = false;
        this.isInputValid = true;
        this.selectedShow = '';

        if (query?.length > 0) {
            this.filteredSuggestions = this.shows.filter(show =>
                show.Name && show.Name.toLowerCase().includes(query)
            );
            this.dropdownStyle = this.filteredSuggestions.length > 0 ? 'display: block;' : 'display: none;';
            this.showErrorMessage = this.filteredSuggestions.length === 0;
        } else {
            this.filteredSuggestions = [];
            this.dropdownStyle = 'display: none;';
        }
    }

    handleFocus() {
        this.isInputValid = true;
        this.filteredSuggestions = this.shows;
        this.dropdownStyle = 'display: block;';
    }

    handleBlur() {
        if (!this.isClickingSuggestion) {
            this.dropdownStyle = 'display: none;';
            const inputValue = this.template.querySelector('lightning-input[data-id="show"]').value.trim();
            this.isInputValid = inputValue.length > 0;
        }
    }

    handleMouseDownSuggestion() {
        this.isClickingSuggestion = true;
    }

    handleMouseUpSuggestion() {
        this.isClickingSuggestion = false;
    }

    handleSuggestionClick(event) {
        const showId = event.target.dataset.id;
        this.selectShow(showId);
    }

    selectShow(showId){
        const selectedShowData = this.shows.find(show => show.Id === showId);
        
        if (selectedShowData) {
            this.selectedShowId = showId;
            const input = this.template.querySelector('lightning-input[data-id="show"]');
            input.value = selectedShowData.Name;
            input.reportValidity();

            this.filteredSuggestions = [];
            this.dropdownStyle = 'display: none;';
            this.showErrorMessage = false;
            this.isInputValid = true;
            this.showDatetimeInput = false;
            this.showTypeInput = false;

            this.selectedShow = selectedShowData.Name;
            this.selectedType = selectedShowData.Type__c;
            this.selectedDatetime = selectedShowData.Datetime__c;

            this.dispatchEvent(new FlowAttributeChangeEvent('selectedShowId', showId));
        }
    }

    handleConfirm() {
        const inputValue = this.template.querySelector('lightning-input[data-id="show"]').value.trim();
        if (inputValue) {
            this.selectedShow = inputValue;
            this.selectedType = null;
            this.selectedDatetime = null;
            this.showErrorMessage = false;
            this.isInputValid = true;
            this.showTypeInput = true;
            this.selectedShowId = null;

            this.dispatchEvent(new FlowAttributeChangeEvent('selectedShow', this.selectedShow));
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedShowId', null));
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedType', null));
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedDatetime', null));
        } else {
            this.isInputValid = false;
        }
    }

    handleTypeInputChange(event) {
        this.selectedType = event.detail.value;
        this.dispatchEvent(new FlowAttributeChangeEvent('selectedType', this.selectedType));
        this.showDatetimeInput = true;
    }

    handleDatetimeInputChange(event){
        this.selectedDatetime = event.detail.value;
        this.dispatchEvent(new FlowAttributeChangeEvent('selectedDatetime', this.selectedDatetime));
    }
}