import { LightningElement, api } from 'lwc';

export default class MultilineHeader extends LightningElement {
    @api mainText;
    @api subText;
}