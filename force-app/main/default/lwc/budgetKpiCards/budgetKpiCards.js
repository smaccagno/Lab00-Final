import { LightningElement, api, wire } from 'lwc';
import getDashboardKpis from '@salesforce/apex/BudgetAppDashboardController.getDashboardKpis';

export default class BudgetKpiCards extends LightningElement {
    @api accountId;
    @api filterDate;

    kpis;
    loading = true;
    error;

    @wire(getDashboardKpis, { accountId: '$accountId', selectedDateStr: '$filterDate' })
    wiredKpis({ data, error }) {
        this.loading = false;
        if (data) {
            this.kpis = data;
            this.error = undefined;
        } else if (error) {
            this.error = (error && error.body && error.body.message) || 'Errore nel caricamento dei KPI';
            this.kpis = undefined;
        }
    }

    get hasData() {
        return !!this.kpis;
    }

    get formattedFilterDate() {
        if (!this.filterDate) return 'Tutti gli anni';
        const parts = String(this.filterDate).slice(0, 10).split('-');
        if (parts.length !== 3) return this.filterDate;
        return `al ${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    formatCurrency(value) {
        if (value == null) return '€ 0';
        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0
        }).format(value);
    }

    formatPercent(value) {
        if (value == null) return '0%';
        return new Intl.NumberFormat('it-IT', {
            maximumFractionDigits: 1
        }).format(value) + '%';
    }

    get incassiEffettivoLabel() { return this.formatCurrency(this.kpis?.incassiEffettivo); }
    get incassiPrevistoLabel() { return this.formatCurrency(this.kpis?.incassiPrevisto); }
    get incassiTotaleLabel() { return this.formatCurrency(this.kpis?.incassiTotale); }
    get incassiAvanzamento() { return this.formatPercent(this.kpis?.avanzamentoIncassi); }

    get speseEffettivoLabel() { return this.formatCurrency(this.kpis?.speseEffettivo); }
    get spesePrevistoLabel() { return this.formatCurrency(this.kpis?.spesePrevisto); }
    get speseTotaleLabel() { return this.formatCurrency(this.kpis?.speseTotale); }
    get speseAvanzamento() { return this.formatPercent(this.kpis?.avanzamentoSpese); }

    get cashFlowEffettivoLabel() { return this.formatCurrency(this.kpis?.cashFlowEffettivo); }
    get cashFlowPrevistoLabel() { return this.formatCurrency(this.kpis?.cashFlowPrevisto); }
    get cashFlowTotaleLabel() { return this.formatCurrency(this.kpis?.cashFlowTotale); }

    get cashFlowPositive() {
        return this.kpis && this.kpis.cashFlowTotale != null && this.kpis.cashFlowTotale >= 0;
    }

    get cashFlowCardClass() {
        const base = 'kpi-card kpi-card--cashflow';
        return this.cashFlowPositive ? base + ' kpi-card--positive' : base + ' kpi-card--negative';
    }

    get cashFlowValueClass() {
        return this.cashFlowPositive ? 'kpi-value kpi-value--positive' : 'kpi-value kpi-value--negative';
    }

    get avanzamentoIncassiBarStyle() {
        const v = Math.min(100, Math.max(0, this.kpis?.avanzamentoIncassi || 0));
        return `width: ${v}%`;
    }

    get avanzamentoSpeseBarStyle() {
        const v = Math.min(100, Math.max(0, this.kpis?.avanzamentoSpese || 0));
        return `width: ${v}%`;
    }
}
