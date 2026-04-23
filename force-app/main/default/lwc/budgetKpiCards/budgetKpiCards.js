import { LightningElement, api, wire } from 'lwc';
import getDashboardKpis from '@salesforce/apex/BudgetAppDashboardController.getDashboardKpis';
import getProgramsKpis from '@salesforce/apex/BudgetAppDashboardController.getProgramsKpis';

export default class BudgetKpiCards extends LightningElement {
    @api accountId;
    @api filterDate;

    kpis;
    programsKpis = [];
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

    @wire(getProgramsKpis, { accountId: '$accountId', selectedDateStr: '$filterDate' })
    wiredProgramsKpis({ data }) {
        if (data) {
            // Mostriamo solo programmi con almeno un movimento reale, ordinati
            // per nome per una lettura stabile.
            const sorted = [...data].sort((a, b) => (a.programName || '').localeCompare(b.programName || ''));
            this.programsKpis = sorted;
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

    // Split per programma — rendering riusabile nelle 3 card.
    _mapProgramRows(valueGetter) {
        return (this.programsKpis || []).map(p => {
            const eff = valueGetter(p, 'eff');
            const prev = valueGetter(p, 'prev');
            return {
                key: p.programId,
                programName: p.programName || 'Programma',
                effettivoLabel: this.formatCurrency(eff),
                previstoLabel: this.formatCurrency(prev)
            };
        });
    }

    get incassiByProgram() {
        return this._mapProgramRows((p, kind) =>
            kind === 'eff' ? p.incassiEffettivo : p.incassiPrevisto
        );
    }

    get speseByProgram() {
        return this._mapProgramRows((p, kind) =>
            kind === 'eff' ? p.speseEffettivo : p.spesePrevisto
        );
    }

    get cashFlowByProgram() {
        return (this.programsKpis || []).map(p => {
            const eff = p.cashFlowEffettivo;
            const prev = p.cashFlowPrevisto;
            const positive = (p.cashFlowTotale || 0) >= 0;
            return {
                key: p.programId,
                programName: p.programName || 'Programma',
                effettivoLabel: this.formatCurrency(eff),
                previstoLabel: this.formatCurrency(prev),
                valueClass: positive ? 'kpi-sub-amount kpi-sub-amount--positive'
                                     : 'kpi-sub-amount kpi-sub-amount--negative'
            };
        });
    }

    get hasPrograms() {
        return (this.programsKpis || []).length > 0;
    }
}
