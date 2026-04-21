@isTest
private class BudgetAggregatorTest {

    @isTest
    static void accumulate_effettiva() {
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        Boolean contrib = BudgetAggregator.accumulate(p, 'Effettiva', null, 100);
        System.assert(contrib);
        System.assertEquals(0, p.previsto);
        System.assertEquals(100, p.effettivo);
    }

    @isTest
    static void accumulate_prevista() {
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        Boolean contrib = BudgetAggregator.accumulate(p, 'Prevista', null, 50);
        System.assert(contrib);
        System.assertEquals(50, p.previsto);
        System.assertEquals(0, p.effettivo);
    }

    @isTest
    static void accumulate_annullata_ex_prevista_erode_previsto() {
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        BudgetAggregator.accumulate(p, 'Prevista', null, 100);
        Boolean contrib = BudgetAggregator.accumulate(p, 'Annullata', 'Prevista', 30);
        System.assert(contrib);
        System.assertEquals(70, p.previsto);
        System.assertEquals(0, p.effettivo);
    }

    @isTest
    static void accumulate_annullata_ex_effettiva_erode_effettivo() {
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        BudgetAggregator.accumulate(p, 'Effettiva', null, 200);
        Boolean contrib = BudgetAggregator.accumulate(p, 'Annullata', 'Effettiva', 50);
        System.assert(contrib);
        System.assertEquals(0, p.previsto);
        System.assertEquals(150, p.effettivo);
    }

    @isTest
    static void accumulate_annullata_senza_precedente_viene_scartata() {
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        BudgetAggregator.accumulate(p, 'Prevista', null, 100);
        Boolean contrib = BudgetAggregator.accumulate(p, 'Annullata', null, 999);
        System.assertEquals(false, contrib, 'Annullata legacy senza Stato_Precedente va scartata');
        System.assertEquals(100, p.previsto, 'Il pair non deve cambiare');
        System.assertEquals(0, p.effettivo);
    }

    @isTest
    static void accumulate_amount_null_e_stato_sconosciuto() {
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        BudgetAggregator.accumulate(p, 'Prevista', null, null);
        System.assertEquals(0, p.previsto);

        Boolean contrib = BudgetAggregator.accumulate(p, 'Sconosciuto', null, 100);
        System.assertEquals(false, contrib);
        System.assertEquals(0, p.previsto);
    }

    @isTest
    static void finalize_azzera_previsto_negativo() {
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        p.previsto = -50;
        p.effettivo = 100;
        BudgetAggregator.finalizePair(p);
        System.assertEquals(0, p.previsto);
        System.assertEquals(100, p.effettivo, 'Il previsto negativo non deve erodere l\'effettivo');
        System.assertEquals(100, p.totale);
    }

    @isTest
    static void finalize_azzera_effettivo_negativo() {
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        p.previsto = 80;
        p.effettivo = -20;
        BudgetAggregator.finalizePair(p);
        System.assertEquals(80, p.previsto);
        System.assertEquals(0, p.effettivo);
        System.assertEquals(80, p.totale);
    }

    @isTest
    static void finalize_entrambi_negativi() {
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        p.previsto = -10;
        p.effettivo = -5;
        BudgetAggregator.finalizePair(p);
        System.assertEquals(0, p.previsto);
        System.assertEquals(0, p.effettivo);
        System.assertEquals(0, p.totale);
    }

    @isTest
    static void finalize_entrambi_positivi() {
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        p.previsto = 60;
        p.effettivo = 40;
        BudgetAggregator.finalizePair(p);
        System.assertEquals(60, p.previsto);
        System.assertEquals(40, p.effettivo);
        System.assertEquals(100, p.totale);
    }

    @isTest
    static void isInDateScope_filter_null_include_tutto() {
        System.assert(BudgetAggregator.isInDateScope(Date.today(), null));
        System.assert(BudgetAggregator.isInDateScope(null, null));
    }

    @isTest
    static void isInDateScope_voceDate_null_incluso() {
        System.assert(BudgetAggregator.isInDateScope(null, Date.today()));
    }

    @isTest
    static void isInDateScope_voceDate_leq_filter_incluso() {
        Date filter = Date.newInstance(2026, 6, 30);
        System.assert(BudgetAggregator.isInDateScope(Date.newInstance(2026, 1, 1), filter));
        System.assert(BudgetAggregator.isInDateScope(filter, filter));
    }

    @isTest
    static void isInDateScope_voceDate_gt_filter_escluso() {
        Date filter = Date.newInstance(2026, 6, 30);
        System.assertEquals(false, BudgetAggregator.isInDateScope(Date.newInstance(2026, 12, 31), filter));
    }

    @isTest
    static void normalizeCategoria_blank_to_default() {
        System.assertEquals('Non categorizzato', BudgetAggregator.normalizeCategoria(null));
        System.assertEquals('Non categorizzato', BudgetAggregator.normalizeCategoria(''));
        System.assertEquals('Non categorizzato', BudgetAggregator.normalizeCategoria('   '));
        System.assertEquals('Donazione', BudgetAggregator.normalizeCategoria('Donazione'));
    }

    @isTest
    static void scenario_end_to_end_previsto_negativo_non_erode_effettivo() {
        // Caso reale: una categoria Spesa con più Annullate ex-Prevista che Previste.
        // Prima del refactor il deficit erodeva l'effettivo. Ora non deve più succedere.
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        BudgetAggregator.accumulate(p, 'Prevista', null, 500);
        BudgetAggregator.accumulate(p, 'Effettiva', null, 300);
        BudgetAggregator.accumulate(p, 'Annullata', 'Prevista', 800);

        BudgetAggregator.finalizePair(p);

        System.assertEquals(0, p.previsto, 'Previsto: 500 - 800 = -300, poi azzerato');
        System.assertEquals(300, p.effettivo, 'Effettivo invariato: la Annullata ex-Prevista non lo tocca');
        System.assertEquals(300, p.totale);
    }

    @isTest
    static void scenario_end_to_end_annullata_ex_effettiva_riduce_effettivo() {
        BudgetAggregator.AmountPair p = new BudgetAggregator.AmountPair();
        BudgetAggregator.accumulate(p, 'Effettiva', null, 1000);
        BudgetAggregator.accumulate(p, 'Annullata', 'Effettiva', 250);
        BudgetAggregator.finalizePair(p);

        System.assertEquals(0, p.previsto);
        System.assertEquals(750, p.effettivo, 'Annullata ex-Effettiva riduce Effettivo');
        System.assertEquals(750, p.totale);
    }
}
